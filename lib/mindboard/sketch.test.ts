import { describe, expect, it } from "vitest";

import {
  defaultTurn,
  hasContent,
  isDrawn,
  MAX_STROKES,
  nextTurn,
  pointCount,
  pointLabel,
  sheetOf,
  shownSize,
  simplify,
  sketchFrom,
  strokePath,
  turnOf,
  turnTransform,
  withFrame,
  withStroke,
  type Sketch,
} from "./sketch";

describe("sketchFrom", () => {
  it("takes a drawing as it was written", () => {
    expect(sketchFrom({ v: 1, strokes: [{ c: "accent", w: 2, p: [10, 20, 30, 40] }] })).toEqual({ v: 1, strokes: [{ c: "accent", w: 2, p: [10, 20, 30, 40] }] });
  });

  it("never trusts what it cannot draw", () => {
    expect(sketchFrom(null)).toBeNull();
    expect(sketchFrom([1, 2])).toBeNull();
    expect(sketchFrom({ strokes: "x" })).toBeNull();
    expect(sketchFrom({ strokes: [] })).toBeNull();
    expect(sketchFrom({ strokes: [{ p: [5] }, null, { p: ["a", "b"] }] })).toBeNull();
  });

  it("keeps points on the grid, an unknown ink white and a weight thin", () => {
    const sketch = sketchFrom({ strokes: [{ c: "pink", w: 7, p: [-5, 2000, 1700.6, 450.4, 3] }] });
    expect(sketch?.strokes[0]).toEqual({ c: "text", w: 1, p: [0, 900, 1600, 450] });
  });

  it("stops at the stroke limit", () => {
    const strokes = Array.from({ length: MAX_STROKES + 20 }, () => ({ c: "text", w: 1, p: [1, 1, 2, 2] }));
    expect(sketchFrom({ strokes })?.strokes).toHaveLength(MAX_STROKES);
  });
});

describe("withStroke", () => {
  it("adds a line, and refuses one past the limits", () => {
    const one = withStroke(null, { c: "text", w: 1, p: [0, 0, 10, 10] });
    expect(one?.strokes).toHaveLength(1);
    expect(pointCount(one)).toBe(2);
    const full: Sketch = { v: 1, strokes: Array.from({ length: MAX_STROKES }, () => ({ c: "text" as const, w: 1 as const, p: [0, 0] })) };
    expect(withStroke(full, { c: "text", w: 1, p: [0, 0] })).toBeNull();
  });
});

describe("simplify", () => {
  it("drops points that do not change the shape and keeps both ends", () => {
    expect(simplify([0, 0, 10, 0.4, 20, 0, 30, 0.3, 40, 0])).toEqual([0, 0, 40, 0]);
  });

  it("keeps a corner", () => {
    expect(simplify([0, 0, 50, 0, 100, 0, 100, 50, 100, 100])).toEqual([0, 0, 100, 0, 100, 100]);
  });

  it("leaves a dot or a short line as it is", () => {
    expect(simplify([5.4, 6.6])).toEqual([5, 7]);
    expect(simplify([0, 0, 3, 4])).toEqual([0, 0, 3, 4]);
  });
});

describe("strokePath", () => {
  it("draws a dot, a segment and a smooth line", () => {
    expect(strokePath({ p: [5, 5] })).toBe("M5 5l0.01 0");
    expect(strokePath({ p: [0, 0, 10, 10] })).toBe("M0 0L10 10");
    expect(strokePath({ p: [0, 0, 10, 0, 10, 10] })).toBe("M0 0Q10 0 10 5L10 10");
  });

  it("keeps the corners the hand meant: a rectangle stays a rectangle", () => {
    expect(strokePath({ p: [100, 100, 900, 100, 900, 600, 100, 600, 100, 100] })).toBe("M100 100L900 100L900 600L100 600L100 100");
    // a wobble inside a long line is smoothed, the far corner is not
    expect(strokePath({ p: [0, 0, 20, 4, 40, 0, 400, 0] })).toBe("M0 0Q20 4 30 2L40 0L400 0");
  });
});

describe("pointLabel, hasContent", () => {
  it("names a drawing without words", () => {
    expect(pointLabel("  Схема склада ", { v: 1 })).toBe("Схема склада");
    expect(pointLabel("", { v: 1, strokes: [{ c: "text", w: 1, p: [0, 0] }] })).toBe("Рисунок");
    expect(pointLabel(" ", null)).toBe("");
    expect(hasContent({ text: "", sketch: { v: 1, strokes: [{ c: "text", w: 1, p: [0, 0] }] } })).toBe(true);
    expect(hasContent({ text: " ", sketch: null })).toBe(false);
  });
});

describe("isDrawn", () => {
  it("wants lines, as the base does", () => {
    expect(isDrawn({ v: 1, strokes: [{ c: "text", w: 1, p: [0, 0] }] })).toBe(true);
    expect(isDrawn({ v: 1, strokes: [] })).toBe(false);
    expect(isDrawn({ v: 1 })).toBe(false);
    expect(isDrawn(null)).toBe(false);
    expect(hasContent({ text: "", sketch: { v: 1, strokes: [] } })).toBe(false);
  });
});

describe("sheets and turns (D-141 amendment)", () => {
  const upright = { v: 1 as const, o: "portrait" as const, strokes: [{ c: "text" as const, w: 1 as const, p: [0, 0, 900, 1600] }] };

  it("keeps a vertical sheet on its own grid and the turn the wall shows it with", () => {
    expect(sketchFrom({ ...upright, r: 90, strokes: [{ c: "text", w: 1, p: [950, 1700] }] })).toEqual({ v: 1, o: "portrait", r: 90, strokes: [{ c: "text", w: 1, p: [900, 1600] }] });
    expect(sketchFrom({ v: 1, r: 45, strokes: [{ c: "text", w: 1, p: [1, 1] }] })).toEqual({ v: 1, strokes: [{ c: "text", w: 1, p: [1, 1] }] });
    expect(sheetOf(null)).toBe("landscape");
    expect(turnOf({ r: 270 })).toBe(270);
  });

  it("lays a vertical sheet along the wall by default, and turns a quarter at a time", () => {
    expect(defaultTurn("portrait")).toBe(90);
    expect(defaultTurn("landscape")).toBe(0);
    expect(nextTurn(0)).toBe(90);
    expect(nextTurn(270)).toBe(0);
  });

  it("shows the box of the turned sheet", () => {
    expect(shownSize(upright)).toEqual({ w: 900, h: 1600 });
    expect(shownSize({ ...upright, r: 90 })).toEqual({ w: 1600, h: 900 });
    expect(shownSize({ r: 180 })).toEqual({ w: 1600, h: 900 });
    expect(shownSize({ r: 270 })).toEqual({ w: 900, h: 1600 });
  });

  it("turns with a transform that keeps the drawing inside its box", () => {
    expect(turnTransform(upright)).toBe("");
    expect(turnTransform({ ...upright, r: 90 })).toBe("translate(1600 0) rotate(90)");
    expect(turnTransform({ r: 180 })).toBe("translate(1600 900) rotate(180)");
    expect(turnTransform({ r: 270 })).toBe("translate(0 1600) rotate(270)");
  });

  it("writes only what differs from the old defaults", () => {
    expect(withFrame({ v: 1, strokes: [] }, "landscape", 0)).toEqual({ v: 1, strokes: [] });
    expect(withFrame({ v: 1, o: "portrait", r: 90, strokes: [] }, "landscape", 180)).toEqual({ v: 1, r: 180, strokes: [] });
  });
});
