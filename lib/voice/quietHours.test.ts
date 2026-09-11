import { describe, expect, it } from "vitest";

import { holdsForQuietHours, isWithinDeliveryWindow } from "./quietHours";

// Aqtobe = UTC+5: 23:30 local is 18:30 UTC; 10:00 local is 05:00 UTC
const NIGHT = new Date("2026-09-11T18:30:00Z");
const DAY = new Date("2026-09-11T05:00:00Z");

describe("delivery window", () => {
  it("knows day from night in Aqtobe", () => {
    expect(isWithinDeliveryWindow(DAY)).toBe(true);
    expect(isWithinDeliveryWindow(NIGHT)).toBe(false);
  });

  it("holds an answer or a rework at night, never a task already timed upstream", () => {
    expect(holdsForQuietHours("reply", NIGHT)).toBe(true);
    expect(holdsForQuietHours("rework", NIGHT)).toBe(true);
    expect(holdsForQuietHours("question", NIGHT)).toBe(true);
    expect(holdsForQuietHours("task_sent", NIGHT)).toBe(false);
    expect(holdsForQuietHours("announcement", NIGHT)).toBe(false);
  });

  it("holds nothing by day", () => {
    expect(holdsForQuietHours("reply", DAY)).toBe(false);
    expect(holdsForQuietHours("task_sent", DAY)).toBe(false);
  });
});
