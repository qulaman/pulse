import { describe, expect, it } from "vitest";

import type { Draft } from "./draft";
import { ASK_FROM_DEFAULT, askFromOf, leftSuggestion, NO_REPORT_DUE, oneTapInput, reportDue } from "./due";
import type { DailyReport, DailyReportTask, MyDailyReportDay } from "./types";

/** An Aqtobe wall-clock moment of 2026-10-28 (a Wednesday), UTC+5. */
const at = (hm: string, ymd = "2026-10-28") => new Date(`${ymd}T${hm}:00+05:00`);

const task = (id: string): DailyReportTask => ({
  id,
  title: "Сверка",
  status: "pending_review",
  completed_at: "2026-10-28T12:00:00+05:00",
  closed_at: null,
  on_time: true,
});

const report = (patch: Partial<DailyReport> = {}): DailyReport => ({
  id: "r1",
  user_id: "u1",
  report_date: "2026-10-28",
  status: "submitted",
  arrived_at: "2026-10-28T09:05:00+05:00",
  left_at: "2026-10-28T17:40:00+05:00",
  summary: "",
  tasks: [],
  submitted_at: "2026-10-28T17:42:00+05:00",
  updated_at: "2026-10-28T17:42:00+05:00",
  points: 1,
  excused_at: null,
  excused_reason: null,
  ...patch,
});

const WORDS: Draft = { date: "2026-10-28", arrived: null, left: null, summary: "Склад" };

const day = (patch: Partial<MyDailyReportDay> = {}): MyDailyReportDay => ({
  date: "2026-10-28",
  today: true,
  workday: true,
  holiday: false,
  enabled: true,
  report: null,
  tasks: [task("t1"), task("t2")],
  suggest: { arrived_at: "2026-10-28T09:00:00+05:00", left_at: "2026-10-28T11:00:00+05:00" },
  points: { enabled: true, reward: 1, penalty: 10 },
  ...patch,
});

