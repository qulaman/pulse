import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALIVE_GLOBAL,
  BOUNDARY_RETRIES,
  HEALTH_MAX_BYTES,
  NEVER_FED_MS,
  STALE_MS,
  WALL_WATCHDOG_SCRIPT,
  WATCHDOG_EVERY_MS,
  WATCHDOG_LIMIT_MS,
  boundaryStep,
  buildHealth,
  getKioskSnapshot,
  kioskApplied,
  kioskBoundary,
  kioskBoundaryRetry,
  kioskBusy,
  kioskAlive,
  offlineNow,
  reconnectStep,
  reloadAllowed,
  resetKioskForTest,
  subscribeKiosk,
  wallWatchdog,
  type HealthInput,
  type WatchdogHost,
} from "./kiosk-signal";

beforeEach(() => resetKioskForTest());

describe("kiosk signals (I5)", () => {
  it("tells listeners of a new version and of busy, once per change", () => {
    const heard = vi.fn();
    const stop = subscribeKiosk(heard);
    kioskApplied(7);
    kioskApplied(7);
    kioskBusy(true);
    kioskBusy(true);
    kioskBusy(false);
    expect(heard).toHaveBeenCalledTimes(3);
    expect(getKioskSnapshot()).toMatchObject({ applied: 7, busy: false });
    stop();
    kioskApplied(8);
    expect(heard).toHaveBeenCalledTimes(3);
  });

  it("does not wake listeners on every tick", () => {
    const heard = vi.fn();
    subscribeKiosk(heard);
    kioskAlive();
    kioskAlive();
    expect(heard).not.toHaveBeenCalled();
    expect(getKioskSnapshot().aliveAt).not.toBeNull();
  });

  it("raises the error screen once per trip and lowers it on the next tick", () => {
    const heard = vi.fn();
    subscribeKiosk(heard);
    kioskBoundary();
    kioskBoundaryRetry();
    kioskBoundary(); // a failed retry: still the same trip
    expect(getKioskSnapshot().boundary).toMatchObject({ on: true, trips: 1, retries: 1 });
    kioskAlive();
    expect(getKioskSnapshot().boundary).toMatchObject({ on: false, trips: 1, retries: 0 });
    kioskBoundary();
    expect(getKioskSnapshot().boundary).toMatchObject({ on: true, trips: 2, retries: 0 });
    // up, down, up — each heard: the receipt goes at once
    expect(heard).toHaveBeenCalledTimes(3);
  });
});

describe("decisions", () => {
  it("reloads only into a server that answers 2xx", () => {
    expect(reloadAllowed(200)).toBe(true);
    expect(reloadAllowed(204)).toBe(true);
    for (const status of [0, 301, 401, 403, 429, 500, 502, 503]) expect(reloadAllowed(status)).toBe(false);
  });

  it("retries the error screen three times, then reloads", () => {
    expect(boundaryStep(0)).toBe("retry");
    expect(boundaryStep(BOUNDARY_RETRIES - 1)).toBe("retry");
    expect(boundaryStep(BOUNDARY_RETRIES)).toBe("reload");
  });

  it("waits out the base on «Переподключаюсь…», and needs two refusals to give the sign-in up", () => {
    expect(reconnectStep(200, 0)).toEqual({ reload: true, strikes: 0 });
    expect(reconnectStep(503, 0)).toEqual({ reload: false, strikes: 0 });
    expect(reconnectStep(0, 1)).toEqual({ reload: false, strikes: 1 });
    expect(reconnectStep(401, 0)).toEqual({ reload: false, strikes: 1 });
    expect(reconnectStep(403, 1)).toEqual({ reload: true, strikes: 2 });
  });

  it("says «нет связи» honestly — never fed counts too", () => {
    const bootAt = 1_000_000;
    // no network
    expect(offlineNow({ online: false, lastDataAt: bootAt, bootAt, now: bootAt })).toBe(true);
    // fresh data
    expect(offlineNow({ online: true, lastDataAt: bootAt, bootAt, now: bootAt + STALE_MS })).toBe(false);
    // the summary stopped
    expect(offlineNow({ online: true, lastDataAt: bootAt, bootAt, now: bootAt + STALE_MS + 1 })).toBe(true);
    // never fed: quiet at first, «нет связи» after two minutes
    expect(offlineNow({ online: true, lastDataAt: null, bootAt, now: bootAt + NEVER_FED_MS })).toBe(false);
    expect(offlineNow({ online: true, lastDataAt: null, bootAt, now: bootAt + NEVER_FED_MS + 1 })).toBe(true);
    expect(offlineNow({ online: true, lastDataAt: 0, bootAt, now: bootAt + NEVER_FED_MS + 1 })).toBe(true);
  });
});

