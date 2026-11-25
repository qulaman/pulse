/**
 * D-198: the words and the address of the director's «Отчёты» on the phone (/reports) — the feed
 * «Подряд» (days in a row, today on top) and «Период». Pure: the screen draws from these, the
 * tests pin them. Every clock is the Aqtobe wall clock (lib/datetime/calendar.ts).
 */
import { addDays, parseYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import type { FeedDay, FeedMissed, FeedReport } from "./types";

/* -------------------------------------------------------------------------- */
/* The address                                                                 */
/* -------------------------------------------------------------------------- */

export type ReportsTab = "feed" | "period";

/** Everything the screen shows lives in the address: a link brings the director to the same view. */
export type ReportsAddress = {
  /** `?tab=period`; the feed is the default (an old `?tab=day` is the feed too). */
  tab: ReportsTab;
  /** `?who=<user id>`: one person's reports through the months. */
  who: string | null;
  /** `?only=new`: submitted reports without «Проверено». */
  unchecked: boolean;
  /** `?day=YYYY-MM-DD`: the feed opens scrolled to that day. */
  day: Ymd | null;
};

const ID = /^[0-9a-f-]{8,64}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Params = { get(name: string): string | null };

/** The address read back; anything unreadable is left out, never an error. */
export function readReportsAddress(params: Params): ReportsAddress {
  const who = params.get("who");
  const day = params.get("day");
  return {
    tab: params.get("tab") === "period" ? "period" : "feed",
    who: who && ID.test(who) ? who.toLowerCase() : null,
    unchecked: params.get("only") === "new",
    day: day && DAY.test(day) && parseYmd(day) ? day : null,
  };
}

/** The address of a view, its parameters always in one order: `/reports?tab&who&only&day`. */
export function reportsHref(address: ReportsAddress): string {
  const params = new URLSearchParams();
  if (address.tab === "period") params.set("tab", "period");
  // a person and «не проверены» are the feed's filters: the period has neither
  if (address.tab === "feed") {
    if (address.who) params.set("who", address.who);
    if (address.unchecked) params.set("only", "new");
    if (address.day) params.set("day", address.day);
  }
  const query = params.toString();
  return query ? `/reports?${query}` : "/reports";
}

/* -------------------------------------------------------------------------- */
/* A day of the feed                                                           */
/* -------------------------------------------------------------------------- */

const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

const utcOf = (ymd: Ymd) => {
  const parts = parseYmd(ymd);
  return parts ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)) : null;
};

/**
 * The day's head in two parts: «Сегодня» + «среда, 25 ноября», «Вчера» + «вторник, 24 ноября»,
 * «Понедельник» + «23 ноября»; the year only when it is not this one.
 */
export function dayHead(date: Ymd, now: Date): { title: string; sub: string } {
  const at = utcOf(date);
  if (!at) return { title: date, sub: "" };
  const today = todayYmd(now);
  const year = parseYmd(date)!.year === parseYmd(today)!.year ? "" : ` ${parseYmd(date)!.year}`;
  const weekday = WEEKDAY.format(at);
  const day = `${DATE.format(at)}${year}`;
  if (date === today) return { title: "Сегодня", sub: `${weekday}, ${day}` };
  if (date === addDays(today, -1)) return { title: "Вчера", sub: `${weekday}, ${day}` };
  return { title: weekday.charAt(0).toUpperCase() + weekday.slice(1), sub: day };
}

/**
 * The day's count beside its head: «сдали 4 из 10»; nobody owed one — «отчёт не нужен» with the
 * reports that came anyway; an excused miss is said apart from the missed ones (D-183).
 */
export function dayCountLine(day: FeedDay): string {
  if (day.due === 0) return day.submitted > 0 ? `отчёт не нужен · сдали ${day.submitted}` : "отчёт не нужен";
  return `сдали ${day.submitted} из ${day.due}`;
}

