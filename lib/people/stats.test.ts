import { describe, expect, it } from "vitest";

import type { RatingRow } from "@/lib/points/queries";

import {
  changeOf,
  givenAt,
  handSpans,
  median,
  monotonePath,
  percent,
  placeText,
  ratingSpot,
  reportCalendar,
  reportDayState,
  reportStreak,
  spanPosition,
  spanShort,
  weekSeries,
  type ReportPerson,
  type ReportRow,
  type ReportRules,
  type StatsTask,
} from "./stats";

// a Thursday
const TODAY = "2026-11-12";
const HOUR = 3_600_000;

const task = (patch: Partial<StatsTask>): StatsTask => ({
  status: "done",
  deadline: null,
  completed_at: "2026-11-10T07:00:00Z",
  created_at: "2026-11-09T07:00:00Z",
  scheduled_send_at: null,
  ...patch,
});

const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: [], started_on: "2026-10-01", checked_on: "2026-11-11" };
const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-09-01T04:00:00Z" };
const report = (report_date: string, status: ReportRow["status"] = "submitted"): ReportRow => ({
  report_date,
  status,
  arrived_at: status === "submitted" ? `${report_date}T04:00:00Z` : null,
  left_at: status === "submitted" ? `${report_date}T13:00:00Z` : null,
  submitted_at: status === "submitted" ? `${report_date}T13:05:00Z` : null,
});

describe("weekSeries", () => {
  it("is twelve whole weeks, oldest first, the last one ending today", () => {
    const series = weekSeries([], TODAY);
    expect(series).toHaveLength(12);
    expect(series[11]).toEqual({ from: "2026-11-06", to: "2026-11-12", count: 0 });
    expect(series[10]).toEqual({ from: "2026-10-30", to: "2026-11-05", count: 0 });
    expect(series[0].from).toBe("2026-08-21");
  });

  it("counts what stands handed in by the company's day of the hand-in", () => {
    const series = weekSeries(
      [
        task({}),
        task({ status: "pending_review" }),
        // sent back: not handed in, though it keeps its completed_at
        task({ status: "rework" }),
        // 2026-11-05 19:30 UTC is 00:30 on the 6th in Aqtobe: this week
        task({ completed_at: "2026-11-05T19:30:00Z" }),
        // too old for the line
        task({ completed_at: "2026-08-01T07:00:00Z" }),
      ],
      TODAY,
    );
    expect(series[11].count).toBe(3);
    expect(series.reduce((sum, week) => sum + week.count, 0)).toBe(3);
  });
});

describe("givenAt and handSpans", () => {
  it("a scheduled task is given when it is sent, not when it was made", () => {
    expect(givenAt({ created_at: "2026-11-09T07:00:00Z", scheduled_send_at: "2026-11-09T09:00:00Z" })).toBe(Date.parse("2026-11-09T09:00:00Z"));
    expect(givenAt({ created_at: "2026-11-09T07:00:00Z", scheduled_send_at: null })).toBe(Date.parse("2026-11-09T07:00:00Z"));
  });

  it("measures given to handed in for the window's hand-ins only", () => {
    const window = { from: "2026-10-14", to: TODAY };
    const spans = handSpans(
      [
        task({ created_at: "2026-11-10T05:00:00Z", completed_at: "2026-11-10T07:00:00Z" }),
        task({ created_at: "2026-11-01T07:00:00Z", completed_at: "2026-11-03T07:00:00Z" }),
        task({ status: "accepted", completed_at: null }),
        task({ completed_at: "2026-09-01T07:00:00Z", created_at: "2026-08-30T07:00:00Z" }),
      ],
      window,
    );
    expect(spans).toEqual([48 * HOUR, 2 * HOUR]);
  });
});

