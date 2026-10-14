import { describe, expect, it } from "vitest";

import { stretchKeyframes } from "@/components/TabBar";

const scale = (frame: Keyframe) => Number(/scaleX\(([\d.]+)\)/.exec(String(frame.transform))?.[1]);

describe("stretchKeyframes (D-136): the thumb's stretch, sampled from its spring", () => {
  it("leaves and lands round, offsets in order from 0 to 1", () => {
    const frames = stretchKeyframes(1);
    expect(scale(frames[0])).toBe(1);
    expect(scale(frames[frames.length - 1])).toBe(1);
    expect(frames[0].offset).toBe(0);
    expect(frames[frames.length - 1].offset).toBe(1);
    const offsets = frames.map((frame) => frame.offset as number);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("stretches with the travel, never past ×1.34", () => {
    const peak = (columns: number) => Math.max(...stretchKeyframes(columns).map(scale));
    expect(peak(1)).toBeGreaterThan(1.25);
    expect(peak(1)).toBeLessThan(1.34);
    expect(peak(5)).toBe(1.34);
    expect(peak(2)).toBeGreaterThanOrEqual(peak(1));
  });
});
