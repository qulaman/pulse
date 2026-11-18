"use client";

import { useEffect, useState } from "react";

import { PulseMark } from "@/components/brand/PulseMark";
import "@/components/tv/tv-type.css";
import { formatPairCode, PAIR_POLL_MS, pairTimeLeft, WALL_TEXT } from "@/lib/tv/pairing";

/** What the wall shows while it waits for the director. */
export type WallView =
  | { kind: "loading" }
  /** `until` — this browser's clock, set from the seconds the base counted */
  | { kind: "code"; code: string; until: number; offline: boolean }
  | { kind: "connecting" }
  | { kind: "offline" }
  | { kind: "failed" }
  | { kind: "busy"; retryAfter: number };

const KEEP = "pulse.tv-pair";

/** The code on screen survives a reload: the director may be typing it right now. */
function keepCode(id: string, code: string) {
  try {
    window.localStorage.setItem(KEEP, JSON.stringify({ id, code }));
  } catch {
    // a private window keeps nothing: a reload just draws a new code
  }
}

function keptCode(id: string): string | null {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEEP) ?? "null") as { id?: string; code?: string } | null;
    return kept?.id === id && typeof kept.code === "string" ? kept.code : null;
  } catch {
    return null;
  }
}

/**
 * `/tv-connect` (D-182): a wall without a session shows six digits, the director types them on
 * the remote, and the wall becomes his company's. It asks every three seconds; the moment the
 * answer says «connected» the session is already in this browser's cookies and the wall opens
 * `/tv`. A code that ran out is replaced by itself; without network the code stays (it is still
 * good) and the wall says so. Nothing to press, no cursor (principle 10).
 */