/**
 * The past day's line of who handed nothing in: «без отчёта: Ерлан Б., Марат» and, apart,
 * «уважительная: Гуля». Quiet — the minus is the person's business, not a red line (D-152). In one
 * person's feed (`alone`) the name is the feed's own: «без отчёта», «без отчёта · уважительная причина».
 */
export function missedLine(missed: readonly FeedMissed[], alone = false): string {
  if (alone) return missed.length === 0 ? "" : missed.every((person) => person.excused) ? "без отчёта · уважительная причина" : "без отчёта";
  const plain = missed.filter((person) => !person.excused).map((person) => shortName(person.full_name));
  const excused = missed.filter((person) => person.excused).map((person) => shortName(person.full_name));
  return [plain.length ? `без отчёта: ${plain.join(", ")}` : "", excused.length ? `уважительная: ${excused.join(", ")}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** A report the director can check: handed in and not checked yet. */
export function isCheckable(report: Pick<FeedReport, "status" | "checked_at">): boolean {
  return report.status === "submitted" && !report.checked_at;
}

/**
 * «Проверить все» of a day: only the reports already seen (owner, answer 2) — a report nobody has
 * read is not checked by a batch.
 */
export function batchCheckIds(reports: readonly FeedReport[]): string[] {
  return reports.filter((report) => isCheckable(report) && Boolean(report.seen_at)).map((report) => report.id);
}

/** «Отчёты · 3 не проверены», «1 не проверен» — the grey line on the director's Pulse. */
export function uncheckedText(count: number): string {
  return `${count} ${pluralRu(count, ["не проверен", "не проверены", "не проверены"])}`;
}

/** The toast after «Проверить все»: «Проверено 3 отчёта». */
export function checkedManyText(count: number): string {
  return `Проверено ${count} ${pluralRu(count, ["отчёт", "отчёта", "отчётов"])}`;
}

/**
 * The first line of the feed: «4 из 10 сдали сегодня» — `big` is the number set large, `of` the
 * rest of it — and how many we still wait for (the button «Ждём 4 ›»).
 */
export function todayStrip(day: FeedDay): { big: string; of: string; words: string; waiting: number } {
  if (day.due === 0) {
    return day.submitted > 0
      ? { big: String(day.submitted), of: "", words: "сдали сегодня · отчёт не нужен", waiting: 0 }
      : { big: "", of: "", words: "Сегодня отчёт не нужен", waiting: 0 };
  }
  return { big: String(day.submitted), of: `из ${day.due}`, words: "сдали сегодня", waiting: day.pending };
}

/* -------------------------------------------------------------------------- */
/* «Не проверены»: a checked report folds in place                             */
/* -------------------------------------------------------------------------- */

/**
 * A report checked under «Не проверены», kept where it stood: the next load of the filtered feed
 * no longer has it, the list must not jump (design B) — `after` is the report it followed.
 */
export type KeptReport = { report: FeedReport; after: string | null };

/**
 * The day's reports with the kept ones put back where they stood: after the report they followed,
 * first when they led the day; one whose neighbour is gone too goes after its neighbour once that
 * one is back, and the rest — at the end.
 */
export function withKept(current: readonly FeedReport[], kept: ReadonlyMap<string, KeptReport>, date: Ymd): FeedReport[] {
  const result = [...current];
  const present = new Set(current.map((report) => report.id));
  let waiting = [...kept.entries()].filter(([id, item]) => item.report.report_date === date && !present.has(id));
  let moved = true;
  while (waiting.length > 0 && moved) {
    moved = false;
    waiting = waiting.filter(([, item]) => {
      const at = item.after === null ? 0 : result.findIndex((report) => report.id === item.after) + 1;
      if (item.after !== null && at === 0) return true;
      result.splice(at, 0, item.report);
      moved = true;
      return false;
    });
  }
  for (const [, item] of waiting) result.push(item.report);
  return result;
}

/** Whether a day has anything to draw under the filters: today always does (its strip and head). */
export function dayHasContent(day: FeedDay): boolean {
  return day.reports.length > 0 || day.missed_people.length > 0;
}
