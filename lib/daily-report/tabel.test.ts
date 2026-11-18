import { describe, expect, it } from "vitest";

import type { ReportPerson, ReportRules } from "@/lib/people/stats";

import {
  awayKindOf,
  buildTabel,
  cellCode,
  cellSymbol,
  cellWords,
  daysOf,
  holidayWords,
  isCalendarMonth,
  isDueDay,
  missedByDay,
  tabelCell,
  tabelDayState,
  tabelPeriodWords,
  tabelTotals,
  type TabelMark,
} from "./tabel";
import { spanText } from "./format";
import type { TeamPeriodRow } from "./types";

// a Thursday; the morning tick has closed Tuesday the 10th
const TODAY = "2026-11-12";
const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-03"], started_on: "2026-10-01", checked_on: "2026-11-10" };
const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-09-01T04:00:00Z" };

const handed = (day: string): TabelMark => ({ status: "submitted", arrived_at: `${day}T04:20:00Z`, left_at: `${day}T13:02:00Z` });
const missed: TabelMark = { status: "missed", arrived_at: null, left_at: null };

const row = (user_id: string, full_name: string): TeamPeriodRow => ({
  user_id,
  full_name,
  position: null,
  avatar_url: null,
  workdays: 99,
  submitted: 99,
  missed: 99,
  excused: 99,
  submit_rate: 1,
  avg_arrived: null,
  avg_left: null,
  avg_hours: null,
  hours_total: 0,
  handed_over: 0,
  closed: 0,
  on_time: 0,
  late: 0,
  points: 0,
});

describe("tabelDayState", () => {
  const state = (day: string, mark?: TabelMark, person = PERSON) => tabelDayState(day, TODAY, mark, RULES, person);

  it("a report speaks for itself, an excused miss is split out", () => {
    expect(state("2026-11-02", handed("2026-11-02"))).toBe("submitted");
    expect(state("2026-11-05", missed)).toBe("missed");
    expect(state("2026-11-04", { ...missed, excused_at: "2026-11-05T05:00:00Z", excused_reason: "болел" })).toBe("excused");
  });

  it("a holiday without a report is named, a weekend stays off", () => {
    expect(state("2026-11-03")).toBe("holiday");
    expect(state("2026-11-08")).toBe("off");
    // a report handed in on a holiday is still a report
    expect(state("2026-11-03", handed("2026-11-03"))).toBe("submitted");
  });

  it("keeps the shared rule: closed days away, not closed yet missed, today pending, tomorrow future", () => {
    expect(state("2026-11-06")).toBe("away");
    expect(state("2026-11-11")).toBe("missed");
    expect(state(TODAY)).toBe("pending");
    expect(state("2026-11-13")).toBe("future");
  });
});

describe("isDueDay", () => {
  it("a working day from the start, after joining, not after today", () => {
    expect(isDueDay("2026-11-02", TODAY, RULES, PERSON, false)).toBe(true);
    expect(isDueDay(TODAY, TODAY, RULES, PERSON, false)).toBe(true);
    expect(isDueDay("2026-11-13", TODAY, RULES, PERSON, false)).toBe(false);
    expect(isDueDay("2026-11-07", TODAY, RULES, PERSON, true)).toBe(false);
    expect(isDueDay("2026-11-03", TODAY, RULES, PERSON, false)).toBe(false);
    expect(isDueDay("2026-09-30", TODAY, RULES, PERSON, true)).toBe(false);
  });

  it("joined during the day — due that day; one who left — only a day with a row", () => {
    const late = { ...PERSON, created_at: "2026-11-09T05:00:00Z" };
    expect(isDueDay("2026-11-09", TODAY, RULES, late, false)).toBe(true);
    expect(isDueDay("2026-11-06", TODAY, RULES, late, false)).toBe(false);
    const gone = { ...PERSON, is_active: false };
    expect(isDueDay("2026-11-02", TODAY, RULES, gone, false)).toBe(false);
    expect(isDueDay("2026-11-02", TODAY, RULES, gone, true)).toBe(true);
  });
});

describe("awayKindOf", () => {
  it("knows the kind only where today's availability still speaks", () => {
    expect(awayKindOf("2026-11-10", RULES, "vacation")).toBeNull();
    expect(awayKindOf("2026-11-11", RULES, "vacation")).toBe("vacation");
    expect(awayKindOf(TODAY, RULES, "sick")).toBe("sick");
    expect(awayKindOf(TODAY, { checked_on: null }, "sick")).toBe("sick");
  });
});

describe("tabelCell", () => {
  it("carries the times and the hours of a handed-in report, the reason of an excused one", () => {
    const cell = tabelCell("2026-11-02", TODAY, handed("2026-11-02"), RULES, PERSON);
    expect(cell).toMatchObject({ state: "submitted", hours: 8.7, due: true, away: null, reason: null });
    expect(spanText(cell.arrived_at, cell.left_at)).toBe("9:20–18:02");
    const excused = tabelCell("2026-11-04", TODAY, { ...missed, excused_at: "x", excused_reason: "  болел " }, RULES, PERSON);
    expect(excused).toMatchObject({ state: "excused", reason: "болел", hours: null, arrived_at: null });
  });
});

