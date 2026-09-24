"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { enablePush, markSeen, pushPlatform, pushState, registerWorker, type PushPlatform, type PushState } from "@/lib/push/client";
import { pushBlocker } from "@/lib/push/words";

const DISMISS_KEY = "pulse.push.dismissed";

/** «Не сейчас» lasts until tomorrow (D-114): the system keeps asking until the channel works. */
function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/**
 * «Включить уведомления» — shown until the browser says granted; an iPhone outside the
 * home-screen app and a refused permission get the way out in their platform's words.
 * Also the place where an opened app reports «увидел» for its recent deliveries.
 */
export function PushCard({ compact = false, bubble = false }: { compact?: boolean; bubble?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [device, setDevice] = useState<PushPlatform>({ platform: "other", standalone: false });
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // first paint: read the browser state, register the worker, close the receipts
    const timer = setTimeout(() => {
      setState(pushState());
      setDevice(pushPlatform());
      let hidden = false;
      try {
        hidden = window.localStorage.getItem(DISMISS_KEY) === today();
      } catch {
        hidden = false;
      }
      setDismissed(hidden);
      void registerWorker();
      markSeen();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!state || state === "granted" || state === "no_keys" || dismissed) return null;
  const blocker = pushBlocker(state, device);
  // a desktop browser without push is not where the team lives
  if (state === "unsupported" && !blocker) return null;

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
      window.localStorage.setItem(DISMISS_KEY, today());
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
          {blocker ?? "Уведомления на этом телефоне выключены. Включить, чтобы задачи приходили, даже когда Pulse закрыт?"}
        </p>
        <div className="mt-3 flex gap-2">
          {blocker ? null : (
            <Button variant="primary" className="!min-h-[40px] !px-4 !text-[14px]" disabled={busy} onClick={enable}>
              {busy ? "…" : "Включить"}
            </Button>
          )}
          <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={dismiss}>
            {blocker ? "Понятно" : "Не сейчас"}
          </Button>
        </div>
      </div>
    );
  }

  if (blocker) {
    return (
      <p className="mt-4 rounded-[12px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] leading-4 text-warn">{blocker}</p>
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
      <button type="button" aria-label="Скрыть до завтра" onClick={dismiss} className="text-[18px] text-muted">
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
