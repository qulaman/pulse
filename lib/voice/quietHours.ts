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
 * What an employee's phone may not receive at night (принцип 8, D-51): the director's answer,
 * a rework, an acceptance, a revoke, a moved deadline, an announcement. `task_sent` is not
 * here — its moment is decided by the producer (a batch waits for the morning, «отправить
 * сейчас» and a reassign inside the window go now, a reassign outside it is scheduled).
 * The director's own alerts (question, pending_review, declined) are not held either: that
 * is a product decision the owner has not taken (D-51 lists it as open).
 */
export const HELD_AT_NIGHT: ReadonlySet<string> = new Set(["reply", "rework", "done", "revoked", "deadline_extended", "announcement"]);

export function holdsForQuietHours(eventKind: string, now: Date = new Date(), window?: DeliveryWindow): boolean {
  if (!HELD_AT_NIGHT.has(eventKind)) return false;
  return !isWithinDeliveryWindow(now, window);
}
