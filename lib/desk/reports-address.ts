/**
 * The desk «Отчёты» address (D-183): what the page shows lives in the address — the day of
 * «Сводка», the period of «Табель», the person whose diary is open — so «Назад», a reload and a
 * link open the same thing. Pure: the page reads and writes through these, the tests pin them.
 * Days are Aqtobe wall-clock days ("YYYY-MM-DD").
 */
import { addDays, daysInclusive, mondayOf, MONTHS_RU, parseYmd, ymdOf, type Ymd } from "@/lib/datetime/calendar";
import { PERIOD_MAX_DAYS } from "@/lib/daily-report/format";
import { isWorkday, type ReportRules } from "@/lib/people/stats";

export type ReportsTab = "day" | "tabel";

/** «Месяц» — a calendar month, «Неделя» — Monday to Sunday, «Свой» — any days up to 92. */
export type TabelPeriod = { kind: "month"; month: string } | { kind: "week"; monday: Ymd } | { kind: "custom"; from: Ymd; to: Ymd };

export type ReportsAddress = {
  tab: ReportsTab;
  /** «Сводка»'s day; null — the page decides (the morning rule). */
  day: Ymd | null;
  /** «Табель»'s period; null — the current month. */
  period: TabelPeriod | null;
  /** The person whose «Дневник» is open. */
  person: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const validDay = (value: string | null): Ymd | null => (value && YMD.test(value) && parseYmd(value) ? (value as Ymd) : null);

/** "YYYY-MM" of a day: the month of the address. */
function monthKey(day: Ymd): string {
  return day.slice(0, 7);
}

/** The first and the last day of a period. */
export function periodRange(period: TabelPeriod): { from: Ymd; to: Ymd } {
  if (period.kind === "custom") return { from: period.from, to: period.to };
  if (period.kind === "week") return { from: period.monday, to: addDays(period.monday, 6) };
  const [year, month] = period.month.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: ymdOf(year, month, 1), to: ymdOf(year, month, last) };
}

/** The period one step back or forward: a month, a week; «Свой» does not step. */
export function stepPeriod(period: TabelPeriod, dir: -1 | 1): TabelPeriod {
  if (period.kind === "week") return { kind: "week", monday: addDays(period.monday, dir * 7) };
  if (period.kind === "month") {
    const [year, month] = period.month.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + dir, 1));
    return { kind: "month", month: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}` };
  }
  return period;
}

/** The period of the same kind that holds today. */
export function currentPeriod(kind: TabelPeriod["kind"], today: Ymd, custom?: { from: Ymd; to: Ymd }): TabelPeriod {
  if (kind === "week") return { kind: "week", monday: mondayOf(today) };
  if (kind === "custom") return { kind: "custom", ...(custom ?? { from: addDays(today, -29), to: today }) };
  return { kind: "month", month: monthKey(today) };
}

/** Whether the period holds today — «Сегодня» is then pressed already. */
export function holdsToday(period: TabelPeriod, today: Ymd): boolean {
  const { from, to } = periodRange(period);
  return from <= today && today <= to;
}

/** «Свой» clamped to what the database answers: the order put right, at most 92 days. */
export function clampCustom(from: Ymd, to: Ymd): { from: Ymd; to: Ymd } {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return daysInclusive(a, b) > PERIOD_MAX_DAYS ? { from: addDays(b, 1 - PERIOD_MAX_DAYS), to: b } : { from: a, to: b };
}

/** The address as the page reads it; anything broken reads as «not given». */
export function readAddress(params: URLSearchParams): ReportsAddress {
  const raw = params.get("tab");
  // «period» — the name the tab had before D-183; old links keep working
  const tab: ReportsTab = raw === "tabel" || raw === "period" ? "tabel" : "day";
  const person = params.get("p") || null;
  if (tab === "day") return { tab, day: validDay(params.get("day")), period: null, person };
  const month = params.get("month");
  const week = validDay(params.get("week"));
  const from = validDay(params.get("from"));
  const to = validDay(params.get("to"));
  const period: TabelPeriod | null =
    month && MONTH.test(month)
      ? { kind: "month", month }
      : week
        ? { kind: "week", monday: mondayOf(week) }
        : from && to
          ? { kind: "custom", ...clampCustom(from, to) }
          : null;
  return { tab, day: null, period, person };
}

/** The address of a state: only what differs from the defaults is written. */
export function writeAddress(address: ReportsAddress): string {
  const query = new URLSearchParams();
  if (address.tab === "tabel") {
    query.set("tab", "tabel");
    const period = address.period;
    if (period?.kind === "month") query.set("month", period.month);
    else if (period?.kind === "week") query.set("week", period.monday);
    else if (period?.kind === "custom") {
      query.set("from", period.from);
      query.set("to", period.to);
    }
  } else if (address.day) {
    query.set("day", address.day);
  }
  if (address.person) query.set("p", address.person);
  return query.toString();
}

export type ReportRulesLite = Pick<ReportRules, "workdays" | "holidays">;

/** A working day by the company's weekdays and not a holiday — the one rule of lib/people/stats. */
export function isWorkdayOf(rules: ReportRulesLite, day: Ymd): boolean {
  return isWorkday(rules, day);
}

/** The last working day before `day` (Monday → Friday, holidays skipped); null within two weeks — none. */
export function lastWorkdayBefore(rules: ReportRulesLite, day: Ymd): Ymd | null {
  for (let back = 1; back <= 14; back++) {
    const candidate = addDays(day, -back);
    if (isWorkdayOf(rules, candidate)) return candidate;
  }
  return null;
}

/**
 * The morning rule: «Сводка» opened without a day shows the last working day while today's reports
 * have not started to come — a working day before `ask_from`, or a day off; else today. Decided once
 * when the page opens: it does not jump at 17:00 under the reader's eyes.
 */
export function autoDay(rules: ReportRulesLite, today: Ymd, nowHm: string, askFrom: string): Ymd {
  const early = isWorkdayOf(rules, today) ? nowHm < askFrom : true;
  if (!early) return today;
  return lastWorkdayBefore(rules, today) ?? today;
}

/** «Ноябрь 2026» — a calendar month in the head. */
export function monthTitle(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const name = MONTHS_RU[number - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}
