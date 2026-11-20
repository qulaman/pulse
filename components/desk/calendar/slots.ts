import { hmOf, parseHm, ymdHmToAqtobeIso, type Hm, type Ymd } from "@/lib/datetime/calendar";
import { endOf } from "@/lib/calendar/overview";

import { HOUR_PX, dayMinuteOf } from "./week";

/**
 * The mouse on the desk's week of hours (wave 3, D-180): a click or a drag over an empty stretch
 * of a day is the time of a new meeting — snapped to a quarter of an hour, a click alone takes an
 * hour from its half-hour; a drag of the director's own meeting is its new time. The hour is as
 * tall as the grid draws it (`hourPx`). And the times a desk form offers in its lists. Pure
 * functions over the Aqtobe wall clock.
 */

/** A drag snaps to this. */
export const SNAP_MIN = 15;
/** A click alone starts on the half-hour it falls in and lasts this long. */
export const CLICK_MIN = 60;
const DAY_MIN = 24 * 60;

/** A stretch of a day: minutes past the wall clock's midnight. */
export type Slot = { ymd: Ymd; start: number; end: number };

/** The minutes of the day under a y on the grid (from the grid's top), snapped down to `step`. */
export function minutesAt(y: number, from: number, hourPx: number = HOUR_PX, step = SNAP_MIN): number {
  const raw = from * 60 + (y / hourPx) * 60;
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

/** The earliest minute of `ymd` a meeting may start at: today — the next quarter, a past day — never (null). */
export function earliest(ymd: Ymd, now: Date): number | null {
  const clock = dayMinuteOf(now.getTime());
  if (ymd < clock.ymd) return null;
  if (ymd > clock.ymd) return 0;
  return Math.ceil(clock.minutes / SNAP_MIN) * SNAP_MIN;
}

/** A slot moved to start no earlier than `first`, its length kept within the day; null — nothing of it is ahead. */
export function ahead(slot: Slot, first: number | null): Slot | null {
  if (first === null) return null;
  if (slot.start >= first) return slot;
  if (first + SNAP_MIN > DAY_MIN) return null;
  return { ...slot, start: first, end: Math.min(DAY_MIN, first + (slot.end - slot.start)) };
}

/** How long a meeting lasts, in ms — an hour when it has no end (D-180). */
export function lengthMs(event: { starts_at: string; ends_at?: string | null }): number {
  return Math.max(0, endOf(event) - new Date(event.starts_at).getTime());
}

/**
 * A meeting dragged to `minutes` of `ymd`, its length kept: the new start and end — or null when
 * it would start in the past (a meeting is never moved there) or did not move at all.
 */
export function movedTo(event: { starts_at: string; ends_at?: string | null }, ymd: Ymd, minutes: number, now: Date): { start: Date; end: Date } | null {
  const iso = ymdHmToAqtobeIso(ymd, hmAt(Math.max(0, Math.min(DAY_MIN - SNAP_MIN, minutes))));
  if (!iso) return null;
  const start = new Date(iso);
  if (start.getTime() < now.getTime()) return null;
  if (start.getTime() === new Date(event.starts_at).getTime()) return null;
  return { start, end: new Date(start.getTime() + lengthMs(event)) };
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
