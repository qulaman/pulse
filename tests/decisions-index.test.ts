import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { HEAD_PATH, nextFreeNumber, readRegister, registerProblems, renderHead } from "../scripts/decisions-index";

const lf = (text: string) => text.split("\r\n").join("\n");

describe("decisions register (D-201)", () => {
  const areas = readRegister();
  const head = lf(readFileSync(HEAD_PATH, "utf8"));

  it("keeps the head of DECISIONS.md rebuilt — run `pnpm decisions:index`", () => {
    // a decision that lands without the head leaves the visa list and the next free number stale
    expect(head).toBe(renderHead(head, areas));
  });

  it("holds every entry within the limit, under one number, with a visa question where one is due, and no number held after its entry is in", () => {
    // an entry that outgrows the limit is retelling a screen: that text belongs to the area document
    expect(registerProblems(areas, head)).toEqual([]);
  });

  it("reads the entries the register is known to hold", () => {
    // anchors of the parser: the three kinds of numbers and an area file
    const ids = new Set(areas.flatMap((area) => area.entries.map((entry) => entry.id)));
    expect(ids.has("V-01")).toBe(true);
    expect(ids.has("G.20")).toBe(true);
    expect(ids.has("D-128")).toBe(true);
    expect(areas.find((area) => area.file === "tasks.md")?.entries.length).toBeGreaterThan(10);
    expect(nextFreeNumber(areas, head)).toBeGreaterThan(200);
  });
});
