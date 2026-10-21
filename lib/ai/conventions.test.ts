import { afterEach, describe, expect, it, vi } from "vitest";

import { CONVENTION_KEYS, DEFAULT_CONVENTIONS, normalizeConventions, renderConventionPhrases } from "./conventions";
import { PARSER_SYSTEM_PROMPT, parserSystemPrompt } from "./prompt";

describe("conventions in the parser prompt", () => {
  it("renders every part with its phrases and no times — code applies those", () => {
    const list = renderConventionPhrases(DEFAULT_CONVENTIONS);
    expect(list).toContain("- before_lunch (до обеда): до обеда");
    expect(list).toContain("- this_week (в течение недели): на неделе");
    expect(list).not.toContain("13:00");
    expect(list).not.toContain("day_default");
  });

  it("a company phrase lands in the prompt; the default prompt has no placeholder left", () => {
    const own = DEFAULT_CONVENTIONS.map((row) => (row.key === "evening" ? { ...row, phrase: "к пересменке" } : row));
    expect(parserSystemPrompt(own)).toContain("- evening (вечер): к пересменке");
    expect(PARSER_SYSTEM_PROMPT).not.toContain("{TIME_PARTS}");
    expect(PARSER_SYSTEM_PROMPT).toContain("- before_lunch (до обеда): до обеда");
  });

  it("an emptied phrase still names the part", () => {
    const own = DEFAULT_CONVENTIONS.map((row) => (row.key === "lunch" ? { ...row, phrase: " " } : row));
    expect(renderConventionPhrases(own)).toContain("- lunch (обед): —");
  });
});

describe("normalizeConventions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("nothing stored — the defaults, one row per key in key order", () => {
    expect(normalizeConventions(undefined)).toEqual(DEFAULT_CONVENTIONS);
    expect(normalizeConventions([]).map((row) => row.key)).toEqual([...CONVENTION_KEYS]);
  });

  it("keeps a company's key row and fills the missing keys", () => {
    const rows = normalizeConventions([{ key: "before_lunch", phrase: "до обеда / до перерыва", time: "12:00", day: "same", confidence: 0.8 }]);
    expect(rows).toHaveLength(CONVENTION_KEYS.length);
    expect(rows.find((row) => row.key === "before_lunch")).toMatchObject({ phrase: "до обеда / до перерыва", time: "12:00", confidence: 0.8 });
    expect(rows.find((row) => row.key === "evening")?.time).toBe("18:00");
  });

  it("converts an old phrase/meaning row by its phrase and keeps its time and confidence", () => {
    const rows = normalizeConventions([
      { phrase: "до обеда", meaning: "12:30 названного дня", confidence: 0.8 },
      { phrase: "к <дню недели> («к пятнице»)", meaning: "этот день 10:00", confidence: 0.6 },
    ]);
    expect(rows.find((row) => row.key === "before_lunch")).toMatchObject({ time: "12:30", confidence: 0.8 });
    expect(rows.find((row) => row.key === "weekday_default")).toMatchObject({ time: "10:00", confidence: 0.6 });
  });

  it("drops a row it cannot recognise, logs it, and does not fail", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = normalizeConventions([{ phrase: "к пересменке", meaning: "20:00" }, 7, null]);
    expect(rows).toEqual(DEFAULT_CONVENTIONS);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("a key twice — the first row wins", () => {
    const rows = normalizeConventions([
      { key: "evening", phrase: "вечером", time: "19:00", day: "same", confidence: 0.7 },
      { key: "evening", phrase: "к вечеру", time: "17:00", day: "same", confidence: 0.7 },
    ]);
    expect(rows.find((row) => row.key === "evening")?.time).toBe("19:00");
  });
});
