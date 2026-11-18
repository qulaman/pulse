"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { chimeStatus, primeChime } from "@/lib/tv/chime";
import { tvTime } from "@/lib/tv/clock";
import {
  buildHealth,
  getKioskSnapshot,
  healthJson,
  kioskAlive,
  kioskWake,
  reconnectStep,
  subscribeKiosk,
} from "@/lib/tv/kiosk-signal";
import { useTvState } from "@/lib/tv/queries";
import { holdUpdate, useUpdateRequest } from "@/lib/update/client";
import { useServerVersion } from "@/lib/update/queries";
import { useHydrated } from "@/lib/useHydrated";
import { BUILD, versionStatus } from "@/lib/version";

import { probeServer, useClock, useNightReload, useRemoteReload } from "./useKiosk";
import "./tv-type.css";

/**
 * The wall's life outside its scenes (D-182), mounted by `app/tv/layout.tsx` beside the page and
 * outside its error boundary — a scene that throws must not take the reloads and the receipt down
 * with it:
 *  - the 04:00 reload and «Перезапустить экран» from the remote, each only into a live server;
 *  - a new build only while nothing is on the wall that a reload would cut (`kioskBusy`);
 *  - the screen kept awake (Screen Wake Lock), asked again on every return to visible;
 *  - the receipt `tv_heartbeat` once a minute and at once on a new state or an error screen,
 *    with the wall's health: build, uptime, memory, wake lock, sound, data age, errors.
 * The receipt, the wake lock and the sound are the kiosk's (`tv`) only: the director's laptop
 * on `/tv` answers for nothing on the office wall.
 */
export function KioskLife({ role, companyId }: { role: string; companyId: string }) {
  const wall = role === "tv";
  // the same row TvScreen reads — one cache entry, one channel
  const state = useTvState(companyId);
  useNightReload();
  useRemoteReload(state.data ?? null);
  useUpdateWhenFree();
  useWakeLock(wall);
  useReceipt(wall);
  return null;
}

/**
 * The wall's update (D-115) is AppUpdate's, which reloads it the moment the server runs another
 * build — `updateAction` makes a busy wall wait (D-182). Busy reaches it as an update hold; the
 * wall's own «Обновить» makes AppUpdate re-read the hold every 1.5 s, so the build lands as soon
 * as the visitor's words or the board leave. The 04:00 reload brings it regardless.
 */
function useUpdateWhenFree(): void {
  const server = useServerVersion();
  const status = versionStatus(BUILD, server.data);
  const due = status === "outdated" || status === "required";

  useEffect(() => {
    if (due) useUpdateRequest.getState().request();
  }, [due]);

  useEffect(() => {
    let release: (() => void) | null = null;
    const sync = () => {
      const { busy } = getKioskSnapshot();
      if (busy && !release) release = holdUpdate();
      else if (!busy && release) {
        release();
        release = null;
      }
    };
    sync();
    const stop = subscribeKiosk(sync);
    return () => {
      stop();
      release?.();
    };
  }, []);
}

/** A refused or released lock is asked for again this often (and on every return to visible). */
const WAKE_RETRY_MS = 60_000;

/** The screen does not dim or sleep while the wall is up (Screen Wake Lock, Chrome 84+). */
function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) {
      kioskWake("unsupported");
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let asking = false;
    let stopped = false;

    const take = async () => {
      if (stopped || sentinel || asking || document.visibilityState !== "visible") return;
      asking = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) {
          void lock.release();
          return;
        }
        sentinel = lock;
        kioskWake("on");
        // the browser drops the lock whenever the page is hidden
        lock.addEventListener("release", () => {
          sentinel = null;
          if (!stopped) kioskWake("off");
        });
      } catch {
        kioskWake("denied");
      } finally {
        asking = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void take();
    };

    void take();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void take(), WAKE_RETRY_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}

const RECEIPT_MS = 60_000;

type HeartbeatArgs = Database["public"]["Functions"]["tv_heartbeat"]["Args"];
type ChromeMemory = { usedJSHeapSize: number; jsHeapSizeLimit: number };

/**
 * The receipt (principle 8 for the wall, D-76 §9; health — D-182): once a minute, at once on a
 * new `tv_state` version and when the error screen comes up or goes. A failed call goes to the
 * console only — the remote then says «экран не отвечает», and the wall must not blink over it.
 */
