"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePushTest } from "@/components/push/usePushTest";
import { toast } from "@/components/ui/Toast";
import { enablePush, pushPlatform, pushState, thisDeviceEndpoint } from "@/lib/push/client";
import { useInstallOffer } from "@/lib/push/install";
import type { TestVerdict } from "@/lib/push/health";
import { pushEnabledToast } from "@/lib/push/words";
import { isTeamRole, type Role } from "@/lib/routes";
import { browserApp, inAppBrowser, phoneMaker } from "@/lib/setup/device";
import { useSetupMarks, writeMarks } from "@/lib/setup/marks";
import {
  aqtobeDay,
  channelOf,
  setupProgress,
  setupSteps,
  type Channel,
  type ChannelRow,
  type MicPermission,
  type Progress,
  type SetupFacts,
  type SetupMarks,
  type Step,
  type StepId,
} from "@/lib/setup/steps";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/tasks/queries";

/** What «Подключение» acts with — the real ones here, made-up ones in the sandbox (/dev/setup). */
export type SetupActions = {
  /** Android's own install dialog; resolves once the person answered */
  install: () => Promise<void>;
  /** «Уже на главном экране» — said by the person where the browser offers no dialog */
  markInstalled: () => void;
  /** ask the browser, subscribe, tell the server — also «Подключить заново» */
  enablePush: () => Promise<void>;
  sendTest: () => void;
  answerTest: (arrived: boolean) => void;
  micDone: () => void;
  skip: (id: StepId) => void;
  /** «Не сейчас» on Лента's line: until tomorrow */
  later: () => void;
};

export type SetupModel = {
  userId: string;
  fullName: string;
  role: Role;
  /** the team: work reaches them by push, so the first sign-in opens the screen by itself */
  team: boolean;
  facts: SetupFacts;
  marks: SetupMarks;
  steps: Step[];
  progress: Progress;
  pushBusy: boolean;
  test: { verdict: TestVerdict | null; busy: boolean };
  actions: SetupActions;
};

type Device = Pick<SetupFacts, "platform" | "maker" | "browser" | "standalone" | "inApp" | "push">;

const channelKey = (userId: string, endpoint: string | null) => ["setup-channel", userId, endpoint] as const;

/** The model's own client hint: Chrome hides the phone's model in its user agent. */
async function phoneModel(): Promise<string | null> {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }> } }).userAgentData;
  try {
    return (await data?.getHighEntropyValues?.(["model"]))?.model ?? null;
  } catch {
    return null;
  }
}

function readDevice(model: string | null): Device {
  const ua = navigator.userAgent;
  const { platform, standalone } = pushPlatform();
  return {
    platform,
    standalone,
    maker: phoneMaker(ua, model),
    browser: browserApp(ua),
    inApp: standalone ? null : inAppBrowser(ua),
    push: pushState(),
  };
}

/**
 * Everything «Подключение» knows about this phone and this person (D-190): the device's own facts
 * (read after the first paint — the server has none of them), what the server knows of this
 * phone's subscription (the person's own `push_subscriptions` row, RLS), and what the person said
 * here (lib/setup/marks.ts). Null until all of it is in. Mounted by the screen, Лента's line, the
 * profile row and the first-sign-in opener — each reads the same query and the same marks.
 */
export function useSetup(): SetupModel | null {
  const me = useMe();
  const userId = me.data?.userId;
  const marks = useSetupMarks(userId);
  const queryClient = useQueryClient();
  const { canInstall, install: installApp } = useInstallOffer();
  const [model, setModel] = useState<string | null | undefined>(undefined);
  const [mic, setMic] = useState<MicPermission>("unknown");
  const [device, setDevice] = useState<Device | null>(null);
  // undefined — still asking the browser; null — it holds no subscription
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [pushBusy, setPushBusy] = useState(false);
  const test = usePushTest(undefined, "/setup");
  const runTest = test.run;

  const refresh = useCallback(() => {
    void thisDeviceEndpoint().then(setEndpoint);
    setDevice(readDevice(model ?? null));
  }, [model]);

  // the device, after the first paint; again whenever the person comes back from the phone's settings
  useEffect(() => {
    let alive = true;
    void phoneModel().then((m) => alive && setModel(m));
    let status: PermissionStatus | null = null;
    const hasMic = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    if (!hasMic) setTimeout(() => alive && setMic("unsupported"), 0);
    else {
      navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .then((s) => {
          if (!alive) return;
          status = s;
          setMic(s.state as MicPermission);
          s.onchange = () => setMic(s.state as MicPermission);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      if (status) status.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (model === undefined) return;
    const timer = setTimeout(refresh, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [model, refresh]);

  const granted = device?.push === "granted";
  const server = useQuery({
    queryKey: channelKey(userId ?? "", endpoint ?? null),
    enabled: Boolean(userId) && granted && endpoint !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<Exclude<Channel, "checking">> => {
      if (!endpoint) return "missing";
      const { data, error } = await createBrowserSupabase()
        .from("push_subscriptions")
        .select("enabled, last_ok_at, last_error_at")
        .eq("user_id", userId as string)
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return channelOf(data as ChannelRow | null);
    },
  });

  // offline the server cannot answer: a browser holding a subscription counts as connected —
  // PushSync re-registers it on the next start (D-114)
  const channel: Channel = !granted ? "missing" : server.data ?? (server.isError ? (endpoint ? "ok" : "missing") : "checking");

  const facts = useMemo<SetupFacts | null>(
    () => (device ? { ...device, mic, installOffer: canInstall, channel } : null),
    [device, mic, canInstall, channel],
  );

  const actions = useMemo<SetupActions | null>(() => {
    if (!userId) return null;
    return {
      install: async () => {
        if (await installApp()) writeMarks(userId, { install: "done" });
      },
      markInstalled: () => writeMarks(userId, { install: "done" }),
      enablePush: async () => {
        setPushBusy(true);
        try {
          const next = await enablePush();
          if (next === "granted") {
            const done = pushEnabledToast(pushPlatform());
            toast(done.text, { lifetimeMs: done.lifetimeMs });
          } else if (next === "denied") toast("Уведомления запрещены в настройках браузера");
        } catch {
          toast("Не получилось включить уведомления");
        } finally {
          setPushBusy(false);
          refresh();
          void queryClient.invalidateQueries({ queryKey: ["setup-channel", userId] });
        }
      },
      sendTest: () => void runTest(),
      answerTest: (arrived) => {
        if (arrived) writeMarks(userId, { test: "done" });
      },
      micDone: () => writeMarks(userId, { mic: "done" }),
      skip: (id) => writeMarks(userId, { [id]: "skipped" }),
      later: () => writeMarks(userId, { later: aqtobeDay(new Date()) }),
    };
  }, [userId, installApp, queryClient, refresh, runTest]);

  return useMemo(() => {
    if (!me.data || !marks || !facts || !actions) return null;
    const steps = setupSteps(facts, marks);
    return {
      userId: me.data.userId,
      fullName: me.data.fullName,
      role: me.data.role,
      team: isTeamRole(me.data.role),
      facts,
      marks,
      steps,
      progress: setupProgress(steps),
      pushBusy,
      test: { verdict: test.verdict, busy: test.busy },
      actions,
    };
  }, [me.data, marks, facts, actions, pushBusy, test.verdict, test.busy]);
}
