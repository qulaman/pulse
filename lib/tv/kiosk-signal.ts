/**
 * The wall's life outside its scenes (D-182). The wall hangs in an office and runs for days with
 * nobody at it: whatever stops it must also bring it back, and the remote must be told how it is.
 *
 * `TvScreen` tells this module three things (I5): it is alive (every clock tick), which `tv_state`
 * version it shows, and whether something is on the wall that a reload would cut (a visitor, a
 * focus, a board, a celebration). `KioskLife` reads them for the receipt and the update, the error
 * screen raises its flag here, and a watchdog with no React behind it reloads a page that went
 * quiet. Plain module state and a listener set: nothing here renders.
 *
 * No browser API is touched at import: the server layout imports the watchdog script from here.
 */

import type { Json } from "@/lib/supabase/types";

/** The error screen (`app/tv/error.tsx`): up now, how many times it came up, its retries in a row. */
export type KioskBoundary = { on: boolean; trips: number; retries: number; at: string | null };

export type WakeState = "on" | "off" | "unsupported" | "denied";

export type KioskSnapshot = {
  /** `performance.now()` of the last tick of the wall; null before the first. */
  aliveAt: number | null;
  /** The `tv_state` version the wall shows. */
  applied: number | null;
  /** Something on the wall a reload would cut: the build waits. */
  busy: boolean;
  boundary: KioskBoundary;
  wake: WakeState;
};

const INITIAL: KioskSnapshot = {
  aliveAt: null,
  applied: null,
  busy: false,
  boundary: { on: false, trips: 0, retries: 0, at: null },
  wake: "off",
};

let snapshot: KioskSnapshot = INITIAL;
const listeners = new Set<() => void>();

function update(patch: Partial<KioskSnapshot>, notify: boolean): void {
  snapshot = { ...snapshot, ...patch };
  if (notify) for (const listener of listeners) listener();
}

/** The global the watchdog script reads: the page's last sign of life, on the `performance.now()` clock. */
export const ALIVE_GLOBAL = "__pulseWallAlive";

function monotonic(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ---- I5: what TvScreen says ------------------------------------------------------------------

/** The wall ticked: its timers run and React renders. Also takes the error screen's flag down. */
export function kioskAlive(): void {
  const now = monotonic();
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>)[ALIVE_GLOBAL] = now;
  if (snapshot.boundary.on) update({ aliveAt: now, boundary: { ...snapshot.boundary, on: false, retries: 0 } }, true);
  else update({ aliveAt: now }, false);
}

/** The `tv_state` version now on the wall — the receipt says it at once. */
export function kioskApplied(version: number | null): void {
  if (version === snapshot.applied) return;
  update({ applied: version }, true);
}

/** A visitor's words, a focus, a board or a celebration is up: a new build waits for it to end. */
export function kioskBusy(busy: boolean): void {
  if (busy === snapshot.busy) return;
  update({ busy }, true);
}

// ---- the rest of the kiosk (KIOSK's own files) -------------------------------------------------

/** The error screen came up (or is still up after a failed retry). */
export function kioskBoundary(): void {
  if (snapshot.boundary.on) return;
  const boundary = { on: true, trips: snapshot.boundary.trips + 1, retries: 0, at: new Date().toISOString() };
  update({ boundary }, true);
}

/** The error screen asks the page to render once more. */
export function kioskBoundaryRetry(): void {
  update({ boundary: { ...snapshot.boundary, retries: snapshot.boundary.retries + 1 } }, false);
}

export function kioskWake(wake: WakeState): void {
  if (wake !== snapshot.wake) update({ wake }, false);
}

export function getKioskSnapshot(): KioskSnapshot {
  return snapshot;
}