describe("median", () => {
  it("is the middle, or the mean of the two middles; nothing — null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("spanShort", () => {
  it("says a span short", () => {
    expect(spanShort(40 * 60_000)).toBe("40 мин");
    expect(spanShort(3 * HOUR + 20 * 60_000)).toBe("3 ч 20 мин");
    expect(spanShort(9 * HOUR + 20 * 60_000)).toBe("9 ч");
    expect(spanShort(28 * HOUR)).toBe("1 д 4 ч");
    expect(spanShort(12 * 24 * HOUR + 5 * HOUR)).toBe("12 д");
    expect(spanShort(10_000)).toBe("1 мин");
  });
});

describe("spanPosition", () => {
  it("holds a quarter of an hour to a month, on a log scale", () => {
    expect(spanPosition(60_000)).toBe(0);
    expect(spanPosition(90 * 24 * HOUR)).toBe(1);
    expect(spanPosition(HOUR)).toBeGreaterThan(0);
    expect(spanPosition(24 * HOUR)).toBeGreaterThan(spanPosition(HOUR));
    expect(spanPosition(24 * HOUR)).toBeLessThan(0.7);
  });
});

describe("changeOf and percent", () => {
  it("says the change in words, nothing to compare with — null", () => {
    expect(changeOf(5, 2)).toEqual({ diff: 3, text: "↑ 3" });
    expect(changeOf(2, 5, " п. п.")).toEqual({ diff: -3, text: "↓ 3 п. п." });
    expect(changeOf(2, 2)).toEqual({ diff: 0, text: "как раньше" });
    expect(changeOf(2, null)).toBeNull();
    expect(percent(5, 6)).toBe(83);
    expect(percent(0, 0)).toBeNull();
  });
});

describe("reportDayState", () => {
  const state = (day: string, row?: ReportRow, rules = RULES, person = PERSON) => reportDayState(day, TODAY, row, rules, person);

  it("a row speaks for itself", () => {
    expect(state("2026-11-10", report("2026-11-10"))).toBe("submitted");
    expect(state("2026-11-10", report("2026-11-10", "missed"))).toBe("missed");
    // even on a day off: a report handed in on Saturday is handed in
    expect(state("2026-11-08", report("2026-11-08"))).toBe("submitted");
  });

  it("without a row: a day off, before the start, before the person came, the module off, who left — not due", () => {
    expect(state("2026-11-08")).toBe("off");
    expect(state("2026-11-10", undefined, { ...RULES, holidays: ["2026-11-10"] })).toBe("off");
    expect(state("2026-09-30")).toBe("off");
    // 20:00 UTC is 01:00 of the 11th in Aqtobe: came after the 10th; came during the day — due that day
    expect(state("2026-11-10", undefined, RULES, { ...PERSON, created_at: "2026-11-10T20:00:00Z" })).toBe("off");
    expect(state("2026-11-10", undefined, { ...RULES, checked_on: null }, { ...PERSON, created_at: "2026-11-10T10:00:00Z" })).toBe("missed");
    expect(state("2026-11-10", undefined, { ...RULES, enabled: false })).toBe("off");
    expect(state("2026-11-10", undefined, RULES, { ...PERSON, is_active: false })).toBe("off");
  });

  it("a day the morning tick closed without a row was a day away; away now — away", () => {
    expect(state("2026-11-10")).toBe("away");
    expect(state("2026-11-10", undefined, { ...RULES, checked_on: "2026-11-09" })).toBe("missed");
    expect(state(TODAY, undefined, RULES, { ...PERSON, availability: "sick" })).toBe("away");
  });

  it("today waits, the days ahead are still to come", () => {
    expect(state(TODAY)).toBe("pending");
    expect(state("2026-11-13")).toBe("future");
  });

  it("never fined before the start: no start yet means from today", () => {
    expect(state("2026-11-11", undefined, { ...RULES, started_on: null, checked_on: null })).toBe("off");
    expect(state(TODAY, undefined, { ...RULES, started_on: null, checked_on: null })).toBe("pending");
  });
});

describe("reportCalendar", () => {
  it("is five weeks of Monday to Sunday, this week last, today marked", () => {
    const calendar = reportCalendar([report("2026-11-11"), report("2026-11-03", "missed")], TODAY, RULES, PERSON);
    expect(calendar).toHaveLength(5);
    expect(calendar.every((week) => week.length === 7)).toBe(true);
    expect(calendar[4][0].day).toBe("2026-11-09");
    expect(calendar[4][6].day).toBe("2026-11-15");
    expect(calendar[0][0].day).toBe("2026-10-12");
    expect(calendar[4][3]).toMatchObject({ day: TODAY, today: true, state: "pending" });
    expect(calendar[4][2]).toMatchObject({ day: "2026-11-11", state: "submitted" });
    expect(calendar[3][1]).toMatchObject({ day: "2026-11-03", state: "missed" });
    expect(calendar[4][4].state).toBe("future");
  });
});

describe("reportStreak", () => {
  it("counts the reports handed in one after another back from today, a miss ends it", () => {
    const rows = [report("2026-11-03", "missed"), report("2026-11-04"), report("2026-11-05"), report("2026-11-06"), report("2026-11-09"), report("2026-11-10"), report("2026-11-11")];
    // the weekend between neither breaks nor adds; today is not due yet
    expect(reportStreak(rows, TODAY, { ...RULES, checked_on: "2026-11-11" }, PERSON, 84)).toBe(6);
    expect(reportStreak([...rows, report(TODAY)], TODAY, RULES, PERSON, 84)).toBe(7);
  });

  it("a past working day without a report breaks it, as the screen counts it missed", () => {
    expect(reportStreak([report("2026-11-10")], TODAY, { ...RULES, checked_on: "2026-11-09" }, PERSON, 84)).toBe(0);
  });

  it("nothing handed in — zero", () => {
    expect(reportStreak([], TODAY, RULES, PERSON, 84)).toBe(0);
  });
});

describe("ratingSpot and placeText", () => {
  const row = (user_id: string, points: number, rank: number, delta = 0): RatingRow => ({ user_id, display_name: user_id, points, rank, delta_vs_prev: delta, on_time_pct: null, is_me: false });

  it("finds the person and how many people stand in the rating, not how many places", () => {
    const rows = [row("a", 50, 1), row("b", 30, 2, 10), row("c", 30, 2), row("d", 0, 3)];
    expect(ratingSpot(rows, "b")).toEqual({ points: 30, rank: 2, of: 4, delta: 10 });
    expect(ratingSpot(rows, "x")).toBeNull();
    expect(ratingSpot(undefined, "a")).toBeNull();
    expect(placeText(3)).toBe("3-е место");
  });
});

describe("monotonePath", () => {
  it("passes through every point and never dips under a flat floor", () => {
    const path = monotonePath([
      { x: 0, y: 30 },
      { x: 10, y: 30 },
      { x: 20, y: 5 },
      { x: 30, y: 30 },
    ]);
    expect(path.startsWith("M0,30C")).toBe(true);
    expect(path.endsWith("30,30")).toBe(true);
    // the flat stretch stays flat: its control points sit on the floor
    expect(path).toContain("C3.33,30,6.67,30,10,30");
    const ys = [...path.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(30);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(5);
  });

  it("one point is a move, none is nothing", () => {
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(monotonePath([])).toBe("");
  });
});