function useReceipt(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const supabase = createBrowserSupabase();
    const bootAt = Date.now();
    let errors = 0;
    let lastError: string | null = null;

    const onError = (event: ErrorEvent) => {
      errors += 1;
      lastError = event.message || String(event.error ?? "error");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      errors += 1;
      const reason: unknown = event.reason;
      lastError = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "rejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    // open the sound now: the receipt tells whether the visitor's chime can ring
    primeChime();

    // the wall's newest data of any kind: the summary, the feed, the state, a scene's read
    const lastDataAt = (): number | null => {
      let at = 0;
      for (const query of queryClient.getQueryCache().findAll({ queryKey: ["tv"] })) {
        at = Math.max(at, query.state.dataUpdatedAt);
      }
      return at > 0 ? at : null;
    };

    const beat = () => {
      const snap = getKioskSnapshot();
      const memory = (performance as Performance & { memory?: ChromeMemory }).memory;
      const health = buildHealth({
        build: { id: BUILD.id, sha: BUILD.sha },
        bootAt,
        now: Date.now(),
        memory: memory ? { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit } : null,
        wake: snap.wake,
        sound: chimeStatus(),
        lastDataAt: lastDataAt(),
        errors,
        lastError,
        boundary: snap.boundary,
        busy: snap.busy,
        online: navigator.onLine,
        visible: document.visibilityState === "visible",
        screen: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      });
      // `p_health` comes with migration 20261118140000; until the types know it, the cast keeps
      // both shapes compiling — an older base refuses the call, which is logged like any failure
      const args = { p_applied_version: snap.applied ?? undefined, p_health: healthJson(health) };
      void supabase.rpc("tv_heartbeat", args as HeartbeatArgs).then(({ error }) => {
        if (error) console.warn("tv_heartbeat:", error.message);
      });
    };

    let last = getKioskSnapshot();
    const stop = subscribeKiosk(() => {
      const next = getKioskSnapshot();
      const changed = next.applied !== last.applied || next.boundary.on !== last.boundary.on;
      last = next;
      if (changed) beat();
    });

    beat();
    const timer = setInterval(beat, RECEIPT_MS);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [enabled, queryClient]);
}

// ---- the wall waiting for itself -----------------------------------------------------------------

/** Ten-minute spots of the pause screen, in vh — its words never stand in one place all night. */
const PAUSE_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-6, -4],
  [6, 3],
  [-4, 5],
  [5, -5],
  [-7, 2],
];
const PAUSE_SPOT_MS = 10 * 60_000;

/**
 * The wall while it brings itself back: dark, the time and one quiet line, nothing to press
 * (principle 10). Shared by «Переподключаюсь…» (the base did not answer the sign-in check) and
 * the error screen (`app/tv/error.tsx`). The time appears after hydration: the server's minute
 * may already be gone.
 */
export function KioskPause({ text }: { text: string }) {
  const now = useClock();
  const hydrated = useHydrated();
  const [x, y] = PAUSE_SPOTS[Math.floor(now.getTime() / PAUSE_SPOT_MS) % PAUSE_SPOTS.length];

  return (
    <div className="flex h-dvh w-full items-center justify-center overflow-hidden bg-bg" style={{ cursor: "none" }} data-testid="tv-pause">
      <div className="flex flex-col items-center gap-[2.4vh] text-center" style={{ transform: `translate(${x}vh, ${y}vh)` }}>
        <p className="tv-hero font-bold tabular-nums text-text opacity-40" suppressHydrationWarning>
          {hydrated ? tvTime(now) : " "}
        </p>
        <p className="tv-lead flex items-center gap-[1.6vh] text-muted">
          <span aria-hidden className="inline-block h-[1.4vh] w-[1.4vh] animate-pulse rounded-full bg-accent" />
          {text}
        </p>
      </div>
    </div>
  );
}

/** «Переподключаюсь…» asks the server this often. */
const RECONNECT_MS = 30_000;

/**
 * The sign-in check failed on the base's side (503): the session may be alive, so the wall waits
 * instead of going to «Подключить экран». Every 30 s it asks `/api/me`: 2xx — back to the wall;
 * two 401/403 in a row — reload, and the layout sends it to pairing (`reconnectStep`). It says it
 * is alive each time, so the watchdog leaves it be. `still` — the sandbox: a picture, no asking.
 */
export function KioskReconnect({ still = false }: { still?: boolean }) {
  useEffect(() => {
    if (still) return;
    let stopped = false;
    let strikes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      kioskAlive();
      const status = await probeServer();
      if (stopped) return;
      const step = reconnectStep(status, strikes);
      strikes = step.strikes;
      if (step.reload) window.location.reload();
      else timer = setTimeout(() => void tick(), RECONNECT_MS);
    };
    kioskAlive();
    timer = setTimeout(() => void tick(), RECONNECT_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [still]);

  return <KioskPause text="Переподключаюсь…" />;
}
