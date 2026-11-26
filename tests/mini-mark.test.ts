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