export function subscribeKiosk(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: a fresh page. */
export function resetKioskForTest(): void {
  snapshot = INITIAL;
  listeners.clear();
}

// ---- decisions -----------------------------------------------------------------------------------

/** The page gave no sign of life this long: the watchdog reloads it. */
export const WATCHDOG_LIMIT_MS = 2 * 60_000;
/** How often the watchdog looks, and asks the server again after a refusal. */
export const WATCHDOG_EVERY_MS = 30_000;
/** Retries of the error screen before a full reload. */
export const BOUNDARY_RETRIES = 3;
/** No data since the wall came up this long ago: «нет связи». */
export const NEVER_FED_MS = 2 * 60_000;
/** The summary comes once a minute: three misses — the wall shows the past. */
export const STALE_MS = 3 * 60_000;

/**
 * A reload goes only to a server that answers: one that is down would leave the wall on the
 * browser's error page with no script to bring it back. `/api/me` 2xx — the deployment, the
 * sign-in and the base all work.
 */
export function reloadAllowed(status: number): boolean {
  return status >= 200 && status < 300;
}

/** The error screen's next step on its timer: one more render, or — after three — a reload. */
export function boundaryStep(retries: number): "retry" | "reload" {
  return retries < BOUNDARY_RETRIES ? "retry" : "reload";
}

/**
 * «Переподключаюсь…» asks `/api/me` every half minute. 2xx — reload into the wall. 401/403 twice
 * in a row — reload too: the layout then sends the wall to «Подключить экран» (`/tv-connect`).
 * Anything else — wait: the base is still away.
 */
export function reconnectStep(status: number, strikes: number): { reload: boolean; strikes: number } {
  if (reloadAllowed(status)) return { reload: true, strikes: 0 };
  if (status === 401 || status === 403) return { reload: strikes + 1 >= 2, strikes: strikes + 1 };
  return { reload: false, strikes };
}

/**
 * «Нет связи» in the corner: the browser knows there is no network, the last summary is older than
 * three minutes, or — never fed at all — two minutes have passed since the wall came up.
 */
export function offlineNow(input: { online: boolean; lastDataAt: number | null; bootAt: number; now: number }): boolean {
  if (!input.online) return true;
  if (input.lastDataAt && input.lastDataAt > 0) return input.now - input.lastDataAt > STALE_MS;
  return input.now - input.bootAt > NEVER_FED_MS;
}

// ---- health -----------------------------------------------------------------------------------------

/** `tv_state.health` (jsonb, ≤ 2 KB): what the remote and the console read about the wall. */
export type KioskHealth = {
  /** The build: short commit or deployment id. */
  build: string;
  /** Minutes since the page came up. */
  up_min: number;
  /** JS heap in use / its ceiling, MB (Chrome only). */
  mem_mb: number | null;
  mem_limit_mb: number | null;
  wake: WakeState;
  /** AudioContext state: `running` — the visitor's chime will sound; `suspended` — Chrome started without the autoplay flag. */
  sound: string;
  /** Chimes rung while the sound was not running. */
  silent_rings: number;
  /** Seconds since the wall last got data; null — never. */
  data_age_s: number | null;
  /** `error` + `unhandledrejection` since the page came up. */
  errors: number;
  last_error: string | null;
  /** The error screen is up now / times it came up since the page came up. */
  error_screen: boolean;
  error_screens: number;
  busy: boolean;
  online: boolean;
  visible: boolean;
  /** «1920x1080@1» — the window, in CSS pixels, and the device pixel ratio. */
  screen: string | null;
};

export type HealthInput = {
  build: { id: string; sha: string };
  bootAt: number;
  now: number;
  memory: { used: number; limit: number } | null;
  wake: WakeState;
  sound: { state: string; silent: number };
  lastDataAt: number | null;
  errors: number;
  lastError: string | null;
  boundary: KioskBoundary;
  busy: boolean;
  online: boolean;
  visible: boolean;
  screen: { width: number; height: number; dpr: number } | null;
};

const MB = 1024 * 1024;
export const HEALTH_MAX_BYTES = 2048;
const ERROR_MAX = 200;

function clip(text: string | null, max: number): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || null;
}

export function buildHealth(input: HealthInput): KioskHealth {
  const health: KioskHealth = {
    build: (input.build.sha || input.build.id).slice(0, 40),
    up_min: Math.max(0, Math.floor((input.now - input.bootAt) / 60_000)),
    mem_mb: input.memory ? Math.round(input.memory.used / MB) : null,
    mem_limit_mb: input.memory ? Math.round(input.memory.limit / MB) : null,
    wake: input.wake,
    sound: input.sound.state.slice(0, 20),
    silent_rings: input.sound.silent,
    data_age_s: input.lastDataAt ? Math.max(0, Math.round((input.now - input.lastDataAt) / 1000)) : null,
    errors: input.errors,
    last_error: clip(input.lastError, ERROR_MAX),
    error_screen: input.boundary.on,
    error_screens: input.boundary.trips,
    busy: input.busy,
    online: input.online,
    visible: input.visible,
    screen: input.screen ? `${Math.round(input.screen.width)}x${Math.round(input.screen.height)}@${input.screen.dpr}` : null,
  };
  // the error text is the only free-length field: it gives way first
  if (JSON.stringify(health).length > HEALTH_MAX_BYTES) health.last_error = null;
  return health;
}

export function healthJson(health: KioskHealth): Json {
  return health as unknown as Json;
}

// ---- the watchdog ----------------------------------------------------------------------------------

/** What the watchdog needs of `window` — a narrow face, so a test can hand it a fake. */
export type WatchdogHost = {
  performance: { now(): number };
  location: { pathname: string; reload(): void };
  document: { visibilityState: string };
  setInterval(handler: () => void, ms: number): unknown;
  fetch(input: string, init: { cache: "no-store"; credentials: "include" }): Promise<{ status: number }>;
} & Record<string, unknown>;

/**
 * Runs inline in the wall's layout, before React and outside it: a page whose React died — a
 * render loop, a crash past every boundary, a hydration that never came — still gets reloaded.
 * If the wall has not called `kioskAlive` for `limitMs` (the page's start counts as a sign), it asks
 * `/api/me` and reloads on 2xx; otherwise it asks again `everyMs` later. A hidden page is not on
 * the wall and its timers are throttled: it is left alone. Turned into a string for the layout —
 * so plain script, no imports, nothing from outside but the host.
 */
export function wallWatchdog(w: WatchdogHost, limitMs: number, everyMs: number): void {
  if (w.__pulseWallWatchdog) return;
  w.__pulseWallWatchdog = true;
  const started = w.performance.now();
  let asking = false;
  w.setInterval(function () {
    const path = w.location.pathname;
    if (asking || !(path === "/tv" || path.indexOf("/tv/") === 0) || w.document.visibilityState !== "visible") return;
    const alive = w.__pulseWallAlive;
    const last = typeof alive === "number" ? alive : started;
    if (w.performance.now() - last < limitMs) return;
    asking = true;
    w.fetch("/api/me", { cache: "no-store", credentials: "include" }).then(
      function (res) {
        if (res.status >= 200 && res.status < 300) w.location.reload();
        else asking = false;
      },
      function () {
        asking = false;
      },
    );
  }, everyMs);
}

/** The inline script of `app/tv/layout.tsx`. */
export const WALL_WATCHDOG_SCRIPT = `(${wallWatchdog.toString()})(window,${WATCHDOG_LIMIT_MS},${WATCHDOG_EVERY_MS});`;