describe("reportDue — the report on Лента (D-167)", () => {
  it("knows it is evening whether the report is in or not — the row keeps its place after «Сдать»", () => {
    expect(reportDue(day(), at("16:59"), "17:00").evening).toBe(false);
    expect(reportDue(day(), at("17:00"), "17:00").evening).toBe(true);
    const handedIn = day({
      report: {
        id: "r1",
        user_id: "u",
        report_date: "2026-10-28",
        status: "submitted",
        arrived_at: null,
        left_at: null,
        summary: "",
        tasks: [],
        submitted_at: "2026-10-28T17:40:00+05:00",
        updated_at: "2026-10-28T17:40:00+05:00",
        points: 1,
        excused_at: null,
        excused_reason: null,
      },
    });
    expect(reportDue(handedIn, at("17:45"), "17:00")).toMatchObject({ submitted: true, asking: false, evening: true });
  });

  it("asks from ask_from on the Aqtobe clock: 16:59 quiet, 17:00 asking", () => {
    expect(reportDue(day(), at("16:59"), "17:00")).toMatchObject({ show: true, asking: false, submitted: false });
    expect(reportDue(day(), at("17:00"), "17:00")).toMatchObject({ show: true, asking: true });
    expect(reportDue(day(), at("23:59"), "17:00").asking).toBe(true);
    // the same instant read in UTC is 12:00 — the wall clock is Aqtobe's, not the phone's zone
    expect(reportDue(day(), new Date("2026-10-28T12:00:00Z"), "17:00").asking).toBe(true);
    expect(reportDue(day(), new Date("2026-10-28T11:59:00Z"), "17:00").asking).toBe(false);
  });

  it("follows the company's own time; a broken one reads as 17:00", () => {
    expect(reportDue(day(), at("16:00"), "15:30").asking).toBe(true);
    expect(reportDue(day(), at("16:59"), "nonsense").asking).toBe(false);
    expect(reportDue(day(), at("17:00"), "nonsense").asking).toBe(true);
    expect(reportDue(day(), at("17:00")).asking).toBe(true);
  });

  it("is not there on a day off, a holiday, with reports off, or while the day loads", () => {
    expect(reportDue(day({ workday: false }), at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
    expect(reportDue(day({ workday: false, holiday: true }), at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
    expect(reportDue(day({ holiday: true }), at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
    expect(reportDue(day({ enabled: false }), at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
    expect(reportDue(undefined, at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
  });

  it("only today's day counts: a phone left open past midnight shows nothing", () => {
    expect(reportDue(day(), at("00:10", "2026-10-29"), "17:00")).toEqual(NO_REPORT_DUE);
    expect(reportDue(day({ today: false }), at("18:00"), "17:00")).toEqual(NO_REPORT_DUE);
  });

  it("handed in — quiet, with the time, never asking", () => {
    const due = reportDue(day({ report: report() }), at("18:00"), "17:00");
    expect(due).toMatchObject({ show: true, submitted: true, submittedAt: "2026-10-28T17:42:00+05:00", asking: false, oneTap: false });
  });

  it("one tap only with the person's words in a draft (D-183); without tasks or words — «Написать ›»", () => {
    expect(reportDue(day(), at("17:30"), "17:00", false, WORDS)).toMatchObject({ oneTap: true, tasks: 2 });
    expect(reportDue(day(), at("17:30"), "17:00")).toMatchObject({ show: true, asking: true, oneTap: false, tasks: 2 });
    expect(reportDue(day({ tasks: [] }), at("17:30"), "17:00", false, WORDS)).toMatchObject({ show: true, asking: true, oneTap: false, tasks: 0 });
  });

  it("no one tap before the suggested arrival: leaving would not be after arriving", () => {
    expect(reportDue(day(), at("08:30"), "17:00", false, WORDS).oneTap).toBe(false);
    expect(reportDue(day(), at("09:00"), "17:00", false, WORDS).oneTap).toBe(false);
    expect(reportDue(day(), at("09:01"), "17:00", false, WORDS).oneTap).toBe(true);
  });

  it("away (leave or sick): no row and no asking — but a report handed in anyway stays said", () => {
    expect(reportDue(day(), at("18:00"), "17:00", true)).toEqual(NO_REPORT_DUE);
    expect(reportDue(day({ report: report() }), at("18:00"), "17:00", true)).toMatchObject({ show: true, submitted: true });
  });

  it("the reward is said only with points on", () => {
    expect(reportDue(day(), at("18:00")).reward).toBe(1);
    expect(reportDue(day({ points: { enabled: false, reward: 1, penalty: 0 } }), at("18:00")).reward).toBe(0);
  });
});

describe("oneTapInput — what «Сдать» from Лента sends", () => {
  it("the suggested arrival, leaving now on the minute, the draft's words, the tap's key", () => {
    const input = oneTapInput(day(), new Date("2026-10-28T12:42:31Z"), "k-1", WORDS);
    expect(input).toEqual({
      arrived_at: "2026-10-28T09:00:00+05:00",
      left_at: "2026-10-28T17:42:00+05:00",
      summary: "Склад",
      client_request_id: "k-1",
    });
  });

  it("no words — no one tap (D-183): the form asks for a line", () => {
    expect(oneTapInput(day(), at("17:42"), "k")).toBeNull();
    expect(oneTapInput(day(), at("17:42"), "k", { ...WORDS, summary: "  \n " })).toBeNull();
  });

  it("an arrival suggested from the last report's time of day is kept to the minute", () => {
    const input = oneTapInput(day({ suggest: { arrived_at: "2026-10-28T04:07:00Z", left_at: "2026-10-28T06:00:00Z" } }), at("18:05"), "k", WORDS);
    expect(input?.arrived_at).toBe("2026-10-28T09:07:00+05:00");
    expect(input?.left_at).toBe("2026-10-28T18:05:00+05:00");
  });

  it("refuses without tasks, on another day, or before the arrival", () => {
    expect(oneTapInput(day({ tasks: [] }), at("18:00"), "k", WORDS)).toBeNull();
    expect(oneTapInput(day(), at("00:05", "2026-10-29"), "k", { ...WORDS, date: "2026-10-29" })).toBeNull();
    expect(oneTapInput(day(), at("08:59"), "k", WORDS)).toBeNull();
  });
});

describe("oneTapInput — the draft typed on /report goes in (tasks/032)", () => {
  const draft = (patch: Partial<Draft> = {}): Draft => ({ date: "2026-10-28", arrived: null, left: null, summary: "", ...patch });
  const plain = { arrived_at: "2026-10-28T09:00:00+05:00", left_at: "2026-10-28T17:42:00+05:00", summary: "Объект", client_request_id: "k" };

  it("without a draft — nothing goes in one tap (D-183)", () => {
    expect(oneTapInput(day(), at("17:42"), "k", null)).toBeNull();
  });

  it("the draft's words, trimmed; the times stay the suggestion and now", () => {
    expect(oneTapInput(day(), at("17:42"), "k", draft({ summary: "  Склад, приёмка цемента \n" }))).toEqual({
      ...plain,
      summary: "Склад, приёмка цемента",
    });
  });

  it("the draft's «Пришёл» and «Ушёл» where they are set, each on its own", () => {
    expect(oneTapInput(day(), at("17:42"), "k", draft({ arrived: "08:40", left: "17:15", summary: "Объект" }))).toEqual({
      arrived_at: "2026-10-28T08:40:00+05:00",
      left_at: "2026-10-28T17:15:00+05:00",
      summary: "Объект",
      client_request_id: "k",
    });
    expect(oneTapInput(day(), at("17:42"), "k", draft({ arrived: "08:40", summary: "Объект" }))).toEqual({ ...plain, arrived_at: "2026-10-28T08:40:00+05:00" });
    expect(oneTapInput(day(), at("17:42"), "k", draft({ left: "17:15", summary: "Объект" }))).toEqual({ ...plain, left_at: "2026-10-28T17:15:00+05:00" });
  });

  it("a draft of another day is not this day's — as without one", () => {
    expect(oneTapInput(day(), at("17:42"), "k", draft({ date: "2026-10-27", arrived: "08:40", summary: "Вчерашнее" }))).toBeNull();
  });

  it("times that make no length give way to the suggestion and now; the words still go in", () => {
    const words = plain;
    // «Ушёл» before «Пришёл»
    expect(oneTapInput(day(), at("17:42"), "k", draft({ arrived: "10:00", left: "09:30", summary: "Объект" }))).toEqual(words);
    // the same minute
    expect(oneTapInput(day(), at("17:42"), "k", draft({ arrived: "10:00", left: "10:00", summary: "Объект" }))).toEqual(words);
    // «Пришёл» later than now, «Ушёл» left to now
    expect(oneTapInput(day(), at("17:42"), "k", draft({ arrived: "18:30", summary: "Объект" }))).toEqual(words);
    // and when the plain way cannot either, nothing goes
    expect(oneTapInput(day(), at("08:30"), "k", draft({ arrived: "10:00", left: "09:30", summary: "Объект" }))).toBeNull();
  });

  it("a draft is no way round the rules: no tasks or another day — nothing", () => {
    expect(oneTapInput(day({ tasks: [] }), at("17:42"), "k", draft({ summary: "Объект" }))).toBeNull();
    expect(oneTapInput(day(), at("00:05", "2026-10-29"), "k", draft({ summary: "Объект" }))).toBeNull();
  });
});

describe("askFromOf", () => {
  it("a clock is kept, anything else is the default", () => {
    expect(askFromOf("16:45")).toBe("16:45");
    expect(askFromOf("24:00")).toBe(ASK_FROM_DEFAULT);
    expect(askFromOf("9:00")).toBe(ASK_FROM_DEFAULT);
    expect(askFromOf(undefined)).toBe(ASK_FROM_DEFAULT);
    expect(askFromOf(1700)).toBe(ASK_FROM_DEFAULT);
  });
});

describe("leftSuggestion (7.6)", () => {
  it("in the morning «Ушёл» is empty — nobody has left at half past nine", () => {
    expect(leftSuggestion(day(), at("09:31"))).toBeNull();
    expect(leftSuggestion(day(), at("16:59"))).toBeNull();
  });

  it("from the evening (`ask_from`) it is now on the minute", () => {
    expect(leftSuggestion(day(), at("17:00"))).toBe("17:00");
    expect(leftSuggestion(day(), at("18:42"))).toBe("18:42");
    expect(leftSuggestion(day(), at("15:10"), "15:00")).toBe("15:10");
  });

  it("a day that is not today keeps the database's suggestion", () => {
    expect(leftSuggestion(day(), at("09:31", "2026-10-29"))).toBe("11:00");
  });
});
