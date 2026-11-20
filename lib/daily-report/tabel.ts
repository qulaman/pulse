/**
 * «Табель» of the daily reports (D-183): people × days, each day in the words of the shared day
 * state (`reportDayState`, lib/people/stats.ts — the client's copy of `daily_report_state`), with
 * two states split out — a missed day the director excused, and a company holiday. Pure, no React:
 * the desk's табель, its file for Excel and the diary's month calendar read the same cells, so the
 * screen, the paper and the panel cannot disagree.
 *
 * Not a payroll sheet: the times are what people typed («по времени сдачи», lunch included), so no
 * hours are summed here — a cell says only whether the report came. Counting follows the period
 * RPC after D-183: a report counts on a day it was due (a working day from `started_on`, after the
 * person joined, not after today); a miss the director excused is counted apart.
 */
import { isWorkday, reportDayState, type ReportDayState, type ReportPerson, type ReportRules } from "@/lib/people/stats";
import { isTeamMember } from "@/lib/people/queries";
import { addDays, MONTHS_RU, parseYmd, ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";

import { kzHolidayName } from "./holidays";

import { isoWeekday, rangeText, spanText } from "./format";
import type { DailyReportStatus, TeamPeriodRow } from "./types";

/** What the табель needs of a day's report — the raw read of `daily_reports` (marks.ts). */
export type TabelMark = {
  status: DailyReportStatus;
  arrived_at: string | null;
  left_at: string | null;
  /** The director's «Уважительная причина» (D-183); absent before the migration lands. */
  excused_at?: string | null;
  excused_reason?: string | null;
};

/** A cell's state: the shared day state, a missed day the director excused and a holiday split out. */
export type TabelState = ReportDayState | "excused" | "holiday";

/** Which kind of away: known for today and the days not closed yet (today's availability), unknown for a closed past day. */
export type AwayKind = "vacation" | "sick" | null;

export type TabelCell = {
  day: Ymd;
  state: TabelState;
  /** left − arrived, one decimal, only for a handed-in report — the diary's grey hours; never drawn in the табель. */
  hours: number | null;
  arrived_at: string | null;
  left_at: string | null;
  /** For `away`: vacation or sick when it is known, null — «отпуск или больничный». */
  away: AwayKind;
  /** For `excused`: the director's words. */
  reason: string | null;
  /** The report was due that day — what the totals count over. */
  due: boolean;
};

export type TabelDay = {
  day: Ymd;
  /** A working day by the weekdays and not a holiday. */
  workday: boolean;
  /** Not one of the company's weekdays (Saturday, Sunday by default). */
  weekend: boolean;
  holiday: boolean;
  today: boolean;
  future: boolean;
  /** People who did not hand in that day (excused ones left out). */
  missed: number;
};

export type TabelPerson = {
  /**
   * The period RPC's row with its counts taken from the cells (so a row's totals are what its
   * cells show, whatever the database's version): `submitted` on due days, `missed` without the
   * excused ones, `excused`, `workdays`, `submit_rate`.
   */
  row: TeamPeriodRow;
  cells: TabelCell[];
  /** No longer in the team (left, or not a team role): the history stays, the name goes quiet. */
  gone: boolean;
  /** What the day state was read with: joining day, role, today's availability (the tooltip's «why»). */
  person: ReportPerson;
};

export type TabelTotals = {
  people: number;
  submitted: number;
  missed: number;
  excused: number;
  /** submitted / (submitted + missed); null when nothing was due. */
  rate: number | null;
  /** People with at least one miss. */
  gaps: number;
};

export type Tabel = {
  from: Ymd;
  to: Ymd;
  today: Ymd;
  days: TabelDay[];
  /** By name. */
  people: TabelPerson[];
  totals: TabelTotals;
  /** The rules the cells were read with (the tooltip's «why nothing was due»). */
  rules: ReportRules;
};

/* ---- one day of one person ------------------------------------------------------------------- */

/** The person came after this day was over (`created_at` ≥ the next midnight in Aqtobe). */
function joinedAfter(person: Pick<ReportPerson, "created_at">, day: Ymd): boolean {
  const end = ymdHmToAqtobeIso(addDays(day, 1), "00:00");
  return end !== null && new Date(person.created_at).getTime() >= new Date(end).getTime();
}

/**
 * The report was due that day — the period RPC's `due`: a working day from `started_on`, not after
 * today, after the person joined; for one who left only a day that has a row.
 */
export function isDueDay(day: Ymd, today: Ymd, rules: ReportRules, person: ReportPerson, hasRow: boolean): boolean {
  return isWorkday(rules, day) && day >= (rules.started_on ?? today) && day <= today && !joinedAfter(person, day) && (isTeamMember(person) || hasRow);
}

/** A cell's state: the shared one, a missed day with an excuse and a holiday without a report split out. */
export function tabelDayState(day: Ymd, today: Ymd, mark: TabelMark | undefined, rules: ReportRules, person: ReportPerson): TabelState {
  const state = reportDayState(day, today, mark, rules, person);
  if (state === "missed" && mark?.excused_at) return "excused";
  if (state === "off" && rules.holidays.includes(day)) return "holiday";
  return state;
}

/**
 * An away day: today and the days the morning tick has not closed yet are read by today's
 * availability; a closed past day kept no record of which — «отпуск или больничный».
 */
export function awayKindOf(day: Ymd, rules: Pick<ReportRules, "checked_on">, availability: ReportPerson["availability"]): AwayKind {
  if (rules.checked_on && day <= rules.checked_on) return null;
  return availability === "vacation" || availability === "sick" ? availability : null;
}

function hoursOf(mark: TabelMark | undefined): number | null {
  if (mark?.status !== "submitted" || !mark.arrived_at || !mark.left_at) return null;
  const ms = new Date(mark.left_at).getTime() - new Date(mark.arrived_at).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 360_000) / 10 : null;
}

