import { humanYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";

import type { CalendarEvent } from "./queries";

/**
 * How the calendar is read (D-78): a ribbon of days, not a month grid. Pure functions —
 * the same rows and the same clock give the same words on the page, on Пульс and on ТВ.
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
