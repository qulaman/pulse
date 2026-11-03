import { describe, expect, it } from "vitest";

import { formatWhen, fromLocalInput, isoAt, parseWhen, toLocalInput, wallOf, whenPresets } from "./when";

// вторник, 03.11.2026 11:30 in Aqtobe (06:30 UTC)
const TUE = new Date("2026-11-03T06:30:00Z");
// четверг, 05.11.2026 19:10 in Aqtobe
const THU_EVENING = new Date("2026-11-05T14:10:00Z");

describe("wall clock (Aqtobe +05:00)", () => {
  it("reads the weekday and the hour", () => {
    expect(wallOf(TUE)).toMatchObject({ y: 2026, m: 11, d: 3, h: 11, min: 30, weekday: 2 });
  });

  it("writes the parser's ISO, overflow normalised", () => {
    expect(isoAt(2026, 11, 31, 18, 0)).toBe("2026-12-01T18:00:00+05:00");
  });

  it("round-trips a datetime-local value", () => {
    expect(toLocalInput("2026-11-07T18:00:00+05:00")).toBe("2026-11-07T18:00");
    expect(fromLocalInput("2026-11-07T18:00")).toBe("2026-11-07T18:00:00+05:00");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("formatWhen", () => {
  it("says today and tomorrow in words", () => {
    expect(formatWhen("2026-11-03T18:00:00+05:00", TUE)).toBe("сегодня 18:00");
    expect(formatWhen("2026-11-04T10:00:00+05:00", TUE)).toBe("завтра 10:00");
  });

  it("names the weekday of a later day", () => {
    expect(formatWhen("2026-11-06T18:00:00+05:00", TUE)).toBe("пт 06.11 18:00");
  });

  it("writes the year of another year", () => {
    expect(formatWhen("2027-01-15T09:00:00+05:00", TUE)).toBe("15.01.2027 09:00");
  });
});

describe("whenPresets", () => {
  it("offers today, tomorrow, Friday, a week and none on a Tuesday morning", () => {
    expect(whenPresets(TUE).map((p) => [p.key, p.iso])).toEqual([
      ["today", "2026-11-03T18:00:00+05:00"],
      ["tomorrow", "2026-11-04T18:00:00+05:00"],
      ["friday", "2026-11-06T18:00:00+05:00"],
      ["week", "2026-11-10T18:00:00+05:00"],
      ["none", null],
    ]);
  });

  it("drops today in the evening and offers Monday when Friday is tomorrow", () => {
    expect(whenPresets(THU_EVENING, { allowNone: false }).map((p) => p.key)).toEqual(["tomorrow", "monday", "week"]);
    expect(whenPresets(THU_EVENING).find((p) => p.key === "monday")?.iso).toBe("2026-11-09T18:00:00+05:00");
  });
});

describe("parseWhen", () => {
  it("reads a day without an hour as 18:00", () => {
    expect(parseWhen("завтра", TUE)).toBe("2026-11-04T18:00:00+05:00");
    expect(parseWhen("до пятницы", TUE)).toBe("2026-11-06T18:00:00+05:00");
    expect(parseWhen("пт", TUE)).toBe("2026-11-06T18:00:00+05:00");
  });

  it("reads a day and an hour", () => {
    expect(parseWhen("завтра 15", TUE)).toBe("2026-11-04T15:00:00+05:00");
    expect(parseWhen("завтра в 9:30", TUE)).toBe("2026-11-04T09:30:00+05:00");
    expect(parseWhen("12.11 10:00", TUE)).toBe("2026-11-12T10:00:00+05:00");
    expect(parseWhen("в пятницу утром", TUE)).toBe("2026-11-06T10:00:00+05:00");
  });

  it("puts an hour alone today while it is ahead, else tomorrow", () => {
    expect(parseWhen("15:00", TUE)).toBe("2026-11-03T15:00:00+05:00");
    expect(parseWhen("10", TUE)).toBe("2026-11-04T10:00:00+05:00");
  });

  it("takes today's weekday while its hour is ahead, else next week's", () => {
    expect(parseWhen("вт 15:00", TUE)).toBe("2026-11-03T15:00:00+05:00");
    expect(parseWhen("вт 9:00", TUE)).toBe("2026-11-10T09:00:00+05:00");
  });

  it("counts «через»", () => {
    expect(parseWhen("через 3 дня", TUE)).toBe("2026-11-06T18:00:00+05:00");
    expect(parseWhen("через неделю", TUE)).toBe("2026-11-10T18:00:00+05:00");
  });

  it("puts a past date without a year into next year", () => {
    expect(parseWhen("01.02", TUE)).toBe("2027-02-01T18:00:00+05:00");
    expect(parseWhen("31.12.2026 12:00", TUE)).toBe("2026-12-31T12:00:00+05:00");
  });

  it("says «без срока» as null and nonsense as undefined", () => {
    expect(parseWhen("без срока", TUE)).toBeNull();
    expect(parseWhen("", TUE)).toBeUndefined();
    expect(parseWhen("когда-нибудь", TUE)).toBeUndefined();
    expect(parseWhen("25:00", TUE)).toBeUndefined();
    expect(parseWhen("32.11", TUE)).toBeUndefined();
  });
});
