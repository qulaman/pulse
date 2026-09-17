import { describe, expect, it } from "vitest";

import { msUntilNightReload, tvTime } from "./clock";

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
