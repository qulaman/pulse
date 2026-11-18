import { describe, expect, it } from "vitest";

import type { ReportPerson, ReportRules } from "@/lib/people/stats";

import {
  awayWord,
  cellMark,
  cellTitle,
  diaryCalendar,
  entryDay,
  excuseHint,
  hoursLine,
  hoursOf,
  missedLine,
  missedMove,
  monthIn,
  monthRange,
  monthTally,
  monthTitle,
  shiftMonth,
  stampOf,
  tallyParts,
  tasksLine,
  timesText,
  wordsOf,
  type DiaryCell,
} from "./diary";
import type { DailyReportTask, PersonDailyReport } from "./types";

// a Wednesday
const TODAY = "2026-11-18";
const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-05"], started_on: "2026-10-01", checked_on: "2026-11-17" };
const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-09-01T04:00:00Z" };

const report = (patch: Partial<PersonDailyReport> = {}): PersonDailyReport => ({
  id: "r1",
  user_id: "u1",
  report_date: "2026-11-17",
  status: "submitted",
  arrived_at: "2026-11-17T09:20:00+05:00",
  left_at: "2026-11-17T18:02:00+05:00",
  summary: "Протянул линию освещения во второй секции.",
  tasks: [],
  submitted_at: "2026-11-17T19:36:00+05:00",
  updated_at: "2026-11-17T19:36:00+05:00",
  points: 1,
  excused_at: null,
  excused_reason: null,
  dispute: null,
  ...patch,
});

const missed = (date: string, patch: Partial<PersonDailyReport> = {}) =>
  report({ id: `m-${date}`, report_date: date, status: "missed", arrived_at: null, left_at: null, summary: null, submitted_at: null, updated_at: `${date}T23:00:00Z`, points: -10, ...patch });

const task = (title: string): DailyReportTask => ({ id: title, title, status: "done", completed_at: null, closed_at: null, on_time: true });

