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

/** The company's window as stored in `company.settings.delivery_window` («HH:MM» strings). */
export type DeliveryWindow = { from?: string | null; to?: string | null };

/** Minutes since midnight for «HH:MM»; a malformed value falls back to the default hour. */
function minutesOf(value: string | null | undefined, fallbackHour: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return fallbackHour * 60;
  const hours = Math.min(23, Number(match[1]));
  const minutes = Math.min(59, Number(match[2]));
  return hours * 60 + minutes;
}

export function isWithinDeliveryWindow(now: Date = new Date(), window?: DeliveryWindow): boolean {
  const wall = new Date(now.getTime() + OFFSET_MS);
  const minute = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  const open = minutesOf(window?.from, WINDOW_OPEN_HOUR);
  const close = minutesOf(window?.to, WINDOW_CLOSE_HOUR);
  return minute >= open && minute < close;
}

/**
 * Kinds whose moment was already decided upstream (D-38: a batch waits for the morning,
 * «отправить сейчас» overrides) — the worker never holds them. Everything else — an answer,
 * a rework, a question at 23:00 — waits for the window (принцип 8: тихие часы доставки).
 */
const TIMED_UPSTREAM = new Set(["task_sent", "announcement"]);

export function holdsForQuietHours(eventKind: string, now: Date = new Date(), window?: DeliveryWindow): boolean {
  if (TIMED_UPSTREAM.has(eventKind)) return false;
  return !isWithinDeliveryWindow(now, window);
}
