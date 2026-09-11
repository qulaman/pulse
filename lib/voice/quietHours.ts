/**
 * Delivery window 08:00–21:00 Asia/Aqtobe (D-38). The authority is the RPC; this copy
 * only decides what /confirm promises the director before the batch leaves.
 * Aqtobe is a fixed +05:00 all year, so the offset is arithmetic, not a timezone lookup.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;

export const WINDOW_OPEN_HOUR = 8;
export const WINDOW_CLOSE_HOUR = 21;

/** Wall-clock hour in Aqtobe for an instant. */
export function aqtobeHour(now: Date = new Date()): number {
  return new Date(now.getTime() + OFFSET_MS).getUTCHours();
}

export function isWithinDeliveryWindow(now: Date = new Date()): boolean {
  const hour = aqtobeHour(now);
  return hour >= WINDOW_OPEN_HOUR && hour < WINDOW_CLOSE_HOUR;
}

/**
 * Kinds whose moment was already decided upstream (D-38: a batch waits for the morning,
 * «отправить сейчас» overrides) — the worker never holds them. Everything else — an answer,
 * a rework, a question at 23:00 — waits for the window (принцип 8: тихие часы доставки).
 */
const TIMED_UPSTREAM = new Set(["task_sent", "announcement"]);

export function holdsForQuietHours(eventKind: string, now: Date = new Date()): boolean {
  if (TIMED_UPSTREAM.has(eventKind)) return false;
  return !isWithinDeliveryWindow(now);
}
