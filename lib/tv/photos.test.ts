import { describe, expect, it } from "vitest";

import { handedIn } from "./photos";
import { stageWord } from "./words";

// Friday, 20 November 2026, 14:00 in Aqtobe
const NOW = new Date("2026-11-20T09:00:00Z");

describe("handedIn — подпись фото", () => {
  it("сегодня — время, вчера — «вчера в», раньше — дата", () => {
    expect(handedIn({ at: "2026-11-20T09:22:00Z", done_at: null }, NOW)).toBe("готово в 14:22");
    expect(handedIn({ at: "2026-11-19T08:45:00Z", done_at: null }, NOW)).toBe("готово вчера в 13:45");
    expect(handedIn({ at: "2026-11-17T06:00:00Z", done_at: null }, NOW)).toBe("готово 17 ноября");
  });

  it("время сдачи отчёта важнее времени снимка", () => {
    expect(handedIn({ at: "2026-11-19T08:45:00Z", done_at: "2026-11-20T04:10:00Z" }, NOW)).toBe("готово в 09:10");
  });

  it("сутки по Актобе, а не по UTC", () => {
    // 20:30 UTC on the 19th = 01:30 on the 20th in Aqtobe: that is today
    expect(handedIn({ at: "2026-11-19T20:30:00Z" }, NOW)).toBe("готово в 01:30");
  });

  it("слово стадии — то же, что на доске и у человека (lib/tv/words.ts); без «сдано»", () => {
    for (const at of ["2026-11-20T09:22:00Z", "2026-11-19T08:45:00Z", "2026-11-17T06:00:00Z"]) {
      const caption = handedIn({ at, done_at: null }, NOW);
      expect(caption.startsWith(`${stageWord("done")} `)).toBe(true);
      expect(caption).not.toMatch(/сдан|принят/);
    }
  });
});
