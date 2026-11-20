import { describe, expect, it } from "vitest";

import { handedIn } from "./photos";

// Friday, 20 November 2026, 14:00 in Aqtobe
const NOW = new Date("2026-11-20T09:00:00Z");

describe("handedIn — подпись фото", () => {
  it("сегодня — время, вчера — «вчера в», раньше — дата", () => {
    expect(handedIn({ at: "2026-11-20T09:22:00Z", done_at: null }, NOW)).toBe("сдано 14:22");
    expect(handedIn({ at: "2026-11-19T08:45:00Z", done_at: null }, NOW)).toBe("сдано вчера в 13:45");
    expect(handedIn({ at: "2026-11-17T06:00:00Z", done_at: null }, NOW)).toBe("сдано 17 ноября");
  });

  it("время сдачи отчёта важнее времени снимка", () => {
    expect(handedIn({ at: "2026-11-19T08:45:00Z", done_at: "2026-11-20T04:10:00Z" }, NOW)).toBe("сдано 09:10");
  });

  it("сутки по Актобе, а не по UTC", () => {
    // 20:30 UTC on the 19th = 01:30 on the 20th in Aqtobe: that is today
    expect(handedIn({ at: "2026-11-19T20:30:00Z" }, NOW)).toBe("сдано 01:30");
  });
});
