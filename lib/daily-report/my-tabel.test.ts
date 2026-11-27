import { describe, expect, it } from "vitest";

import type { ReportPerson, ReportRules } from "@/lib/people/stats";

import { monthTally, tallyParts } from "./diary";
import { blankMonth, cellMark, cellTone, dayWords, monthOfDay, monthSteps, myTabelMonth, withToday, type MyTabelCell } from "./my-tabel";
import { reportRulesOf } from "./rules";
import type { DailyReport } from "./types";

const TODAY = "2026-11-18"; // a Wednesday
const NOVEMBER = { year: 2026, month: 11 };
const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-05"], started_on: "2026-10-01", checked_on: "2026-11-17" };
const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-09-01T04:00:00Z" };

function report(day: string, over: Partial<DailyReport> = {}): DailyReport {
  return {
    id: `r-${day}`,
    user_id: "u1",
    report_date: day,
    status: "submitted",
    arrived_at: null,
    left_at: null,
    summary: "Сверил объёмы по кровле",
    tasks: [],
    submitted_at: `${day}T13:04:00Z`,
    updated_at: `${day}T13:04:00Z`,
    points: 1,
    excused_at: null,
    excused_reason: null,
    ...over,
  };
}

const missed = (day: string, over: Partial<DailyReport> = {}) =>
  report(day, { status: "missed", summary: null, submitted_at: null, points: -10, ...over });

const REPORTS = [
  report("2026-11-02"),
  missed("2026-11-03"),
  missed("2026-11-04", { points: 0 }),
  missed("2026-11-06", { points: 0, excused_at: "2026-11-07T05:00:00Z", excused_reason: "Был у врача" }),
  report("2026-11-07"), // a Saturday
];

const weeks = (reports: DailyReport[] = REPORTS, person = PERSON, rules = RULES) => myTabelMonth(NOVEMBER, reports, TODAY, rules, person);
const cellOf = (day: string, grid = weeks()): MyTabelCell => {
  const cell = grid.flat().find((item) => item?.day === day);
  if (!cell) throw new Error(`no cell for ${day}`);
  return cell;
};

