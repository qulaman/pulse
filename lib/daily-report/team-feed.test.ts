import { describe, expect, it } from "vitest";

import {
  batchCheckIds,
  checkedManyText,
  dayCountLine,
  dayHasContent,
  dayHead,
  isCheckable,
  missedLine,
  readReportsAddress,
  reportsHref,
  todayStrip,
  uncheckedText,
  withKept,
  type KeptReport,
} from "./team-feed";
import type { FeedDay, FeedReport } from "./types";

// 2026-11-25 12:00 in Aqtobe (UTC+5) — a Wednesday
const NOW = new Date("2026-11-25T07:00:00Z");
const WHO = "6f1c2b3a-0000-4000-8000-000000000001";

const report = (id: string, patch: Partial<FeedReport> = {}): FeedReport => ({
  id,
  user_id: `u-${id}`,
  report_date: "2026-11-24",
  status: "submitted",
  arrived_at: null,
  left_at: null,
  summary: "Сделал",
  tasks: [],
  submitted_at: "2026-11-24T13:00:00Z",
  updated_at: "2026-11-24T13:00:00Z",
  points: 1,
  excused_at: null,
  excused_reason: null,
  full_name: `Человек ${id}`,
  position: null,
  avatar_url: null,
  ...patch,
});

const day = (patch: Partial<FeedDay> = {}): FeedDay => ({
  date: "2026-11-24",
  today: false,
  workday: true,
  due: 10,
  submitted: 9,
  missed: 1,
  excused: 0,
  pending: 0,
  reports: [],
  missed_people: [],
  ...patch,
});

describe("the address", () => {
  it("reads the view back, leaving out what it cannot read", () => {
    expect(readReportsAddress(new URLSearchParams(""))).toEqual({ tab: "feed", who: null, unchecked: false, day: null });
    expect(readReportsAddress(new URLSearchParams(`tab=period&who=${WHO.toUpperCase()}&only=new&day=2026-11-20`))).toEqual({
      tab: "period",
      who: WHO,
      unchecked: true,
      day: "2026-11-20",
    });
    // an old «День» link is the feed; junk is dropped, never an error
    expect(readReportsAddress(new URLSearchParams("tab=day&who=<x>&only=all&day=2026-13-40"))).toEqual({ tab: "feed", who: null, unchecked: false, day: null });
  });

  it("writes the parameters in one order, the period without the feed's filters", () => {
    expect(reportsHref({ tab: "feed", who: null, unchecked: false, day: null })).toBe("/reports");
    expect(reportsHref({ tab: "feed", who: WHO, unchecked: true, day: "2026-11-20" })).toBe(`/reports?who=${WHO}&only=new&day=2026-11-20`);
    expect(reportsHref({ tab: "period", who: WHO, unchecked: true, day: null })).toBe("/reports?tab=period");
    const back = readReportsAddress(new URLSearchParams(reportsHref({ tab: "feed", who: WHO, unchecked: true, day: null }).split("?")[1]));
    expect(back).toEqual({ tab: "feed", who: WHO, unchecked: true, day: null });
  });
});

