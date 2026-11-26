/**
 * The mascot's small self and the waiting field stay light (D-206, D-209): the small mark is one
 * drawing of a few nodes without a script, every animation their stylesheets name is declared
 * there, and their keyframes move `transform` and `opacity` only — nothing that repaints.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import { BEATS, waveLife } from "@/components/pulse/beat";
import { FIELD_WAVE_REACH, fieldWaveDelay } from "@/components/pulse/IdleField";

const SHEETS = ["components/brand/mini-mark.css", "components/pulse/idle-field.css"];
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const STATES: Record<MiniState, true> = { still: true, idle: true, busy: true, listening: true, done: true, alert: true };

describe("the small mark", () => {
  it("is one small drawing in every state, and says its state", () => {
    for (const state of Object.keys(STATES) as MiniState[]) {
      const markup = renderToStaticMarkup(createElement(MiniMark, { state, size: 16 }));
      expect(markup).toContain(`data-state="${state}"`);
      // the span, the svg and what is drawn in it
      expect((markup.match(/<[a-z]/g) ?? []).length).toBeLessThanOrEqual(11);
      expect(markup).not.toContain("<script");
    }
  });

  it("is decoration unless it is given words", () => {
    expect(renderToStaticMarkup(createElement(MiniMark, {}))).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(createElement(MiniMark, { label: "Обновляю данные" }));
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Обновляю данные"');
    expect(named).not.toContain("aria-hidden");
  });

  it("has a rule for every state", () => {
    const css = read("components/brand/mini-mark.css");
    for (const state of Object.keys(STATES) as MiniState[]) {
      if (state === "still") continue;
      expect(css, state).toContain(`[data-state="${state}"]`);
    }
  });
});

describe("the waiting field's heartbeat", () => {
  const seconds = (text: string | undefined) => Math.round(Number(text) * 1000);

  it("is the mark's own: the period and the moment its first wave leaves the ring", () => {
    const mark = read("components/brand/mark/mark.css");
    const asleep = mark.match(/\.bk\[data-glow="sleep"\] \.bk-wave-1\s*\{[^}]*?bk-wave-out\s+([\d.]+)s\s+cubic-bezier\([^)]*\)\s+([\d.]+)s/);
    expect(asleep, "the sleeping mark's wave").not.toBeNull();
    expect(seconds(asleep?.[1])).toBe(BEATS.sleep.ms);
    expect(seconds(asleep?.[2])).toBe(BEATS.sleep.lead);
    const awake = mark.match(/\.bk\[data-glow="pulse"\] \.bk-wave\s*\{[^}]*?bk-wave-out\s+([\d.]+)s/);
    const lead = mark.match(/\.bk\[data-glow="pulse"\] \.bk-wave-1\s*\{[^}]*?animation-delay:\s*([\d.]+)s/);
    expect(seconds(awake?.[1])).toBe(BEATS.awake.ms);
    expect(seconds(lead?.[1])).toBe(BEATS.awake.lead);
  });

  it("times everything that answers a wave by the same number", () => {
    const field = read("components/pulse/idle-field.css");
    for (const loop of ["idle-flare", "idle-echo"]) expect(field, loop).toMatch(new RegExp(`animation:\\s*${loop}\\s+var\\(--beat`));
    // the front reaches a place later the longer the wave lives, and never after it has faded
    const radius = 400;
    for (const beat of ["sleep", "awake"] as const) {
      const life = waveLife(beat);
      expect(fieldWaveDelay(radius * 0.13, radius, life)).toBe(0);
      const near = fieldWaveDelay(radius * 0.4, radius, life)!;
      const far = fieldWaveDelay(radius * 0.8, radius, life)!;
      expect(near).toBeGreaterThan(0);
      expect(far).toBeGreaterThan(near);
      expect(far).toBeLessThan(life * FIELD_WAVE_REACH);
      expect(Math.abs(fieldWaveDelay(radius * 0.6, radius, life * 2)! - 2 * fieldWaveDelay(radius * 0.6, radius, life)!)).toBeLessThanOrEqual(1);
    }
  });
});

describe.each(SHEETS)("%s", (file) => {
  const css = read(file);
  const declared = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]!));

  it("names only animations it declares", () => {
    for (const match of css.matchAll(/animation(?:-name)?:\s*([\w-]+)/g)) {
      const name = match[1]!;
      if (name === "none") continue;
      expect(declared.has(name), name).toBe(true);
    }
  });

  it("moves transform and opacity only", () => {
    for (const block of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)) {
      const props = [...block[2]!.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]!);
      for (const prop of props) expect(["transform", "opacity"], `${block[1]}: ${prop}`).toContain(prop);
    }
  });
});
