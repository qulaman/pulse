/**
 * «Табель» of one's own daily reports on the phone (D-219): the month as a calendar of day states —
 * the same states the director's табель and «Дневник» draw (`tabelDayState`, lib/daily-report/tabel.ts),
 * so the person and the director cannot disagree about a day. Pure, no React: the card
 * (components/daily-report/MyTabel.tsx) draws from these, the tests pin them.
 *
 * Said in the person's own voice: «ещё не сдан», not «ждём отчёт»; a miss is red only when it cost
 * points, as in «Прошлые отчёты» (lib/daily-report/history.ts).
 */
import { addMonths, monthMatrix, parseYmd, ymdAt, type Month, type Ymd } from "@/lib/datetime/calendar";
import type { ReportPerson, ReportRules } from "@/lib/people/stats";

import { historyLine, isoWeekday, pointsText } from "./format";
import { finedMiss } from "./history";
import { awayKindOf, holidayWords, isDueDay, tabelDayState, type AwayKind, type TabelState } from "./tabel";
import type { DailyReport } from "./types";

export type MyTabelCell = {
  day: Ymd;
  state: TabelState;
  today: boolean;
  /** For an away day the morning tick has not closed yet: which one, by today's availability. */
  away: AwayKind;
  /** The report was due that day (the табель's `isDueDay`). */
  due: boolean;
  /** Not one of the company's weekdays. */
  weekend: boolean;
  /** A company holiday (`settings.daily_report.holidays`). */
  holiday: boolean;
  /** The day's row, handed in or missed; null — none. */
  report: DailyReport | null;
};

/**
 * The month as weeks of Monday to Sunday — only the weeks the month touches; a day of a
 * neighbouring month is null. `reports` — the person's rows of the month, any order.
 */
export function myTabelMonth(
  month: Month,
  reports: readonly DailyReport[],
  today: Ymd,
  rules: ReportRules,
  person: ReportPerson,
): (MyTabelCell | null)[][] {
  const byDay = new Map(reports.map((report) => [report.report_date, report]));
  return monthMatrix(month)
    .filter((week) => week.some(Boolean))
    .map((week) =>
      week.map((day) => {
        if (!day) return null;
        const report = byDay.get(day) ?? null;
        const state = tabelDayState(day, today, report ?? undefined, rules, person);
        return {
          day,
          state,
          today: day === today,
          away: state === "away" ? awayKindOf(day, rules, person.availability) : null,
          due: isDueDay(day, today, rules, person, report !== null),
          weekend: !rules.workdays.includes(isoWeekday(day)),
          holiday: rules.holidays.includes(day),
          report,
        };
      }),
    );
}

/** The same weeks without states — the grid while the month's reports are on their way. */
export function blankMonth(month: Month): (Ymd | null)[][] {
  return monthMatrix(month).filter((week) => week.some(Boolean));
}

/**
 * Today's report as the screen has it (the day's own read, a submit just tapped) over the month's
 * rows: the cell of today turns green with the tap, not with the next read of the month.
 */
export function withToday(reports: readonly DailyReport[], today: DailyReport | null | undefined): readonly DailyReport[] {
  if (!today) return reports;
  return [...reports.filter((report) => report.report_date !== today.report_date), today];
}

/** How a cell is painted: `fined` — a miss that cost points, the only red one. */
export type CellTone = "ok" | "fined" | "missed" | "excused" | "away" | "pending" | "quiet";

export function cellTone(cell: Pick<MyTabelCell, "state" | "report">): CellTone {
  switch (cell.state) {
    case "submitted":
      return "ok";
    case "missed":
      return cell.report && finedMiss(cell.report) ? "fined" : "missed";
    case "excused":
      return "excused";
    case "away":
      return "away";
    case "pending":
      return "pending";
    default:
      return "quiet";
  }
}

/** The mark inside a square: ✓ handed in, ✕ missed, «у» excused, «о» / «б» away; nothing for a day off. */
export function cellMark(cell: Pick<MyTabelCell, "state" | "away">): string {
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

/**
 * A day in the person's words — the line under the calendar for a day without a handed-in report
 * (a handed-in one says what happened to it, `reviewFacts`): «не сдан · −10», «не сдан · уважительная
 * причина: болел», «ещё не сдан», «в отпуске», «выходной», «праздник · День Независимости».
 */
export function dayWords(cell: MyTabelCell, rules: Pick<ReportRules, "enabled">): string {
  switch (cell.state) {
    case "submitted":
      // a day off by the calendar, not «nothing was due»: a working day before the reports started is no day off
      return cell.holiday ? "сдан в праздник" : cell.weekend ? "сдан в выходной" : "сдан";
    case "missed": {
      // no row yet — the morning tick has not closed the day: nothing is known about a fine
      if (!cell.report) return "не сдан";
      const minus = cell.report.points < 0 ? pointsText(cell.report.points) : "без штрафа";
      return `не сдан · ${minus}`;
    }
    case "excused":
      return cell.report ? historyLine(cell.report) : "не сдан · уважительная причина";
    case "pending":
      return "ещё не сдан";
    case "away":
      return cell.away === "vacation" ? "в отпуске" : cell.away === "sick" ? "на больничном" : "отпуск или больничный";
    case "holiday":
      return holidayWords(cell.day);
    case "future":
      return cell.holiday ? holidayWords(cell.day) : cell.weekend ? "выходной" : "ещё впереди";
    default:
      if (cell.holiday) return holidayWords(cell.day);
      if (cell.weekend) return "выходной";
      return rules.enabled ? "отчёт не нужен" : "отчёты выключены";
  }
}

/* ---- stepping the months ------------------------------------------------------------------------ */

/** The month of a day. */
export function monthOfDay(day: Ymd): Month {
  const parts = parseYmd(day) ?? { year: 1970, month: 1 };
  return { year: parts.year, month: parts.month };
}

const order = (month: Month) => month.year * 12 + month.month;

/**
 * Where «‹» and «›» may lead: never past the month of today, never before the month the person
 * joined (nothing was due then, the calendar would be grey for ever).
 */
export function monthSteps(month: Month, today: Ymd, joinedAt: string | null | undefined): { prev: Month | null; next: Month | null } {
  const last = order(monthOfDay(today));
  const joined = joinedAt ? new Date(joinedAt) : null;
  const first = joined && !Number.isNaN(joined.getTime()) ? Math.min(order(monthOfDay(ymdAt(joined))), last) : last;
  return {
    prev: order(month) > first ? addMonths(month, -1) : null,
    next: order(month) < last ? addMonths(month, 1) : null,
  };
}
