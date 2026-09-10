import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { colors, durations, overlay } from "./tokens";

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
});
