import { describe, expect, it } from "vitest";

import { aqtobeClock, handAngles, msUntilNightReload, tvTime } from "./clock";

describe("msUntilNightReload", () => {
  it("в 03:00 по Актобе ждёт час", () => {
    // 22:00 UTC = 03:00 Asia/Aqtobe следующего дня
    expect(msUntilNightReload(new Date("2026-09-16T22:00:00Z"))).toBe(3_600_000);
  });

  it("в 05:00 по Актобе ждёт до завтрашних 04:00", () => {
    expect(msUntilNightReload(new Date("2026-09-17T00:00:00Z"))).toBe(23 * 3_600_000);
  });
});

describe("tvTime", () => {
  it("показывает стенные часы Актобе, а не UTC", () => {
    expect(tvTime(new Date("2026-09-17T09:32:00Z"))).toBe("14:32");
  });
});

describe("handAngles", () => {
  it("15:00 по Актобе: часовая на трёх, минутная на двенадцати", () => {
    // 10:00 UTC = 15:00 Asia/Aqtobe
    const a = handAngles(new Date("2026-09-17T10:00:00Z"));
    expect(a.hour).toBe(90);
    expect(a.minute).toBe(0);
    expect(a.second).toBe(0);
  });

  it("часовая идёт вместе с минутами, минутная — с секундами", () => {
    // 07:30:30 UTC = 12:30:30 Актобе
    const a = handAngles(new Date("2026-09-17T07:30:30Z"));
    expect(a.hour).toBeCloseTo(15.25, 5);
    expect(a.minute).toBeCloseTo(183, 5);
    expect(a.second).toBe(180);
  });

  it("часы Актобе, а не UTC", () => {
    expect(aqtobeClock(new Date("2026-09-17T20:15:07Z"))).toMatchObject({ h: 1, m: 15, s: 7 });
  });
});
