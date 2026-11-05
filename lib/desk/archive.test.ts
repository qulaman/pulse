import { describe, expect, it } from "vitest";

import {
  appendPage,
  daysWords,
  foldFirstPage,
  ilikeAny,
  inRange,
  parseRange,
  phrasePattern,
  rangeBounds,
  rangePresets,
  rangeWords,
  rowsLeft,
  searchWords,
  wordPattern,
} from "./archive";

// a Wednesday, 14:00 in Aqtobe
const NOW = new Date("2026-11-04T09:00:00.000Z");
const BS = String.fromCharCode(92);

describe("parseRange", () => {
  it("reads both ends, one end, or none", () => {
    expect(parseRange("2026-10-01", "2026-10-31")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(parseRange("2026-10-01", null)).toEqual({ from: "2026-10-01", to: null });
    expect(parseRange(null, "2026-10-31")).toEqual({ from: null, to: "2026-10-31" });
    expect(parseRange(null, null)).toBeNull();
  });

  it("drops a broken end and turns a backward range round", () => {
    expect(parseRange("2026-02-31", "вчера")).toBeNull();
    expect(parseRange("2026-02-31", "2026-03-01")).toEqual({ from: null, to: "2026-03-01" });
    expect(parseRange("2026-10-31", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("rangeBounds and inRange", () => {
  it("asks whole Aqtobe days, the end day included", () => {
    expect(rangeBounds({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ gte: "2026-10-01T00:00:00+05:00", lt: "2026-11-01T00:00:00+05:00" });
    expect(rangeBounds({ from: null, to: "2026-12-31" }).lt).toBe("2027-01-01T00:00:00+05:00");
    expect(rangeBounds(null)).toEqual({ gte: null, lt: null });
  });

  it("puts an instant into the day it was in Aqtobe, not in UTC", () => {
    const range = { from: "2026-11-01", to: "2026-11-01" };
    // 21:00 UTC on Oct 31 is 02:00 on Nov 1 in Aqtobe
    expect(inRange("2026-10-31T21:00:00Z", range)).toBe(true);
    expect(inRange("2026-10-31T18:59:59Z", range)).toBe(false);
    expect(inRange("2026-11-01T18:59:59Z", range)).toBe(true);
    expect(inRange("2026-11-01T19:00:00Z", range)).toBe(false);
    expect(inRange("2026-11-01T19:00:00Z", null)).toBe(true);
  });
});

describe("rangePresets", () => {
  it("runs the week from Monday and the month whole", () => {
    expect(rangePresets(NOW).map((one) => [one.key, one.from, one.to])).toEqual([
      ["this-week", "2026-11-02", "2026-11-08"],
      ["last-week", "2026-10-26", "2026-11-01"],
      ["this-month", "2026-11-01", "2026-11-30"],
      ["last-month", "2026-10-01", "2026-10-31"],
    ]);
  });

  it("crosses the year in January, and a Sunday is the week's last day", () => {
    const january = rangePresets(new Date("2027-01-10T09:00:00Z"));
    expect(january[1]).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
    expect(january[3]).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(january[0]).toMatchObject({ from: "2027-01-04", to: "2027-01-10" });
  });

  it("knows the length of a February", () => {
    expect(rangePresets(new Date("2028-03-10T09:00:00Z"))[3]).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("rangeWords", () => {
  it("names a quick choice by its name", () => {
    expect(rangeWords(null, NOW)).toBe("Все даты");
    expect(rangeWords({ from: "2026-10-01", to: "2026-10-31" }, NOW)).toBe("Прошлый месяц");
    expect(rangeWords({ from: "2026-11-02", to: "2026-11-08" }, NOW)).toBe("Эта неделя");
  });

  it("says a custom range the way a person does", () => {
    expect(rangeWords({ from: "2026-10-07", to: "2026-10-07" }, NOW)).toBe("7 октября");
    expect(rangeWords({ from: "2026-10-01", to: "2026-10-15" }, NOW)).toBe("1–15 октября");
    expect(rangeWords({ from: "2026-10-28", to: "2026-11-03" }, NOW)).toBe("28 октября – 3 ноября");
    expect(rangeWords({ from: "2026-10-01", to: null }, NOW)).toBe("с 1 октября");
    expect(rangeWords({ from: null, to: "2026-10-15" }, NOW)).toBe("по 15 октября");
  });

  it("says the days of a quick choice too, when asked for them", () => {
    expect(daysWords({ from: "2026-10-01", to: "2026-10-31" }, NOW)).toBe("1–31 октября");
  });

  it("names the year only when it is not this one", () => {
    expect(rangeWords({ from: "2025-12-20", to: "2025-12-25" }, NOW)).toBe("20–25 декабря 2025");
    expect(rangeWords({ from: "2025-12-20", to: "2026-01-05" }, NOW)).toBe("20 декабря 2025 – 5 января");
  });
});

describe("searchWords", () => {
  it("splits the text and waits for two letters", () => {
    expect(searchWords("  Смета   ПО объекту ")).toEqual(["смета", "по", "объекту"]);
    expect(searchWords("с")).toEqual([]);
    expect(searchWords("   ")).toEqual([]);
  });
});

describe("wordPattern", () => {
  it("finds the word anywhere and in its other cases", () => {
    expect(wordPattern("акт")).toBe("%акт%");
    expect(wordPattern("смету")).toBe("%см_т%");
  });

  it("keeps a number and a Latin word whole", () => {
    expect(wordPattern("12345")).toBe("%12345%");
    expect(wordPattern("acts_2026")).toBe(`%acts${BS}_2026%`);
  });

  it("does not care about ё in a long word, and leaves a short one exact", () => {
    expect(wordPattern("отчет")).toBe("%отч_%");
    expect(wordPattern("отчёт")).toBe("%отч_%");
    expect(wordPattern("счёт")).toBe("%сч_т%");
    expect(wordPattern("мёд")).toBe("%мёд%");
  });

  it("takes % and _ and the backslash literally", () => {
    expect(wordPattern("%")).toBe(`%${BS}%%`);
    expect(wordPattern("_")).toBe(`%${BS}_%`);
    expect(wordPattern(BS)).toBe(`%${BS}${BS}%`);
    expect(wordPattern("10%")).toBe(`%10${BS}%%`);
  });

  it("gives PostgREST's asterisk no way to match everything", () => {
    expect(wordPattern("*")).toBe("%_%");
    expect(wordPattern("a*b")).toBe("%a_b%");
  });
});

describe("phrasePattern", () => {
  it("keeps the phrase whole", () => {
    expect(phrasePattern(" Без сахара ")).toBe("%б_з сахара%");
    expect(phrasePattern("чай")).toBe("%чай%");
    expect(phrasePattern("50%")).toBe(`%50${BS}%%`);
  });
});

describe("ilikeAny", () => {
  it("quotes the value, so a person's punctuation is not PostgREST's syntax", () => {
    expect(ilikeAny(["label", "note"], "%а,б(в).г%")).toBe('label.ilike."%а,б(в).г%",note.ilike."%а,б(в).г%"');
  });

  it("escapes what a quoted value would end on", () => {
    expect(ilikeAny(["label"], '%"%')).toBe(`label.ilike."%${BS}"%"`);
    expect(ilikeAny(["label"], `%${BS}%%`)).toBe(`label.ilike."%${BS}${BS}%%"`);
  });
});

describe("foldFirstPage", () => {
  const row = (id: string, at: string) => ({ id, at });
  const order = (one: { at: string }) => one.at;

  it("is the page alone when nothing is held or the page is short", () => {
    expect(foldFirstPage([row("a", "5")], [], 1, order).map((one) => one.id)).toEqual(["a"]);
    expect(foldFirstPage([row("a", "5")], [row("b", "1")], 2, order).map((one) => one.id)).toEqual(["a"]);
  });

  it("keeps the opened pages under a fresh first page", () => {
    const held = [row("b", "4"), row("c", "3"), row("d", "2"), row("e", "1")];
    const first = [row("n", "5"), row("b", "4")];
    expect(foldFirstPage(first, held, 2, order).map((one) => one.id)).toEqual(["n", "b", "c", "d", "e"]);
  });

  it("drops a held row the page's own stretch no longer has", () => {
    const held = [row("gone", "5"), row("b", "4"), row("c", "3"), row("d", "1")];
    const first = [row("b", "4"), row("c", "3")];
    expect(foldFirstPage(first, held, 2, order).map((one) => one.id)).toEqual(["b", "c", "d"]);
  });
});

describe("appendPage and rowsLeft", () => {
  it("adds only what is new", () => {
    expect(appendPage([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((one) => one.id)).toEqual(["a", "b", "c"]);
  });

  it("promises what is left, never less than nothing", () => {
    expect(rowsLeft(120, 100)).toBe(20);
    expect(rowsLeft(100, 120)).toBe(0);
    expect(rowsLeft(undefined, 10)).toBe(0);
  });
});
