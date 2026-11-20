import { phoneRow } from "./list";
import type { PendingCreate, PendingEdit } from "./pending";
import type { Note } from "./queries";

/**
 * Notes as the director should see them while some of them still wait on this device (D-95):
 * the one rule of every screen of notes and boards, phone and desk alike.
 */

/** An owed write younger than this is simply on its way; older, with the network up, it is stuck. */
export const STUCK_MS = 20_000;

/** What waits on this device: notes made here and edits not taken by the server yet. */
export type Owed = { creates: readonly PendingCreate[]; edits: readonly PendingEdit[] };

export type Overlaid = {
  /** The rows to draw: the cache and what the screen read besides it, with what waits here laid over. */
  rows: Note[];
  /** Rows that exist only on this device so far, with what is kept of each (its recording, its board). */
  phone: ReadonlyMap<string, PendingCreate>;
  /** Made on this device and not confirmed by the server yet — in the cache already or not. */
  owed: ReadonlySet<string>;
};

/** The scope of a screen: every note (the notes list), or the live lines of one board. */
export type OverlayScope = {
  /** Rows the screen read besides the cache — older search hits, a note opened by its address. The cache wins over them. */
  extra?: readonly Note[];
  /** Only the live lines of this board. */
  board?: string;
};

const NONE: readonly Note[] = [];

function inScope(note: Note, board: string | undefined): boolean {
  return board === undefined || (note.board_id === board && note.deleted_at === null);
}

function createsOf(pending: Owed, board: string | undefined): readonly PendingCreate[] {
  return board === undefined ? pending.creates : pending.creates.filter((entry) => entry.boardId === board);
}

/**
 * The cache, the rows read besides it, the edits still on this device laid over their rows, and
 * the notes that exist only here so far. A new reminder time rings again, so an edit of
 * `remind_at` clears `reminded_at` — as the write itself does, and the base's trigger after it.
 */
export function overlayPending(cached: readonly Note[], pending: Owed, scope: OverlayScope = {}): Overlaid {
  const { extra = NONE, board } = scope;
  const byId = new Map<string, Note>();
  for (const note of cached) if (inScope(note, board)) byId.set(note.id, note);
  for (const note of extra) if (!byId.has(note.id) && inScope(note, board)) byId.set(note.id, note);
  for (const edit of pending.edits) {
    const row = byId.get(edit.id);
    if (row) byId.set(edit.id, { ...row, ...edit.fields, ...("remind_at" in edit.fields ? { reminded_at: null } : {}) });
  }
  const creates = createsOf(pending, board);
  const phone = new Map<string, PendingCreate>();
  for (const entry of creates) {
    if (byId.has(entry.id)) continue;
    phone.set(entry.id, entry);
    byId.set(entry.id, phoneRow(entry));
  }
  return { rows: [...byId.values()], phone, owed: new Set(creates.map((entry) => entry.id)) };
}

/**
 * «ждёт связи»: what is owed with no network, or has waited longer than `STUCK_MS` — not the
 * second an ordinary autosave is on its way. `now` — the clock of `useStuckClock`.
 */
export function waitingOf(pending: Owed, at: { online: boolean; now: number; board?: string }): ReadonlySet<string> {
  const late = (since: number) => !at.online || at.now - since > STUCK_MS;
  return new Set([
    ...createsOf(pending, at.board)
      .filter((entry) => late(Date.parse(entry.createdAt)))
      .map((entry) => entry.id),
    ...pending.edits.filter((edit) => late(edit.at)).map((edit) => edit.id),
  ]);
}
