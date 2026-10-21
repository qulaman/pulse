import { z } from "zod";

import { conventionFor, TIME_PARTS, type Convention, type TimePart } from "./conventions";
import { aqtobeDateAt, aqtobeIsoWeekday, atAqtobe, toAqtobeIso } from "./time";

/**
 * Time as the model hears it (task 026): a symbolic reference, never an ISO. The model says
 * WHAT was named — a day, a weekday, a date, a clock time, a part of the day — and code turns
 * it into an instant on the Aqtobe clock with the company's conventions (D-15). Date
 * arithmetic was the model's one systematic failure (evals fs-05, a-003, a-007, a-015).
 *
 * A flat object, every field present and nullable: the same shape for JSON mode and for the
 * Claude grammar, no union of shapes.
 */

export const TIME_DAYS = ["today", "tomorrow", "after_tomorrow", "weekday", "date"] as const;

export const TimeRefSchema = z.strictObject({
  /** The words about time, verbatim — the yellow chip on /confirm quotes them. */
  text: z.string(),
  day: z.enum(TIME_DAYS).nullable(),
  /** 1 — Monday … 7 — Sunday; with day "weekday". */
  weekday: z.literal([1, 2, 3, 4, 5, 6, 7]).nullable(),
  /** "YYYY-MM-DD", only when a calendar date was named. */
  date: z.string().nullable(),
  /** "HH:MM", only when a clock time was named. */
  time: z.string().nullable(),
  part: z.enum(TIME_PARTS).nullable(),
  /** How sure the model is it heard the words right; a phonetic reconstruction is ≤ 0.5. */
  confidence: z.number(),
});

export type TimeRef = z.infer<typeof TimeRefSchema>;

export interface ResolvedTime {
  iso: string;
  confidence: number;
  source_text: string | null;
}

/** Whose time it is: a meeting named without a time starts at 09:00 (D-78). */
export type TimeOwner = "task" | "event" | "reminder";

// A moment already behind «now» is something the director must look at (yellow chip).
const PAST_CONFIDENCE_CAP = 0.7;
// D-78: «в пятницу корпоратив» — 09:00 of that day, and the card asks to check it.
const EVENT_DAY_TIME = { hours: 9, minutes: 0 };
const EVENT_DAY_CONFIDENCE = 0.5;
// Parts of the day after noon: «в шесть вечера» said as "06:00" is 18:00.
const AFTERNOON_PARTS = new Set<TimePart>(["after_lunch", "evening", "end_of_day"]);

interface Clock {
  hours: number;
  minutes: number;
}

function parseClock(value: string | null): Clock | null {
  const match = value ? /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(value) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : null;
}

/**
 * A named hour is a working hour: «в три» is 15:00, «до шести» 18:00 (eval a-007) — an hour
 * 1–7 with no part of the day is the afternoon, and an afternoon part moves any morning hour.
 */
function daytime(clock: Clock, part: TimePart | null): Clock {
  if (clock.hours >= 1 && clock.hours <= 11 && part !== null && AFTERNOON_PARTS.has(part)) {
    return { ...clock, hours: clock.hours + 12 };
  }
  if (clock.hours >= 1 && clock.hours <= 7 && part === null) return { ...clock, hours: clock.hours + 12 };
  return clock;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0);

/**
 * TimeRef → an instant, or null when nothing usable was named.
 * - a weekday is the nearest such day ahead; today counts while its moment is still ahead;
 * - only a time or a part, no day: today, or the next such moment once today's has passed
 *   (eval a-015: «до девяти утра» said at 10:00 is tomorrow 09:00);
 * - a part takes its time (and, for the week, Friday) from the company's convention row;
 *   a day without a time — `day_default`, a weekday without a time — `weekday_default`;
 *   a meeting without a time — 09:00 at 0.5 (D-78);
 * - confidence = min(the model's, the convention row's); a named clock time keeps the model's;
 *   a result before `now` is capped at 0.7 so the director sees it.
 */
export function resolveTimeRef(
  ref: TimeRef | null,
  now: Date,
  conventions: readonly Convention[],
  owner: TimeOwner,
): ResolvedTime | null {
  if (!ref) return null;
  const named = parseClock(ref.time);
  const row = ref.part ? conventionFor(conventions, ref.part) : null;
  const dateMatch = ref.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ref.date.trim()) : null;

  // which day: a Friday row wins (the week has one end), then what was named
  let weekday: number | null = ref.day === "weekday" || ref.day === null ? ref.weekday : null;
  if (row?.day === "friday") weekday = 5;
  const dayShift = ref.day === "today" ? 0 : ref.day === "tomorrow" ? 1 : ref.day === "after_tomorrow" ? 2 : null;
  const hasDay = weekday !== null || dayShift !== null || dateMatch !== null;
  if (!hasDay && !named && !row) return null;

  let confidence = clamp01(ref.confidence);
  let clock: Clock;
  if (named) {
    clock = daytime(named, ref.part);
  } else if (row) {
    clock = parseClock(row.time) ?? EVENT_DAY_TIME;
    confidence = Math.min(confidence, row.confidence);
  } else if (owner === "event") {
    clock = EVENT_DAY_TIME;
    confidence = Math.min(confidence, EVENT_DAY_CONFIDENCE);
  } else {
    const fallback = conventionFor(conventions, weekday !== null && dayShift === null && !dateMatch ? "weekday_default" : "day_default");
    clock = parseClock(fallback.time) ?? EVENT_DAY_TIME;
    confidence = Math.min(confidence, fallback.confidence);
  }

  let at: Date | null;
  if (dateMatch && row?.day !== "friday") {
    at = aqtobeDateAt(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]), clock.hours, clock.minutes);
  } else if (dayShift !== null && row?.day !== "friday") {
    at = atAqtobe(now, dayShift, clock.hours, clock.minutes);
  } else if (weekday !== null) {
    const ahead = (weekday - aqtobeIsoWeekday(now) + 7) % 7;
    at = atAqtobe(now, ahead, clock.hours, clock.minutes);
    if (at.getTime() <= now.getTime()) at = atAqtobe(now, ahead + 7, clock.hours, clock.minutes);
  } else {
    at = atAqtobe(now, 0, clock.hours, clock.minutes);
    if (at.getTime() <= now.getTime()) at = atAqtobe(now, 1, clock.hours, clock.minutes);
  }
  if (!at) return null;

  if (at.getTime() < now.getTime()) confidence = Math.min(confidence, PAST_CONFIDENCE_CAP);
  const text = ref.text.trim();
  return { iso: toAqtobeIso(at), confidence, source_text: text || null };
}
