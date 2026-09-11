import { describe, expect, it } from "vitest";

import { isWithinDeliveryWindow } from "./quietHours";

// Aqtobe = UTC+5: 23:30 local is 18:30 UTC; 10:00 local is 05:00 UTC
const NIGHT = new Date("2026-09-11T18:30:00Z");
const DAY = new Date("2026-09-11T05:00:00Z");

describe("delivery window", () => {
  it("knows day from night in Aqtobe", () => {
    expect(isWithinDeliveryWindow(DAY)).toBe(true);
    expect(isWithinDeliveryWindow(NIGHT)).toBe(false);
  });

  it("honours the company's own window", () => {
    // 22:30 Aqtobe is inside a 09:00–23:00 window and outside the default one
    const late = new Date("2026-09-11T17:30:00Z");
    expect(isWithinDeliveryWindow(late)).toBe(false);
    expect(isWithinDeliveryWindow(late, { from: "09:00", to: "23:00" })).toBe(true);
    // a broken value falls back to the default hours
    expect(isWithinDeliveryWindow(late, { from: "nine", to: "" })).toBe(false);
  });

});
