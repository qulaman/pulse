import { hmOf, parseHm, ymdHmToAqtobeIso, type Hm, type Ymd } from "@/lib/datetime/calendar";

import { HOUR_PX } from "./week";

/**
 * The mouse on the desk's week of hours (wave 3): a click or a drag over an empty stretch of a
 * day is the time of a new meeting — snapped to a quarter of an hour, a click alone takes an
 * hour from its half-hour. And the times a desk form offers in its lists. Pure functions over the
 * Aqtobe wall clock.
 */

/** A drag snaps to this. */
export const SNAP_MIN = 15;
/** A click alone starts on the half-hour it falls in and lasts this long. */
export const CLICK_MIN = 60;
const DAY_MIN = 24 * 60;

/** A stretch of a day: minutes past the wall clock's midnight. */
export type Slot = { ymd: Ymd; start: number; end: number };

/** The minutes of the day under a y on the grid (from the grid's top), snapped down to `step`. */
export function minutesAt(y: number, from: number, step = SNAP_MIN): number {
  const raw = from * 60 + (y / HOUR_PX) * 60;
  return Math.max(0, Math.min(DAY_MIN - step, Math.floor(raw / step) * step));
}

/**
 * The slot of a press and a release on one day: a drag spans both ends (at least a quarter), a
 * click without a drag takes an hour from its half-hour — never past midnight.
 */
export function slotOf(ymd: Ymd, down: number, up: number, dragged: boolean): Slot {
  if (!dragged) {
    const start = Math.floor(down / 30) * 30;
    return { ymd, start, end: Math.min(DAY_MIN, start + CLICK_MIN) };
  }
  const start = Math.min(down, up);
  const end = Math.max(down, up) + SNAP_MIN;
  return { ymd, start, end: Math.min(DAY_MIN, end) };
}

/** «14:30» of minutes past midnight; 24:00 is said as 23:59, the last minute of the day. */
export function hmAt(minutes: number): Hm {
  const clamped = Math.max(0, Math.min(DAY_MIN - 1, minutes));
  return hmOf(Math.floor(clamped / 60), clamped % 60);
}

export function minutesOfHm(hm: Hm): number {
  const parts = parseHm(hm);
  return parts ? parts.hours * 60 + parts.minutes : 0;
}

/** The slot as the instants a meeting is written with. */
export function slotIso(slot: Slot): { starts_at: string; ends_at: string } {
  return { starts_at: ymdHmToAqtobeIso(slot.ymd, hmAt(slot.start))!, ends_at: ymdHmToAqtobeIso(slot.ymd, hmAt(slot.end))! };
}

/** «1 ч», «45 мин», «1 ч 30 мин» — how long a meeting lasts, beside its end in a list. */
export function lengthRu(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

/** Every quarter of an hour of the day — the list of a start. */
export function startTimes(): Hm[] {
  return Array.from({ length: DAY_MIN / SNAP_MIN }, (_, index) => hmAt(index * SNAP_MIN));
}

/**
 * The ends a start allows, each with how long it makes the meeting: the quarters after it till
 * the day is over (a meeting lives within one day).
 */
export function endTimes(start: Hm): { hm: Hm; label: string }[] {
  const from = minutesOfHm(start);
  const out: { hm: Hm; label: string }[] = [];
  for (let minutes = from + SNAP_MIN; minutes < DAY_MIN; minutes += SNAP_MIN) {
    out.push({ hm: hmAt(minutes), label: `${hmAt(minutes)} · ${lengthRu(minutes - from)}` });
  }
  return out;
}

/** A start not on the quarter grid (said by voice) keeps its own entry in the list. */
export function withOwn(list: readonly Hm[], own: Hm | null): Hm[] {
  if (!own || list.includes(own)) return [...list];
  return [...list, own].sort((a, b) => minutesOfHm(a) - minutesOfHm(b));
}

/**
 * Where a floating card stands beside a block (Google Calendar's way): to its right when there is
 * room, else to its left; its top a little above the block's — and high enough for `height`, what
 * the card may grow to, to fit the window. A point for `Popover`'s anchor.
 */
export function besideAnchor(
  rect: { left: number; right: number; top: number },
  width: number,
  viewport: { width: number; height: number },
  height = 0,
): { x: number; y: number } {
  const gap = 10;
  const right = rect.right + gap;
  const x = right + width <= viewport.width - 8 ? right : Math.max(8, rect.left - gap - width);
  // Popover hangs its panel a 6 px gap below the point
  return { x, y: Math.max(8, Math.min(rect.top - 18, viewport.height - height - 14)) };
}