describe("a day of the feed", () => {
  it("names today, yesterday and the other days", () => {
    expect(dayHead("2026-11-25", NOW)).toEqual({ title: "Сегодня", sub: "среда, 25 ноября" });
    expect(dayHead("2026-11-24", NOW)).toEqual({ title: "Вчера", sub: "вторник, 24 ноября" });
    expect(dayHead("2026-11-23", NOW)).toEqual({ title: "Понедельник", sub: "23 ноября" });
    expect(dayHead("2025-12-31", NOW)).toEqual({ title: "Среда", sub: "31 декабря 2025" });
  });

  it("counts who handed in out of who owed, a day nobody owed one said so", () => {
    expect(dayCountLine(day())).toBe("сдали 9 из 10");
    expect(dayCountLine(day({ due: 0, submitted: 0 }))).toBe("отчёт не нужен");
    expect(dayCountLine(day({ due: 0, submitted: 2 }))).toBe("отчёт не нужен · сдали 2");
  });

  it("says who handed nothing in, the excused apart", () => {
    const missed = [
      { user_id: "a", full_name: "Ерлан Байжанов", avatar_url: null, excused: false, report_id: "r1" },
      { user_id: "b", full_name: "Гуля Сатпаева", avatar_url: null, excused: true, report_id: "r2" },
      { user_id: "c", full_name: "Марат Каримов", avatar_url: null, excused: false, report_id: null },
    ];
    expect(missedLine(missed)).toBe("без отчёта: Ерлан, Марат · уважительная: Гуля");
    expect(missedLine([])).toBe("");
    // one person's feed: the name is the feed's own
    expect(missedLine([missed[0]], true)).toBe("без отчёта");
    expect(missedLine([missed[1]], true)).toBe("без отчёта · уважительная причина");
    expect(missedLine([], true)).toBe("");
  });

  it("draws a day with reports or people without one", () => {
    expect(dayHasContent(day())).toBe(false);
    expect(dayHasContent(day({ reports: [report("a")] }))).toBe(true);
    expect(dayHasContent(day({ missed_people: [{ user_id: "a", full_name: "А", avatar_url: null, excused: false, report_id: null }] }))).toBe(true);
  });

  it("puts today's count first and whom we wait for on the button", () => {
    expect(todayStrip(day({ today: true, submitted: 4, due: 10, pending: 4 }))).toEqual({ big: "4", of: "из 10", words: "сдали сегодня", waiting: 4 });
    expect(todayStrip(day({ today: true, submitted: 0, due: 0, pending: 0 }))).toEqual({ big: "", of: "", words: "Сегодня отчёт не нужен", waiting: 0 });
    expect(todayStrip(day({ today: true, submitted: 1, due: 0 })).words).toBe("сдали сегодня · отчёт не нужен");
  });
});

describe("«Проверено»", () => {
  it("checks only a handed-in report without the mark", () => {
    expect(isCheckable(report("a"))).toBe(true);
    expect(isCheckable(report("a", { checked_at: "2026-11-24T14:00:00Z" }))).toBe(false);
    expect(isCheckable(report("a", { status: "missed" }))).toBe(false);
  });

  it("«Проверить все» takes only the reports already seen", () => {
    const list = [
      report("a", { seen_at: "2026-11-24T14:00:00Z" }),
      report("b"),
      report("c", { seen_at: "2026-11-24T14:00:00Z", checked_at: "2026-11-24T15:00:00Z" }),
      report("d", { seen_at: "2026-11-24T14:00:00Z" }),
    ];
    expect(batchCheckIds(list)).toEqual(["a", "d"]);
  });

  it("speaks the counts", () => {
    expect(uncheckedText(1)).toBe("1 не проверен");
    expect(uncheckedText(3)).toBe("3 не проверены");
    expect(uncheckedText(11)).toBe("11 не проверены");
    expect(checkedManyText(1)).toBe("Проверено 1 отчёт");
    expect(checkedManyText(3)).toBe("Проверено 3 отчёта");
    expect(checkedManyText(5)).toBe("Проверено 5 отчётов");
  });
});

describe("a checked report folds in place under «Не проверены»", () => {
  const a = report("a");
  const b = report("b");
  const c = report("c");
  const d = report("d");

  it("leaves the list alone while the data still has the report", () => {
    const kept = new Map<string, KeptReport>([["b", { report: b, after: "a" }]]);
    expect(withKept([a, b, c], kept, "2026-11-24").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("puts a dropped report back after the one it followed, or first", () => {
    const kept = new Map<string, KeptReport>([
      ["b", { report: b, after: "a" }],
      ["a", { report: a, after: null }],
    ]);
    expect(withKept([c, d], kept, "2026-11-24").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("waits for a neighbour that comes back itself, and keeps other days out", () => {
    const kept = new Map<string, KeptReport>([
      ["c", { report: c, after: "b" }],
      ["b", { report: b, after: "a" }],
      ["x", { report: report("x", { report_date: "2026-11-23" }), after: null }],
    ]);
    expect(withKept([a, d], kept, "2026-11-24").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ends the day with one whose neighbour is gone for good", () => {
    const kept = new Map<string, KeptReport>([["c", { report: c, after: "zz" }]]);
    expect(withKept([a, d], kept, "2026-11-24").map((r) => r.id)).toEqual(["a", "d", "c"]);
  });
});
