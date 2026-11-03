import { describe, expect, it } from "vitest";

import { formatNum, pointsTone } from "./format";

describe("formatNum (D-154)", () => {
  it("puts a no-break space between thousands", () => {
    expect(formatNum(1000880)).toBe("1 000 880");
    expect(formatNum(999)).toBe("999");
    expect(formatNum(0)).toBe("0");
  });

  it("writes a real minus and a plus only when asked", () => {
    expect(formatNum(-30)).toBe("−30");
    expect(formatNum(12, { signed: true })).toBe("+12");
    expect(formatNum(0, { signed: true })).toBe("0");
    expect(formatNum(-1200, { signed: true })).toBe("−1 200");
  });
});

describe("pointsTone", () => {
  it("keeps gold for a gain only", () => {
    expect(pointsTone(5)).toBe("gold");
    expect(pointsTone(-10)).toBe("muted");
    expect(pointsTone(0)).toBe("muted");
  });
});
