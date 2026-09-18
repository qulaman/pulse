import { describe, expect, it } from "vitest";

import {
  addMonths,
  aqtobeIsoToYmdHm,
  compactYmd,
  compareYmd,
  daysBetween,
  humanYmd,
  isWithin,
  monthMatrix,
  monthTitleRu,
  nowHm,
  parseHm,
  parseYmd,
  todayYmd,
  ymdHmToAqtobeIso,
} from "./calendar";

/** 2026-09-17 21:30 UTC is already 2026-09-18 02:30 in Aqtobe — the day is the local one. */
const LATE = new Date("2026-09-17T21:30:00Z");
const NOON = new Date("2026-09-17T07:00:00Z");

describe("the day on the Aqtobe clock", () => {
  it("rolls over five hours before UTC does", () => {
    expect(todayYmd(NOON)).toBe("2026-09-17");
    expect(todayYmd(LATE)).toBe("2026-09-18");
    expect(nowHm(NOON)).toBe("12:00");
  });

  it("refuses a day that does not exist", () => {
    expect(parseYmd("2026-02-31")).toBeNull();
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("17.09.2026")).toBeNull();
    expect(parseYmd("2026-02-29")).toBeNull(); // 2026 is not a leap year
    expect(parseYmd("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("refuses a time that does not exist", () => {
    expect(parseHm("24:00")).toBeNull();
    expect(parseHm("08:60")).toBeNull();
    expect(parseHm("8:00")).toBeNull();
    expect(parseHm("08:00")).toEqual({ hours: 8, minutes: 0 });
  });
});

describe("the month grid", () => {
  it("always has six rows of seven, Monday first", () => {
    for (const month of [{ year: 2026, month: 2 }, { year: 2026, month: 9 }, { year: 2026, month: 11 }]) {
      const grid = monthMatrix(month);
      expect(grid).toHaveLength(6);
      expect(grid.every((row) => row.length === 7)).toBe(true);
    }
  });

  it("puts the first day under its own weekday", () => {
    // 1 сентября 2026 — вторник
    const grid = monthMatrix({ year: 2026, month: 9 });
    expect(grid[0][0]).toBeNull();
    expect(grid[0][1]).toBe("2026-09-01");
    expect(grid[4][2]).toBe("2026-09-30");
    expect(grid[5].every((cell) => cell === null)).toBe(true);
  });

  it("holds every day of the month exactly once", () => {
    const days = monthMatrix({ year: 2026, month: 2 }).flat().filter(Boolean);
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
  });

  it("steps over a year boundary in both directions", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 3 }, -14)).toEqual({ year: 2025, month: 1 });
    expect(monthTitleRu({ year: 2026, month: 9 })).toBe("сентябрь 2026");
  });
});

describe("what a person would call the day", () => {
  it("says сегодня, завтра and вчера before it says a date", () => {
    expect(humanYmd("2026-09-17", NOON)).toBe("сегодня");
    expect(humanYmd("2026-09-18", NOON)).toBe("завтра");
    expect(humanYmd("2026-09-16", NOON)).toBe("вчера");
    // the same instant late at night is already tomorrow in Aqtobe
    expect(humanYmd("2026-09-18", LATE)).toBe("сегодня");
  });

  it("names the weekday, and the year only when it is another one", () => {
    expect(humanYmd("2026-09-24", NOON)).toBe("чт, 24 сентября");
    expect(humanYmd("2027-01-05", NOON)).toBe("вт, 5 января 2027");
  });
});

describe("the short form", () => {
  it("keeps сегодня and завтра, then falls back to digits", () => {
    expect(compactYmd("2026-09-17", NOON)).toBe("сегодня");
    expect(compactYmd("2026-09-18", NOON)).toBe("завтра");
    expect(compactYmd("2026-09-24", NOON)).toBe("24.09");
    expect(compactYmd("2027-01-05", NOON)).toBe("05.01.27");
  });
});

describe("bounds and order", () => {
  it("orders days as strings", () => {
    expect(compareYmd("2026-09-09", "2026-09-10")).toBe(-1);
    expect(daysBetween("2026-09-17", "2026-10-01")).toBe(14);
    expect(daysBetween("2026-09-17", "2026-09-16")).toBe(-1);
  });

  it("keeps a day inside the window it was given", () => {
    expect(isWithin("2026-09-17", "2026-09-17", null)).toBe(true);
    expect(isWithin("2026-09-16", "2026-09-17", null)).toBe(false);
    expect(isWithin("2026-09-20", null, "2026-09-19")).toBe(false);
  });
});

describe("the instant the rest of the app speaks in", () => {
  it("writes the offset out and reads it back unchanged", () => {
    expect(ymdHmToAqtobeIso("2026-09-17", "18:00")).toBe("2026-09-17T18:00:00+05:00");
    expect(ymdHmToAqtobeIso("2026-09-17", null)).toBeNull();
    expect(ymdHmToAqtobeIso("2026-02-31", "18:00")).toBeNull();
    expect(aqtobeIsoToYmdHm("2026-09-17T18:00:00+05:00")).toEqual({ ymd: "2026-09-17", hm: "18:00" });
    // a UTC instant is shown on the Aqtobe wall clock, not on the browser's
    expect(aqtobeIsoToYmdHm("2026-09-17T21:30:00Z")).toEqual({ ymd: "2026-09-18", hm: "02:30" });
    expect(aqtobeIsoToYmdHm("не дата")).toBeNull();
  });
});
