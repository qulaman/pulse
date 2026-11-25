import { describe, expect, it } from "vitest";

import { finedMiss, foldHistory, gapLine } from "./history";
import type { DailyReport } from "./types";

const report = (date: string, patch: Partial<DailyReport> = {}): DailyReport => ({
  id: date,
  user_id: "u",
  report_date: date,
  status: "missed",
  arrived_at: null,
  left_at: null,
  summary: null,
  tasks: [],
  submitted_at: null,
  updated_at: `${date}T12:00:00Z`,
  points: 0,
  excused_at: null,
  excused_reason: null,
  ...patch,
} as DailyReport);

const handed = (date: string) => report(date, { status: "submitted", points: 1, submitted_at: `${date}T13:00:00Z` });

describe("foldHistory", () => {
  it("twenty misses in a row are one card, newest and oldest day named", () => {
    const days = Array.from({ length: 20 }, (_, i) => report(`2026-11-${String(23 - i).padStart(2, "0")}`));
    const items = foldHistory(days);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "gap", newest: "2026-11-23", oldest: "2026-11-04", points: 0 });
  });

  it("short runs stay as days; a handed-in or an excused day breaks a run", () => {
    const items = foldHistory([
      report("2026-11-23"),
      report("2026-11-20"),
      handed("2026-11-19"),
      report("2026-11-18"),
      report("2026-11-17"),
      report("2026-11-16", { excused_at: "x", excused_reason: "болел" }),
      report("2026-11-13"),
      report("2026-11-12"),
      report("2026-11-11"),
    ]);
    expect(items.map((item) => (item.kind === "day" ? item.report.report_date : `gap ${item.newest}…${item.oldest}`))).toEqual([
      "2026-11-23",
      "2026-11-20",
      "2026-11-19",
      "2026-11-18",
      "2026-11-17",
      "2026-11-16",
      "gap 2026-11-13…2026-11-11",
    ]);
  });

  it("empty and one", () => {
    expect(foldHistory([])).toEqual([]);
    expect(foldHistory([handed("2026-11-23")])).toEqual([{ kind: "day", report: handed("2026-11-23") }]);
  });
});

describe("words and colour", () => {
  it("a run says its days and what it cost — or that it cost nothing", () => {
    const free = foldHistory([report("2026-11-23"), report("2026-11-20"), report("2026-11-19")]);
    const fined = foldHistory([report("2026-11-23", { points: -10 }), report("2026-11-20", { points: -10 }), report("2026-11-19")]);
    expect(free[0].kind === "gap" && gapLine(free[0])).toBe("3 дня без отчёта · без штрафа");
    expect(fined[0].kind === "gap" && gapLine(fined[0])).toBe("3 дня без отчёта · −20");
  });

  it("only a miss that cost points is red", () => {
    expect(finedMiss(report("2026-11-23", { points: -10 }))).toBe(true);
    expect(finedMiss(report("2026-11-23"))).toBe(false);
    expect(finedMiss(report("2026-11-23", { points: 0, excused_at: "x" }))).toBe(false);
    expect(finedMiss(handed("2026-11-23"))).toBe(false);
  });
});
