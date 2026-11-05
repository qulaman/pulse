import { describe, expect, it } from "vitest";

import { reachOf, splitEther } from "./ether";

describe("reachOf", () => {
  const team = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("counts who has read and names who has not", () => {
    expect(reachOf([{ user_id: "b" }], team)).toEqual({ seen: 1, of: 3, missing: [{ id: "a" }, { id: "c" }] });
  });

  it("counts a person once", () => {
    expect(reachOf([{ user_id: "a" }, { user_id: "a" }], team).seen).toBe(1);
  });

  it("does not count somebody who left: never «4 из 3»", () => {
    expect(reachOf([{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }, { user_id: "gone" }], team)).toEqual({ seen: 3, of: 3, missing: [] });
  });

  it("has nothing to count without a team", () => {
    expect(reachOf([{ user_id: "a" }], [])).toEqual({ seen: 0, of: 0, missing: [] });
  });
});

describe("splitEther", () => {
  const now = new Date("2026-11-04T18:00:00Z");
  const items = [
    { id: "old", created_at: "2026-11-01T10:00:00Z" },
    { id: "night", created_at: "2026-11-04T17:00:00Z" },
    { id: "new", created_at: "2026-11-03T10:00:00Z" },
    { id: "later", created_at: "2026-11-04T17:30:00Z" },
  ];

  it("keeps the waiting apart, the soonest first, the rest newest first", () => {
    const parts = splitEther(items, { later: "2026-11-05T05:00:00Z", night: "2026-11-05T03:00:00Z" }, now);
    expect(parts.held).toEqual([
      { item: items[1], until: "2026-11-05T03:00:00Z" },
      { item: items[3], until: "2026-11-05T05:00:00Z" },
    ]);
    expect(parts.sent.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("does not hold what has already gone", () => {
    const parts = splitEther(items, { night: "2026-11-04T17:59:00Z" }, now);
    expect(parts.held).toEqual([]);
    expect(parts.sent).toHaveLength(4);
  });

  it("takes everything as sent while the outbox is not known", () => {
    expect(splitEther(items, undefined, now).held).toEqual([]);
  });
});
