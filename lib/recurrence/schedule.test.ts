import { describe, expect, it } from "vitest";

import { aqtobeDay } from "@/lib/ai/time";

import { describeDay, describeRule, firstOn, instantOf, nextOn, normalizeRule, ruleOfEventRepeat, runAtOf, type RepeatRule } from "./schedule";

const dayOf = (iso: string) => aqtobeDay(new Date(iso));
const at = (h: number, m = 0) => ({ hours: h, minutes: m });
const weekly = (weekdays: number[], interval = 1): RepeatRule => ({ every: "week", interval, weekdays, month_day: 0 });

// 2026-10-22 is a Thursday; 2026-10-26 a Monday
const THU = dayOf("2026-10-22T12:00:00+05:00");
const MON = dayOf("2026-10-26T12:00:00+05:00");

describe("normalizeRule", () => {
  it("gives an empty week a Monday and caps the interval", () => {
    expect(normalizeRule({ every: "week", interval: 40, weekdays: [], month_day: 7 })).toEqual({
      every: "week",
      interval: 12,
      weekdays: [1],
      month_day: 0,
    });
  });

  it("sorts and dedupes the weekdays, drops what is not a weekday", () => {
    expect(normalizeRule(weekly([4, 1, 4, 9, 0])).weekdays).toEqual([1, 4]);
  });

  it("a month without a day is the 1st; a workday has no interval", () => {
    expect(normalizeRule({ every: "month", interval: 1, weekdays: [3], month_day: 0 })).toMatchObject({ month_day: 1, weekdays: [] });
    expect(normalizeRule({ every: "workday", interval: 3, weekdays: [], month_day: 0 }).interval).toBe(1);
  });
});

describe("firstOn", () => {
  const window = at(8);

  it("«каждый понедельник», said on Thursday, starts next Monday", () => {
    expect(firstOn(weekly([1]), new Date("2026-10-22T12:00:00+05:00"), at(18), window)).toBe(MON);
  });

  it("said on Monday before the working day — today; at noon — next week", () => {
    expect(firstOn(weekly([1]), new Date("2026-10-26T07:30:00+05:00"), at(18), window)).toBe(MON);
    expect(firstOn(weekly([1]), new Date("2026-10-26T12:00:00+05:00"), at(18), window)).toBe(MON + 7);
  });

  it("a deadline before the window opens is made the evening before — so tomorrow still counts tonight", () => {
    // «каждый день к восьми», said at 21:00: tomorrow's task is made… at 08:00 today — already gone
    expect(firstOn({ every: "day", interval: 1, weekdays: [], month_day: 0 }, new Date("2026-10-22T21:00:00+05:00"), at(8), window)).toBe(THU + 2);
    expect(runAtOf(MON, at(8), window).toISOString()).toBe(new Date("2026-10-25T08:00:00+05:00").toISOString());
    expect(runAtOf(MON, at(18), window).toISOString()).toBe(new Date("2026-10-26T08:00:00+05:00").toISOString());
  });

  it("the 31st of a month is its last day", () => {
    const first = firstOn({ every: "month", interval: 1, weekdays: [], month_day: 31 }, new Date("2026-11-02T12:00:00+05:00"), at(18), window);
    expect(first).toBe(dayOf("2026-11-30T12:00:00+05:00"));
  });
});

describe("nextOn", () => {
  it("steps through the chosen weekdays", () => {
    expect(nextOn(weekly([1, 4]), MON, MON)).toBe(MON + 3);
    expect(nextOn(weekly([1, 4]), MON + 3, MON)).toBe(MON + 7);
  });

  it("«раз в две недели» skips every other week, counted from the first", () => {
    expect(nextOn(weekly([1], 2), MON, MON)).toBe(MON + 14);
    // Monday and Thursday every other week: Thursday of the same week is in step
    expect(nextOn(weekly([1, 4], 2), MON, MON)).toBe(MON + 3);
    expect(nextOn(weekly([1, 4], 2), MON + 3, MON)).toBe(MON + 14);
  });

  it("weekdays skip the weekend", () => {
    const friday = MON + 4;
    expect(nextOn({ every: "workday", interval: 1, weekdays: [], month_day: 0 }, friday, friday)).toBe(MON + 7);
  });

  it("every two months on the 5th", () => {
    const anchor = dayOf("2026-11-05T12:00:00+05:00");
    expect(nextOn({ every: "month", interval: 2, weekdays: [], month_day: 5 }, anchor, anchor)).toBe(dayOf("2027-01-05T12:00:00+05:00"));
  });
});

describe("words", () => {
  it("says the rule the way a person does", () => {
    expect(describeRule(weekly([1]))).toBe("каждый понедельник");
    expect(describeRule(weekly([3]))).toBe("каждую среду");
    expect(describeRule(weekly([2, 4]))).toBe("по вторникам и четвергам");
    expect(describeRule(weekly([1, 2, 3, 4, 5]))).toBe("по будням");
    expect(describeRule(weekly([1], 2))).toBe("раз в две недели по понедельникам");
    expect(describeRule({ every: "day", interval: 1, weekdays: [], month_day: 0 })).toBe("каждый день");
    expect(describeRule({ every: "workday", interval: 1, weekdays: [], month_day: 0 })).toBe("по будням");
    expect(describeRule({ every: "month", interval: 1, weekdays: [], month_day: 5 })).toBe("каждое 5-е число");
    expect(describeRule({ every: "month", interval: 1, weekdays: [], month_day: 31 })).toBe("в последний день месяца");
    expect(describeRule({ every: "month", interval: 3, weekdays: [], month_day: 1 })).toBe("раз в 3 месяца, 1-го числа");
  });

  it("names a day short", () => {
    expect(describeDay(MON)).toBe("пн, 26\u00a0окт.");
  });
});

describe("a meeting's step", () => {
  it("takes its weekday and date from the first meeting", () => {
    const start = instantOf(THU, at(9));
    expect(ruleOfEventRepeat("week", start)).toEqual(weekly([4]));
    expect(ruleOfEventRepeat("biweek", start)).toEqual(weekly([4], 2));
    expect(ruleOfEventRepeat("month", start)).toMatchObject({ every: "month", month_day: 22 });
    expect(ruleOfEventRepeat("none", start)).toBeNull();
  });
});
