import { describe, expect, it } from "vitest";

import { autoDay, clampCustom, holdsToday, lastWorkdayBefore, monthTitle, periodRange, readAddress, stepPeriod, writeAddress } from "./reports-address";

const RULES = { workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-17"] };
const read = (query: string) => readAddress(new URLSearchParams(query));

describe("reports address", () => {
  it("reads the day, the person and nothing broken", () => {
    expect(read("day=2026-11-13&p=u1")).toEqual({ tab: "day", day: "2026-11-13", period: null, person: "u1" });
    expect(read("day=2026-13-40").day).toBeNull();
    expect(read("").tab).toBe("day");
  });

  it("keeps the old ?tab=period links", () => {
    expect(read("tab=period&p=u2")).toEqual({ tab: "tabel", day: null, period: null, person: "u2" });
  });

  it("reads a month, a week by any of its days and a custom range clamped to 92 days", () => {
    expect(read("tab=tabel&month=2026-11").period).toEqual({ kind: "month", month: "2026-11" });
    expect(read("tab=tabel&week=2026-11-19").period).toEqual({ kind: "week", monday: "2026-11-16" });
    expect(read("tab=tabel&from=2026-01-01&to=2026-12-31").period).toEqual({ kind: "custom", from: "2026-10-01", to: "2026-12-31" });
    expect(read("tab=tabel&month=2026-13").period).toBeNull();
  });

  it("writes back only what differs from the defaults", () => {
    expect(writeAddress({ tab: "day", day: null, period: null, person: null })).toBe("");
    expect(writeAddress({ tab: "day", day: "2026-11-13", period: null, person: "u1" })).toBe("day=2026-11-13&p=u1");
    expect(writeAddress({ tab: "tabel", day: "2026-11-13", period: { kind: "month", month: "2026-11" }, person: null })).toBe("tab=tabel&month=2026-11");
    expect(writeAddress({ tab: "tabel", day: null, period: { kind: "custom", from: "2026-11-01", to: "2026-11-10" }, person: null })).toBe("tab=tabel&from=2026-11-01&to=2026-11-10");
  });

  it("gives a calendar month and a Monday–Sunday week", () => {
    expect(periodRange({ kind: "month", month: "2026-02" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange({ kind: "week", monday: "2026-11-16" })).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(stepPeriod({ kind: "month", month: "2026-01" }, -1)).toEqual({ kind: "month", month: "2025-12" });
    expect(stepPeriod({ kind: "week", monday: "2026-11-16" }, 1)).toEqual({ kind: "week", monday: "2026-11-23" });
    expect(holdsToday({ kind: "month", month: "2026-11" }, "2026-11-18")).toBe(true);
    expect(clampCustom("2026-11-10", "2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("opens the last working day in the morning, today from ask_from", () => {
    // Wednesday 18 November; Tuesday 17 is a holiday → Monday 16
    expect(autoDay(RULES, "2026-11-18", "09:30", "17:00")).toBe("2026-11-16");
    expect(autoDay(RULES, "2026-11-18", "17:00", "17:00")).toBe("2026-11-18");
    // Monday morning → Friday
    expect(autoDay(RULES, "2026-11-23", "10:00", "17:00")).toBe("2026-11-20");
    // Saturday evening — a day off: still Friday
    expect(autoDay(RULES, "2026-11-21", "19:00", "17:00")).toBe("2026-11-20");
    expect(lastWorkdayBefore({ workdays: [], holidays: [] }, "2026-11-18")).toBeNull();
    expect(autoDay({ workdays: [], holidays: [] }, "2026-11-18", "09:00", "17:00")).toBe("2026-11-18");
  });

  it("names a month", () => {
    expect(monthTitle("2026-11")).toBe("Ноябрь 2026");
  });
});
