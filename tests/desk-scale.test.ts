import { describe, expect, it } from "vitest";

import { checkComponent, checkCss, checkDesk } from "../scripts/desk-scale";

describe("the desk's ruler (D-214)", () => {
  it("keeps every radius, size of a word, transition and light of the desk on the scale — run `pnpm check:desk-scale`", () => {
    // a value off the scale is how the desk grew twenty radii and forty durations: name it, then fix it
    expect(checkDesk().map((item) => `${item.file}:${item.line} ${item.kind}`)).toEqual([]);
  });

  it("names what is off the scale in a stylesheet", () => {
    const css = [
      ".a {",
      "  border-radius: 7px;",
      "  font-size: 13.5px;",
      "  transition:",
      "    color 120ms linear,",
      "    scale 240ms cubic-bezier(0.2, 0.8, 0.2, 1);",
      "  box-shadow: 0 0 10px color-mix(in srgb, var(--pen) 60%, transparent);",
      "}",
    ].join("\n");
    expect(checkCss("x.css", css).map((item) => item.kind)).toEqual(["radius 7px", "font-size 13.5px", "transition 120ms", "transition 240ms", "raw cubic-bezier", "coloured glow"]);
  });

  it("lets through what is on it: a ring, a stagger's step, a breath, a keyframe's own length", () => {
    const css = [
      ".a {",
      "  border-radius: 0 2px 2px 0;",
      "  font: 600 24px/32px var(--font-body);",
      "  transition: color 140ms linear, opacity 900ms var(--ease-out);",
      "  animation: rise 260ms var(--ease-snap) both;",
      "  animation-delay: calc(var(--i) * 35ms);",
      "  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pen) 16%, transparent);",
      "}",
    ].join("\n");
    expect(checkCss("x.css", css)).toEqual([]);
  });

  it("reads the arbitrary values of a component's classes", () => {
    const tsx = '<p className="rounded-[10px] text-[15px] duration-[120ms] rounded-[8px] text-[14px] duration-[140ms]" />';
    expect(checkComponent("x.tsx", tsx).map((item) => item.kind)).toEqual(["radius 10px", "font-size 15px", "transition 120ms"]);
  });
});
