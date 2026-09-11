"use client";

import { useEffect, useState } from "react";

import { toast } from "@/components/ui/Toast";
import { enablePush, pushState, type PushState } from "@/lib/push/client";

const LABEL: Record<PushState, string> = {
  granted: "включены",
  denied: "запрещены в браузере",
  default: "выключены · включить ›",
  unsupported: "этот браузер не умеет",
  no_keys: "не настроены",
};

/** Profile row: where push stands for this browser, one tap to switch it on. */
export function NotificationsRow() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setState(pushState()), 0);
    return () => clearTimeout(timer);
  }, []);

  const canEnable = state === "default";

  const enable = async () => {
    if (!canEnable) return;
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "granted") toast("Уведомления включены");
      else if (next === "denied") toast("Уведомления запрещены в настройках браузера");
    } catch {
      toast("Не получилось включить уведомления");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={enable}
      disabled={!canEnable || busy}
      className="flex min-h-[52px] w-full items-center justify-between gap-3 card px-4 text-left text-[16px] leading-[22px] disabled:opacity-100"
    >
      Уведомления
      <span className="text-[13px] leading-4" style={{ color: state === "granted" ? "var(--ok)" : "var(--text-muted)" }}>
        {busy ? "…" : state ? LABEL[state] : ""}
      </span>
    </button>
  );
}
