/**
 * «Дневник» — one person's daily reports in the desk's right-hand panel (D-183): the month as a
 * calendar of day states (the табель's words for a day) and the reports one under another, newest
 * first. Pure: the panel (components/desk/reports/Diary.tsx) draws from these, the tests pin them.
 * Days are Asia/Aqtobe calendar days; the hours are «по времени сдачи», lunch included — never a
 * payroll number, so they stay grey and are never summed into one.
 */
import { addMonths, MONTHS_RU, monthMatrix, parseYmd, ymdOf, type Month, type Ymd } from "@/lib/datetime/calendar";
import { isWorkday, type ReportPerson, type ReportRules } from "@/lib/people/stats";
import { pluralRu } from "@/lib/tasks/status-text";

import { hoursText, minutesBetween, pointsText, spanText, timeOf } from "./format";
import { awayKindOf, isDueDay, tabelDayState, type AwayKind, type TabelState } from "./tabel";
import type { DailyReport, PersonDailyReport } from "./types";

/* ---- the month --------------------------------------------------------------------------------- */

/** The calendar month a day stands in: its first and last day and the month itself. */
export function monthRange(ymd: Ymd): { month: Month; from: Ymd; to: Ymd } {
  const parts = parseYmd(ymd) ?? { year: 1970, month: 1, day: 1 };
  const month = { year: parts.year, month: parts.month };
  const last = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return { month, from: ymdOf(parts.year, parts.month, 1), to: ymdOf(parts.year, parts.month, last) };
}

/** The first day of the month `delta` months away from the month of `ymd`. */
export function shiftMonth(ymd: Ymd, delta: number): Ymd {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const next = addMonths({ year: parts.year, month: parts.month }, delta);
  return ymdOf(next.year, next.month, 1);
}

/** «Ноябрь»; another year than today's — «Ноябрь 2025». */
export function monthTitle(month: Month, today: Ymd): string {
  const name = MONTHS_RU[month.month - 1] ?? "";
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return parseYmd(today)?.year === month.year ? title : `${title} ${month.year}`;
}

/** «в ноябре» — the month inside a sentence. */
const MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"] as const;

export function monthIn(month: Month): string {
  return `в ${MONTHS_IN[month.month - 1] ?? ""}`;
}

/* ---- a day of the calendar --------------------------------------------------------------------- */

/**
 * A day of the diary in the табель's words (`tabelDayState`, lib/daily-report/tabel.ts — the shared
 * `reportDayState` with the excused miss and the holiday split out): the panel and the табель
 * cannot disagree about a day.
 */
export type DiaryDayState = TabelState;

export type DiaryCell = {
  day: Ymd;
  state: DiaryDayState;
  today: boolean;
  /** For an away day the morning tick has not closed yet: which one, by today's availability. */
  away: AwayKind;
  /** The report was due that day (the табель's `isDueDay`). */
  due: boolean;
  report: PersonDailyReport | null;
};

/**
 * The month as weeks of Monday to Sunday — only the weeks the month touches; a day of a
 * neighbouring month is null. Every day carries its state and its report, if one came.
 */
export function diaryCalendar(
  month: Month,
  reports: readonly PersonDailyReport[],
  today: Ymd,
  rules: ReportRules,
  person: ReportPerson,
): (DiaryCell | null)[][] {
  const byDay = new Map(reports.map((report) => [report.report_date, report]));
  return monthMatrix(month)
    .filter((week) => week.some(Boolean))
    .map((week) =>
      week.map((day) => {
        if (!day) return null;
        const report = byDay.get(day) ?? null;
        const state = tabelDayState(day, today, report ?? undefined, rules, person);
        // a day the tick has not closed yet is away by today's word; a closed one is not known
        const away = state === "away" ? awayKindOf(day, rules, person.availability) : null;
        return { day, state, today: day === today, away, due: isDueDay(day, today, rules, person, report !== null), report };
      }),
    );
}

/** The one mark inside a calendar square: ✓ handed in, ✕ missed, «у» excused, «о» / «б» away. */
export function cellMark(cell: Pick<DiaryCell, "state" | "away">): string {
  switch (cell.state) {
    case "submitted":
      return "✓";
    case "missed":
      return "✕";
    case "excused":
      return "у";
    case "pending":
      return "ждём";
    case "away":
      return cell.away === "vacation" ? "о" : cell.away === "sick" ? "б" : "";
    default:
      return "";
  }
}

