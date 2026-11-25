/**
 * The desk «Отчёты» address (D-183, D-198): what the page shows lives in the address — the day the
 * feed «Подряд» scrolls to, the feed's filters (one person, words, «Не проверены»), the period of
 * «Табель», the person whose «Дневник» is open — so «Назад», a reload and a link open the same
 * thing. Old links keep working: `?day=…&p=…` of «Команда» (the feed at that day, the diary open),
 * `?tab=period`. Pure: the page reads and writes through these, the tests pin them. Days are
 * Aqtobe wall-clock days ("YYYY-MM-DD").
 */
import { addDays, daysInclusive, mondayOf, MONTHS_RU, parseYmd, ymdOf, type Ymd } from "@/lib/datetime/calendar";
import { PERIOD_MAX_DAYS } from "@/lib/daily-report/format";

/** «Подряд» — the reports day after day (D-198, it replaced «День»), «Табель» — people × days. */
export type ReportsTab = "feed" | "tabel";

/** «Месяц» — a calendar month, «Неделя» — Monday to Sunday, «Свой» — any days up to 92. */
export type TabelPeriod = { kind: "month"; month: string } | { kind: "week"; monday: Ymd } | { kind: "custom"; from: Ymd; to: Ymd };

export type ReportsAddress = {
  tab: ReportsTab;
  /** The day the feed scrolls to and the diary opens on; null — today, the top of the feed. */
  day: Ymd | null;
  /** «Табель»'s period; null — the current month. */
  period: TabelPeriod | null;
  /** The person whose «Дневник» is open. */
  person: string | null;
  /** The feed of one person (`?who=`). */
  who: string | null;
  /** Words the feed's reports must hold (`?q=`); "" — none. */
  q: string;
  /** «Не проверены» (`?only=new`). */
  unchecked: boolean;
};

/** What the server searches is short: a pasted page is cut, never sent whole. */
export const QUERY_MAX = 80;

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
  // «period» — the name the tab had before D-183; «day» — before D-198: both still open
  const tab: ReportsTab = raw === "tabel" || raw === "period" ? "tabel" : "feed";
  const person = params.get("p") || null;
  const day = validDay(params.get("day"));
  if (tab === "feed") {
    const q = (params.get("q") ?? "").trim().slice(0, QUERY_MAX);
    return { tab, day, period: null, person, who: params.get("who") || null, q, unchecked: params.get("only") === "new" };
  }
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
  return { tab, day, period, person, who: null, q: "", unchecked: false };
}

/** The address of a state: only what differs from the defaults is written; the feed's filters only on the feed. */
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
  } else {
    if (address.who) query.set("who", address.who);
    const q = address.q.trim().slice(0, QUERY_MAX);
    if (q) query.set("q", q);
    if (address.unchecked) query.set("only", "new");
  }
  if (address.day) query.set("day", address.day);
  if (address.person) query.set("p", address.person);
  return query.toString();
}

/** The address of one person's reports in the feed — what «Команда» and «Дневник» link to (D-198). */
export function personFeedHref(userId: string, day?: Ymd | null): string {
  const query = new URLSearchParams({ who: userId });
  if (day) query.set("day", day);
  return `/desk/reports?${query.toString()}`;
}

/** «Ноябрь 2026» — a calendar month in the head. */
export function monthTitle(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const name = MONTHS_RU[number - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}