export function tabelCell(day: Ymd, today: Ymd, mark: TabelMark | undefined, rules: ReportRules, person: ReportPerson): TabelCell {
  const state = tabelDayState(day, today, mark, rules, person);
  return {
    day,
    state,
    hours: hoursOf(mark),
    arrived_at: mark?.status === "submitted" ? mark.arrived_at : null,
    left_at: mark?.status === "submitted" ? mark.left_at : null,
    away: state === "away" ? awayKindOf(day, rules, person.availability) : null,
    reason: state === "excused" ? (mark?.excused_reason?.trim() ?? null) || null : null,
    due: isDueDay(day, today, rules, person, Boolean(mark)),
  };
}

/* ---- the period ------------------------------------------------------------------------------ */

/** Every calendar day from `from` to `to`, both inclusive. */
export function daysOf(from: Ymd, to: Ymd): Ymd[] {
  const days: Ymd[] = [];
  if (!parseYmd(from) || !parseYmd(to)) return days;
  // the database answers for 92 days at most; a few more never hurt, a broken range never loops
  for (let day = from; day <= to && days.length < 400; day = addDays(day, 1)) days.push(day);
  return days;
}

/** What a row's cells add up to: submitted on due days, missed without the excused ones. */
export function countCells(cells: readonly TabelCell[]) {
  let submitted = 0;
  let missed = 0;
  let excused = 0;
  let workdays = 0;
  for (const cell of cells) {
    if (cell.due) workdays += 1;
    // only the days a report was due count, as the period RPC does: a miss on a day that became a
    // holiday afterwards, or before the person's start, stays drawn but is not a miss of the month
    if (!cell.due) continue;
    if (cell.state === "submitted") submitted += 1;
    else if (cell.state === "missed") missed += 1;
    else if (cell.state === "excused") excused += 1;
  }
  return { submitted, missed, excused, workdays, submit_rate: submitted + missed > 0 ? submitted / (submitted + missed) : null };
}

/** The totals over the people given — the shown ones on paper, everybody in the line over the sheet. */
export function tabelTotals(people: readonly TabelPerson[]): TabelTotals {
  let submitted = 0;
  let missed = 0;
  let excused = 0;
  let gaps = 0;
  for (const { row } of people) {
    submitted += row.submitted;
    missed += row.missed;
    excused += row.excused ?? 0;
    if (row.missed > 0) gaps += 1;
  }
  return { people: people.length, submitted, missed, excused, rate: submitted + missed > 0 ? submitted / (submitted + missed) : null, gaps };
}

/** People who did not hand in on each day, over the people given (the bottom row «Не сдали»). */
export function missedByDay(people: readonly TabelPerson[], count: number): number[] {
  const missed = new Array<number>(count).fill(0);
  for (const person of people) person.cells.forEach((cell, index) => cell.due && cell.state === "missed" && (missed[index] += 1));
  return missed;
}

export type TabelInput = {
  from: Ymd;
  to: Ymd;
  today: Ymd;
  /** `team_daily_report_period(from, to).rows` — who stands in the табель. */
  rows: readonly TeamPeriodRow[];
  /** person → day → the report of that day (marks.ts). */
  marks: ReadonlyMap<string, ReadonlyMap<string, TabelMark>>;
  rules: ReportRules;
  /** The roster (`usePeople`): when each person joined, their role, whether they are in the team, today's availability. */
  people: ReadonlyMap<string, ReportPerson>;
};

/** Someone the roster does not know (never under RLS, but a табель must not break): out of the team, their rows speak for themselves. */
const STRANGER: ReportPerson = { is_active: false, role: "employee", availability: "active", created_at: "1970-01-01T00:00:00Z" };

