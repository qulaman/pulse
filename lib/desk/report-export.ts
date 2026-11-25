import { dayTitle, isoWeekday, rangeText, taskMeta, timeOf } from "@/lib/daily-report/format";
import { cellCode, TABEL_CODES_LEGEND, tabelPeriodWords, type Tabel, type TabelPerson } from "@/lib/daily-report/tabel";
import type { DailyReport, FeedDay, FeedMissed, FeedReport } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm, parseYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";

/**
 * «Отчёты» as a sheet of cells (D-152, D-183): one model behind the file for Excel and the table on
 * paper, so the two cannot disagree. Pure: the screen says which people are shown, this file puts
 * them in order, turns them into cells, and the cells into text.
 *
 * A number stays a number: a spreadsheet adds it up, a sign on it is not a formula. Whatever a
 * person typed is text, and text is what the formula guard is for. No points anywhere: a minus is
 * the director's business, not the paper's (D-152, D-45).
 */

/** A number for the spreadsheet, words as they read, null — an empty cell (the screen's «—»). */
export type Cell = string | number | null;

export type SheetColumn = {
  title: string;
  /** Stands on the right edge, as on the screen. */
  right?: boolean;
  /** On paper a gain keeps its «+». */
  signed?: boolean;
  /** A person's own words: on paper they wrap, whatever was pasted into them. */
  words?: boolean;
  /** A day of the табель: narrow and centred on paper. */
  day?: boolean;
  /** On paper under the title: the weekday of a day. */
  sub?: string;
  /** On paper a day nothing was due on (a weekend, a holiday) is shaded. */
  dim?: boolean;
  /** Short words that read on one line on paper (a time, a state): never wrapped. */
  tight?: boolean;
};

export type ReportSheet = {
  columns: SheetColumn[];
  rows: Cell[][];
  total: Cell[];
  /** Lines under the table: after an empty line in the file, under the table on paper (the legend). */
  notes?: string[];
};

const SEPARATOR = ";";
const LINE_END = "\r\n";
const BOM = "﻿";

/** What a spreadsheet would run as a formula, or read as the start of one (OWASP «CSV Injection»). */
const FORMULA = /^[=+\-@\t\r]/;

const MONTHS_OF = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] as const;

/** One cell of the file. A zero stays «0» (only null is empty); decimals take the Russian comma. */
export function csvCell(cell: Cell): string {
  if (cell === null) return "";
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "";
    return String(cell === 0 ? 0 : cell).replace(".", ",");
  }
  const guarded = FORMULA.test(cell) ? `'${cell}` : cell;
  // a lone CR ends a row for some readers: inside a cell a break is always LF, as Alt+Enter makes it
  const text = guarded.replace(/\r\n?/g, "\n");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The file: UTF-8 with a BOM (or Excel reads Cyrillic as cp1251), «;» — the Russian Excel's list separator. */
export function toCsv({ columns, rows, total, notes }: ReportSheet): string {
  const lines: Cell[][] = [columns.map((column) => column.title), ...rows, total];
  if (notes?.length) lines.push([], ...notes.map((note) => [note]));
  return BOM + lines.map((line) => line.map(csvCell).join(SEPARATOR)).join(LINE_END) + LINE_END;
}

/** One cell on paper: the screen's dash, a real minus, the comma. */
export function printCell(cell: Cell, signed = false): string {
  if (cell === null || cell === "") return "—";
  if (typeof cell === "string") return cell;
  const digits = String(Math.abs(cell)).replace(".", ",");
  if (cell < 0) return `−${digits}`;
  return signed && cell > 0 ? `+${digits}` : digits;
}

/** «87%» — a share for the sheet (Excel reads it as a percent); null when nothing was due. */
function shareText(rate: number | null | undefined): string | null {
  return rate === null || rate === undefined || !Number.isFinite(rate) ? null : `${Math.round(rate * 100)}%`;
}

/* ---- «Табель» ---------------------------------------------------------------------------------- */

/** «Табель отчётов ноябрь 2026.csv», «Табель отчётов 3–9 нояб. 2026.csv». */
export function tabelFileName(from: Ymd, to: Ymd): string {
  return `Табель отчётов ${tabelPeriodWords(from, to)}.csv`;
}

/** The head of the paper sheet: «Табель отчётов · ноябрь 2026». */
export function tabelSheetTitle(from: Ymd, to: Ymd): string {
  return `Табель отчётов · ${tabelPeriodWords(from, to)}`;
}

/**
 * «Табель» for Excel and paper: a person a row, a day a column (its number for a title), the
 * accountant's short words in the cells, then the totals — «Сдал» on the days it was due, «Не сдал»
 * without the excused, «Уваж.» when any, «Доля». «Итого» counts who did not hand in each day.
 * No hours (the times are typed, lunch included) and no points. The people are the shown ones
 * (the search, «С пропусками»), in the табель's order; the total is over them.
 */
