"use client";

import { useEffect, useMemo, useState } from "react";

import { usePushTest } from "@/components/push/usePushTest";
import { SetupEntryLine } from "@/components/setup/SetupEntry";
import { SetupView } from "@/components/setup/SetupView";
import type { SetupModel } from "@/components/setup/useSetup";
import type { TestVerdict } from "@/lib/push/health";
import { browserApp, inAppBrowser, phoneMaker } from "@/lib/setup/device";
import { entryLine, progressLabel, setupProgress, setupSteps, type SetupFacts, type SetupMarks, type StepId } from "@/lib/setup/steps";
import { useHydrated } from "@/lib/useHydrated";

/**
 * Component sandbox (D-190): «Подключение» on made-up phones — nothing is read or written. The
 * platform, the maker and a messenger's browser come from the real user agent (a smoke swaps it);
 * `?case=` sets the rest:
 *   ios-tab · ios-app · android-offer · android-menu · denied · broken · test · late · mic · done
 * The buttons play in memory: «Включить» switches push on, «Прислать пробное» answers in a second
 * and a half. `?real` sends the test through the real `/api/push/test` — a smoke answers it with
 * `page.route`, never the server. `?entry` draws the home screens' line instead of the screen.
 */

type Case = { facts: Partial<SetupFacts>; marks: SetupMarks; late?: boolean };

const CASES: Record<string, Case> = {
  "ios-tab": { facts: { standalone: false, push: "unsupported", mic: "prompt" }, marks: {} },
  "ios-app": { facts: { standalone: true, push: "default", mic: "prompt" }, marks: {} },
  "android-offer": { facts: { standalone: false, installOffer: true, push: "default", mic: "prompt" }, marks: {} },
  "android-menu": { facts: { standalone: false, installOffer: false, push: "default", mic: "prompt" }, marks: {} },
  denied: { facts: { standalone: true, push: "denied", mic: "prompt" }, marks: {} },
  broken: { facts: { standalone: true, push: "granted", channel: "broken", mic: "prompt" }, marks: {} },
  test: { facts: { standalone: true, push: "granted", channel: "ok", mic: "prompt" }, marks: {} },
  late: { facts: { standalone: true, push: "granted", channel: "ok", mic: "prompt" }, marks: {}, late: true },
  mic: { facts: { standalone: true, push: "granted", channel: "ok", mic: "prompt" }, marks: { test: "done" } },
  done: { facts: { standalone: true, push: "granted", channel: "ok", mic: "granted" }, marks: { test: "done" } },
};

function fromAgent(): SetupFacts {
  const ua = navigator.userAgent;
  const platform = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  return {
    platform,
    maker: phoneMaker(ua),
    browser: browserApp(ua),
    standalone: false,
    inApp: inAppBrowser(ua),
    installOffer: false,
    push: "default",
    channel: "missing",
    mic: "prompt",
  };
}

const SENT: TestVerdict = { done: false, tone: "muted", text: "Отправлено, ждём телефон…" };
const ARRIVED: TestVerdict = { done: true, tone: "ok", text: "Пришло на телефон · 12:04" };
const LATE: TestVerdict = { done: true, tone: "warn", text: "Не пришло за 30 секунд — телефон выключен, без связи или экономит батарею", cause: "late" };

export default function SetupSandbox() {
  const hydrated = useHydrated();
  return hydrated ? <Sandbox /> : null;
}

function Sandbox() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const preset = CASES[params.get("case") ?? "ios-app"] ?? CASES["ios-app"]!;
  const real = params.has("real");
  const [facts, setFacts] = useState<SetupFacts>(() => ({ ...fromAgent(), ...preset.facts }));
  const [marks, setMarks] = useState<SetupMarks>(preset.marks);
  const [verdict, setVerdict] = useState<TestVerdict | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const live = usePushTest(undefined, "/setup");

  useEffect(() => {
    if (!verdict || verdict.done) return;
    const timer = setTimeout(() => setVerdict(preset.late ? LATE : ARRIVED), 1500);
    return () => clearTimeout(timer);
  }, [verdict, preset.late]);

  const mark = (patch: SetupMarks) => setMarks((m) => ({ ...m, ...patch }));
  const steps = setupSteps(facts, marks);
  const model: SetupModel = {
    userId: "u1",
    fullName: "Айгуль Серикова",
    role: params.get("role") === "director" ? "director" : "employee",
    team: params.get("role") !== "director",
    facts,
    marks,
    steps,
    progress: setupProgress(steps),
    pushBusy: false,
    test: real ? { verdict: live.verdict, busy: live.busy } : { verdict, busy: Boolean(verdict && !verdict.done) },
    actions: {
      install: async () => mark({ install: "done" }),
      markInstalled: () => mark({ install: "done" }),
      enablePush: async () => setFacts((f) => ({ ...f, push: "granted", channel: "ok" })),
      sendTest: () => (real ? void live.run() : setVerdict(SENT)),
      answerTest: (arrived) => arrived && mark({ test: "done" }),
      micDone: () => mark({ mic: "done" }),
      skip: (id: StepId) => mark({ [id]: "skipped" }),
      later: () => mark({ later: "today" }),
    },
  };

  if (params.has("entry")) {
    // the line as it stands under the words of a home screen
    return (
      <main className="mx-auto max-w-lg px-4 pt-10">
        <p className="mb-4 text-[17px] leading-6">Привет, Айгуль. Новых дел нет.</p>
        <div className="flex flex-col gap-2">
          <EntryPreview model={model} />
        </div>
      </main>
    );
  }

  return (
    <>
      <SetupView model={model} onLeave={() => setLeft("Позже")} onHome={() => setLeft("В Ленту")} onCode={() => setLeft("код")} />
      {left ? (
        <p className="fixed inset-x-0 bottom-4 text-center text-[13px] text-muted" data-testid="sandbox-left">
          нажато: {left}
        </p>
      ) : null}
    </>
  );
}

/** The home screens' line from the model — the live one reads the same words through `useSetup`. */
function EntryPreview({ model }: { model: SetupModel }) {
  const line = entryLine(model.facts, model.steps);
  if (!line) return <p className="text-[13px] text-muted">строки нет — всё нужное готово</p>;
  return <SetupEntryLine count={progressLabel(model.progress)} line={line} href="/dev/setup" onLater={model.actions.later} />;
}
