"use client";

import { useEffect, useState } from "react";

import { usePushTest } from "@/components/push/usePushTest";
import { Row } from "@/components/ui/Row";
import { BellIcon, PulseIcon } from "@/components/profile/icons";
import { toast } from "@/components/ui/Toast";
import { enablePush, pushPlatform, pushState, type PushState } from "@/lib/push/client";
import { pushBlocker, pushEnabledToast } from "@/lib/push/words";

const LABEL: Record<PushState, string> = {
  granted: "включены",
  denied: "запрещены в браузере",
  default: "включить",
  unsupported: "браузер не умеет",
  no_keys: "не настроены",
};

const TONE_COLOR = { ok: "var(--ok)", warn: "var(--danger)", muted: undefined } as const;

/**
 * Profile rows of the push channel (D-114). Everybody: where push stands for this browser, one
 * tap to switch it on, and «Проверить» — a real push and whether the phone showed it. The
 * director's row leads to his own rules (/profile/notifications); nobody else has rules — the
 * system decides for them.
 */
export function NotificationsRow({ director = false }: { director?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const test = usePushTest();

  useEffect(() => {
    const timer = setTimeout(() => setState(pushState()), 0);
    return () => clearTimeout(timer);
  }, []);

  const canEnable = state === "default";

  const enable = async () => {
    if (!canEnable) {
      const blocker = state ? pushBlocker(state, pushPlatform()) : null;
      if (blocker) toast(blocker);
      return;
    }
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "granted") {
        const done = pushEnabledToast(pushPlatform());
        toast(done.text, { lifetimeMs: done.lifetimeMs });
      } else if (next === "denied") toast("Уведомления запрещены в настройках браузера");
    } catch {
      toast("Не получилось включить уведомления");
    } finally {
      setBusy(false);
    }
  };

  const value = state ? LABEL[state] : "";
  const valueColor = state === "granted" ? "var(--ok)" : state === "denied" ? "var(--danger)" : undefined;

  return (
    <>
      {/* the director always reaches his rules; the screen itself switches this device on */}
      {director ? (
        <Row icon={<BellIcon />} title="Уведомления" value={value} valueColor={valueColor} href="/profile/notifications" />
      ) : (
        <Row
          icon={<BellIcon />}
          title="Уведомления"
          tone={state === "denied" ? "danger" : "accent"}
          value={value}
          valueColor={valueColor}
          busy={busy}
          disabled={state !== "default" && state !== "denied" && state !== "unsupported"}
          onClick={() => void enable()}
        />
      )}
      {state === "granted" ? (
        <Row
          icon={<PulseIcon />}
          title="Проверить уведомления"
          value={test.verdict?.text ?? "прислать пробное"}
          valueColor={test.verdict ? TONE_COLOR[test.verdict.tone] : undefined}
          busy={false}
          disabled={test.busy}
          onClick={() => void test.run()}
        />
      ) : null}
    </>
  );
}
