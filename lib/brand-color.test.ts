import { describe, expect, it } from "vitest";

import { APP_BG, contrastRatio, DEFAULT_ACCENT, effectiveAccent, parseHex } from "./brand-color";

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
