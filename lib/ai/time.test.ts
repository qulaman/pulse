import { describe, expect, it } from "vitest";

import { aqtobeDateAt, aqtobeIsoToUtc, aqtobeIsoWeekday, formatAqtobe, humanAqtobe, weekdayRu } from "./time";

// Thursday, 13.08.2026, 10:00 Asia/Aqtobe.
const NOW = new Date("2026-08-13T10:00:00+05:00");

describe("Aqtobe helpers", () => {
  it("converts Aqtobe ISO to UTC", () => {
    expect(aqtobeIsoToUtc("2026-08-14T13:00:00+05:00")).toBe("2026-08-14T08:00:00.000Z");
  });

  it("formats and names the day in Russian", () => {
    expect(weekdayRu(NOW)).toBe("четверг");
    expect(formatAqtobe(NOW)).toBe("13.08.2026 10:00");
  });

  it.each([
    ["2026-08-13T13:00:00+05:00", "сегодня 13:00"],
    ["2026-08-13T23:30:00+05:00", "сегодня 23:30"],
    ["2026-08-14T00:10:00+05:00", "завтра 00:10"],
    ["2026-08-12T18:00:00+05:00", "вчера 18:00"],
    ["2026-08-15T09:00:00+05:00", "сб 09:00"],
    ["2026-08-19T09:00:00+05:00", "ср 09:00"],
    ["2026-08-20T09:00:00+05:00", "20.08 09:00"],
    ["2026-07-01T09:00:00+05:00", "01.07 09:00"],
    ["2027-01-05T09:00:00+05:00", "05.01.2027 09:00"],
  ])("humanAqtobe(%s) → %s", (iso, expected) => {
    expect(humanAqtobe(new Date(iso), NOW)).toBe(expected);
  });

  it("names the ISO weekday and builds a calendar instant, refusing a date that does not exist", () => {
    expect(aqtobeIsoWeekday(NOW)).toBe(4);
    expect(aqtobeIsoWeekday(new Date("2026-08-16T23:30:00+05:00"))).toBe(7);
    expect(aqtobeDateAt(2026, 8, 25, 9, 30)?.toISOString()).toBe("2026-08-25T04:30:00.000Z");
    expect(aqtobeDateAt(2026, 2, 31, 9, 0)).toBeNull();
  });
});
