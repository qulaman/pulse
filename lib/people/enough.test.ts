import { describe, expect, it } from "vitest";

import { ENOUGH, enough, onTimeWords, speedWords, weeksWith } from "./enough";

const MIN = 60_000;

describe("enough", () => {
  it("one task with a deadline is no percent", () => {
    expect(enough("onTime", 1)).toBe(false);
    expect(enough("onTime", ENOUGH.onTime - 1)).toBe(false);
    expect(enough("onTime", ENOUGH.onTime)).toBe(true);
  });

  it("four hand-ins over twelve weeks are no line", () => {
    expect(enough("weeks", weeksWith([{ count: 0 }, { count: 4 }, { count: 0 }]))).toBe(false);
    expect(enough("weeks", weeksWith([{ count: 1 }, { count: 1 }, { count: 2 }]))).toBe(true);
  });

  it("one hand-in is no typical speed", () => {
    expect(enough("speed", 1)).toBe(false);
    expect(enough("speed", 5)).toBe(true);
  });
});

describe("onTimeWords", () => {
  it("says the one task in words", () => {
    expect(onTimeWords(1, 0)).toBe("1 задача со сроком — сдана в срок");
    expect(onTimeWords(0, 1)).toBe("1 задача со сроком — сдана позже срока");
  });

  it("says a few as counts, never as a share", () => {
    expect(onTimeWords(3, 0)).toBe("3 задачи со сроком — все в срок");
    expect(onTimeWords(2, 1)).toBe("в срок 2 из 3, позже срока — 1");
    expect(onTimeWords(0, 2)).toBe("2 задачи со сроком — все позже срока");
  });

  it("nothing with a deadline — nothing to say", () => {
    expect(onTimeWords(0, 0)).toBeNull();
  });
});

describe("speedWords", () => {
  it("one hand-in: its own time", () => {
    expect(speedWords([18 * MIN])).toBe("1 сдана — за 18 мин");
  });

  it("a few: the fastest and the slowest", () => {
    expect(speedWords([18 * MIN, 2 * 24 * 60 * MIN, 3 * 60 * MIN])).toBe("3 сданы — от 18 мин до 2 д");
    expect(speedWords([40 * MIN, 40 * MIN])).toBe("2 сданы — каждая за 40 мин");
  });

  it("none — nothing to say", () => {
    expect(speedWords([])).toBeNull();
  });
});
