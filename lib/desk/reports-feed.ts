/**
 * The feed of «Отчёты» (D-198, D-201): the pure words and choices — a day's head, who is without a
 * report, which days stand open and which fold into their one line, which reports «Проверить все»
 * takes, the next report for the key A, the words a search found. The screen draws from these, the
 * tests pin them. Days are Aqtobe "YYYY-MM-DD".
 */
import { dayTitle } from "@/lib/daily-report/format";
import type { DailyReport, FeedDay, FeedReport } from "@/lib/daily-report/types";
import { addDays, type Ymd } from "@/lib/datetime/calendar";
import { foldRu } from "@/lib/people/search";
import { pluralRu } from "@/lib/tasks/status-text";

/** «Сегодня · среда, 25 ноября», «Вчера · вторник, 24 ноября», «Понедельник · 23 ноября» (another year — with it). */
export function dayHead(date: Ymd, today: Ymd): { name: string; date: string } {
  const title = dayTitle(date);
  const [weekday = title, rest = ""] = title.split(", ");
  const year = date.slice(0, 4) === today.slice(0, 4) ? "" : ` ${date.slice(0, 4)}`;
  if (date === today || date === addDays(today, -1)) {
    return { name: date === today ? "Сегодня" : "Вчера", date: `${weekday.toLowerCase()}, ${rest}${year}` };
  }
  return { name: weekday, date: `${rest}${year}` };
}

/** What the head says of the day's team: «сдали 4 из 10», today with «· ждём 6»; a day nothing was due — its name. */
export function dayCountLine(day: Pick<FeedDay, "due" | "submitted" | "workday"> & Partial<Pick<FeedDay, "pending">>, holiday: boolean): string {
  if (day.due > 0) return `сдали ${day.submitted} из ${day.due}${day.pending ? ` · ждём ${day.pending}` : ""}`;
  if (holiday) return "праздник";
  return day.workday ? "отчёт не нужен" : "выходной";
}

/** Only a handed-in report is looked at and checked (D-198). */
export const isSubmitted = (report: Pick<DailyReport, "status">) => report.status === "submitted";
export const isChecked = (report: Pick<DailyReport, "checked_at">) => Boolean(report.checked_at);
export const isSeen = (report: Pick<DailyReport, "seen_at">) => Boolean(report.seen_at);

/** «Проверить все · N» of a day: the reports already seen and not checked yet — never one nobody read. */
export function checkableIds(reports: readonly FeedReport[]): string[] {
  return reports.filter((report) => isSubmitted(report) && isSeen(report) && !isChecked(report)).map((report) => report.id);
}

/** Every report of the day on screen is checked: the head says «все проверены». */
export function allChecked(reports: readonly FeedReport[]): boolean {
  const handed = reports.filter(isSubmitted);
  return handed.length > 0 && handed.every(isChecked);
}

/** A day's handed-in reports that still wait for «Проверено» — the count in its folded line (D-201). */
export function waitingCount(reports: readonly FeedReport[]): number {
  return reports.filter((report) => isSubmitted(report) && !isChecked(report)).length;
}

/** «1 не проверен», «5 не проверены». */
export function waitingText(count: number): string {
  return `${count} ${pluralRu(count, ["не проверен", "не проверены", "не проверены"])}`;
}

/** The first line of a report's words — what a checked report folds into (D-201); "" — no words. */
export function firstLine(text: string | null | undefined): string {
  return (
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

/** «Проверено 3 отчёта» — the toast of a batch. */
export function checkedText(count: number): string {
  return `Проверено ${count} ${pluralRu(count, ["отчёт", "отчёта", "отчётов"])}`;
}

/**
 * After A on a report: the next report that still waits, below it first, then from the top;
 * null — none is left (the choice stays where it is).
 */
export function nextUnchecked(order: readonly string[], current: string | null, waits: (id: string) => boolean): string | null {
  const at = current ? order.indexOf(current) : -1;
  for (const id of [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))]) {
    if (id !== current && waits(id)) return id;
  }
  return null;
}

