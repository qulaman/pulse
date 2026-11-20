import {
  addMonths,
  compareYmd,
  daysBetween,
  hmAt,
  hmFrom,
  humanYmd,
  nowHm,
  parseHm,
  todayYmd,
  ymdAt,
  ymdHmToAqtobeIso,
  ymdOf,
  type Hm,
  type Month,
  type Ymd,
} from "@/lib/datetime/calendar";
import { pluralRu } from "@/lib/tasks/status-text";

import type { EventDraft } from "./mutations";
import type { CalendarEvent } from "./queries";

/**
 * How the calendar is read: a ribbon of days on Пульс and in Ленте (D-78), a month grid
 * with the ribbon under it on /calendar (D-94). Pure functions — the same rows and the
 * same clock give the same words on the page, on Пульс and on ТВ.
 */

export function ymdOfEvent(event: { starts_at: string }): Ymd {
  return ymdAt(new Date(event.starts_at));
}

export function hhmm(iso: string): string {
  return hmAt(new Date(iso));
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

/**
 * A meeting without an end lasts an hour — one rule everywhere (D-180): the grid draws it so,
 * `director_busy` counts it so (`coalesce(ends_at, starts_at + interval '1 hour')`), and it is
 * «идёт» and then over by the same clock on the phone and on the desk.
 */
export const NO_END_MS = 60 * 60 * 1000;

/** Where a meeting ends: its own end, or an hour after it began. */
export function endMs(event: { starts_at: string; ends_at?: string | null }): number {
  return event.ends_at ? new Date(event.ends_at).getTime() : new Date(event.starts_at).getTime() + NO_END_MS;
}

/** Over once its end has passed; a meeting without an end — an hour after it began. */
export function isOver(event: { starts_at: string; ends_at?: string | null }, now: Date): boolean {
  return endMs(event) < now.getTime();
}

/**
 * The meeting on right now (the desk's «Идёт», D-180): begun and not over; of two at once the one
 * that began last — the one the person has just walked into. `nextEvent` stays the phone's «the
 * next one», which counts a meeting that has just begun as still ahead.
 */
export function runningEvent<T extends { starts_at: string; ends_at?: string | null }>(events: readonly T[], now: Date): T | null {
  let found: T | null = null;
  for (const event of events) {
    if (new Date(event.starts_at).getTime() > now.getTime() || isOver(event, now)) continue;
    if (!found || event.starts_at > found.starts_at) found = event;
  }
  return found;
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
  return hmFrom(Math.min(23, parseHm(nowHm(now))!.hours + 1), 0);
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
  return hmFrom(Math.floor(moved / 60), moved % 60);
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

/** How the answers are joined: the phone's comma, the desk's middle dot. */
export type RsvpWords = { join: string };
export const RSVP_PHONE: RsvpWords = { join: ", " };
export const RSVP_DESK: RsvpWords = { join: " · " };

/**
 * «4 из 6 будут» / «1 из 3 будет, 2 не смогут» — what the director needs at a glance; one phrasing
 * for every place that says it (D-180), the verb agreeing with its number. The author counts as
 * coming: it is their meeting.
 */
export function rsvpSummary(event: CalendarEvent, words: RsvpWords = RSVP_PHONE): string {
  const total = event.participants.length;
  const going = event.participants.filter((p) => p.status === "going" || p.user_id === event.author_id).length;
  const declined = event.participants.filter((p) => p.status === "declined" && p.user_id !== event.author_id).length;
  const head = `${going} из ${total} ${pluralRu(going, ["будет", "будут", "будут"])}`;
  return declined > 0 ? `${head}${words.join}${declined} ${pluralRu(declined, ["не сможет", "не смогут", "не смогут"])}` : head;
}

/**
 * What a saved change sends (the trigger of `edit_event`): a new start — «Перенос», a new place —
 * «Новое место», to everyone on the list but the author and those who refused, while the meeting
 * is still ahead; a new end, title or agenda sends nothing. Null — nobody is told. Pure, for the
 * toast that says so (principle 8: the director knows what went out).
 */
export function noticeOfEdit(
  before: Pick<CalendarEvent, "starts_at" | "location" | "author_id" | "participants">,
  after: Pick<EventDraft, "starts_at" | "ends_at" | "location">,
  now: Date,
): "Перенос" | "Новое место" | null {
  const moved = new Date(before.starts_at).getTime() !== new Date(after.starts_at).getTime();
  const placed = (before.location ?? null) !== (after.location ?? null);
  if (!moved && !placed) return null;
  const ahead = new Date(after.ends_at ?? after.starts_at).getTime() > now.getTime();
  const told = before.participants.some((p) => p.user_id !== before.author_id && p.status !== "declined");
  if (!ahead || !told) return null;
  return moved ? "Перенос" : "Новое место";
}

/** The meeting as the form would save it unchanged — the base of a change of one field. */
export function draftOf(event: CalendarEvent): EventDraft {
  return {
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    location: event.location,
    body: event.body,
    remind_before_min: event.remind_before_min,
    everyone: event.everyone,
    participant_ids: event.everyone ? [] : event.participants.map((p) => p.user_id).filter((id) => id !== event.author_id),
  };
}

/**
 * «+15 мин» on a meeting that runs over (D-180): the end moves on from where it stands — an hour
 * after the start when there was none. Only the end: the trigger sends nobody anything.
 */
export function extendedEnd(event: { starts_at: string; ends_at?: string | null }, minutes: number): string {
  return new Date(endMs(event) + minutes * 60_000).toISOString();
}

/**
 * This person's meetings that share a stretch with `from`–`to` (the quick card's «Пересекается
 * с …», D-180): by the real ends — an hour for a meeting without one — the nearest first. Theirs:
 * made by them, or on their list and not refused.
 */
export function clashesWith<T extends CalendarEvent>(events: readonly T[], from: string, to: string, meId: string, exceptId: string | null = null): T[] {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return events
    .filter((event) => {
      if (event.id === exceptId || event.cancelled_at) return false;
      const mine = event.author_id === meId || event.participants.some((p) => p.user_id === meId && p.status !== "declined");
      return mine && new Date(event.starts_at).getTime() < end && endMs(event) > start;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** «15:00–16:00» with the end the rules give it — an hour on for a meeting without one. */
export function spanOf(event: { starts_at: string; ends_at?: string | null }): string {
  return `${hhmm(event.starts_at)}–${hhmm(new Date(endMs(event)).toISOString())}`;
}
