import { describe, expect, it } from "vitest";

import { overlayPending, STUCK_MS, waitingOf, type Owed } from "./overlay";
import type { PendingCreate, PendingEdit } from "./pending";
import type { Note } from "./queries";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: crypto.randomUUID(),
    company_id: "c-1",
    user_id: "u-1",
    text: "Мысль",
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
    board_id: null,
    position: null,
    done_at: null,
    client_request_id: null,
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:00:00Z",
    ...overrides,
  };
}

function made(overrides: Partial<PendingCreate> = {}): PendingCreate {
  return {
    id: crypto.randomUUID(),
    userId: "u-1",
    companyId: "c-1",
    crid: crypto.randomUUID(),
    text: "С телефона",
    createdAt: "2026-09-17T10:00:00.000Z",
    audio: null,
    audioPath: null,
    inboxId: null,
    ...overrides,
  };
}

const edit = (id: string, fields: PendingEdit["fields"], at = Date.parse("2026-09-17T10:00:00Z")): PendingEdit => ({ id, userId: "u-1", fields, at });
const owed = (creates: PendingCreate[] = [], edits: PendingEdit[] = []): Owed => ({ creates, edits });
const T0 = Date.parse("2026-09-17T10:00:00Z");

describe("overlayPending", () => {
  it("lays an edit over its row and adds what exists only on this device", () => {
    const row = note({ text: "Было" });
    const phone = made({ text: "Без сети" });
    const result = overlayPending([row], owed([phone], [edit(row.id, { text: "Стало", pinned: true })]));
    expect(result.rows.map((line) => line.text)).toEqual(["Стало", "Без сети"]);
    expect(result.rows[0].pinned).toBe(true);
    expect([...result.phone.keys()]).toEqual([phone.id]);
    expect(result.owed.has(phone.id)).toBe(true);
  });

  it("a create already in the cache is owed but not drawn twice", () => {
    const row = note({ text: "С сервера" });
    const result = overlayPending([row], owed([made({ id: row.id, text: "С телефона" })]));
    expect(result.rows.map((line) => line.text)).toEqual(["С сервера"]);
    expect(result.phone.size).toBe(0);
    expect(result.owed.has(row.id)).toBe(true);
  });

  it("a new reminder time clears the old «reminded» — on every screen", () => {
    const rung = note({ remind_at: "2026-09-17T05:00:00Z", reminded_at: "2026-09-17T05:00:10Z" });
    const plain = note({ reminded_at: "2026-09-17T05:00:10Z" });
    const result = overlayPending([rung, plain], owed([], [edit(rung.id, { remind_at: "2026-09-18T05:00:00Z" }), edit(plain.id, { text: "Только текст" })]));
    expect(result.rows[0]).toMatchObject({ remind_at: "2026-09-18T05:00:00Z", reminded_at: null });
    expect(result.rows[1].reminded_at).toBe("2026-09-17T05:00:10Z");
    const onBoard = overlayPending([{ ...rung, board_id: "b-1" }], owed([], [edit(rung.id, { remind_at: null })]), { board: "b-1" });
    expect(onBoard.rows[0].reminded_at).toBeNull();
  });

  it("rows read besides the cache join it, the cache wins, edits reach them too", () => {
    const fresh = note({ text: "Кэш" });
    const old = note({ text: "Старая" });
    const result = overlayPending([fresh], owed([], [edit(old.id, { pinned: true })]), { extra: [{ ...fresh, text: "Из поиска" }, old] });
    expect(result.rows.map((line) => line.text)).toEqual(["Кэш", "Старая"]);
    expect(result.rows[1].pinned).toBe(true);
  });

  it("a board: only its live lines, only its creates", () => {
    const line = note({ board_id: "b-1", position: 1 });
    const gone = note({ board_id: "b-1", position: 2, deleted_at: "2026-09-17T11:00:00Z" });
    const elsewhere = note({ board_id: "b-2" });
    const thought = note();
    const here = made({ boardId: "b-1", position: 3 });
    const there = made({ boardId: "b-2" });
    const result = overlayPending([line, gone, elsewhere, thought], owed([here, there]), { board: "b-1" });
    expect(result.rows.map((row) => row.id)).toEqual([line.id, here.id]);
    expect([...result.phone.keys()]).toEqual([here.id]);
    expect([...result.owed]).toEqual([here.id]);
    // the notes list keeps everything: the bin and every board
    expect(overlayPending([line, gone, elsewhere, thought], owed([here, there])).rows).toHaveLength(6);
  });
});

describe("waitingOf", () => {
  const create = made({ createdAt: new Date(T0).toISOString() });
  const change = edit("e-1", { text: "x" }, T0);
  const pending = owed([create], [change]);

  it("without network everything owed waits at once", () => {
    expect([...waitingOf(pending, { online: false, now: T0 })].sort()).toEqual([create.id, "e-1"].sort());
  });

  it("with network only what is stuck past STUCK_MS", () => {
    expect(waitingOf(pending, { online: true, now: T0 + STUCK_MS }).size).toBe(0);
    expect(waitingOf(pending, { online: true, now: T0 + STUCK_MS + 1 }).size).toBe(2);
    // a clock that has not ticked since the write was made never says «stuck»
    expect(waitingOf(pending, { online: true, now: T0 - 60_000 }).size).toBe(0);
  });

  it("a board waits for its own creates only", () => {
    const mine = made({ boardId: "b-1" });
    const other = made({ boardId: "b-2" });
    expect([...waitingOf(owed([mine, other]), { online: false, now: T0, board: "b-1" })]).toEqual([mine.id]);
  });
});