/** A piece of words: found by the search (`hit`) or not. */
export type Part = { text: string; hit: boolean };

/**
 * The words with what the search found marked: every typed word of two letters and more, any
 * case, «ё» as «е» (the search's own rule, lib/people/search.ts). Overlaps merge into one mark.
 */
export function highlightParts(text: string, query: string): Part[] {
  const terms = [...new Set(foldRu(query).split(/\s+/).filter((term) => term.length >= 2))];
  if (!text || terms.length === 0) return text ? [{ text, hit: false }] : [];
  // folded char by char, so an index in it is the same index in the words as typed
  const folded = Array.from(text, (char) => {
    const lower = foldRu(char);
    return lower.length === char.length ? lower : char;
  }).join("");
  const spans: [number, number][] = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) spans.push([at, at + term.length]);
  }
  if (spans.length === 0) return [{ text, hit: false }];
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  const parts: Part[] = [];
  let from = 0;
  for (const [start, end] of merged) {
    if (start > from) parts.push({ text: text.slice(from, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    from = end;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}

/**
 * The day to scroll to for ← → from the day on top: ← an older one (further down), → a newer one;
 * null — the edge of what is loaded.
 */
export function neighbourDay(days: readonly Ymd[], current: Ymd | null, dir: -1 | 1): Ymd | null {
  if (days.length === 0) return null;
  const at = current ? days.indexOf(current) : 0;
  const next = (at < 0 ? 0 : at) + (dir === -1 ? 1 : -1);
  return next >= 0 && next < days.length ? days[next] : null;
}

/** The listed day a jump to `target` lands on: that day, or the first older one listed (a quiet day is not listed). */
export function landingDay(days: readonly Ymd[], target: Ymd): Ymd | null {
  return days.find((day) => day <= target) ?? null;
}

/**
 * The days the feed draws: a day with reports or people without one; today always while nothing
 * narrows the feed (its morning line), under a filter only when it holds something.
 */
export function shownDays(days: readonly FeedDay[], filtered: boolean): FeedDay[] {
  return days.filter((day) => day.reports.length > 0 || day.missed_people.length > 0 || (day.today && !filtered));
}

/**
 * Today is only a line yet — «Отчёты за сегодня — с 17:00», «Сегодня выходной»: nothing handed in,
 * nothing narrows the feed, and it is a day off or still before `ask_from`.
 */
export function isMorningLine(day: Pick<FeedDay, "today" | "workday" | "reports">, at: { filtered: boolean; holiday: boolean; beforeAsk: boolean }): boolean {
  return day.today && day.reports.length === 0 && !at.filtered && (!day.workday || at.holiday || at.beforeAsk);
}

/**
 * The days that stand open when the feed comes (D-201): the newest day drawn as a section and,
 * while it has no report yet, the days under it down to the first one with reports — so there is
 * always something to read on top and the rest of the month is one line a day. `skip` — today
 * while it is only the morning's line.
 */
export function defaultOpenDays(days: readonly Pick<FeedDay, "date" | "reports">[], skip: Ymd | null): Ymd[] {
  const open: Ymd[] = [];
  for (const day of days) {
    if (day.date === skip) continue;
    open.push(day.date as Ymd);
    if (day.reports.length > 0) break;
  }
  return open;
}

/**
 * Whether a day stands open: what the person chose by hand wins; under a filter (one person, words,
 * «Не проверены») every day is open — the feed is already short; otherwise the days of `base`.
 */
export function isDayOpen(date: Ymd, base: readonly Ymd[], toggled: ReadonlyMap<string, boolean>, filtered: boolean): boolean {
  return toggled.get(date) ?? (filtered || base.includes(date));
}

/** The key of a day's head among the feed's rows (↑ ↓ walk heads and reports alike). */
export const dayRowKey = (date: string) => `day:${date}`;
/** The day of a row key; null — the key is a report's. */
export const dayOfRowKey = (key: string | null): Ymd | null => (key?.startsWith("day:") ? (key.slice(4) as Ymd) : null);