describe("myTabelMonth — the person's month in the director's states (D-219)", () => {
  it("draws only the weeks the month touches, Monday first", () => {
    const grid = weeks();
    // November 2026 starts on a Sunday and ends on a Monday: six weeks
    expect(grid).toHaveLength(6);
    expect(grid[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grid[0][6]?.day).toBe("2026-11-01");
    expect(grid[5][0]?.day).toBe("2026-11-30");
    expect(blankMonth(NOVEMBER).map((week) => week.filter(Boolean).length)).toEqual(grid.map((week) => week.filter(Boolean).length));
  });

  it("reads each day as the табель does", () => {
    expect(cellOf("2026-11-02").state).toBe("submitted");
    expect(cellOf("2026-11-03").state).toBe("missed");
    expect(cellOf("2026-11-06").state).toBe("excused");
    expect(cellOf("2026-11-05").state).toBe("holiday");
    expect(cellOf("2026-11-08").state).toBe("off");
    // a working day the morning tick closed without a row: the person was away then
    expect(cellOf("2026-11-10").state).toBe("away");
    expect(cellOf(TODAY).state).toBe("pending");
    expect(cellOf(TODAY).today).toBe(true);
    expect(cellOf("2026-11-19").state).toBe("future");
  });

  it("knows a day off, a holiday and whether the report was due", () => {
    expect(cellOf("2026-11-07")).toMatchObject({ state: "submitted", weekend: true, due: false });
    expect(cellOf("2026-11-05")).toMatchObject({ holiday: true, weekend: false, due: false });
    expect(cellOf("2026-11-02")).toMatchObject({ weekend: false, holiday: false, due: true });
  });

  it("says which kind of away only for a day the tick has not closed", () => {
    const sick = { ...PERSON, availability: "sick" as const };
    expect(cellOf(TODAY, weeks(REPORTS, sick))).toMatchObject({ state: "away", away: "sick" });
    expect(cellOf("2026-11-10", weeks(REPORTS, sick))).toMatchObject({ state: "away", away: null });
  });

  it("takes today's report from the day's own read", () => {
    const fresh = report(TODAY, { id: "pending-1" });
    const grid = weeks([...withToday(REPORTS, fresh)]);
    expect(cellOf(TODAY, grid)).toMatchObject({ state: "submitted", report: fresh });
    // nothing handed in — the rows as they are
    expect(withToday(REPORTS, null)).toBe(REPORTS);
    // the month already has the day: the fresher one wins, once
    expect(withToday([...REPORTS, report(TODAY)], fresh).filter((row) => row.report_date === TODAY)).toEqual([fresh]);
  });

  it("adds up to the same line as the director's «Дневник»", () => {
    const parts = tallyParts(monthTally(weeks(), RULES));
    expect(parts?.map((part) => part.text)).toEqual(["сдано 1 из 4", "2 пропуска", "1 по уважительной", "ещё 1 в выходной"]);
  });
});

describe("cellTone, cellMark — how a square is painted", () => {
  it("is red only for a miss that cost points", () => {
    expect(cellTone(cellOf("2026-11-03"))).toBe("fined");
    expect(cellTone(cellOf("2026-11-04"))).toBe("missed");
    expect(cellTone(cellOf("2026-11-06"))).toBe("excused");
    expect(cellTone(cellOf("2026-11-02"))).toBe("ok");
    expect(cellTone(cellOf(TODAY))).toBe("pending");
    expect(cellTone(cellOf("2026-11-08"))).toBe("quiet");
    expect(cellTone(cellOf("2026-11-19"))).toBe("quiet");
  });

  it("marks what happened and leaves a day off empty", () => {
    expect(cellMark(cellOf("2026-11-02"))).toBe("✓");
    expect(cellMark(cellOf("2026-11-03"))).toBe("✕");
    expect(cellMark(cellOf("2026-11-06"))).toBe("у");
    expect(cellMark(cellOf("2026-11-10"))).toBe("о/б");
    expect(cellMark({ state: "away", away: "vacation" })).toBe("о");
    expect(cellMark({ state: "away", away: "sick" })).toBe("б");
    expect(cellMark(cellOf("2026-11-08"))).toBe("");
    expect(cellMark(cellOf(TODAY))).toBe("");
  });
});

describe("dayWords — a day in the person's own words", () => {
  const words = (day: string, grid = weeks(), rules = RULES) => dayWords(cellOf(day, grid), rules);

  it("says a miss with what it cost", () => {
    expect(words("2026-11-03")).toBe("не сдан · −10");
    expect(words("2026-11-04")).toBe("не сдан · без штрафа");
    expect(words("2026-11-06")).toBe("не сдан · уважительная причина: Был у врача");
  });

  it("says a miss the morning tick has not written yet without a fine", () => {
    const open = { ...RULES, checked_on: "2026-11-13" };
    expect(dayWords(cellOf("2026-11-16", weeks(REPORTS, PERSON, open)), open)).toBe("не сдан");
  });

  it("says today, a day off, a holiday and a day to come", () => {
    expect(words(TODAY)).toBe("ещё не сдан");
    expect(words("2026-11-08")).toBe("выходной");
    expect(words("2026-11-05")).toMatch(/^праздник/);
    expect(words("2026-11-19")).toBe("ещё впереди");
    expect(words("2026-11-21")).toBe("выходной");
    expect(words("2026-11-10")).toBe("отпуск или больничный");
    expect(words("2026-11-07")).toBe("сдан в выходной");
    expect(words("2026-11-02")).toBe("сдан");
    // a working day before the reports started owed nothing, but it is no day off
    const late = { ...RULES, started_on: "2026-11-10" };
    expect(cellOf("2026-11-02", weeks(REPORTS, PERSON, late))).toMatchObject({ state: "submitted", due: false });
    expect(dayWords(cellOf("2026-11-02", weeks(REPORTS, PERSON, late)), late)).toBe("сдан");
    expect(dayWords(cellOf("2026-11-05", weeks([report("2026-11-05")])), RULES)).toBe("сдан в праздник");
  });

  it("says why a working day asked nothing", () => {
    const late = { ...PERSON, created_at: "2026-11-10T04:00:00Z" };
    expect(dayWords(cellOf("2026-11-09", weeks([], late)), RULES)).toBe("отчёт не нужен");
    const off = { ...RULES, enabled: false };
    expect(dayWords(cellOf("2026-11-09", weeks([], PERSON, off)), off)).toBe("отчёты выключены");
  });
});

describe("monthSteps — where «‹ ›» may lead", () => {
  it("never goes past today's month nor before the month the person joined", () => {
    expect(monthSteps(NOVEMBER, TODAY, PERSON.created_at)).toEqual({ prev: { year: 2026, month: 10 }, next: null });
    expect(monthSteps({ year: 2026, month: 10 }, TODAY, PERSON.created_at)).toEqual({ prev: { year: 2026, month: 9 }, next: NOVEMBER });
    expect(monthSteps({ year: 2026, month: 9 }, TODAY, PERSON.created_at)).toEqual({ prev: null, next: { year: 2026, month: 10 } });
  });

  it("steps over a new year", () => {
    expect(monthSteps({ year: 2027, month: 1 }, "2027-01-12", "2026-11-03T04:00:00Z")).toEqual({ prev: { year: 2026, month: 12 }, next: null });
  });

  it("stays on today's month until the person is known, and for one who joined this month", () => {
    expect(monthSteps(NOVEMBER, TODAY, undefined)).toEqual({ prev: null, next: null });
    expect(monthSteps(NOVEMBER, TODAY, "2026-11-10T04:00:00Z")).toEqual({ prev: null, next: null });
    expect(monthOfDay(TODAY)).toEqual(NOVEMBER);
  });
});

describe("reportRulesOf — the company's report rules as the phone reads them", () => {
  it("reads the keys the day state needs", () => {
    expect(reportRulesOf({ enabled: false, workdays: [6, 1, 1, 2], holidays: ["2026-12-16", "2026-03-08", "2026-12-16"], started_on: "2026-10-01", checked_on: "2026-11-17", remind_at: "18:00" })).toEqual({
      enabled: false,
      workdays: [1, 2, 6],
      holidays: ["2026-03-08", "2026-12-16"],
      started_on: "2026-10-01",
      checked_on: "2026-11-17",
    });
  });

  it("falls back to the defaults of the settings schema", () => {
    const defaults = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: [], started_on: null, checked_on: null };
    expect(reportRulesOf(undefined)).toEqual(defaults);
    expect(reportRulesOf(null)).toEqual(defaults);
    expect(reportRulesOf({ workdays: [], holidays: "нет", started_on: 5, enabled: "да" })).toEqual(defaults);
    expect(reportRulesOf({ workdays: [0, 8, 2.5], holidays: ["2026-02-31", 7] })).toEqual(defaults);
  });
});
