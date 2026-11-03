import { describe, expect, it } from "vitest";

import { kzFixedHolidays } from "./holidays";

describe("Kazakhstan's fixed-date holidays", () => {
  it("lists the fourteen days of a year in order", () => {
    expect(kzFixedHolidays(2027)).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-01-07",
      "2027-03-08",
      "2027-03-21",
      "2027-03-22",
      "2027-03-23",
      "2027-05-01",
      "2027-05-07",
      "2027-05-09",
      "2027-07-06",
      "2027-08-30",
      "2027-10-25",
      "2027-12-16",
    ]);
  });

  it("takes the year asked for, each day once", () => {
    const days = kzFixedHolidays(2026);
    expect(days.every((day) => day.startsWith("2026-"))).toBe(true);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
  });
});
