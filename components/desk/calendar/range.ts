import { shiftDay } from "@/lib/calendar/agenda";
import { monthTitleRu, parseYmd, weeksInMonth, ymdOf, type Month, type Ymd } from "@/lib/datetime/calendar";

/**
 * What the desk's calendar draws (D-153): a week of seven columns or a month of weeks, Monday
 * first like the phone's grid. Plain functions over the Aqtobe day strings.
 */

export type CalendarView = "week" | "month";

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(ymd: Ymd): number {
  const { year, month, day } = parseYmd(ymd)!;
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function mondayOf(ymd: Ymd): Ymd {
  return shiftDay(ymd, -weekdayOf(ymd));
}

/** The days on screen: the chosen day's week, or every week the month touches. */
export function daysOf(view: CalendarView, day: Ymd, month: Month): Ymd[] {
  if (view === "week") {
    const start = mondayOf(day);
    return Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
  }
  const start = mondayOf(ymdOf(month.year, month.month, 1));
  return Array.from({ length: weeksInMonth(month) * 7 }, (_, index) => shiftDay(start, index));
}

const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

function dateOf(ymd: Ymd): Date {
  const { year, month, day } = parseYmd(ymd)!;
  return new Date(Date.UTC(year, month - 1, day));
}

/** «3–9 ноября 2026», «27 октября – 2 ноября 2026», «29 декабря 2025 – 4 января 2026». */
export function weekTitle(first: Ymd, last: Ymd): string {
  const a = parseYmd(first)!;
  const b = parseYmd(last)!;
  if (a.year !== b.year) return `${DAY_MONTH.format(dateOf(first))} ${a.year} – ${DAY_MONTH.format(dateOf(last))} ${b.year}`;
  if (a.month !== b.month) return `${DAY_MONTH.format(dateOf(first))} – ${DAY_MONTH.format(dateOf(last))} ${b.year}`;
  return `${a.day}–${DAY_MONTH.format(dateOf(last))} ${b.year}`;
}

/** «Ноябрь 2026». */
export function monthTitle(month: Month): string {
  const title = monthTitleRu(month);
  return title.charAt(0).toUpperCase() + title.slice(1);
}
