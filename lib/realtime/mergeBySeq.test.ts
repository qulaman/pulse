import { describe, expect, it } from "vitest";

import { lastSeqOf, mergeBySeq } from "./mergeBySeq";

type Row = { id: string; seq: number; content?: string };

describe("mergeBySeq", () => {
  it("appends a cursor read and keeps seq order", () => {
    const existing: Row[] = [
      { id: "a", seq: 1 },
      { id: "b", seq: 2 },
    ];
    const incoming: Row[] = [
      { id: "d", seq: 4 },
      { id: "c", seq: 3 },
    ];

    expect(mergeBySeq(existing, incoming).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("deduplicates by id — an optimistic row and its Realtime echo are one row", () => {
    const existing: Row[] = [{ id: "a", seq: 1, content: "optimistic" }];
    const incoming: Row[] = [{ id: "a", seq: 1, content: "from server" }];

    const merged = mergeBySeq(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe("from server");
  });

  it("lets an unchanged seq carry new content — answered_at lands on an old question", () => {
    const existing: Row[] = [
      { id: "q", seq: 7, content: "open" },
      { id: "r", seq: 8 },
    ];
    const incoming: Row[] = [{ id: "q", seq: 7, content: "answered" }];

    const merged = mergeBySeq(existing, incoming);
    expect(merged.map((r) => r.id)).toEqual(["q", "r"]);
    expect(merged[0].content).toBe("answered");
  });

  it("survives an empty cache and an empty read", () => {
    expect(mergeBySeq<Row>([], [])).toEqual([]);
    expect(mergeBySeq<Row>([], [{ id: "a", seq: 1 }])).toHaveLength(1);
    expect(mergeBySeq<Row>([{ id: "a", seq: 1 }], [])).toHaveLength(1);
  });
});

describe("lastSeqOf", () => {
  it("is 0 for an empty cache so the caller reads the whole page", () => {
    expect(lastSeqOf([])).toBe(0);
  });

  it("takes the maximum, not the last element", () => {
    expect(lastSeqOf([{ id: "a", seq: 5 }, { id: "b", seq: 2 }])).toBe(5);
  });
});