describe("buildHealth", () => {
  const input: HealthInput = {
    build: { id: "dpl_123", sha: "4c1bbfa" },
    bootAt: 0,
    now: 3 * 3_600_000 + 30_000,
    memory: { used: 120 * 1024 * 1024, limit: 4096 * 1024 * 1024 },
    wake: "on",
    sound: { state: "suspended", silent: 2 },
    lastDataAt: 3 * 3_600_000,
    errors: 1,
    lastError: "TypeError:   x is\nundefined",
    boundary: { on: false, trips: 1, retries: 0, at: "2026-11-18T10:00:00.000Z" },
    busy: false,
    online: true,
    visible: true,
    screen: { width: 1920, height: 1080, dpr: 1 },
  };

  it("says what the remote needs, in numbers a person reads", () => {
    expect(buildHealth(input)).toEqual({
      build: "4c1bbfa",
      up_min: 180,
      mem_mb: 120,
      mem_limit_mb: 4096,
      wake: "on",
      sound: "suspended",
      silent_rings: 2,
      data_age_s: 30,
      errors: 1,
      last_error: "TypeError: x is undefined",
      error_screen: false,
      error_screens: 1,
      busy: false,
      online: true,
      visible: true,
      screen: "1920x1080@1",
    });
  });

  it("knows no memory, no data and no screen", () => {
    const health = buildHealth({ ...input, build: { id: "dev", sha: "" }, memory: null, lastDataAt: null, screen: null, lastError: null });
    expect(health).toMatchObject({ build: "dev", mem_mb: null, mem_limit_mb: null, data_age_s: null, screen: null, last_error: null });
  });

  it("stays within 2 KB whatever the error says", () => {
    const health = buildHealth({ ...input, lastError: "x".repeat(50_000), build: { id: "y".repeat(500), sha: "" } });
    expect(JSON.stringify(health).length).toBeLessThanOrEqual(HEALTH_MAX_BYTES);
    expect(health.last_error!.length).toBeLessThanOrEqual(200);
    expect(health.build.length).toBe(40);
  });
});

describe("the watchdog", () => {
  type Host = WatchdogHost & { reloads: number; asked: number };

  /** A fake window whose clock is the fake timers' clock. */
  function host(path = "/tv", answer = 200): Host {
    const h = {
      reloads: 0,
      asked: 0,
      performance: { now: () => Date.now() },
      location: {
        pathname: path,
        reload: () => {
          h.reloads += 1;
        },
      },
      document: { visibilityState: "visible" },
      setInterval: (handler: () => void, ms: number) => setInterval(handler, ms),
      fetch: () => {
        h.asked += 1;
        return Promise.resolve({ status: answer });
      },
    } as unknown as Host;
    return h;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("leaves a ticking wall alone", async () => {
    const w = host();
    wallWatchdog(w, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    for (let i = 0; i < 20; i += 1) {
      (w as Record<string, unknown>)[ALIVE_GLOBAL] = w.performance.now();
      await vi.advanceTimersByTimeAsync(WATCHDOG_EVERY_MS);
    }
    expect(w.asked).toBe(0);
    expect(w.reloads).toBe(0);
  });

  it("reloads a wall silent for two minutes — the page's start counts as a sign", async () => {
    const w = host();
    wallWatchdog(w, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    await vi.advanceTimersByTimeAsync(WATCHDOG_LIMIT_MS - WATCHDOG_EVERY_MS);
    expect(w.reloads).toBe(0);
    await vi.advanceTimersByTimeAsync(WATCHDOG_EVERY_MS);
    expect(w.asked).toBe(1);
    expect(w.reloads).toBe(1);
  });

  it("does not reload into a server that does not answer, and asks again", async () => {
    const w = host("/tv", 503);
    wallWatchdog(w, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    await vi.advanceTimersByTimeAsync(WATCHDOG_LIMIT_MS + 2 * WATCHDOG_EVERY_MS);
    expect(w.asked).toBe(3);
    expect(w.reloads).toBe(0);
  });

  it("stays out of other screens, hidden pages, and a second copy of itself", async () => {
    const off = host("/tv-connect");
    wallWatchdog(off, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    const hidden = host();
    hidden.document.visibilityState = "hidden";
    wallWatchdog(hidden, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    const twice = host();
    wallWatchdog(twice, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    wallWatchdog(twice, WATCHDOG_LIMIT_MS, WATCHDOG_EVERY_MS);
    await vi.advanceTimersByTimeAsync(WATCHDOG_LIMIT_MS + WATCHDOG_EVERY_MS);
    expect(off.asked + hidden.asked).toBe(0);
    expect(twice.asked).toBe(1);
  });

  it("reads the same global kioskAlive writes", () => {
    expect(ALIVE_GLOBAL).toBe("__pulseWallAlive");
    expect(wallWatchdog.toString()).toContain("__pulseWallAlive");
  });

  it("is a script that runs on its own, with nothing from the module", () => {
    const w = host();
    // the inline script as the browser runs it
    new Function("window", WALL_WATCHDOG_SCRIPT)(w);
    expect(w.__pulseWallWatchdog).toBe(true);
  });
});
