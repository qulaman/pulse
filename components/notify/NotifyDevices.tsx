"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { usePushTest } from "@/components/push/usePushTest";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { enablePush, pushPlatform, pushState, type PushState } from "@/lib/push/client";
import { pushBlocker, pushEnabledToast } from "@/lib/push/words";

type Device = {
  id: string;
  endpoint: string;
  label: string | null;
  enabled: boolean;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
};

const devicesKey = ["push-devices"] as const;

async function fetchDevices(): Promise<Device[]> {
  const res = await fetch("/api/push/devices", { credentials: "include" });
  if (!res.ok) throw new Error("devices failed");
  return ((await res.json()) as { devices: Device[] }).devices;
}

async function send(method: "PATCH" | "DELETE", body: unknown): Promise<void> {
  const res = await fetch("/api/push/devices", {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("devices failed");
}

function at(iso: string): string {
  return humanAqtobe(new Date(iso), new Date()).replace(/^сегодня /, "");
}

/** How the last push to this device went, in one short line. */
function deviceLine(device: Device): { text: string; color?: string } {
  if (!device.enabled) return { text: "выключено — сюда не приходят" };
  if (device.last_error_at && (!device.last_ok_at || device.last_error_at > device.last_ok_at)) {
    return { text: `последний пуш не прошёл · ${at(device.last_error_at)}`, color: "var(--danger)" };
  }
  if (device.last_ok_at) return { text: `работает · последний пуш ${at(device.last_ok_at)}`, color: "var(--ok)" };
  return { text: `подключено ${at(device.created_at)}` };
}

/**
 * The director's devices (D-114): each phone and browser his pushes go to, how the last one went,
 * «присылать сюда» and «Удалить»; this browser is marked. Under the list — «Проверить»: a real
 * push to every switched-on device and whether a phone showed it.
 */
export function NotifyDevices() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: devicesKey, queryFn: fetchDevices });
  const test = usePushTest();
  const [here, setHere] = useState<string | null>(null);
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setState(pushState());
      if (pushState() !== "granted") return;
      void navigator.serviceWorker.ready
        .then((registration) => registration.pushManager.getSubscription())
        .then((subscription) => setHere(subscription?.endpoint ?? null))
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggle = useMutation({
    mutationFn: (device: Device) => send("PATCH", { id: device.id, enabled: !device.enabled }),
    onMutate: (device) => {
      queryClient.setQueryData<Device[]>(devicesKey, (list) =>
        (list ?? []).map((d) => (d.id === device.id ? { ...d, enabled: !d.enabled } : d)),
      );
    },
    onError: () => toast("Не сохранилось — попробуйте ещё раз"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKey }),
  });

  const remove = useMutation({
    mutationFn: (device: Device) => send("DELETE", { id: device.id }),
    onMutate: (device) => {
      queryClient.setQueryData<Device[]>(devicesKey, (list) => (list ?? []).filter((d) => d.id !== device.id));
    },
    onError: () => toast("Не получилось удалить — попробуйте ещё раз"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKey }),
  });

  const enableHere = async () => {
    try {
      const next = await enablePush();
      setState(next);
      if (next === "granted") {
        const done = pushEnabledToast(pushPlatform(), "Уведомления включены на этом устройстве");
        toast(done.text, { lifetimeMs: done.lifetimeMs });
        void queryClient.invalidateQueries({ queryKey: devicesKey });
      } else if (next === "denied") toast("Уведомления запрещены в настройках браузера");
    } catch {
      toast("Не получилось включить уведомления");
    }
  };

  const list = devices.data ?? [];
  const anyOn = list.some((d) => d.enabled);

  return (
    <div className="mt-2 flex flex-col gap-2">
      {devices.isLoading ? <div className="card h-[74px] animate-pulse opacity-60" /> : null}
      {list.map((device) => {
        const line = deviceLine(device);
        const isHere = device.endpoint === here;
        return (
          <div key={device.id} className="card flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] leading-[22px]">
                {device.label ?? "Устройство"}
                {isHere ? <span className="text-muted"> · это устройство</span> : null}
              </p>
              <p className="truncate text-[13px] leading-4 text-muted" style={line.color ? { color: line.color } : undefined}>
                {line.text}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={device.enabled}
              aria-label={device.enabled ? "Не присылать сюда" : "Присылать сюда"}
              onClick={() => toggle.mutate(device)}
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]"
              style={{ background: device.enabled ? "var(--accent)" : "var(--border)" }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]"
                style={{ transform: device.enabled ? "translateX(24px)" : "translateX(4px)", left: 0 }}
              />
            </button>
            <button
              type="button"
              aria-label="Удалить устройство"
              onClick={() => remove.mutate(device)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] active:bg-surface-2"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
        );
      })}

      {!devices.isLoading && list.length === 0 ? (
        <p className="card px-4 py-3 text-[15px] leading-[21px] text-muted">
          Ни одного устройства — пуши сейчас никуда не приходят.
        </p>
      ) : null}

      {state === "default" ? (
        <Button block variant="primary" onClick={() => void enableHere()}>
          Включить на этом устройстве
        </Button>
      ) : null}
      {state && pushBlocker(state, pushPlatform()) ? (
        <p className="rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-[18px] text-warn">
          {pushBlocker(state, pushPlatform())}
        </p>
      ) : null}

      {anyOn ? (
        <div className="mt-1">
          <Button block variant="ghost" disabled={test.busy} onClick={() => void test.run()}>
            {test.busy ? "Проверяю…" : "Проверить уведомления"}
          </Button>
          {test.verdict ? (
            <p
              className="mt-2 text-center text-[13px] leading-4"
              style={{ color: test.verdict.tone === "ok" ? "var(--ok)" : test.verdict.tone === "warn" ? "var(--danger)" : "var(--text-muted)" }}
            >
              {test.verdict.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
