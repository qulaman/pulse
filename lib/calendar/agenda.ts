import {
  addMonths,
  compareYmd,
  daysBetween,
  hmOf,
  humanYmd,
  nowHm,
  parseHm,
  todayYmd,
  ymdHmToAqtobeIso,
  ymdOf,
  type Hm,
  type Month,
  type Ymd,
} from "@/lib/datetime/calendar";

import type { CalendarEvent } from "./queries";

/**
 * How the calendar is read: a ribbon of days on Пульс and in Ленте (D-78), a month grid
 * with the ribbon under it on /calendar (D-94). Pure functions — the same rows and the
 * same clock give the same words on the page, on Пульс and on ТВ.
 */

/** Aqtobe is +05:00 all year (docs/AI.md §2), so the wall clock is plain arithmetic. */
const OFFSET_MS = 5 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function wall(iso: string): Date {
  return new Date(new Date(iso).getTime() + OFFSET_MS);
}

export function ymdOfEvent(event: { starts_at: string }): Ymd {
  const w = wall(event.starts_at);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function hhmm(iso: string): string {
  const w = wall(iso);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** «10:00» or «10:00–11:30» — the end only when the director named one. */
export function timeRange(event: { starts_at: string; ends_at?: string | null }): string {
  const start = hhmm(event.starts_at);
  return event.ends_at ? `${start}–${hhmm(event.ends_at)}` : start;
}

export type DayGroup<T> = { ymd: Ymd; label: string; events: T[] };

/** Groups by the company's day, in order, labelled the way a person would say it. */
export function dayGroups<T extends { starts_at: string }>(events: readonly T[], now: Date): DayGroup<T>[] {
  const groups = new Map<Ymd, T[]>();
  for (const event of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const ymd = ymdOfEvent(event);
    const list = groups.get(ymd);
    if (list) list.push(event);
    else groups.set(ymd, [event]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ymd, list]) => ({ ymd, label: humanYmd(ymd, now), events: list }));
}

/** Half an hour of grace: a meeting that has just started is still «the next one». */
export const STARTED_GRACE_MS = 30 * 60 * 1000;
/** «Скоро»: the quarter of an hour in which people get up and go (D-78 §8). */
export const SOON_MS = 15 * 60 * 1000;

export function nextEvent<T extends { starts_at: string }>(events: readonly T[], now: Date): T | null {
  const at = now.getTime();
  const ahead = [...events]
    .filter((event) => new Date(event.starts_at).getTime() >= at - STARTED_GRACE_MS)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return ahead[0] ?? null;
}

/** Over once its end has passed; a meeting without an end — half an hour after it began. */
export function isOver(event: { starts_at: string; ends_at?: string | null }, now: Date): boolean {
  const end = event.ends_at
    ? new Date(event.ends_at).getTime()
    : new Date(event.starts_at).getTime() + STARTED_GRACE_MS;
  return end < now.getTime();
}

/**
 * What one month of the page reads: the month itself and the one after it, because the
 * ribbon under the grid runs on past the month's last day.
 */
export function monthWindow({ year, month }: Month): { from: string; to: string } {
  const after = addMonths({ year, month }, 2);
  return {
    from: ymdHmToAqtobeIso(ymdOf(year, month, 1), "00:00")!,
    to: ymdHmToAqtobeIso(ymdOf(after.year, after.month, 1), "00:00")!,
  };
}

/** A day so many days on (or back) — the week view steps by seven. */
export function shiftDay(ymd: Ymd, days: number): Ymd {
  const [year, month, day] = ymd.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return ymdOf(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** Meetings per company day — the dots under the numbers of the grid. */
export function countByDay(events: readonly { starts_at: string }[]): Map<Ymd, number> {
  const counts = new Map<Ymd, number>();
  for (const event of events) {
    const ymd = ymdOfEvent(event);
    counts.set(ymd, (counts.get(ymd) ?? 0) + 1);
  }
  return counts;
}

/**
 * The ribbon under the grid: the chosen day first — even an empty one, it is what was
 * tapped — then every day ahead that has something, up to `days` days on.
 */
export function agendaFrom<T extends { starts_at: string }>(
  events: readonly T[],
  from: Ymd,
  now: Date,
  days = 30,
): DayGroup<T>[] {
  const ahead = events.filter((event) => {
    const ymd = ymdOfEvent(event);
    return compareYmd(ymd, from) >= 0 && daysBetween(from, ymd) <= days;
  });
  const groups = dayGroups(ahead, now);
  if (groups[0]?.ymd !== from) groups.unshift({ ymd: from, label: humanYmd(from, now), events: [] });
  return groups;
}

/** Where a new meeting starts: the next whole hour today, ten in the morning any other day. */
export function defaultStartHm(day: Ymd, now: Date): Hm {
  if (day !== todayYmd(now)) return "10:00";
  return hmOf(Math.min(23, parseHm(nowHm(now))!.hours + 1), 0);
}

const minutesOf = (hm: Hm) => {
  const parts = parseHm(hm)!;
  return parts.hours * 60 + parts.minutes;
};

/**
 * A moved start takes the end along, so the meeting keeps its length; an end pushed past
 * midnight is dropped — a meeting here lives within one day.
 */
export function shiftEnd(startBefore: Hm, end: Hm | null, startAfter: Hm): Hm | null {
  if (!end) return null;
  const moved = minutesOf(end) + minutesOf(startAfter) - minutesOf(startBefore);
  if (moved >= 24 * 60 || moved <= minutesOf(startAfter)) return null;
  return hmOf(Math.floor(moved / 60), moved % 60);
}

/** The end must come after the start — on the same day, by the rule above. */
export function endIsBeforeStart(start: Hm | null, end: Hm | null): boolean {
  return Boolean(start && end && minutesOf(end) <= minutesOf(start));
}

export function startsSoon(event: { starts_at: string } | null, now: Date, withinMs = SOON_MS): boolean {
  if (!event) return false;
  const left = new Date(event.starts_at).getTime() - now.getTime();
  return left <= withinMs && left >= -STARTED_GRACE_MS;
}

/** Today's meetings that are still ahead — the number on the fourth orb. */
export function todayCount(events: readonly CalendarEvent[], now: Date): number {
  const today = todayYmd(now);
  const at = now.getTime();
  return events.filter(
    (event) =>
      ymdOfEvent(event) === today && new Date(event.starts_at).getTime() >= at - STARTED_GRACE_MS,
  ).length;
}

export type ParticipantStatus = "invited" | "going" | "declined";

export function myStatus(event: CalendarEvent, meId: string): ParticipantStatus | null {
  const mine = event.participants.find((p) => p.user_id === meId);
  return (mine?.status as ParticipantStatus | undefined) ?? null;
}

/** Everybody who has not refused — the author included: he is a participant too. */
export function peopleCount(event: CalendarEvent): number {
  return event.participants.filter((p) => p.status !== "declined").length;
}

/** «4 из 6 будут» / «4 из 6 будут, 1 не сможет» — what the director needs at a glance. */
export function rsvpSummary(event: CalendarEvent): string {
  const total = event.participants.length;
  const going = event.participants.filter((p) => p.status === "going").length;
  const declined = event.participants.filter((p) => p.status === "declined").length;
  const head = `${going} из ${total} будут`;
  return declined > 0 ? `${head}, ${declined} не сможет` : head;
}
