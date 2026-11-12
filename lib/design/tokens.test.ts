import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { colors, durations, easing, overlay, springCurve, springs, springSteps } from "./tokens";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
/** Whitespace-free copy keeps the assertions free of regex escaping. */
const compact = css.replace(/\s/g, "").toLowerCase();

describe("design tokens ↔ globals.css", () => {
  it.each(Object.entries(colors))("--%s is declared with the same hex", (name, hex) => {
    expect(compact).toContain(`--${name}:${hex}`.toLowerCase() + ";");
  });

  it("declares --overlay", () => {
    expect(compact).toContain(`--overlay:${overlay.replace(/\s/g, "")};`.toLowerCase());
  });

  it.each(Object.entries(durations))("--t-%s matches tokens.ts", (name, value) => {
    expect(compact).toContain(`--t-${name}:${value};`.toLowerCase());
  });

  it("declares --ease-object as the object spring written out", () => {
    expect(compact).toContain(`--ease-object:${easing.object.replace(/\s/g, "")};`);
  });
});

describe("springs (D-166)", () => {
  it("the object spring settles without a bounce", () => {
    const peak = Math.max(...springSteps(springs.object).map(([, x]) => x));
    expect(peak).toBeLessThanOrEqual(1.0005);
  });

  it("the alive spring overshoots", () => {
    const peak = Math.max(...springSteps(springs.alive).map(([, x]) => x));
    expect(peak).toBeGreaterThan(1.02);
  });

  it("writes a spring out as a linear() curve from 0 to 1", () => {
    const { easing: curve, ms } = springCurve(springs.object);
    expect(curve.startsWith("linear(0, ")).toBe(true);
    expect(curve.endsWith(", 1)")).toBe(true);
    expect(`${ms}ms`).toBe(durations.object);
    expect(ms).toBeGreaterThan(250);
    expect(ms).toBeLessThan(600);
  });
});