/** A day said short: «вт, 17 ноября». */
const SHORT_DAY = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

export function shortDay(ymd: Ymd): string {
  const parts = parseYmd(ymd);
  if (!parts) return "";
  return SHORT_DAY.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

/** The head of an entry: «Вт, 17 ноября». */
export function entryDay(ymd: Ymd): string {
  const text = shortDay(ymd);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What a square says under the mouse: «вт, 17 ноября · сдан · 9:19–19:17». */
export function cellTitle(cell: DiaryCell): string {
  const word: Record<DiaryDayState, string> = {
    submitted: "сдан",
    missed: "не сдан",
    excused: "не сдан, по уважительной причине",
    pending: "ждём отчёт",
    away: cell.away === "vacation" ? "в отпуске" : cell.away === "sick" ? "на больничном" : "отпуск или больничный",
    off: "отчёт не нужен",
    holiday: "праздник",
    future: "ещё впереди",
  };
  const times = cell.report?.status === "submitted" ? timesText(cell.report) : "";
  return [shortDay(cell.day), word[cell.state], times].filter(Boolean).join(" · ");
}

/* ---- the month in one line --------------------------------------------------------------------- */

export type MonthTally = {
  /** Reports handed in on a working day. */
  submitted: number;
  /** Missed days, the excused ones left out. */
  missed: number;
  excused: number;
  /** Reports handed in on a day off or a holiday — not counted against anything. */
  offDay: number;
};

/**
 * The month as its calendar shows it: every ✓ of a working day counts (also one from before the
 * fines started, which the табель's totals leave out — the line must agree with the squares under
 * it), one on a weekend stands apart, a missed day the director excused is not a miss.
 */
export function monthTally(cells: readonly (DiaryCell | null)[][], rules: Pick<ReportRules, "workdays" | "holidays">): MonthTally {
  const tally: MonthTally = { submitted: 0, missed: 0, excused: 0, offDay: 0 };
  for (const cell of cells.flat()) {
    if (!cell) continue;
    if (cell.state === "submitted") {
      if (isWorkday(rules, cell.day)) tally.submitted += 1;
      else tally.offDay += 1;
    } else if (cell.state === "missed") tally.missed += 1;
    else if (cell.state === "excused") tally.excused += 1;
  }
  return tally;
}

export type TallyPart = { key: string; text: string; tone?: "danger" | "muted" };

/**
 * «сдано 11 из 12 · 1 пропуск · 1 по уважительной · ещё 1 в выходной»; nothing at all — null
 * (the panel says the month is empty in its own words).
 */
export function tallyParts(tally: MonthTally): TallyPart[] | null {
  const due = tally.submitted + tally.missed + tally.excused;
  if (due === 0 && tally.offDay === 0) return null;
  const parts: TallyPart[] = [];
  if (due > 0) parts.push({ key: "in", text: `сдано ${tally.submitted} из ${due}` });
  if (tally.missed > 0) parts.push({ key: "missed", text: `${tally.missed} ${pluralRu(tally.missed, ["пропуск", "пропуска", "пропусков"])}`, tone: "danger" });
  if (tally.excused > 0) parts.push({ key: "excused", text: `${tally.excused} по уважительной`, tone: "muted" });
  if (tally.offDay > 0) parts.push({ key: "off", text: `${due > 0 ? "ещё " : ""}${tally.offDay} в выходной`, tone: "muted" });
  return parts;
}

/* ---- an entry ---------------------------------------------------------------------------------- */

/** «9:20–18:02»; a missing end — what is known; nothing — "". */
export function timesText(report: Pick<DailyReport, "arrived_at" | "left_at">): string {
  return spanText(report.arrived_at, report.left_at);
}

/** Hours from arrival to leaving, one decimal; null while they make no length. */
export function hoursOf(report: Pick<DailyReport, "arrived_at" | "left_at">): number | null {
  const minutes = minutesBetween(report.arrived_at, report.left_at);
  return minutes !== null && minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : null;
}

/** «9:20–18:02 · 8,7 ч по времени сдачи» — the grey line of a handed-in day. */
export function hoursLine(report: Pick<DailyReport, "arrived_at" | "left_at">): string {
  const hours = hoursOf(report);
  return [timesText(report), hours !== null ? `${hoursText(hours)} по времени сдачи` : ""].filter(Boolean).join(" · ");
}

/** The words of a report, or "" — whitespace is no words. */
export function wordsOf(report: Pick<DailyReport, "summary">): string {
  return report.summary?.trim() ?? "";
}

/** «3 задачи: Акт сверки, Отчёт Казахтелеком, Смета» — a report without words says its tasks. */
export function tasksLine(report: Pick<DailyReport, "tasks">): string {
  const n = report.tasks.length;
  if (n === 0) return "";
  const word = pluralRu(n, ["задача", "задачи", "задач"]);
  return `${n} ${word}: ${report.tasks.map((task) => task.title.trim()).join(", ")}`;
}

/** A report changed more than this after its hand-in was edited; within it — the same submit. */
const EDIT_GAP_MS = 60_000;
/** «только что» lasts this long after the hand-in. */
export const FRESH_MS = 10 * 60_000;

export type Stamp = {
  /** «сдан 19:36»; handed in on another day — «сдан 18 нояб. в 8:05». */
  text: string;
  /** Handed in on a later day than the report's. */
  late: boolean;
  /** «правка 21:40» when the report was changed after its hand-in; "" — it was not. */
  edited: string;
  /** Within ten minutes of the hand-in. */
  fresh: boolean;
};

const SHORT_DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Aqtobe" });

/** When a report was handed in, as the entry's right edge says it. */
export function stampOf(report: Pick<DailyReport, "report_date" | "submitted_at" | "updated_at">, now: Date): Stamp | null {
  if (!report.submitted_at) return null;
  const at = new Date(report.submitted_at);
  if (Number.isNaN(at.getTime())) return null;
  const day = new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
  const late = day > report.report_date;
  const text = late ? `сдан ${SHORT_DATE.format(at)} в ${timeOf(report.submitted_at)}` : `сдан ${timeOf(report.submitted_at)}`;
  const changed = new Date(report.updated_at).getTime() - at.getTime() > EDIT_GAP_MS;
  const age = now.getTime() - at.getTime();
  return { text, late, edited: changed ? `правка ${timeOf(report.updated_at)}` : "", fresh: age >= 0 && age < FRESH_MS };
}

/**
 * What a missed day offers the director: an open dispute of its minus — answer it; excused —
 * say why; otherwise «Уважительная причина…» (with points off too: the day stays missed, nothing
 * moves). null — the report was handed in.
 */
export type MissedMove = "dispute" | "excused" | "excuse";

export function missedMove(report: Pick<PersonDailyReport, "status" | "excused_at" | "dispute">): MissedMove | null {
  if (report.status !== "missed") return null;
  if (report.excused_at) return "excused";
  if (report.dispute && !report.dispute.resolved) return "dispute";
  return "excuse";
}

/** «Не сдан · −10»: the minus only where the points game is on and the minus still stands. */
export function missedLine(report: Pick<DailyReport, "points">, pointsOn: boolean): string {
  const minus = pointsOn && report.points < 0 ? pointsText(report.points) : "";
  return ["Не сдан", minus].filter(Boolean).join(" · ");
}

/** What «Записать» will do, said under the reason: the day stays missed; a standing minus comes back. */
export function excuseHint(points: number, pointsOn: boolean): string {
  if (!pointsOn || points >= 0) return "День останется пропуском, причина встанет рядом с ним";
  const back = -points;
  return `День останется пропуском, а ${back} ${pluralRu(back, ["очко вернётся", "очка вернутся", "очков вернутся"])}`;
}

/** The longest reason the database keeps (`excused_reason`, 1..300). */
export const REASON_MAX = 300;

/** The person's availability as the head says it; at work — nothing. */
export function awayWord(availability: ReportPerson["availability"], active: boolean): string {
  if (!active) return "не в команде";
  return availability === "vacation" ? "в отпуске" : availability === "sick" ? "на больничном" : "";
}