/** The табель: the RPC's people × the period's days, by name; each row's counts from its own cells. */
export function buildTabel({ from, to, today, rows, marks, rules, people }: TabelInput): Tabel {
  const list = daysOf(from, to);
  const persons = [...rows]
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"))
    .map((row): TabelPerson => {
      const person = people.get(row.user_id) ?? STRANGER;
      const mine = marks.get(row.user_id);
      const cells = list.map((day) => tabelCell(day, today, mine?.get(day), rules, person));
      return { row: { ...row, ...countCells(cells) }, cells, gone: !isTeamMember(person), person };
    });
  const missed = missedByDay(persons, list.length);
  const days = list.map(
    (day, index): TabelDay => ({
      day,
      workday: isWorkday(rules, day),
      weekend: !rules.workdays.includes(isoWeekday(day)),
      holiday: rules.holidays.includes(day),
      today: day === today,
      future: day > today,
      missed: missed[index],
    }),
  );
  return { from, to, today, days, people: persons, totals: tabelTotals(persons), rules };
}

/* ---- words and marks ------------------------------------------------------------------------- */

/** The cell on the screen: a mark of one or three characters, or nothing. */
export function cellSymbol(cell: TabelCell): string {
  switch (cell.state) {
    case "submitted":
      return "✓";
    case "missed":
      return "✕";
    case "excused":
      return "у";
    case "away":
      return cell.away === "vacation" ? "о" : cell.away === "sick" ? "б" : "о/б";
    default:
      return "";
  }
}

/** The cell in the file and on paper — the accountant's short words (never the Т-13 letters). */
export function cellCode(cell: TabelCell, day: Pick<TabelDay, "weekend" | "holiday">): string {
  switch (cell.state) {
    case "submitted":
      return "✓";
    case "missed":
      return "✕";
    case "excused":
      return "ув.";
    case "away":
      return cell.away === "vacation" ? "отп." : cell.away === "sick" ? "бол." : "о/б";
    case "holiday":
      return "пр.";
    // a day off is one on paper whether it has passed or not: the month reads whole
    case "off":
    case "future":
      return day.holiday ? "пр." : day.weekend ? "вых." : "";
    default:
      return "";
  }
}

/** The legend of the file and of the paper, one line. */
export const TABEL_CODES_LEGEND =
  "Обозначения: ✓ сдан · ✕ не сдан · ув. уважительная причина · отп. отпуск · бол. больничный · о/б отпуск или больничный · вых. выходной · пр. праздник";

/** Kazakhstan's fixed-date holidays by name (lib/daily-report/holidays.ts) — a company's own days off stay «праздник». */

/** «праздник · День Республики» — the name only where the date has one. */
export function holidayWords(day: Ymd): string {
  const name = kzHolidayName(day);
  return name ? `праздник · ${name}` : "праздник";
}

/** Why a working day owed nothing: before the person came, out of the team, before the reports started. */
function offWords(cell: TabelCell, day: TabelDay, rules: ReportRules, person: ReportPerson | undefined): string {
  if (day.holiday) return holidayWords(day.day);
  if (day.weekend) return "выходной";
  if (!rules.enabled) return "отчёты выключены";
  if (person && !isTeamMember(person)) return "не в команде";
  if (rules.started_on && cell.day < rules.started_on) return "отчёты ещё не начались";
  if (person && joinedAfter(person, cell.day)) return "ещё не в команде";
  return "отчёт не нужен";
}

/** A cell in words — the табель's tooltip and the diary's day: «сдан · 9:20–18:02», «уважительная: …». */
export function cellWords(cell: TabelCell, day: TabelDay, rules: ReportRules, person?: ReportPerson): string {
  switch (cell.state) {
    case "submitted": {
      const times = spanText(cell.arrived_at, cell.left_at);
      return ["сдан", times, cell.due ? "" : day.holiday ? "в праздник, не в счёт" : "в выходной, не в счёт"].filter(Boolean).join(" · ");
    }
    case "missed":
      return "не сдан";
    case "excused":
      return cell.reason ? `уважительная: ${cell.reason}` : "уважительная причина";
    case "away":
      return cell.away === "vacation" ? "в отпуске" : cell.away === "sick" ? "на больничном" : "отпуск или больничный";
    case "pending":
      return "ещё не сдан";
    case "future":
      return day.holiday ? holidayWords(day.day) : day.weekend ? "выходной" : "ещё впереди";
    case "holiday":
      return holidayWords(day.day);
    default:
      return offWords(cell, day, rules, person);
  }
}

/** The period is one whole calendar month. */
export function isCalendarMonth(from: Ymd, to: Ymd): boolean {
  const a = parseYmd(from);
  const b = parseYmd(to);
  return Boolean(a && b && a.day === 1 && a.year === b.year && a.month === b.month && addDays(to, 1).endsWith("-01"));
}

/** «ноябрь 2026» for a calendar month, «3–9 нояб. 2026» otherwise, «29 дек. 2026 – 4 янв. 2027» over a new year. */
export function tabelPeriodWords(from: Ymd, to: Ymd): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return "";
  if (isCalendarMonth(from, to)) return `${MONTHS_RU[a.month - 1]} ${a.year}`;
  if (a.year === b.year) return `${rangeText(from, to)} ${a.year}`;
  return `${rangeText(from, from)} ${a.year} – ${rangeText(to, to)} ${b.year}`;
}