export function TvConnect() {
  const [view, setView] = useState<WallView>({ kind: "loading" });

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let shown: { id: string; code: string; until: number } | null = null;

    const show = (offline = false) => {
      if (shown) setView({ kind: "code", code: shown.code, until: shown.until, offline });
    };

    /** A fresh code; the answer says how long to wait before the next step. */
    const issue = async (): Promise<number> => {
      const res = await fetch("/api/tv/pair", { method: "POST", credentials: "include", cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { code?: string; id?: string; expires_in?: number; retry_after?: number };
      if (res.status === 201 && body.code && body.id && body.expires_in) {
        shown = { id: body.id, code: body.code, until: Date.now() + body.expires_in * 1000 };
        keepCode(body.id, body.code);
        show();
        return PAIR_POLL_MS;
      }
      // the director has just confirmed the previous code: pick it up soon — never back to back, a poll that
      // keeps saying «gone» for it (the screen or the director switched off meanwhile) must not spin the wall
      if (res.status === 409) return 1_500;
      if (res.status === 429) {
        const wait = Math.max(30, body.retry_after ?? 60);
        shown = null;
        setView({ kind: "busy", retryAfter: wait });
        return wait * 1000;
      }
      shown = null;
      setView({ kind: "failed" });
      return 10_000;
    };

    const step = async () => {
      if (stopped) return;
      let next = PAIR_POLL_MS;
      try {
        const res = await fetch("/api/tv/pair", { credentials: "include", cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { state?: string; id?: string; expires_in?: number; error?: { code?: string } };
        if (stopped) return;
        if (res.ok && body.state === "connected") {
          setView({ kind: "connecting" });
          // a full load: the server renders the wall with the session this answer has just set
          window.location.replace("/tv");
          return;
        }
        if (res.ok && body.state === "waiting" && body.id && body.expires_in !== undefined) {
          const code = shown?.id === body.id ? shown.code : keptCode(body.id);
          if (code) {
            shown = { id: body.id, code, until: Date.now() + body.expires_in * 1000 };
            show();
          } else {
            next = await issue();
          }
        } else if (res.ok) {
          // none, expired, gone: a new code
          next = await issue();
        } else if (body.error?.code === "session_failed") {
          // confirmed, the session did not come out this time: the next poll tries again
          setView({ kind: "connecting" });
        } else if (shown) {
          show();
          next = 10_000;
        } else {
          setView({ kind: "failed" });
          next = 10_000;
        }
      } catch {
        // no network: a code still in time stays on the wall, it will work once the network is back
        if (shown && shown.until > Date.now()) show(true);
        else setView({ kind: "offline" });
        next = 5_000;
      }
      if (!stopped) timer = window.setTimeout(() => void step(), next);
    };

    void step();
    const online = () => {
      window.clearTimeout(timer);
      void step();
    };
    window.addEventListener("online", online);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
    };
  }, []);

  return <TvConnectView view={view} />;
}

/** «Код действует ещё N мин» moves by itself; a quarter of a minute is precise enough for minutes. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * The wall's picture of the wait, on the wall's type scale (D-182, components/tv/tv-type.css):
 * the code in `tv-giant`, the instruction in `tv-lead`, the time left in `tv-text`. Dark, nothing
 * to press, no cursor. Only opacity moves (the wall's perf contract, D-45).
 */
export function TvConnectView({ view, now: fixedNow }: { view: WallView; now?: number }) {
  const ticking = useNow();
  const now = fixedNow ?? ticking;

  return (
    <div
      className="relative flex h-dvh w-full flex-col overflow-hidden bg-bg text-text"
      style={{ cursor: "none" }}
      data-testid="tv-connect"
      data-state={view.kind}
    >
      <header className="flex shrink-0 items-center px-[4vh] pt-[3.4vh]">
        <PulseMark size="tv" />
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-[6vh] text-center" aria-live="polite">
        {view.kind === "code" ? (
          <div key={view.code} className="tv-connect-in flex flex-col items-center">
            <p className="tv-lead text-muted">Подключение экрана</p>
            <p
              className="tv-giant nums mt-[2.4vh] flex gap-[0.32em] font-bold tracking-[0.04em]"
              data-testid="tv-connect-code"
              aria-label={`Код ${view.code.split("").join(" ")}`}
            >
              <span>{formatPairCode(view.code).slice(0, 3)}</span>
              <span>{formatPairCode(view.code).slice(4)}</span>
            </p>
            <p className="tv-lead mt-[4vh] max-w-[150vh] text-balance">
              Откройте на телефоне Пульт → <span className="text-accent">«Подключить экран»</span> и введите код
            </p>
            <p className="tv-text mt-[2.4vh] flex items-center gap-[1.2vh] text-muted" data-testid="tv-connect-left">
              {view.offline ? (
                <span style={{ color: "var(--warn)" }}>Нет связи — код сработает, когда сеть вернётся</span>
              ) : (
                <>
                  <span className="tv-connect-dot inline-block h-[1.4vh] w-[1.4vh] rounded-full bg-accent" aria-hidden />
                  {pairTimeLeft(view.until - now)}
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="tv-title tv-connect-in max-w-[150vh] text-balance" data-testid="tv-connect-message">
            {view.kind === "connecting"
              ? WALL_TEXT.connecting
              : view.kind === "offline"
                ? WALL_TEXT.offline
                : view.kind === "failed"
                  ? WALL_TEXT.failed
                  : view.kind === "busy"
                    ? WALL_TEXT.busy(view.retryAfter)
                    : WALL_TEXT.loading}
          </p>
        )}
      </main>

      <footer className="tv-caption shrink-0 px-[4vh] pb-[3.4vh] text-muted">
        Экран покажет стену той компании, чей директор введёт код
      </footer>

      <style>{`
        .tv-connect-in { animation: tv-connect-in var(--t-tv) var(--ease-out) both; }
        @keyframes tv-connect-in { from { opacity: 0; } to { opacity: 1; } }
        .tv-connect-dot { animation: tv-connect-dot 2.4s var(--ease-in-out) infinite; }
        @keyframes tv-connect-dot { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .tv-connect-in, .tv-connect-dot { animation: none; } }
      `}</style>
    </div>
  );
}