describe("buildTabel", () => {
  const marks = new Map<string, Map<string, TabelMark>>([
    [
      "a",
      new Map([
        ["2026-11-02", handed("2026-11-02")],
        ["2026-11-04", { ...missed, excused_at: "2026-11-05T05:00:00Z", excused_reason: "болел" }],
        ["2026-11-05", missed],
        ["2026-11-07", handed("2026-11-07")],
        ["2026-11-09", handed("2026-11-09")],
        ["2026-11-10", handed("2026-11-10")],
      ]),
    ],
    ["d", new Map([["2026-11-02", handed("2026-11-02")]])],
  ]);
  const people = new Map<string, ReportPerson>([
    ["a", PERSON],
    ["b", { ...PERSON, availability: "vacation" }],
    ["c", { ...PERSON, created_at: "2026-11-09T05:00:00Z" }],
    ["d", { ...PERSON, is_active: false }],
  ]);
  const tabel = buildTabel({
    from: "2026-11-01",
    to: "2026-11-30",
    today: TODAY,
    rows: [row("d", "Ярослав"), row("b", "Бауыржан"), row("a", "Айгуль"), row("c", "Ербол")],
    marks,
    rules: RULES,
    people,
  });
  const of = (id: string) => tabel.people.find((person) => person.row.user_id === id)!;
  const at = (id: string, day: string) => of(id).cells.find((cell) => cell.day === day)!;

  it("people by name, every day of the period, the RPC's own counts replaced by the cells'", () => {
    expect(tabel.people.map((person) => person.row.full_name)).toEqual(["Айгуль", "Бауыржан", "Ербол", "Ярослав"]);
    expect(tabel.days).toHaveLength(30);
    expect(of("a").cells).toHaveLength(30);
    // 2, 9, 10 counted; Saturday the 7th is a report but was not due; 5 and 11 missed; 4 excused
    expect(of("a").row).toMatchObject({ submitted: 3, missed: 2, excused: 1, workdays: 8, submit_rate: 0.6 });
  });

  it("a weekend report is drawn but not counted", () => {
    expect(at("a", "2026-11-07")).toMatchObject({ state: "submitted", due: false });
  });

  it("away now: closed days unknown, the rest by today's availability; never a miss", () => {
    expect(at("b", "2026-11-10")).toMatchObject({ state: "away", away: null });
    expect(at("b", "2026-11-11")).toMatchObject({ state: "away", away: "vacation" });
    expect(at("b", TODAY)).toMatchObject({ state: "away", away: "vacation" });
    expect(of("b").row).toMatchObject({ submitted: 0, missed: 0, submit_rate: null });
  });

  it("a late joiner owes nothing before the day they came", () => {
    expect(at("c", "2026-11-05").state).toBe("off");
    expect(at("c", "2026-11-11").state).toBe("missed");
    expect(of("c").row.missed).toBe(1);
  });

  it("one who left: the history stays, the name goes quiet", () => {
    expect(of("d").gone).toBe(true);
    expect(at("d", "2026-11-02").state).toBe("submitted");
    expect(at("d", "2026-11-05").state).toBe("off");
    expect(of("d").row).toMatchObject({ submitted: 1, missed: 0 });
  });

  it("the days: weekends, the holiday, today, the future, the misses of each day", () => {
    const day = (ymd: string) => tabel.days.find((one) => one.day === ymd)!;
    expect(day("2026-11-01")).toMatchObject({ weekend: true, workday: false, holiday: false });
    expect(day("2026-11-03")).toMatchObject({ weekend: false, workday: false, holiday: true });
    expect(day(TODAY)).toMatchObject({ today: true, future: false });
    expect(day("2026-11-13")).toMatchObject({ future: true });
    expect(day("2026-11-05").missed).toBe(1);
    expect(day("2026-11-11").missed).toBe(2);
    expect(day("2026-11-04").missed).toBe(0);
  });

  it("totals over the people given", () => {
    expect(tabel.totals).toEqual({ people: 4, submitted: 4, missed: 3, excused: 1, rate: 4 / 7, gaps: 2 });
    expect(tabelTotals([of("b")])).toEqual({ people: 1, submitted: 0, missed: 0, excused: 0, rate: null, gaps: 0 });
    expect(missedByDay([of("c")], 30)[10]).toBe(1);
  });

  it("someone the roster does not know is out of the team, not a row of misses", () => {
    const lone = buildTabel({ from: "2026-11-09", to: "2026-11-11", today: TODAY, rows: [row("z", "Зарина")], marks: new Map(), rules: RULES, people: new Map() });
    expect(lone.people[0].cells.map((cell) => cell.state)).toEqual(["off", "off", "off"]);
    expect(lone.people[0].gone).toBe(true);
  });
});

