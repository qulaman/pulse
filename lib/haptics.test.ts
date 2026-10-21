import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { haptic, hapticsOn, iosHapticMode, OWN_PATTERN_MS, resetHapticsForTest, setHapticsOn, setIosHapticMode, tapHaptic, TAP_MS } from "./haptics";

function stubPhone({ vibrate, ua = "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro)" }: { vibrate: boolean; ua?: string }) {
  const calls: (number | number[])[] = [];
  const store = new Map<string, string>();
  vi.stubGlobal("navigator", {
    userAgent: ua,
    maxTouchPoints: 5,
    ...(vibrate ? { vibrate: (pattern: number | number[]) => (calls.push(pattern), true) } : {}),
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  return calls;
}

describe("haptics — one tick per tap, a pattern of its own wins (D-147)", () => {
  beforeEach(() => resetHapticsForTest());
  afterEach(() => vi.unstubAllGlobals());

  it("ticks a plain tap", () => {
    const calls = stubPhone({ vibrate: true });
    expect(tapHaptic(Date.now())).toBe(true);
    expect(calls).toEqual([TAP_MS]);
  });

  it("stays silent when the tap has just played a pattern of its own", () => {
    const calls = stubPhone({ vibrate: true });
    haptic([15, 30, 15]);
    expect(tapHaptic(Date.now() + OWN_PATTERN_MS - 50)).toBe(false);
    expect(calls).toEqual([[15, 30, 15]]);
  });

  it("ticks again for the next tap after the pattern", () => {
    const calls = stubPhone({ vibrate: true });
    haptic(12);
    expect(tapHaptic(Date.now() + OWN_PATTERN_MS + 50)).toBe(true);
    expect(calls).toEqual([12, TAP_MS]);
  });

  it("one touch with two clicks (a label and its control) ticks once", () => {
    const calls = stubPhone({ vibrate: true });
    const at = Date.now();
    expect(tapHaptic(at)).toBe(true);
    expect(tapHaptic(at + 5)).toBe(false);
    expect(tapHaptic(at + 200)).toBe(true);
    expect(calls).toEqual([TAP_MS, TAP_MS]);
  });

  it("is off for the whole phone once the person said so", () => {
    const calls = stubPhone({ vibrate: true });
    expect(hapticsOn()).toBe(true);
    setHapticsOn(false);
    haptic(20);
    expect(tapHaptic(Date.now())).toBe(false);
    expect(calls).toEqual([]);
  });

  it("an iPhone has no Vibration API: no crash, the switch way stays off until chosen", () => {
    const calls = stubPhone({ vibrate: false, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X)" });
    expect(tapHaptic(Date.now())).toBe(false);
    expect(iosHapticMode()).toBe("off");
    setIosHapticMode("label");
    expect(iosHapticMode()).toBe("label");
    setHapticsOn(false);
    expect(iosHapticMode()).toBe("off");
    expect(calls).toEqual([]);
  });

  it("an Android phone never takes the iPhone's way", () => {
    stubPhone({ vibrate: true });
    setIosHapticMode("input");
    expect(iosHapticMode()).toBe("off");
  });
});
