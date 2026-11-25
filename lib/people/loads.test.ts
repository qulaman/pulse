import { describe, expect, it } from "vitest";

import { loadColor, type Load } from "./loads";

const NOW = Date.parse("2026-11-24T05:00:00Z");
const load = (patch: Partial<Load> = {}): Load => ({ active: 1, overdue: 0, review: 0, nearest: null, waiting: 0, ...patch });

describe("loadColor", () => {
  it("work somebody took is green; given and not accepted is not (never green for undone)", () => {
    expect(loadColor(load(), true, NOW)).toBe("green");
    expect(loadColor(load({ waiting: 1 }), true, NOW)).toBe("gray");
    expect(loadColor(load({ active: 2, waiting: 1 }), true, NOW)).toBe("green");
  });

  it("late and close deadlines speak whatever was accepted; away or empty is grey", () => {
    expect(loadColor(load({ waiting: 1, overdue: 1 }), true, NOW)).toBe("red");
    expect(loadColor(load({ waiting: 1, nearest: "2026-11-24T10:00:00Z" }), true, NOW)).toBe("yellow");
    expect(loadColor(load(), false, NOW)).toBe("gray");
    expect(loadColor(undefined, true, NOW)).toBe("gray");
    expect(loadColor(load({ active: 0 }), true, NOW)).toBe("gray");
  });
});
