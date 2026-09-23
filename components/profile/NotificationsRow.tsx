"use client";

import { useEffect, useState } from "react";

import { Row } from "@/components/ui/Row";
import { BellIcon } from "@/components/profile/icons";
import { toast } from "@/components/ui/Toast";
import { enablePush, pushState, type PushState } from "@/lib/push/client";

const LABEL: Record<PushState, string> = {
  granted: "включены",
  denied: "запрещены в браузере",
  default: "включить",
  unsupported: "браузер не умеет",
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
    <Row
      icon={<BellIcon />}
      title="Уведомления"
      tone={state === "denied" ? "danger" : "accent"}
      value={state ? LABEL[state] : ""}
      valueColor={state === "granted" ? "var(--ok)" : state === "denied" ? "var(--danger)" : undefined}
      busy={busy}
      disabled={!canEnable}
      onClick={() => void enable()}
    />
  );
}