describe("the month", () => {
  it("knows its first and last day", () => {
    expect(monthRange("2026-11-18")).toEqual({ month: { year: 2026, month: 11 }, from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2028-02-10").to).toBe("2028-02-29");
  });

  it("steps by months across the year", () => {
    expect(shiftMonth("2026-11-18", -1)).toBe("2026-10-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-05", 1)).toBe("2027-01-01");
  });

  it("names the month, the year only when it is another", () => {
    expect(monthTitle({ year: 2026, month: 11 }, TODAY)).toBe("Ноябрь");
    expect(monthTitle({ year: 2025, month: 12 }, TODAY)).toBe("Декабрь 2025");
    expect(monthIn({ year: 2026, month: 5 })).toBe("в мае");
  });
});

const cellsOf = (reports: PersonDailyReport[], person: ReportPerson = PERSON) =>
  new Map(
    diaryCalendar({ year: 2026, month: 11 }, reports, TODAY, RULES, person)
      .flat()
      .filter((cell): cell is DiaryCell => cell !== null)
      .map((cell) => [cell.day, cell]),
  );

describe("a day of the calendar", () => {
  it("is the табель's day state: the excused and the holiday split out", () => {
    const cells = cellsOf([report(), missed("2026-11-10"), missed("2026-11-11", { excused_at: "2026-11-12T05:00:00Z" })]);
    expect(cells.get("2026-11-17")?.state).toBe("submitted");
    expect(cells.get("2026-11-10")?.state).toBe("missed");
    expect(cells.get("2026-11-11")?.state).toBe("excused");
    expect(cells.get("2026-11-05")?.state).toBe("holiday");
    expect(cells.get("2026-11-08")?.state).toBe("off");
    expect(cells.get(TODAY)?.state).toBe("pending");
    expect(cells.get("2026-11-19")?.state).toBe("future");
  });

  it("a report handed in on a holiday stays handed in, not due", () => {
    expect(cellsOf([report({ report_date: "2026-11-05" })]).get("2026-11-05")).toMatchObject({ state: "submitted", due: false });
  });

  it("lays the month out Monday first, only the weeks it touches", () => {
    const weeks = diaryCalendar({ year: 2026, month: 11 }, [], TODAY, RULES, PERSON);
    // 1 November 2026 is a Sunday: the first week holds it alone; the 30th is a Monday
    expect(weeks).toHaveLength(6);
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(weeks[0][6]?.day).toBe("2026-11-01");
    expect(weeks[5][0]?.day).toBe("2026-11-30");
    expect(weeks[5].slice(1).every((cell) => cell === null)).toBe(true);
    expect(weeks.flat().find((cell) => cell?.today)?.day).toBe(TODAY);
  });

  it("puts each report on its day", () => {
    const cells = cellsOf([report(), missed("2026-11-10")]);
    expect(cells.get("2026-11-17")?.report?.id).toBe("r1");
    expect(cells.get("2026-11-17")?.due).toBe(true);
    expect(cells.get("2026-11-10")?.report?.status).toBe("missed");
  });

  it("says vacation or sick only for days the morning tick has not closed", () => {
    const cells = cellsOf([], { ...PERSON, availability: "sick" });
    expect(cells.get(TODAY)).toMatchObject({ state: "away", away: "sick" });
    // closed by the tick: who was away then is not known by today's word
    expect(cells.get("2026-11-16")).toMatchObject({ state: "away", away: null });
  });

  it("marks a square with one sign", () => {
    expect(cellMark({ state: "submitted", away: null })).toBe("✓");
    expect(cellMark({ state: "missed", away: null })).toBe("✕");
    expect(cellMark({ state: "excused", away: null })).toBe("у");
    expect(cellMark({ state: "away", away: "vacation" })).toBe("о");
    expect(cellMark({ state: "away", away: "sick" })).toBe("б");
    expect(cellMark({ state: "away", away: null })).toBe("");
    expect(cellMark({ state: "off", away: null })).toBe("");
  });

  it("says the square in words under the mouse", () => {
    const cell = (patch: Partial<DiaryCell>): DiaryCell => ({ day: "2026-11-17", state: "submitted", today: false, away: null, due: true, report: report(), ...patch });
    expect(cellTitle(cell({}))).toBe("вт, 17 ноября · сдан · 9:20–18:02");
    expect(cellTitle(cell({ state: "away", report: null }))).toBe("вт, 17 ноября · отпуск или больничный");
    expect(cellTitle(cell({ day: "2026-11-05", state: "holiday", report: null }))).toBe("чт, 5 ноября · праздник");
    expect(entryDay("2026-11-17")).toBe("Вт, 17 ноября");
  });
});

describe("the month in one line", () => {
  it("counts reports on working days, a weekend one apart, the excused not as a miss", () => {
    const reports = [
      report(),
      report({ id: "r2", report_date: "2026-11-16" }),
      report({ id: "r3", report_date: "2026-11-15" }), // a Sunday
      missed("2026-11-10"),
      missed("2026-11-11", { excused_at: "2026-11-12T05:00:00Z", excused_reason: "Ездил в Кандыагаш" }),
    ];
    const tally = monthTally(diaryCalendar({ year: 2026, month: 11 }, reports, TODAY, RULES, PERSON), RULES);
    expect(tally).toEqual({ submitted: 2, missed: 1, excused: 1, offDay: 1 });
    expect(tallyParts(tally)?.map((part) => part.text)).toEqual(["сдано 2 из 4", "1 пропуск", "1 по уважительной", "ещё 1 в выходной"]);
  });

  it("counts a ✓ from before the fines started, as the squares show it", () => {
    const late: ReportRules = { ...RULES, started_on: "2026-11-16" };
    const cells = diaryCalendar({ year: 2026, month: 11 }, [report({ id: "r0", report_date: "2026-11-03" }), report()], TODAY, late, PERSON);
    expect(cells.flat().find((cell) => cell?.day === "2026-11-03")?.due).toBe(false);
    expect(monthTally(cells, late)).toEqual({ submitted: 2, missed: 0, excused: 0, offDay: 0 });
  });

  it("says nothing of an empty month", () => {
    expect(tallyParts({ submitted: 0, missed: 0, excused: 0, offDay: 0 })).toBeNull();
    expect(tallyParts({ submitted: 0, missed: 0, excused: 0, offDay: 2 })?.map((part) => part.text)).toEqual(["2 в выходной"]);
    expect(tallyParts({ submitted: 3, missed: 5, excused: 0, offDay: 0 })?.[1]?.text).toBe("5 пропусков");
  });
});

describe("an entry", () => {
  it("says the times without a gender and the hours as hours by the hand-in", () => {
    expect(timesText(report())).toBe("9:20–18:02");
    expect(timesText(report({ left_at: null }))).toBe("9:20");
    expect(hoursOf(report())).toBe(8.7);
    expect(hoursLine(report())).toBe("9:20–18:02 · 8,7 ч по времени сдачи");
    expect(hoursLine(report({ left_at: "2026-11-17T09:00:00+05:00" }))).toBe("9:20–9:00");
  });

  it("reads whitespace as no words and lists the tasks instead", () => {
    expect(wordsOf(report({ summary: "  \n " }))).toBe("");
    expect(tasksLine(report({ tasks: [task("Акт сверки"), task("Отчёт Казахтелеком"), task("Смета")] }))).toBe("3 задачи: Акт сверки, Отчёт Казахтелеком, Смета");
    expect(tasksLine(report({ tasks: [task("Акт сверки")] }))).toBe("1 задача: Акт сверки");
    expect(tasksLine(report())).toBe("");
  });

  it("stamps the hand-in: the time, another day said, an edit, «только что»", () => {
    const evening = new Date("2026-11-17T20:00:00+05:00");
    expect(stampOf(report(), evening)).toEqual({ text: "сдан 19:36", late: false, edited: "", fresh: false });
    expect(stampOf(report(), new Date("2026-11-17T19:40:00+05:00"))?.fresh).toBe(true);
    expect(stampOf(report({ updated_at: "2026-11-17T21:40:00+05:00" }), evening)?.edited).toBe("правка 21:40");
    expect(stampOf(report({ updated_at: "2026-11-17T19:36:40+05:00" }), evening)?.edited).toBe("");
    const late = stampOf(report({ submitted_at: "2026-11-18T08:05:00+05:00", updated_at: "2026-11-18T08:05:00+05:00" }), evening);
    expect(late).toMatchObject({ text: "сдан 18 нояб. в 8:05", late: true });
    expect(stampOf(missed("2026-11-10"), evening)).toBeNull();
  });

  it("offers one move on a missed day", () => {
    const dispute = { id: "d1", transaction_id: "t1", text: "Был на объекте без связи", created_at: "2026-11-11T05:00:00Z", resolved: false };
    expect(missedMove(report())).toBeNull();
    expect(missedMove(missed("2026-11-10"))).toBe("excuse");
    expect(missedMove(missed("2026-11-10", { points: 0 }))).toBe("excuse");
    expect(missedMove(missed("2026-11-10", { dispute }))).toBe("dispute");
    expect(missedMove(missed("2026-11-10", { dispute: { ...dispute, resolved: true } }))).toBe("excuse");
    expect(missedMove(missed("2026-11-10", { excused_at: "2026-11-11T05:00:00Z", excused_reason: "Больница" }))).toBe("excused");
  });

  it("shows the minus only where the game is on and it still stands", () => {
    expect(missedLine({ points: -10 }, true)).toBe("Не сдан · −10");
    expect(missedLine({ points: -10 }, false)).toBe("Не сдан");
    expect(missedLine({ points: 0 }, true)).toBe("Не сдан");
    expect(excuseHint(-10, true)).toBe("День останется пропуском, а 10 очков вернутся");
    expect(excuseHint(-1, true)).toBe("День останется пропуском, а 1 очко вернётся");
    expect(excuseHint(-10, false)).toBe("День останется пропуском, причина встанет рядом с ним");
    expect(excuseHint(0, true)).toBe("День останется пропуском, причина встанет рядом с ним");
  });

  it("says where the person is", () => {
    expect(awayWord("vacation", true)).toBe("в отпуске");
    expect(awayWord("sick", true)).toBe("на больничном");
    expect(awayWord("active", true)).toBe("");
    expect(awayWord("active", false)).toBe("не в команде");
  });
});
