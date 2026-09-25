import { describe, expect, it } from "vitest";

import { branchesOf, nextPlaceIn, stepLabel, stepPoint } from "./tree";

type Row = { id: string; parent_id: string | null; position: number | null; created_at: string };

const row = (id: string, position: number, parent_id: string | null = null, created_at = "2026-09-25T05:00:00Z"): Row => ({
  id,
  parent_id,
  position,
  created_at,
});

describe("branchesOf", () => {
  it("puts sub-points under their points, both in the order of the board", () => {
    const tree = branchesOf([row("b", 2), row("a", 1), row("a2", 2, "a"), row("a1", 1, "a"), row("b1", 1, "b")]);
    expect(tree.map((branch) => branch.point.id)).toEqual(["a", "b"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["a1", "a2"]);
    expect(tree[1].children.map((child) => child.id)).toEqual(["b1"]);
  });

  it("breaks a tie of places by time", () => {
    const tree = branchesOf([row("late", 1, null, "2026-09-25T06:00:00Z"), row("early", 1, null, "2026-09-25T05:00:00Z")]);
    expect(tree.map((branch) => branch.point.id)).toEqual(["early", "late"]);
  });

  it("draws a sub-point without its point as a point", () => {
    const tree = branchesOf([row("a", 1), row("orphan", 1.5, "gone")]);
    expect(tree.map((branch) => branch.point.id)).toEqual(["a", "orphan"]);
  });
});

describe("nextPlaceIn", () => {
  it("counts siblings only", () => {
    const rows = [row("a", 1), row("b", 4), row("a1", 1, "a"), row("a2", 2.5, "a")];
    expect(nextPlaceIn(rows, null)).toBe(5);
    expect(nextPlaceIn(rows, "a")).toBe(3);
    expect(nextPlaceIn(rows, "b")).toBe(1);
  });
});

describe("stepPoint", () => {
  const order = ["a", "b", "c"];

  it("starts at the first going forward, at the last going back", () => {
    expect(stepPoint(order, null, 1)).toBe("a");
    expect(stepPoint(order, null, -1)).toBe("c");
  });

  it("steps and stops at the edges", () => {
    expect(stepPoint(order, "a", 1)).toBe("b");
    expect(stepPoint(order, "b", -1)).toBe("a");
    expect(stepPoint(order, "c", 1)).toBeNull();
    expect(stepPoint(order, "a", -1)).toBeNull();
  });

  it("restarts when the spotlit point is gone", () => {
    expect(stepPoint(order, "x", 1)).toBe("a");
    expect(stepPoint([], null, 1)).toBeNull();
  });
});

describe("stepLabel", () => {
  it("says where the meeting is", () => {
    expect(stepLabel(["a", "b", "c"], "b")).toBe("2 из 3");
    expect(stepLabel(["a"], null)).toBeNull();
    expect(stepLabel(["a"], "x")).toBeNull();
  });
});
