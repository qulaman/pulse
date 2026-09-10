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
