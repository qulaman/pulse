import { describe, expect, it } from "vitest";

import type { Chase, Sample } from "./flight";
import { brushesOf, keyframesOfBrushes, swellAt, type Touch } from "./wake";

const MS = 14_000;

/** A flight that runs straight out to the right, so where it is at any moment is arithmetic. */
function straight(): Chase {
  const lead: Sample[] = [];
  for (let t = 0; t <= MS; t += 500) lead.push({ t, x: (t / MS) * 1000, y: 0, a: 0 });
  return { lead, chase: lead, ms: MS };
}

const runner: Touch[] = [{ track: "lead", trail: 0, size: 40 }];

describe("swellAt", () => {
  it("matches the knots of `dream-swell` in app/globals.css", () => {
    expect(swellAt(0)).toBeCloseTo(0.08, 5);
    expect(swellAt(0.14)).toBeCloseTo(0.62, 5);
    expect(swellAt(0.38)).toBeCloseTo(1, 5);
    expect(swellAt(1)).toBeCloseTo(1, 5);
  });

  it("only ever grows, and never leaves the scene bigger than the screen", () => {
    let last = 0;
    for (let p = 0; p <= 1; p += 0.01) {
      const scale = swellAt(p);
      expect(scale).toBeGreaterThanOrEqual(last - 1e-9);
      expect(scale).toBeLessThanOrEqual(1);
      last = scale;
    }
  });
});

describe("brushesOf", () => {
  it("finds the moment the figure goes past, and pushes the thing away from it", () => {
    // at 8400 ms the swell is long since 1, so the figure is at x = 600 exactly
    const [brush, ...rest] = brushesOf(straight(), runner, 600, 24, 20);
    expect(rest).toEqual([]);
    expect(brush!.t).toBeGreaterThan(8_000);
    expect(brush!.t).toBeLessThan(8_800);
    // it passed underneath, so the shove is straight down and away
    expect(brush!.dy).toBeGreaterThan(0.9);
    expect(brush!.force).toBeGreaterThan(0);
    expect(brush!.force).toBeLessThanOrEqual(1);
  });

  it("leaves alone what it never came near", () => {
    expect(brushesOf(straight(), runner, 600, 300, 20)).toEqual([]);
  });

  it("counts the swell: early on the scene is a speck, so a far point is not touched yet", () => {
    // 700 px out at 14% of the dream the figure is still drawn at 0.62 of that
    const early = brushesOf(straight(), [{ track: "lead", trail: 0, size: 40 }], 140, 0, 10);
    expect(early.every((b) => b.t > 1_900)).toBe(true);
  });

  it("a body that trails behind brushes later, by exactly as long as it trails", () => {
    const head = brushesOf(straight(), [{ track: "lead", trail: 0, size: 40 }], 600, 24, 20)[0]!;
    const tail = brushesOf(straight(), [{ track: "lead", trail: 2_000, size: 40 }], 600, 24, 20)[0]!;
    expect(tail.t - head.t).toBeGreaterThan(1_900);
    expect(tail.t - head.t).toBeLessThan(2_100);
  });

  it("a dragon is one shove, not nine: links moments apart are a single brush", () => {
    const body: Touch[] = [0, 34, 68, 102, 136, 170].map((trail) => ({ track: "lead", trail, size: 40 }));
    expect(brushesOf(straight(), body, 600, 24, 20)).toHaveLength(1);
  });
});

describe("keyframesOfBrushes", () => {
  it("writes one flat animation over the whole dream with a bump at every brush", () => {
    const brushes = [
      { t: 2_000, dx: 0, dy: 1, force: 1 },
      { t: 9_000, dx: 1, dy: 0, force: 0.5 },
    ];
    const css = keyframesOfBrushes("x", brushes, MS, "orb");
    const at = [...css.matchAll(/([\d.]+)% \{/g)].map((m) => Number(m[1]));
    expect(at[0]).toBe(0);
    expect(at.at(-1)).toBe(100);
    expect([...at]).toEqual([...at].sort((a, b) => a - b));
    expect(new Set(at).size).toBe(at.length);
    // the shove is a transform, and nothing here is allowed to touch colour
    expect(css).toContain("translate(");
    expect(css).not.toMatch(/color|background|filter/);
  });

  it("gives the ripple on the head its fade, and a person none", () => {
    const brushes = [{ t: 4_000, dx: 1, dy: 0, force: 1 }];
    expect(keyframesOfBrushes("x", brushes, MS, "rim")).toContain("opacity:");
    expect(keyframesOfBrushes("x", brushes, MS, "orb")).not.toContain("opacity:");
  });

  it("does not run off the end when a brush lands in the last moments", () => {
    const css = keyframesOfBrushes("x", [{ t: MS - 100, dx: 1, dy: 0, force: 1 }], MS, "orb");
    const at = [...css.matchAll(/([\d.]+)% \{/g)].map((m) => Number(m[1]));
    expect(Math.max(...at)).toBe(100);
    expect([...at]).toEqual([...at].sort((a, b) => a - b));
  });
});
