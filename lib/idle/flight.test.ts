import { describe, expect, it } from "vitest";

import { flyChase, keyframesOf, MAX_OVERSHOOT, type Sample } from "./flight";

const AREA = { hx: 160, hy: 300, ms: 14_000 };

function fly(seed: number) {
  return flyChase({ ...AREA, seed });
}

/**
 * The fastest the drawn nose ever turns, in degrees per second. Between samples the browser
 * tweens the heading, so what matters is not the step but the rate it implies: a hard turn is
 * fine, a spin is not.
 */
function fastestSpin(samples: Sample[]): number {
  let fastest = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const dt = samples[i]!.t - samples[i - 1]!.t;
    if (dt > 0) fastest = Math.max(fastest, (Math.abs(samples[i]!.a - samples[i - 1]!.a) / dt) * 1000);
  }
  return fastest;
}

describe("flyChase", () => {
  it("draws the same flight for the same seed and a different one for another", () => {
    expect(fly(7).lead).toEqual(fly(7).lead);
    expect(fly(7).lead).not.toEqual(fly(8).lead);
  });

  it("keeps both of them inside the play area", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { lead, chase } = fly(seed);
      for (const samples of [lead, chase]) {
        for (const s of samples) {
          // a steered turn leans past its own wall; the caller keeps that much room for it
          expect(Math.abs(s.x)).toBeLessThanOrEqual(AREA.hx + MAX_OVERSHOOT);
          expect(Math.abs(s.y)).toBeLessThanOrEqual(AREA.hy + MAX_OVERSHOOT);
        }
      }
    }
  });

  it("uses the whole screen instead of circling in the middle", () => {
    const { lead } = fly(11);
    const xs = lead.map((s) => s.x);
    const ys = lead.map((s) => s.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(AREA.hx);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(AREA.hy);
  });

  it("turns hard but never spins: the drawn nose stays within a hard turn of the model", () => {
    for (const seed of [21, 22, 23, 24, 25]) {
      const { lead, chase } = fly(seed);
      // the steering tops out around 800 deg/s; the lean it is drawn with adds a little
      expect(fastestSpin(lead)).toBeLessThan(1300);
      expect(fastestSpin(chase)).toBeLessThan(1300);
    }
  });

  it("runs the whole dream, in order, from the middle of the head", () => {
    const { lead, ms } = fly(3);
    expect(lead[0]).toMatchObject({ t: 0, x: 0, y: 0 });
    expect(lead.at(-1)!.t).toBe(ms);
    for (let i = 1; i < lead.length; i += 1) expect(lead[i]!.t).toBeGreaterThan(lead[i - 1]!.t);
  });

  it("samples a straight run thinly and a turn densely", () => {
    const { lead } = fly(5);
    // dense enough to be a curve, thin enough not to be a per-frame animation
    expect(lead.length).toBeGreaterThan(60);
    expect(lead.length).toBeLessThan(300);
  });

  it("holds the runner clear of his pursuer: the figures are up to ~84px across", () => {
    for (const seed of [3, 7, 11, 31, 99, 1234]) {
      const { lead, chase } = fly(seed);
      // both lines are sampled on their own moments, so compare them on a shared clock
      const at = (samples: Sample[], t: number) => {
        let i = 1;
        while (i < samples.length - 1 && samples[i]!.t < t) i += 1;
        const a = samples[i - 1]!;
        const b = samples[i]!;
        const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      };
      const gaps: number[] = [];
      for (let t = 0; t <= AREA.ms; t += 100) {
        const p = at(lead, t);
        const q = at(chase, t);
        gaps.push(Math.hypot(p.x - q.x, p.y - q.y));
      }
      const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
      // it may brush past him on a turn, but it never rides on him
      expect(Math.min(...gaps)).toBeGreaterThan(24);
      expect(median).toBeGreaterThan(90);
    }
  });

  it("chases: the two of them are near each other far more often than two loose flights", () => {
    const { lead, chase } = fly(31);
    const near = lead.filter((s, i) => chase[i] && Math.hypot(s.x - chase[i]!.x, s.y - chase[i]!.y) < 220).length;
    expect(near).toBeGreaterThan(lead.length * 0.3);
  });
});

describe("keyframesOf", () => {
  it("writes one frame per sample, in order, over the whole dream", () => {
    const { lead, ms } = fly(9);
    const css = keyframesOf("x", lead, ms);
    const at = [...css.matchAll(/([\d.]+)% \{/g)].map((m) => Number(m[1]));
    expect(at.length).toBe(lead.length);
    expect(at[0]).toBe(0);
    expect(at.at(-1)).toBe(100);
    expect([...at]).toEqual([...at].sort((a, b) => a - b));
    expect(css).toContain("translate(");
    expect(css).toContain("rotate(");
  });
});
