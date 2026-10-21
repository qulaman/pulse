import { describe, expect, it } from "vitest";

import type { Note } from "@/lib/notes/queries";

import { wallBoardOf, wallNote } from "./wall";

function row(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    company_id: "c-1",
    user_id: "u-1",
    text: "Пункт",
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    sketch: null,
    parent_id: null,
    board_id: "b-1",
    position: 1,
    done_at: null,
    client_request_id: null,
    created_at: "2026-10-20T05:00:00Z",
    updated_at: "2026-10-20T05:00:00Z",
    ...overrides,
  };
}

const BOARD = { id: "b-1", title: "Планёрка", updated_at: "2026-10-20T05:00:00Z" };

describe("wallBoardOf", () => {
  const rows = [
    row({ id: "p2", text: "Продажи", position: 2, done_at: "2026-10-20T06:00:00Z" }),
    row({ id: "p1", text: "Склад", position: 1, converted_task_id: "t-1" }),
    row({ id: "p3", text: "", position: 3, audio_path: "a.webm" }),
    row({ id: "s2", text: "Охрана", parent_id: "p1", position: 2 }),
    row({ id: "s1", text: "Аренда", parent_id: "p1", position: 1, converted_task_id: "t-2" }),
    row({ id: "s3", text: " ", parent_id: "p1", position: 3 }),
    row({ id: "gone", text: "Удалён", position: 0, deleted_at: "2026-10-20T06:00:00Z" }),
  ];
  const handed = (note: Note) =>
    note.converted_task_id === "t-1" ? { assignee: "Марат", done: false } : note.converted_task_id === "t-2" ? { assignee: null, done: true } : null;

  it("draws what the wall draws: points with words in order, their sub-points with words", () => {
    const board = wallBoardOf(BOARD, rows, { view: "list", focus: null }, handed);
    expect(board.items.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(board.items[0].children.map((child) => child.id)).toEqual(["s1", "s2"]);
    expect(board.total).toBe(2);
    expect(board.done).toBe(1);
  });

  it("names whom a line was handed to, and when it is done", () => {
    const board = wallBoardOf(BOARD, rows, { view: "list", focus: null }, handed);
    expect(board.items[0].assignee).toBe("Марат");
    expect(board.items[0].children[0]).toMatchObject({ assignee: null, handed_done: true });
    expect(board.items[1]).toMatchObject({ assignee: null, done: true });
  });

  it("keeps the spotlight only on a point that is there", () => {
    expect(wallBoardOf(BOARD, rows, { view: "map", focus: "p2" }, handed)).toMatchObject({ view: "map", focus: "p2" });
    expect(wallBoardOf(BOARD, rows, { view: "map", focus: "s1" }, handed).focus).toBeNull();
    expect(wallBoardOf(BOARD, rows, { view: "map", focus: "gone" }, handed).focus).toBeNull();
  });
});

describe("wallNote", () => {
  it("says when the wall will not draw what was asked", () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, text: "x", done: false, created_at: "", assignee: null, handed_done: false, children: [] }));
    expect(wallNote({ view: "map", items: items(13) })).toMatch(/стена покажет список/);
    expect(wallNote({ view: "map", items: items(12) })).toBeNull();
    expect(wallNote({ view: "list", items: items(30) })).toBeNull();
    expect(wallNote({ view: "list", items: [] })).toMatch(/Пока пусто/);
  });
});

describe("a drawing on the wall (D-141)", () => {
  it("is a point even without words, and carries its drawing", () => {
    const sketch = { v: 1, strokes: [{ c: "accent", w: 2, p: [10, 10, 200, 200] }] };
    const board = wallBoardOf(BOARD, [row({ id: "p1", text: "Склад", position: 1 }), row({ id: "p2", text: "", position: 2, sketch })], { view: "list", focus: "p2" }, () => null);
    expect(board.items.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(board.items[1].sketch?.strokes[0].c).toBe("accent");
    expect(board.items[0].sketch).toBeNull();
    expect(board.focus).toBe("p2");
  });
});
