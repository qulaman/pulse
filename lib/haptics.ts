/**
 * Haptics (D-147), two layers.
 *
 * Every tap ticks by itself: one listener for the whole app (`TapHaptics`) — no button codes
 * it. A moment with a meaning keeps its own pattern through `haptic()`: a hold that started a
 * recording, a card thrown, a reaction. The tap's tick stays silent when such a pattern has
 * just played, so one touch never buzzes twice.
 *
 * Android vibrates (`navigator.vibrate`). iOS Safari has no Vibration API: a tick there comes
 * only from a finger toggling a hidden `<input type="checkbox" switch>` — since iOS 26.5 never
 * from script — so an iPhone ticks only where a tap primitive carries one (`HapticSwitch`),
 * and patterns are lost there. A missing API is a no-op, never a crash (docs/DESIGN.md §3).
 *
 * The person switches it all off on this phone: Профиль → «Вибрация при нажатии».
 */

/** The tap's own tick: short enough to feel like a press, not a buzz. */
export const TAP_MS = 10;
/** A pattern this close before the tap's click was that tap's own (a pointerdown, a handler). */
export const OWN_PATTERN_MS = 350;

const ON_KEY = "pulse.haptics.v1";
const IOS_KEY = "pulse.haptics.ios.v1";
const CHANGED = "pulse:haptics";

/** How an iPhone's tick is carried — see `HapticSwitch`; checked on a real phone in «Лаб». */
export type IosHapticMode = "off" | "label" | "input";

let lastAt = 0;
let lastTapAt = -Infinity;
/** One touch, two clicks (a label hands its click to its control): one tick. */
const SAME_TOUCH_MS = 60;

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // a private window or blocked storage: the switch lasts until the tab closes
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
}

/** On by default; a phone that said «выключить» stays quiet. */
export function hapticsOn(): boolean {
  return read(ON_KEY) !== "off";
}

export function setHapticsOn(on: boolean): void {
  write(ON_KEY, on ? "on" : "off");
}

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** A pattern of its own for a moment with a meaning. */
export function haptic(pattern: number | number[] = 20): void {
  if (!canVibrate() || !hapticsOn()) return;
  lastAt = Date.now();
  navigator.vibrate(pattern);
}

/** The tap's tick, unless the tap has already played a pattern of its own since `clickedAt`. */
export function tapHaptic(clickedAt: number): boolean {
  if (lastAt >= clickedAt - OWN_PATTERN_MS) return false;
  if (clickedAt - lastTapAt < SAME_TOUCH_MS) return false;
  if (!canVibrate() || !hapticsOn()) return false;
  lastTapAt = clickedAt;
  navigator.vibrate(TAP_MS);
  return true;
}

/** iPhone: Safari without a Vibration API, on a touch screen (an iPad asks to be a Mac). */
export function isIosWeb(): boolean {
  if (typeof navigator === "undefined" || canVibrate()) return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** The iPhone's way chosen on this phone; off until «Лаб → Вибрация» says which one ticks. */
export function iosHapticMode(): IosHapticMode {
  if (!isIosWeb() || !hapticsOn()) return "off";
  const mode = read(IOS_KEY);
  return mode === "label" || mode === "input" ? mode : "off";
}

export function setIosHapticMode(mode: IosHapticMode): void {
  write(IOS_KEY, mode);
}

/** For `useSyncExternalStore`: the switches change in this tab or in another one. */
export function subscribeHaptics(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === ON_KEY || event.key === IOS_KEY) onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tests only: forget the last pattern. */
export function resetHapticsForTest(): void {
  lastAt = 0;
  lastTapAt = -Infinity;
}
