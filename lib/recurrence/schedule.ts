import { aqtobeDay } from "../ai/time";

/**
 * A repeating order as data (D-148): how often, on which days, by what time. The parser names
 * it, code counts the dates — the same split as TimeRef (task 026). The database has the same
 * arithmetic in SQL (`recurrence_matches` / `recurrence_next_on`, migration
 * 20261022120000_recurrence_live); this copy draws the card before anything is sent and the
 * lines of the list. Days are Aqtobe wall-clock day numbers (`aqtobeDay`): +05:00 all year,
 * no DST, so a day is always 86 400 000 ms.
 */

export const REPEAT_EVERY = ["day", "workday", "week", "month"] as const;
export type RepeatEvery = (typeof REPEAT_EVERY)[number];

export interface RepeatRule {
  every: RepeatEvery;
  /** 1 — every time; 2 — «раз в две недели»; capped at 12. */
  interval: number;
  /** For `week`: ISO weekdays 1 (пн) … 7 (вс), sorted, at least one. */
  weekdays: number[];
  /** For `month`: 1…31; a month shorter than it takes its last day («в конце месяца» — 31). */
  month_day: number;
}

/** A meeting repeats in one of these steps; its day of the week or month is its own start (D-148). */
export const EVENT_REPEATS = ["none", "day", "workday", "week", "biweek", "month"] as const;
export type EventRepeat = (typeof EVENT_REPEATS)[number];

const DAY_MS = 86_400_000;
const MAX_INTERVAL = 12;
// a rule that matches nothing in this many days matches nothing at all
const HORIZON_DAYS = 800;

