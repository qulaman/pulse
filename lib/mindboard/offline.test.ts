import { describe, expect, it } from "vitest";

import { movesBranch, revertEdit, valuesBefore, waitOf, withoutBranch } from "./offline";

const set = (...ids: string[]) => {
  const all = new Set(ids);
  return (id: string) => all.has(id);
};

describe("waitOf", () => {
  const point = { id: "p", parent_id: null };
  const sub = { id: "s", parent_id: "p" };
  const look = (over: { late?: string[]; owed?: string[]; phone?: string[]; online?: boolean }) => ({
    late: set(...(over.late ?? [])),
    owed: set(...(over.owed ?? [])),
    phone: set(...(over.phone ?? [])),
    online: over.online ?? true,
  });

  it("says nothing while a line is simply on its way", () => {
    expect(waitOf(sub, look({ owed: ["p", "s"] }))).toBeNull();
    expect(waitOf(point, look({ owed: ["p"], phone: ["p"] }))).toBeNull();
  });

  it("a sub-point under a point still on the phone waits for its point, not for the network", () => {
    expect(waitOf(sub, look({ late: ["p", "s"], owed: ["p", "s"] }))).toBe("point");
  });

  it("says so at once when the point exists only on the phone (not a write in flight)", () => {
    expect(waitOf(sub, look({ owed: ["p", "s"], phone: ["p", "s"] }))).toBe("point");
  });

  it("without network everything waits for the network — the point too", () => {
    expect(waitOf(sub, look({ late: ["p", "s"], owed: ["p", "s"], phone: ["p", "s"], online: false }))).toBe("network");
    expect(waitOf(point, look({ late: ["p"], owed: ["p"], online: false }))).toBe("network");
  });

  it("a sub-point whose point has landed waits for the network like any line", () => {
    expect(waitOf(sub, look({ late: ["s"], owed: ["s"] }))).toBe("network");
  });

  it("an owed edit of a landed sub-point (its point landed long ago) is the network's", () => {
    expect(waitOf(sub, look({ late: ["s"] }))).toBe("network");
  });

  it("a point never waits for a point", () => {
    expect(waitOf(point, look({ late: ["p"], owed: ["p"], phone: ["p"] }))).toBe("network");
  });
});

describe("withoutBranch", () => {
  it("keeps an edit that does not touch the branch as it is", () => {
    const fields = { text: "План", position: 2.5 };
    expect(movesBranch(fields)).toBe(false);
    expect(withoutBranch(fields)).toBe(fields);
  });

  it("drops the parent and its place, keeps the text and the tick", () => {
    const fields = { parent_id: "a", position: 3, text: "Офис", done_at: "2026-09-25T10:00:00Z" };
    expect(movesBranch(fields)).toBe(true);
    expect(withoutBranch(fields)).toEqual({ text: "Офис", done_at: "2026-09-25T10:00:00Z" });
  });

  it("leaves nothing to write when the edit was only the move", () => {
    expect(withoutBranch({ parent_id: "a", position: 3 })).toBeNull();
    expect(withoutBranch({ parent_id: null, position: 4.5 })).toBeNull();
  });
});

describe("revertEdit", () => {
  type Row = { id: string; parent_id: string | null; position: number | null; text: string; deleted_at: string | null };
  const a: Row = { id: "a", parent_id: null, position: 1, text: "Продажи", deleted_at: null };
  const b: Row = { id: "b", parent_id: null, position: 2, text: "Офис", deleted_at: null };

  it("takes a refused «Сделать подпунктом» back: the row is a point in its old place", () => {
    const wrote = { parent_id: "a", position: 1 };
    const was = valuesBefore(b, wrote);
    expect(was).toEqual({ parent_id: null, position: 2 });
    const drawn = [a, { ...b, ...wrote }];
    expect(revertEdit(drawn, "b", wrote, was)).toEqual([a, b]);
  });

  it("touches nothing else: a deletion and a new line that came meanwhile stay", () => {
    const wrote = { parent_id: "a", position: 1 };
    const was = valuesBefore(b, wrote);
    const gone = { ...a, deleted_at: "2026-09-25T10:00:00Z" };
    const fresh: Row = { id: "c", parent_id: null, position: 3, text: "Новый", deleted_at: null };
    const drawn = [gone, { ...b, ...wrote }, fresh];
    expect(revertEdit(drawn, "b", wrote, was)).toEqual([gone, b, fresh]);
  });

  it("leaves a field a newer edit has changed since", () => {
    const wrote = { parent_id: "a", position: 1 };
    const was = valuesBefore(b, wrote);
    // «Вынести в пункты» came after the refused move: the newer place stays
    const drawn = [a, { ...b, parent_id: null, position: 1.5 }];
    expect(revertEdit(drawn, "b", wrote, was)).toEqual([a, { ...b, parent_id: null, position: 1.5 }]);
  });

  it("does nothing for a row it does not know", () => {
    expect(valuesBefore(undefined, { text: "x" })).toEqual({});
    expect(revertEdit([a], "b", { text: "x" }, {})).toEqual([a]);
  });
});