export function tabelSheet(tabel: Tabel, people: readonly TabelPerson[]): ReportSheet {
  const excused = tabel.people.some((person) => (person.row.excused ?? 0) > 0);
  const columns: SheetColumn[] = [
    { title: "Сотрудник" },
    ...tabel.days.map((day) => ({
      title: String(parseYmd(day.day)?.day ?? day.day),
      day: true,
      sub: WEEKDAYS_SHORT_RU[isoWeekday(day.day) - 1],
      dim: !day.workday,
    })),
    { title: "Сдал", right: true },
    { title: "Не сдал", right: true },
    ...(excused ? [{ title: "Уваж.", right: true }] : []),
    { title: "Доля", right: true },
  ];
  const tail = (submitted: number, missed: number, excusedCount: number, rate: number | null | undefined): Cell[] => [
    submitted,
    missed,
    ...(excused ? [excusedCount] : []),
    shareText(rate),
  ];
  const rows = people.map((person) => [
    person.row.full_name,
    ...person.cells.map((cell, index) => cellCode(cell, tabel.days[index]) || null),
    ...tail(person.row.submitted, person.row.missed, person.row.excused ?? 0, person.row.submit_rate),
  ]);
  const submitted = people.reduce((sum, person) => sum + person.row.submitted, 0);
  const missed = people.reduce((sum, person) => sum + person.row.missed, 0);
  const excusedSum = people.reduce((sum, person) => sum + (person.row.excused ?? 0), 0);
  // a day anybody owed a report on gets its count, a zero included; a day off or ahead stays empty
  const perDay = tabel.days.map((day, index) => {
    if (day.future || !people.some((person) => person.cells[index]?.due)) return null;
    return people.filter((person) => person.cells[index]?.state === "missed").length;
  });
  return {
    columns,
    rows,
    total: ["Итого", ...perDay, ...tail(submitted, missed, excusedSum, submitted + missed > 0 ? submitted / (submitted + missed) : null)],
    notes: [`${TABEL_CODES_LEGEND}. «Итого» под днями — сколько не сдали. Табель отчётов за день — не учёт рабочего времени: часов и очков в нём нет.`],
  };
}

/* ---- «Подряд» --------------------------------------------------------------------------------- */

/** «Отчёты 4 ноября 2026.csv». */
export function dayFileName(date: Ymd): string {
  const parts = parseYmd(date);
  return parts ? `Отчёты ${parts.day} ${MONTHS_OF[parts.month - 1]} ${parts.year}.csv` : `Отчёты ${date}.csv`;
}

/** «Отчёты · Среда, 4 ноября 2026» — a sheet outlives the year it was printed in. */
export function daySheetTitle(date: Ymd): string {
  return `Отчёты · ${dayTitle(date)} ${parseYmd(date)?.year ?? ""}`.trim();
}

/** The days of the feed on screen, oldest and newest; null — none. */
function feedSpan(days: readonly FeedDay[]): { from: Ymd; to: Ymd } | null {
  if (days.length === 0) return null;
  const dates = days.map((day) => day.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/** «Отчёты 3–25 нояб. 2026.csv»; one day — by its date. */
export function feedFileName(days: readonly FeedDay[]): string {
  const span = feedSpan(days);
  if (!span) return "Отчёты.csv";
  if (span.from === span.to) return dayFileName(span.from);
  return `Отчёты ${rangeText(span.from, span.to)} ${span.to.slice(0, 4)}.csv`;
}

/** The head of the paper: «Отчёты · 3–25 нояб. 2026»; one day — by its date. */
export function feedSheetTitle(days: readonly FeedDay[]): string {
  const span = feedSpan(days);
  if (!span) return "Отчёты";
  if (span.from === span.to) return daySheetTitle(span.from);
  return `Отчёты · ${rangeText(span.from, span.to)} ${span.to.slice(0, 4)}`;
}

/** «25.11» — a day in a cell. */
function shortDate(date: Ymd): string {
  const parts = parseYmd(date);
  return parts ? `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}` : date;
}

/** «18:04»; a report handed in on another day than its own says the day: «15.11 8:05». */
function submittedWhen(report: Pick<DailyReport, "submitted_at" | "report_date">): string | null {
  const at = aqtobeIsoToYmdHm(report.submitted_at);
  if (!at) return null;
  const time = timeOf(report.submitted_at);
  if (at.ymd === report.report_date) return time;
  return `${shortDate(at.ymd)} ${time}`;
}

/** «Проверено 19:05» — the director's mark on paper; nothing before it. */
function checkWords(report: FeedReport): string | null {
  return report.checked_at ? `проверено ${timeOf(report.checked_at)}` : null;
}

/**
 * «Подряд» for Excel and paper (D-198): the days on screen, newest first — every report shown (the
 * words in full, the tasks by title, when it came, whether it is checked), then who of that day
 * did not hand one in. No times of arrival or leaving and no hours (D-194, D-198), nobody's
 * points. The reports are the shown ones (one person, words, «Не проверены»).
 */
export function feedSheet(days: readonly FeedDay[]): ReportSheet {
  const columns: SheetColumn[] = [
    { title: "День", tight: true },
    { title: "Сотрудник" },
    { title: "Состояние", tight: true },
    { title: "Сдан в", tight: true },
    { title: "Задачи", words: true },
    { title: "Что сделано", words: true },
  ];
  const ordered = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const rows: Cell[][] = [];
  let reports = 0;
  let tasks = 0;
  for (const day of ordered) {
    for (const report of day.reports) {
      reports += 1;
      tasks += report.tasks.length;
      rows.push([
        shortDate(day.date),
        report.full_name,
        ["сдан", checkWords(report)].filter(Boolean).join(", "),
        submittedWhen(report),
        report.tasks.length ? report.tasks.map((task) => `${task.title} — ${taskMeta(task)}`).join("\n") : null,
        report.summary?.trim() || null,
      ]);
    }
    for (const person of day.missed_people) rows.push(missedRow(day.date, person));
  }
  return {
    columns,
    rows,
    total: ["Итого", null, `отчётов ${reports}`, null, tasks ? `задач ${tasks}` : null, null],
  };
}

function missedRow(date: Ymd, person: FeedMissed): Cell[] {
  return [shortDate(date), person.full_name, person.excused ? "уважительная" : "не сдан", null, null, null];
}
