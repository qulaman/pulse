import { describe, expect, it } from "vitest";

import { countByAssignee, pickHintRoster } from "./hint-roster";

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u-${String(i).padStart(3, "0")}` }));

describe("pickHintRoster", () => {
  it("keeps a small roster whole and in its original order", () => {
    const roster = people(5).reverse();
    expect(pickHintRoster(roster, new Map(), 60)).toBe(roster);
  });

  it("keeps the most-addressed people when the roster is over the cap", () => {
    const roster = people(100);
    const counts = new Map([
      ["u-099", 12],
      ["u-077", 3],
      ["u-050", 1],
    ]);
    const picked = pickHintRoster(roster, counts, 5).map((u) => u.id);
    expect(picked.slice(0, 3)).toEqual(["u-099", "u-077", "u-050"]);
    // Ties (count 0) resolve by id, so the choice is stable between requests.
    expect(picked.slice(3)).toEqual(["u-000", "u-001"]);
    expect(picked).toHaveLength(5);
  });

  it("counts tasks per assignee and ignores unassigned rows", () => {
    const counts = countByAssignee([
      { assignee_id: "a" },
      { assignee_id: null },
      { assignee_id: "a" },
      { assignee_id: "b" },
    ]);
    expect([...counts.entries()]).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});
