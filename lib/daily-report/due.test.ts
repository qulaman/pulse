import { describe, expect, it } from "vitest";

import { ASK_FROM_DEFAULT, askFromOf, NO_REPORT_DUE, oneTapInput, reportDue } from "./due";
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
  ...patch,
});

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

  it("one tap on a day with tasks; without tasks the words are needed — no one tap", () => {
    expect(reportDue(day(), at("17:30"), "17:00")).toMatchObject({ oneTap: true, tasks: 2 });
    expect(reportDue(day({ tasks: [] }), at("17:30"), "17:00")).toMatchObject({ show: true, asking: true, oneTap: false, tasks: 0 });
  });

  it("no one tap before the suggested arrival: leaving would not be after arriving", () => {
    expect(reportDue(day(), at("08:30"), "17:00").oneTap).toBe(false);
    expect(reportDue(day(), at("09:00"), "17:00").oneTap).toBe(false);
    expect(reportDue(day(), at("09:01"), "17:00").oneTap).toBe(true);
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
  it("the suggested arrival, leaving now on the minute, no words, the tap's key", () => {
    const input = oneTapInput(day(), new Date("2026-10-28T12:42:31Z"), "k-1");
    expect(input).toEqual({
      arrived_at: "2026-10-28T09:00:00+05:00",
      left_at: "2026-10-28T17:42:00+05:00",
      summary: "",
      client_request_id: "k-1",
    });
  });

  it("an arrival suggested from the last report's time of day is kept to the minute", () => {
    const input = oneTapInput(day({ suggest: { arrived_at: "2026-10-28T04:07:00Z", left_at: "2026-10-28T06:00:00Z" } }), at("18:05"), "k");
    expect(input?.arrived_at).toBe("2026-10-28T09:07:00+05:00");
    expect(input?.left_at).toBe("2026-10-28T18:05:00+05:00");
  });

  it("refuses without tasks, on another day, or before the arrival", () => {
    expect(oneTapInput(day({ tasks: [] }), at("18:00"), "k")).toBeNull();
    expect(oneTapInput(day(), at("00:05", "2026-10-29"), "k")).toBeNull();
    expect(oneTapInput(day(), at("08:59"), "k")).toBeNull();
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
