import type { TvWeekDay } from "./queries";

/**
 * The week on «Сегодня» (D-185, owner's answer 2026-11-25): seven columns, one per day of the company's last seven
 * days (`tv_summary.week`, today last), each the number of tasks the director accepted that day. Good news only
 * (D-45): a column is a count of accepted tasks, nothing else; a day with none has no bar and no «0» — the base line
 * alone, so an empty week still reads as a designed scale. Pure, checked by a test.
 */

export type WeekBar = {
  key: string;
  /** «пн», «вт» — the day's short name in Aqtobe. */
  label: string;
  done: number;
  /** 0..1 of the tallest bar of the week; 0 — no bar. */
  share: number;
  today: boolean;
};

const DAYS = 7;
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "short" });

/** «2026-11-24» at noon in Aqtobe: a safe instant to name the day by. */
function noonOf(day: string): Date {
  return new Date(`${day}T12:00:00+05:00`);
}

/**
 * The seven bars, oldest first, today last. A base older than the client (fewer days, or none) still gets seven
 * columns: the missing days are empty ones before the first known. `today` is the last day the base sent.
 */
export function weekBars(week: readonly TvWeekDay[] | undefined): WeekBar[] {
  const days = (week ?? []).slice(-DAYS);
  if (days.length === 0) return [];
  const last = noonOf(days[days.length - 1].day).getTime();
  const all = Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(last - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return days.find((d) => d.day === day) ?? { day, done: 0 };
  });
  const max = Math.max(0, ...all.map((d) => d.done));
  return all.map((d, i) => ({
    key: d.day,
    label: weekdayFmt.format(noonOf(d.day)),
    done: Math.max(0, d.done),
    share: max > 0 ? Math.max(0, d.done) / max : 0,
    today: i === DAYS - 1,
  }));
}