describe("marks and words", () => {
  const day = (ymd: string, patch = {}) => ({ day: ymd, workday: true, weekend: false, holiday: false, today: false, future: false, missed: 0, ...patch });
  const cell = (patch: Partial<ReturnType<typeof tabelCell>>) => ({ day: "2026-11-05", state: "missed" as const, hours: null, arrived_at: null, left_at: null, away: null, reason: null, due: true, ...patch });

  it("the screen's marks: short, nothing for a day that owed nothing", () => {
    expect(cellSymbol(cell({ state: "submitted" }))).toBe("✓");
    expect(cellSymbol(cell({ state: "missed" }))).toBe("✕");
    expect(cellSymbol(cell({ state: "excused" }))).toBe("у");
    expect(cellSymbol(cell({ state: "away", away: "vacation" }))).toBe("о");
    expect(cellSymbol(cell({ state: "away", away: "sick" }))).toBe("б");
    expect(cellSymbol(cell({ state: "away" }))).toBe("о/б");
    expect(cellSymbol(cell({ state: "off" }))).toBe("");
    expect(cellSymbol(cell({ state: "pending" }))).toBe("");
  });

  it("the file's codes: the accountant's short words, days off named", () => {
    expect(cellCode(cell({ state: "excused" }), day("x"))).toBe("ув.");
    expect(cellCode(cell({ state: "away", away: "vacation" }), day("x"))).toBe("отп.");
    expect(cellCode(cell({ state: "away", away: "sick" }), day("x"))).toBe("бол.");
    expect(cellCode(cell({ state: "holiday" }), day("x", { holiday: true }))).toBe("пр.");
    expect(cellCode(cell({ state: "off" }), day("x", { weekend: true }))).toBe("вых.");
    expect(cellCode(cell({ state: "future" }), day("x", { weekend: true }))).toBe("вых.");
    expect(cellCode(cell({ state: "future" }), day("x"))).toBe("");
    expect(cellCode(cell({ state: "pending" }), day("x"))).toBe("");
    expect(cellCode(cell({ state: "off" }), day("x"))).toBe("");
  });

  it("the tooltip's words: times without a gender, why nothing was owed", () => {
    const handedCell = tabelCell("2026-11-02", TODAY, handed("2026-11-02"), RULES, PERSON);
    expect(cellWords(handedCell, day("2026-11-02"), RULES, PERSON)).toBe("сдан · 9:20–18:02");
    const weekend = tabelCell("2026-11-07", TODAY, handed("2026-11-07"), RULES, PERSON);
    expect(cellWords(weekend, day("2026-11-07", { weekend: true }), RULES, PERSON)).toBe("сдан · 9:20–18:02 · в выходной, не в счёт");
    expect(cellWords(cell({ state: "excused", reason: "болел" }), day("x"), RULES)).toBe("уважительная: болел");
    expect(cellWords(cell({ state: "away" }), day("x"), RULES)).toBe("отпуск или больничный");
    expect(cellWords(cell({ state: "pending" }), day("x"), RULES)).toBe("ещё не сдан");
    const late = { ...PERSON, created_at: "2026-11-09T05:00:00Z" };
    expect(cellWords(cell({ state: "off", day: "2026-11-05" }), day("2026-11-05"), RULES, late)).toBe("ещё не в команде");
    expect(cellWords(cell({ state: "off", day: "2026-11-05" }), day("2026-11-05"), RULES, { ...PERSON, is_active: false })).toBe("не в команде");
    expect(cellWords(cell({ state: "off", day: "2026-09-29" }), day("2026-09-29"), RULES, PERSON)).toBe("отчёты ещё не начались");
  });

  it("names a fixed holiday, says «праздник» for the company's own", () => {
    expect(holidayWords("2026-10-25")).toBe("праздник · День Республики");
    expect(holidayWords("2026-11-03")).toBe("праздник");
  });

});

describe("the period's words", () => {
  it("a calendar month by its name, anything else by its days", () => {
    expect(isCalendarMonth("2026-11-01", "2026-11-30")).toBe(true);
    expect(isCalendarMonth("2026-02-01", "2026-02-28")).toBe(true);
    expect(isCalendarMonth("2026-11-01", "2026-11-29")).toBe(false);
    expect(isCalendarMonth("2026-10-02", "2026-11-01")).toBe(false);
    expect(tabelPeriodWords("2026-11-01", "2026-11-30")).toBe("ноябрь 2026");
    expect(tabelPeriodWords("2026-11-02", "2026-11-08")).toBe("2–8 нояб. 2026");
    expect(tabelPeriodWords("2026-10-26", "2026-11-01")).toBe("26 окт. – 1 нояб. 2026");
    expect(tabelPeriodWords("2026-12-28", "2027-01-03")).toBe("28 дек. 2026 – 3 янв. 2027");
  });

  it("every day of a range, none of a broken one", () => {
    expect(daysOf("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(daysOf("2026-03-02", "2026-03-01")).toEqual([]);
    expect(daysOf("x", "2026-03-01")).toEqual([]);
  });
});
