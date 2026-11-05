import { dayTitle, percentText, personDayLine, shortHm, timeOf } from "@/lib/daily-report/format";
import type { TeamDayRow, TeamPeriodRow } from "@/lib/daily-report/types";
import { parseYmd, type Ymd } from "@/lib/datetime/calendar";

/**
 * «Отчёты» as a sheet of cells (D-152): one model behind the file for Excel and the table on paper,
 * so the two cannot disagree. Pure: the screen says which people are shown and in what order, this
 * file turns them into cells, and the cells into text.
 *
 * A number stays a number: a spreadsheet adds it up, a sign on it is not a formula. Whatever a
 * person typed is text, and text is what the formula guard is for.
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
};

export type ReportSheet = { columns: SheetColumn[]; rows: Cell[][]; total: Cell[] };

const SEPARATOR = ";";
const LINE_END = "\r\n";
const BOM = "﻿";

/** What a spreadsheet would run as a formula, or read as the start of one (OWASP «CSV Injection»). */
const FORMULA = /^[=+\-@\t\r]/;

const pad = (value: number) => String(value).padStart(2, "0");
const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = <T>(rows: readonly T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

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
export function toCsv({ columns, rows, total }: ReportSheet): string {
  const lines = [columns.map((column) => column.title), ...rows, total];
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

/** The rows in the order the screen shows them (a sort by a column lives in the table); the rest keep theirs, last. */
export function inOrder<T>(rows: readonly T[], keyOf: (row: T) => string, keys: readonly string[]): T[] {
  const at = new Map(keys.map((key, index) => [key, index]));
  const place = (row: T) => at.get(keyOf(row)) ?? keys.length;
  return [...rows].sort((a, b) => place(a) - place(b));
}

function dayMonth(ymd: Ymd): string {
  const parts = parseYmd(ymd);
  return parts ? `${pad(parts.day)}.${pad(parts.month)}` : ymd;
}

function fullDate(ymd: Ymd): string {
  const parts = parseYmd(ymd);
  return parts ? `${pad(parts.day)}.${pad(parts.month)}.${parts.year}` : ymd;
}

/** «Табель 01.11–30.11.csv». */
export function periodFileName(from: Ymd, to: Ymd): string {
  return `Табель ${dayMonth(from)}–${dayMonth(to)}.csv`;
}

/** «Отчёты 04.11.csv». */
export function dayFileName(date: Ymd): string {
  return `Отчёты ${dayMonth(date)}.csv`;
}

/** The head of the paper sheet: a sheet outlives the year it was printed in. */
export function periodSheetTitle(from: Ymd, to: Ymd): string {
  return `Табель · ${fullDate(from)} – ${fullDate(to)}`;
}

export function daySheetTitle(date: Ymd): string {
  return `Отчёты · ${dayTitle(date)} ${parseYmd(date)?.year ?? ""}`.trim();
}

/**
 * «Отчёты → Период»: the screen's columns whatever the window has hidden, one change — «Задачи»
 * («3 / 2» on the screen) are two columns here: a spreadsheet would take «3 / 2» for a date.
 * The total is over the rows given, the shown ones, never the whole team's figure.
 */
export function periodSheet(rows: readonly TeamPeriodRow[], { pointsOn }: { pointsOn: boolean }): ReportSheet {
  const columns: SheetColumn[] = [
    { title: "Сотрудник" },
    { title: "Сдача", right: true },
    { title: "Сдал", right: true },
    { title: "Приход", right: true },
    { title: "Уход", right: true },
    { title: "Часы в день", right: true },
    { title: "Всего", right: true },
    { title: "Задачи сдано", right: true },
    { title: "Задачи принято", right: true },
    { title: "После срока", right: true },
    ...(pointsOn ? [{ title: "Очки", right: true, signed: true }] : []),
  ];
  const points = (cells: Cell[], value: number) => (pointsOn ? [...cells, value] : cells);
  const submitted = sum(rows, (row) => row.submitted);
  const due = submitted + sum(rows, (row) => row.missed);
  const hours = sum(rows, (row) => row.hours_total);
  return {
    columns,
    rows: rows.map((row) =>
      points(
        [
          row.full_name,
          row.submit_rate === null ? null : percentText(row.submit_rate),
          `${row.submitted} из ${row.submitted + row.missed}`,
          row.avg_arrived ? shortHm(row.avg_arrived) : null,
          row.avg_left ? shortHm(row.avg_left) : null,
          row.avg_hours,
          row.hours_total,
          row.handed_over,
          row.closed,
          row.late,
        ],
        row.points,
      ),
    ),
    total: points(
      [
        "Итого",
        due > 0 ? percentText(submitted / due) : null,
        `${submitted} из ${due}`,
        null,
        null,
        submitted > 0 ? round1(hours / submitted) : null,
        round1(hours),
        sum(rows, (row) => row.handed_over),
        sum(rows, (row) => row.closed),
        sum(rows, (row) => row.late),
      ],
      sum(rows, (row) => row.points),
    ),
  };
}

const handedIn = (row: TeamDayRow) => (row.report?.status === "submitted" ? row.report : null);

/** «Чем занимался»: the words whole (the screen cuts them to a line), or what stands there without words. */
function dayWords(row: TeamDayRow): string {
  return handedIn(row)?.summary?.trim() || personDayLine(row);
}

/** «Отчёты → День»: the screen's columns; the total is over the rows given, the shown ones. */
export function daySheet(rows: readonly TeamDayRow[], { pointsOn }: { pointsOn: boolean }): ReportSheet {
  const columns: SheetColumn[] = [
    { title: "Кто" },
    { title: "Пришёл" },
    { title: "Ушёл" },
    { title: "Часы", right: true },
    { title: "Задачи", right: true },
    { title: "Чем занимался", words: true },
    ...(pointsOn ? [{ title: "Очки", right: true, signed: true }] : []),
  ];
  const hoursOf = (row: TeamDayRow) => (handedIn(row) ? row.hours : null);
  const points = (cells: Cell[], value: Cell) => (pointsOn ? [...cells, value] : cells);
  const submitted = rows.filter(handedIn).length;
  // out of everyone shown, as the screen's headline counts; a day off owes nothing, so no «из»
  const working = rows.some((row) => row.state !== "off");
  return {
    columns,
    rows: rows.map((row) => {
      const report = handedIn(row);
      return points(
        [row.full_name, timeOf(report?.arrived_at) || null, timeOf(report?.left_at) || null, hoursOf(row), row.tasks.length, dayWords(row)],
        row.report ? row.report.points : null,
      );
    }),
    total: points(
      [
        "Итого",
        null,
        null,
        round1(sum(rows, (row) => hoursOf(row) ?? 0)),
        sum(rows, (row) => row.tasks.length),
        working ? `сдали ${submitted} из ${rows.length}` : `сдали ${submitted}`,
      ],
      sum(rows, (row) => row.report?.points ?? 0),
    ),
  };
}