/** The rule as code can trust it: an empty week is a Monday, a lost interval is 1. */
export function normalizeRule(rule: RepeatRule): RepeatRule {
  const every: RepeatEvery = (REPEAT_EVERY as readonly string[]).includes(rule.every) ? rule.every : "week";
  const interval = Number.isFinite(rule.interval) ? Math.min(Math.max(Math.round(rule.interval), 1), MAX_INTERVAL) : 1;
  let weekdays = [...new Set((rule.weekdays ?? []).map((d) => Math.round(d)).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  const monthDay = Number.isFinite(rule.month_day) ? Math.min(Math.max(Math.round(rule.month_day), 0), 31) : 0;
  if (every === "week" && weekdays.length === 0) weekdays = [1];
  return {
    every,
    interval: every === "workday" ? 1 : interval,
    weekdays: every === "week" ? weekdays : [],
    month_day: every === "month" ? monthDay || 1 : 0,
  };
}

/** The wall-clock fields of a day number. */
function wall(day: number): { year: number; month: number; date: number; weekday: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay() || 7 };
}

function lastDateOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Monday of the day's week, as a day number: weeks are counted between Mondays. */
function mondayOf(day: number): number {
  return day - (wall(day).weekday - 1);
}

/** Does the rule fall on this day — the day's own fields only, without the interval's phase. */
function fallsOn(rule: RepeatRule, day: number): boolean {
  const w = wall(day);
  switch (rule.every) {
    case "day":
      return true;
    case "workday":
      return w.weekday <= 5;
    case "week":
      return rule.weekdays.includes(w.weekday);
    case "month":
      return w.date === Math.min(rule.month_day, lastDateOf(w.year, w.month));
  }
}

/** Is the day in step with the first occurrence: «раз в две недели» skips every other one. */
function inPhase(rule: RepeatRule, day: number, anchor: number): boolean {
  if (rule.interval <= 1) return true;
  switch (rule.every) {
    case "day":
      return (((day - anchor) % rule.interval) + rule.interval) % rule.interval === 0;
    case "workday":
      return true;
    case "week": {
      const weeks = (mondayOf(day) - mondayOf(anchor)) / 7;
      return ((weeks % rule.interval) + rule.interval) % rule.interval === 0;
    }
    case "month": {
      const a = wall(anchor);
      const d = wall(day);
      const months = (d.year - a.year) * 12 + (d.month - a.month);
      return ((months % rule.interval) + rule.interval) % rule.interval === 0;
    }
  }
}

export function matches(rule: RepeatRule, day: number, anchor: number): boolean {
  return fallsOn(rule, day) && inPhase(rule, day, anchor);
}

/** The first occurrence after `after` (a day number), in step with `anchor`; null if none. */
export function nextOn(rule: RepeatRule, after: number, anchor: number): number | null {
  const r = normalizeRule(rule);
  for (let day = after + 1; day <= after + HORIZON_DAYS; day += 1) if (matches(r, day, anchor)) return day;
  return null;
}

export interface Clock {
  hours: number;
  minutes: number;
}

export function parseClock(value: string | null | undefined): Clock | null {
  const match = value ? /^\s*(\d{1,2}):(\d{2})/.exec(value) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? { hours, minutes } : null;
}

const minutesOf = (clock: Clock) => clock.hours * 60 + clock.minutes;

/** The instant of a day number at a wall-clock time in Aqtobe. */
export function instantOf(day: number, clock: Clock): Date {
  return new Date(day * DAY_MS + minutesOf(clock) * 60_000 - 5 * 3_600_000);
}

/**
 * When the task of a day is made: as the day's delivery window opens; a deadline no later than
 * that opening is made the morning before, or it would arrive already late (D-148).
 */
export function runAtOf(day: number, due: Clock, windowFrom: Clock): Date {
  return instantOf(minutesOf(due) <= minutesOf(windowFrom) ? day - 1 : day, windowFrom);
}

/**
 * The first occurrence of a new rule: the nearest matching day whose task is still to be made —
 * said on Monday before the working day, «каждый понедельник» starts today; said at noon, next
 * week. It is also the anchor every later step counts from.
 */
export function firstOn(rule: RepeatRule, now: Date, due: Clock, windowFrom: Clock): number | null {
  const r = normalizeRule(rule);
  const today = aqtobeDay(now);
  for (let day = today; day <= today + HORIZON_DAYS; day += 1) {
    if (fallsOn(r, day) && runAtOf(day, due, windowFrom).getTime() > now.getTime()) return day;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

const EVERY_DAY_OF_WEEK = ["", "каждый понедельник", "каждый вторник", "каждую среду", "каждый четверг", "каждую пятницу", "каждую субботу", "каждое воскресенье"];
const ON_DAYS_OF_WEEK = ["", "понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];
export const WEEKDAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_SHORT = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

function times(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** «раз в две недели», «раз в 3 месяца». */
function onceIn(n: number, unit: "day" | "week" | "month"): string {
  const words: Record<typeof unit, [string, string, string]> = {
    day: ["день", "дня", "дней"],
    week: ["неделю", "недели", "недель"],
    month: ["месяц", "месяца", "месяцев"],
  };
  const spelled = n === 2 ? (unit === "week" ? "две" : "два") : String(n);
  return `раз в ${spelled} ${times(n, words[unit])}`;
}

/** The rule in plain Russian: «каждый понедельник», «по вторникам и четвергам», «каждое 5-е число». */
export function describeRule(rule: RepeatRule): string {
  const r = normalizeRule(rule);
  switch (r.every) {
    case "day":
      return r.interval === 1 ? "каждый день" : onceIn(r.interval, "day");
    case "workday":
      return "по будням";
    case "week": {
      const days = r.weekdays;
      let text: string;
      if (days.length === 7) text = "каждый день";
      else if (days.length === 5 && days.every((d, i) => d === i + 1)) text = "по будням";
      else if (days.length === 1) text = EVERY_DAY_OF_WEEK[days[0]];
      else text = `по ${joinAnd(days.map((d) => ON_DAYS_OF_WEEK[d]))}`;
      if (r.interval === 1) return text;
      // «каждый понедельник» once in two weeks reads as «по понедельникам»
      const plural = days.length === 1 ? `по ${ON_DAYS_OF_WEEK[days[0]]}` : text;
      return `${onceIn(r.interval, "week")} ${plural}`;
    }
    case "month": {
      const day = r.month_day >= 31 ? "в последний день месяца" : `${r.month_day}-го числа`;
      if (r.interval === 1) return r.month_day >= 31 ? day : `каждое ${r.month_day}-е число`;
      return `${onceIn(r.interval, "month")}, ${day}`;
    }
  }
}

/** The day number of a calendar date «YYYY-MM-DD» (a `date` column); null for anything else. */
export function dayOfYmd(ymd: string | null | undefined): number | null {
  const match = ymd ? /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd) : null;
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : null;
}

/** «пн, 27 окт.» — the date of an occurrence. */
export function describeDay(day: number): string {
  const w = wall(day);
  // the date and its month never part at a line end
  return `${WEEKDAY_SHORT[w.weekday]}, ${w.date}\u00a0${MONTHS_SHORT[w.month]}`;
}

/** A meeting's step in words: «каждую неделю», «раз в две недели». */
export const EVENT_REPEAT_LABEL: Record<EventRepeat, string> = {
  none: "Не повторять",
  day: "Каждый день",
  workday: "По будням",
  week: "Каждую неделю",
  biweek: "Раз в две недели",
  month: "Каждый месяц",
};

/** A meeting's step as the rule it becomes: its weekday and date are the first meeting's own. */
export function ruleOfEventRepeat(repeat: EventRepeat, start: Date): RepeatRule | null {
  if (repeat === "none") return null;
  const day = aqtobeDay(start);
  const w = wall(day);
  switch (repeat) {
    case "day":
      return { every: "day", interval: 1, weekdays: [], month_day: 0 };
    case "workday":
      return { every: "workday", interval: 1, weekdays: [], month_day: 0 };
    case "week":
    case "biweek":
      return { every: "week", interval: repeat === "biweek" ? 2 : 1, weekdays: [w.weekday], month_day: 0 };
    case "month":
      return { every: "month", interval: 1, weekdays: [], month_day: w.date };
  }
}
