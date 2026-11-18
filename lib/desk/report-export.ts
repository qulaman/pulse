import { dayTitle, isoWeekday, spanText, taskMeta, timeOf } from "@/lib/daily-report/format";
import { cellCode, TABEL_CODES_LEGEND, tabelPeriodWords, type Tabel, type TabelPerson } from "@/lib/daily-report/tabel";
import type { TeamDay, TeamDayRow } from "@/lib/daily-report/types";
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
export type Sheet = ReportSheet;

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

/* ---- «Сводка» ---------------------------------------------------------------------------------- */

/** «Отчёты 4 ноября 2026.csv». */
export function dayFileName(date: Ymd): string {
  const parts = parseYmd(date);
  return parts ? `Отчёты ${parts.day} ${MONTHS_OF[parts.month - 1]} ${parts.year}.csv` : `Отчёты ${date}.csv`;
}

/** «Отчёты · Среда, 4 ноября 2026» — a sheet outlives the year it was printed in. */
export function daySheetTitle(date: Ymd): string {
  return `Отчёты · ${dayTitle(date)} ${parseYmd(date)?.year ?? ""}`.trim();
}

const handedIn = (row: TeamDayRow) => (row.report?.status === "submitted" ? row.report : null);
const excusedRow = (row: TeamDayRow) => row.state === "missed" && Boolean(row.report?.excused_at);

/** The order of the paper: handed in (newest first, as the ledger reads), waiting, missed, excused, away. */
function placeOf(row: TeamDayRow): number {
  if (row.state === "submitted") return 0;
  if (row.state === "pending") return 1;
  if (row.state === "missed") return excusedRow(row) ? 3 : 2;
  return 4;
}

function inDayOrder(rows: readonly TeamDayRow[]): TeamDayRow[] {
  return rows
    .filter((row) => row.state !== "off" || handedIn(row))
    .sort((a, b) => {
      const place = placeOf(a) - placeOf(b);
      if (place) return place;
      const at = handedIn(a)?.submitted_at ?? "";
      const bt = handedIn(b)?.submitted_at ?? "";
      if (at !== bt) return at < bt ? 1 : -1;
      return a.full_name.localeCompare(b.full_name, "ru");
    });
}

/** A person's state in the sheet's words; times without a gender, «не на месте» is the secretary's. */
function stateWords(row: TeamDayRow, today: boolean): string {
  if (handedIn(row)) return "сдан";
  if (row.state === "pending") return "ждём";
  if (row.state === "missed") return excusedRow(row) ? "уважительная" : "не сдан";
  if (row.state === "away") {
    // a closed past day kept no record of which: today's availability speaks only for today
    if (!today) return "отпуск или больничный";
    return row.availability === "sick" ? "на больничном" : row.availability === "vacation" ? "в отпуске" : "отпуск или больничный";
  }
  return "не рабочий день";
}

/** «18:04»; a report handed in on another day than its own says the day: «15.11 8:05». */
function submittedWhen(report: NonNullable<ReturnType<typeof handedIn>>): string | null {
  const at = aqtobeIsoToYmdHm(report.submitted_at);
  if (!at) return null;
  const time = timeOf(report.submitted_at);
  if (at.ymd === report.report_date) return time;
  const parts = parseYmd(at.ymd);
  return parts ? `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")} ${time}` : time;
}

/**
 * «Сводка» for Excel and paper: everybody who owed the day's report or handed one in — the words in
 * full, the tasks by title, the times without a gender; nobody's points. The rows are the shown
 * ones (the search); this puts them in the paper's order and leaves out who owed nothing.
 */
export function daySheet(day: TeamDay, rows: readonly TeamDayRow[]): ReportSheet {
  const columns: SheetColumn[] = [
    { title: "Сотрудник" },
    { title: "Должность" },
    { title: "Состояние" },
    { title: "Время", tight: true },
    { title: "Сдан в", tight: true },
    { title: "Задачи", words: true },
    { title: "Что сделано", words: true },
  ];
  const shown = inDayOrder(rows);
  const owed = shown.filter((row) => row.state !== "away" && row.state !== "off").length;
  const submitted = shown.filter((row) => handedIn(row)).length;
  const tasks = shown.reduce((sum, row) => sum + (handedIn(row) ? row.tasks.length : 0), 0);
  return {
    columns,
    rows: shown.map((row) => {
      const report = handedIn(row);
      const words = report?.summary?.trim() || (excusedRow(row) ? `Уважительная причина${row.report?.excused_reason ? `: ${row.report.excused_reason.trim()}` : ""}` : null);
      return [
        row.full_name,
        row.position,
        stateWords(row, day.today),
        report ? spanText(report.arrived_at, report.left_at) || null : null,
        report ? submittedWhen(report) : null,
        report && row.tasks.length ? row.tasks.map((task) => `${task.title} — ${taskMeta(task)}`).join("\n") : null,
        words,
      ];
    }),
    total: ["Итого", null, owed > 0 && day.workday ? `сдали ${submitted} из ${owed}` : `сдали ${submitted}`, null, null, tasks ? `задач ${tasks}` : null, null],
  };
}
