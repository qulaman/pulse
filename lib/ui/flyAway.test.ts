import { describe, expect, it } from "vitest";

import { arcFrames } from "./flyAway";

/** translate x, y, rotate, scale of a frame's transform. */
function parts(frame: Keyframe): { x: number; y: number; turn: number; scale: number } {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) rotate\((-?[\d.]+)deg\) scale\((-?[\d.]+)\)/.exec(String(frame.transform));
  if (!match) throw new Error(`unexpected transform ${String(frame.transform)}`);
  return { x: Number(match[1]), y: Number(match[2]), turn: Number(match[3]), scale: Number(match[4]) };
}

// a card of the list and the face above it (393 px wide phone)
const CARD = { left: 16, top: 420, width: 361, height: 200 };
const FACE = { left: 130, top: 150, width: 132, height: 132 };

describe("arcFrames", () => {
  it("starts on the card, whole and still", () => {
    const first = arcFrames(CARD, FACE)[0];
    expect(first.offset).toBe(0);
    expect(first.opacity).toBe(1);
    expect(parts(first)).toEqual({ x: 0, y: 0, turn: 0, scale: 1 });
  });

  it("ends in the target's centre, the size of a token, gone", () => {
    const frames = arcFrames(CARD, FACE);
    const last = frames[frames.length - 1];
    const end = parts(last);
    expect(last.offset).toBe(1);
    expect(last.opacity).toBe(0);
    expect(end.x).toBeCloseTo(196 - 196.5, 0);
    expect(end.y).toBeCloseTo(216 - 520, 0);
    expect(end.turn).toBeCloseTo(0, 1);
    expect(end.scale).toBeCloseTo((132 * 0.24) / 361, 3);
  });

  it("is sampled evenly in time and only ever moves towards the target", () => {
    const frames = arcFrames(CARD, FACE, 24);
    expect(frames).toHaveLength(25);
    frames.forEach((frame, k) => expect(frame.offset).toBeCloseTo(k / 24, 4));
    const ys = frames.map((frame) => parts(frame).y);
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeLessThanOrEqual(ys[k - 1] + 0.05);
    const opacities = frames.map((frame) => Number(frame.opacity));
    for (let k = 1; k < opacities.length; k++) expect(opacities[k]).toBeLessThanOrEqual(opacities[k - 1]);
  });

  it("bulges outwards: a card left of the target swings left, one right of it right", () => {
    const leftCard = { left: 0, top: 500, width: 160, height: 120 };
    const rightCard = { left: 233, top: 500, width: 160, height: 120 };
    // how far off the straight way the copy is, sideways, half-way through the flight
    const off = (from: typeof CARD) => {
      const frames = arcFrames(from, FACE);
      const dx = FACE.left + FACE.width / 2 - (from.left + from.width / 2);
      const dy = FACE.top + FACE.height / 2 - (from.top + from.height / 2);
      const { x, y } = parts(frames[Math.round(frames.length / 2)]);
      return x - (dx * y) / dy;
    };
    expect(off(leftCard)).toBeLessThan(-10);
    expect(off(rightCard)).toBeGreaterThan(10);
  });

  it("never grows a small card past its size at the end", () => {
    const chip = { left: 180, top: 600, width: 24, height: 24 };
    const frames = arcFrames(chip, FACE);
    expect(parts(frames[frames.length - 1]).scale).toBe(1);
  });
});
