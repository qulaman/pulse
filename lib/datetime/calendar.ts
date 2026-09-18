/**
 * The calendar and the clock this app draws itself. The browser's own date and time
 * pickers are the last piece of system furniture in a field: they bring their own
 * layout, their own language and their own sense of what a week starts with, none of
 * which is ours. Everything here is the Aqtobe wall clock — the only clock the product
 * shows (CLAUDE.md §6) — and needs no date library, because +05:00 holds all year.
 */
import { AQTOBE_OFFSET } from "@/lib/ai/time";

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** A day on the Aqtobe wall clock: "2026-09-17". */
export type Ymd = string;
/** A time on the Aqtobe wall clock: "18:00". */
export type Hm = string;

/** Nominative for the month header, genitive for a date read out loud. */
export const MONTHS_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
] as const;

const MONTHS_RU_OF = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

/** The week starts on Monday here — a Sunday-first grid reads as somebody else's calendar. */
export const WEEKDAYS_SHORT_RU = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

export type YmdParts = { year: number; month: number; day: number };
export type Month = { year: number; month: number };

function wall(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

export function ymdOf(year: number, month: number, day: number): Ymd {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayYmd(now: Date = new Date()): Ymd {
  const w = wall(now);
  return ymdOf(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate());
}

export function nowHm(now: Date = new Date()): Hm {
  const w = wall(now);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
}

/** Parses a day, and refuses one that does not exist — "2026-02-31" is not a date. */
export function parseYmd(value: string | null | undefined): YmdParts | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseHm(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function hmOf(hours: number, minutes: number): Hm {
  return `${pad(hours)}:${pad(minutes)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthOf(ymd: Ymd | null, now: Date = new Date()): Month {
  const parts = parseYmd(ymd);
  if (parts) return { year: parts.year, month: parts.month };
  const today = parseYmd(todayYmd(now))!;
  return { year: today.year, month: today.month };
}

export function addMonths({ year, month }: Month, delta: number): Month {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

export function monthTitleRu({ year, month }: Month): string {
  return `${MONTHS_RU[month - 1]} ${year}`;
}

/**
 * Six rows of seven, Monday first, with empty cells where the month has not started or
 * has already ended. Six rows always: a grid that changes height makes the sheet jump
 * under the thumb between one month and the next.
 */
export function monthMatrix({ year, month }: Month): (Ymd | null)[][] {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // 0 = Monday
  const total = daysInMonth(year, month);
  const cells: (Ymd | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(ymdOf(year, month, day));
  while (cells.length < 42) cells.push(null);
  return [0, 1, 2, 3, 4, 5].map((row) => cells.slice(row * 7, row * 7 + 7));
}

/** Days are plain strings in this shape, so string order is date order. */
export function compareYmd(a: Ymd, b: Ymd): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(ymd: Ymd, min?: Ymd | null, max?: Ymd | null): boolean {
  if (min && compareYmd(ymd, min) < 0) return false;
  if (max && compareYmd(ymd, max) > 0) return false;
  return true;
}

/** Days between two days on the wall clock — b minus a, so tomorrow is +1. */
export function daysBetween(a: Ymd, b: Ymd): number {
  const from = parseYmd(a);
  const to = parseYmd(b);
  if (!from || !to) return 0;
  const ms = Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / DAY_MS);
}

/** What a person would say: «сегодня», «завтра», «чт, 17 сентября», year only when it differs. */
export function humanYmd(ymd: Ymd, now: Date = new Date()): string {
  const parts = parseYmd(ymd);
  if (!parts) return "";
  const today = todayYmd(now);
  const diff = daysBetween(today, ymd);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  const weekday = WEEKDAYS_SHORT_RU[(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7];
  const date = `${parts.day} ${MONTHS_RU_OF[parts.month - 1]}`;
  const thisYear = parseYmd(today)!.year;
  return parts.year === thisYear ? `${weekday}, ${date}` : `${weekday}, ${date} ${parts.year}`;
}

/** Half the width, same meaning: «сегодня», «завтра», otherwise «21.09» («21.09.27»). */
export function compactYmd(ymd: Ymd, now: Date = new Date()): string {
  const parts = parseYmd(ymd);
  if (!parts) return "";
  const diff = daysBetween(todayYmd(now), ymd);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  const day = `${pad(parts.day)}.${pad(parts.month)}`;
  const thisYear = parseYmd(todayYmd(now))!.year;
  return parts.year === thisYear ? day : `${day}.${String(parts.year).slice(2)}`;
}

/** The pair the rest of the app speaks in: an instant with the offset written out. */
export function ymdHmToAqtobeIso(ymd: Ymd | null, hm: Hm | null): string | null {
  if (!parseYmd(ymd) || !parseHm(hm)) return null;
  return `${ymd}T${hm}:00${AQTOBE_OFFSET}`;
}

export function aqtobeIsoToYmdHm(iso: string | null): { ymd: Ymd; hm: Hm } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const w = wall(date);
  return {
    ymd: ymdOf(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate()),
    hm: `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`,
  };
}
