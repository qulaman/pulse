import { describe, expect, it } from "vitest";

import {
  accentClash,
  accentRefusal,
  APP_BG,
  contrastRatio,
  DEFAULT_ACCENT,
  effectiveAccent,
  hueDistance,
  hueOf,
  parseHex,
  SAFE_ACCENTS,
  STATE_COLORS,
} from "./brand-color";

describe("brand colour", () => {
  it("parses hex with and without the hash", () => {
    expect(parseHex("#2ED3B7")).toEqual([46, 211, 183]);
    expect(parseHex("2ed3b7")).toEqual([46, 211, 183]);
    expect(parseHex("#abc")).toBeNull();
    expect(parseHex("teal")).toBeNull();
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio(DEFAULT_ACCENT, APP_BG)!).toBeGreaterThan(4.5);
    expect(contrastRatio("#nope", APP_BG)).toBeNull();
  });

  it.each([
    [null, DEFAULT_ACCENT, false],
    ["", DEFAULT_ACCENT, false],
    ["#1A1F26", DEFAULT_ACCENT, false], // too close to the background
    ["#F0B24A", "#F0B24A", true],
    ["f0b24a", "#F0B24A", true],
    ["#3B82F6", "#3B82F6", true],
  ])("effectiveAccent(%s)", (candidate, accent, custom) => {
    expect(effectiveAccent(candidate)).toEqual({ accent, custom });
  });
});

describe("a brand colour never says a state", () => {
  it("reads hues and the way round the wheel", () => {
    expect(hueOf("#FF0000")).toBeCloseTo(0, 5);
    expect(hueOf("#00FF00")).toBeCloseTo(120, 5);
    expect(hueOf("#0000FF")).toBeCloseTo(240, 5);
    expect(hueOf("#808080")).toBeNull(); // a grey has no hue
    expect(hueOf("nope")).toBeNull();
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
  });

  it("the pilot's green is taken for «готово, в работе»", () => {
    expect(accentClash("#23B33B")).toMatchObject({ state: "ok" });
  });

  it.each([
    ["#34C759", "ok"],
    ["#22C55E", "ok"],
    ["#FFB020", "warn"],
    ["#F0B24A", "warn"],
    ["#FF5A52", "danger"],
    ["#E11D48", "danger"], // a rose-red still reads as «просрочено»
  ])("%s is near %s", (hex, state) => {
    expect(accentClash(hex)?.state).toBe(state);
  });

  it("the state colours themselves and the safe ones", () => {
    for (const color of STATE_COLORS) expect(accentClash(color.hex)?.state).toBe(color.state);
    for (const safe of SAFE_ACCENTS) {
      expect(accentClash(safe.hex)).toBeNull();
      expect(effectiveAccent(safe.hex).custom || safe.hex === DEFAULT_ACCENT).toBe(true);
    }
    expect(accentClash(DEFAULT_ACCENT)).toBeNull();
    expect(accentClash("#3B82F6")).toBeNull();
    expect(accentClash("#B0B0B0")).toBeNull();
    expect(accentClash(null)).toBeNull();
  });

  it("refuses a new colour near a state, keeps the one already saved", () => {
    expect(accentRefusal("#23B33B", null)).toMatch(/зелёному/);
    expect(accentRefusal("#23B33B", "#23b33b")).toBeNull(); // re-saving the pilot's own colour is no change
    expect(accentRefusal("#22C55E", "#23B33B")).toMatch(/зелёному/); // the next change obeys the rule
    expect(accentRefusal("#4DA3FF", "#23B33B")).toBeNull();
    expect(accentRefusal(null, "#23B33B")).toBeNull(); // back to Pulse's own accent is always fine
  });
});
