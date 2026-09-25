import { describe, expect, it } from "vitest";

import { binCards, demotedPlace, glimpse, lineState, numbersOf, parentsFirst, promotedPlace } from "./branch";
import { branchesOf } from "./tree";

type Row = { id: string; parent_id: string | null; position: number | null; created_at: string; text: string };

const row = (id: string, position: number, parent_id: string | null = null, text = id): Row => ({
  id,
  parent_id,
  position,
  created_at: "2026-09-25T05:00:00Z",
  text,
});

describe("numbersOf", () => {
  it("numbers the points with words 1…N, as the wall does", () => {
    const branches = branchesOf([row("a", 1), row("voice", 2, null, ""), row("b", 3), row("a1", 1, "a")]);
    const numbers = numbersOf(branches);
    expect(numbers.get("a")).toBe(1);
    expect(numbers.has("voice")).toBe(false);
    expect(numbers.get("b")).toBe(2);
    // a sub-point has a marker, not a number
    expect(numbers.has("a1")).toBe(false);
  });

  it("treats spaces as no words", () => {
    expect(numbersOf(branchesOf([row("a", 1, null, "   ")])).size).toBe(0);
  });
});

describe("glimpse", () => {
  it("shows everything up to one over the limit", () => {
    expect(glimpse([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(glimpse([1, 2, 3, 4])).toEqual({ shown: [1, 2, 3, 4], more: 0 });
  });

  it("says «ещё N» past that", () => {
    expect(glimpse([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(glimpse([], 3)).toEqual({ shown: [], more: 0 });
  });
});

describe("promotedPlace", () => {
  const rows = [row("a", 1), row("b", 2), row("a1", 1, "a"), row("a2", 2, "a"), row("c", 4)];

  it("puts the sub-point right after its point", () => {
    expect(promotedPlace(rows, "a2")).toEqual({ parent_id: null, position: 1.5 });
    const after = branchesOf(rows.map((r) => (r.id === "a2" ? { ...r, parent_id: null, position: 1.5 } : r)));
    expect(after.map((branch) => branch.point.id)).toEqual(["a", "a2", "b", "c"]);
  });

  it("steps past the last point", () => {
    expect(promotedPlace([row("a", 3), row("a1", 1, "a")], "a1")).toEqual({ parent_id: null, position: 4 });
  });

  it("is null for a point, a missing row and an orphan", () => {
    expect(promotedPlace(rows, "a")).toBeNull();
    expect(promotedPlace(rows, "zzz")).toBeNull();
    expect(promotedPlace([row("x", 1, "gone")], "x")).toBeNull();
  });
});

describe("demotedPlace", () => {
  const rows = [row("a", 1), row("a1", 1, "a"), row("b", 2), row("c", 3), row("d", 4)];

  it("goes under the point above, as its last sub-point", () => {
    expect(demotedPlace(rows, "b")).toEqual({ parent_id: "a", position: 2 });
    expect(demotedPlace(rows, "c")).toEqual({ parent_id: "b", position: 1 });
  });

  it("is not offered to the first point", () => {
    expect(demotedPlace(rows, "a")).toBeNull();
  });

  it("is not offered to a point with sub-points of its own", () => {
    expect(demotedPlace([row("z", 0), ...rows], "a")).toBeNull();
  });

  it("is not offered under a point the server does not have yet", () => {
    expect(demotedPlace(rows, "d", (id) => id !== "c")).toBeNull();
  });

  it("is not offered under an orphan drawn as a point", () => {
    expect(demotedPlace([row("o", 1, "gone"), row("p", 2)], "p")).toBeNull();
  });
});

describe("binCards", () => {
  const at = "2026-09-25T08:00:00.123Z";
  // the server echoes timestamptz in its own spelling
  const echo = "2026-09-25T08:00:00.123+00:00";
  const bin = (id: string, parent_id: string | null, deleted_at: string) => ({ id, parent_id, deleted_at });

  it("lets the sub-points that went with their point ride on its card", () => {
    const cards = binCards([bin("p", null, at), bin("p1", "p", echo), bin("p2", "p", at)]);
    expect(cards).toHaveLength(1);
    expect(cards[0].card.id).toBe("p");
    expect(cards[0].riders.map((r) => r.id)).toEqual(["p1", "p2"]);
  });

  it("keeps a sub-point deleted on its own as its own card", () => {
    const cards = binCards([bin("p", null, at), bin("early", "p", "2026-09-25T07:00:00Z"), bin("lone", "q", at)]);
    expect(cards.map((c) => c.card.id)).toEqual(["p", "early", "lone"]);
    expect(cards[0].riders).toEqual([]);
  });
});

describe("parentsFirst", () => {
  const entry = (id: string, parentId: string | null = null) => ({ id, parentId });

  it("keeps the order when it is already right", () => {
    expect(parentsFirst([entry("p"), entry("s", "p"), entry("q")]).map((e) => e.id)).toEqual(["p", "s", "q"]);
  });

  it("holds a sub-point back until its point has gone", () => {
    expect(parentsFirst([entry("s1", "p"), entry("x"), entry("p"), entry("s2", "p")]).map((e) => e.id)).toEqual(["x", "p", "s1", "s2"]);
  });

  it("lets a sub-point of a point on the server go as it is", () => {
    expect(parentsFirst([entry("s", "on-server"), entry("p")]).map((e) => e.id)).toEqual(["s", "p"]);
  });

  it("never loses an entry", () => {
    const loop = [entry("a", "b"), entry("b", "a")];
    expect(parentsFirst(loop).map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});

describe("lineState", () => {
  const none = { phone: false, waiting: false, hearing: false };

  it("is words once there are words, whatever else is going on", () => {
    expect(lineState({ text: "План", audio_path: "a.webm" }, { phone: true, waiting: true, hearing: true })).toBe("words");
  });

  it("follows the voice: kept now, waiting on the phone, heard, not heard", () => {
    expect(lineState({ text: "", audio_path: null }, { ...none, phone: true })).toBe("saving");
    expect(lineState({ text: "", audio_path: null }, { ...none, phone: true, waiting: true })).toBe("phone");
    expect(lineState({ text: " ", audio_path: "a.webm" }, { ...none, hearing: true })).toBe("hearing");
    expect(lineState({ text: "", audio_path: "a.webm" }, none)).toBe("deaf");
  });

  it("calls an empty typed line words («Без текста»)", () => {
    expect(lineState({ text: "", audio_path: null }, none)).toBe("words");
  });
});
