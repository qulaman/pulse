"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { enablePush, markSeen, pushState, registerWorker, type PushState } from "@/lib/push/client";

const DISMISS_KEY = "pulse.push.dismissed";

/**
 * «Включить уведомления» — shown until the browser says granted. Also the place
 * where an opened app reports «увидел» for its recent deliveries.
 */
export function PushCard({ compact = false, bubble = false }: { compact?: boolean; bubble?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // first paint: read the browser state, register the worker, close the receipts
    const timer = setTimeout(() => {
      setState(pushState());
      let hidden = false;
      try {
        hidden = window.localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        hidden = false;
      }
      setDismissed(hidden);
      void registerWorker();
      markSeen();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!state || state === "granted" || state === "unsupported" || state === "no_keys" || dismissed) return null;

  const enable = async () => {
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

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: the card simply comes back next time
    }
    setDismissed(true);
  };

  if (bubble) {
    return (
      <div className="card-in relative py-1 pl-4">
        <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full" style={{ background: "var(--text-muted)" }} />
        <p className="text-[17px] leading-6">
          {state === "denied"
            ? "Уведомления запрещены в браузере. Разреши их в настройках сайта, иначе задачи придут только при открытии."
            : "Уведомления на этом телефоне выключены. Включить, чтобы задачи приходили, даже когда Pulse закрыт?"}
        </p>
        {state !== "denied" ? (
          <div className="mt-3 flex gap-2">
            <Button variant="primary" className="!min-h-[40px] !px-4 !text-[14px]" disabled={busy} onClick={enable}>
              {busy ? "…" : "Включить"}
            </Button>
            <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={dismiss}>
              Не сейчас
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="mt-4 rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-4 text-warn">
        Уведомления запрещены в браузере. Разреши их в настройках сайта, иначе задачи придут только при открытии
      </p>
    );
  }

  return (
    <div className={`card-in ${compact ? "mt-3" : "mt-4"} flex items-center gap-3 rounded-[16px] border border-accent/40 bg-surface px-4 py-3`}>
      <BellIcon />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] leading-[22px]">Уведомления</p>
        <p className="text-[13px] leading-4 text-muted">Задача придёт на телефон, даже если Pulse закрыт</p>
      </div>
      <Button variant="primary" className="!min-h-[40px] !px-3 !text-[14px]" disabled={busy} onClick={enable}>
        {busy ? "…" : "Включить"}
      </Button>
      <button type="button" aria-label="Скрыть" onClick={dismiss} className="text-[18px] text-muted">
        ×
      </button>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
