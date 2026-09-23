import type { Note } from "@/lib/notes/queries";
import type { TvState } from "@/lib/tv/queries";

import type { MindBoard } from "./queries";

/**
 * Pure arithmetic of the boards (D-102): which points a board holds and in what order,
 * where a new or a moved point goes, what the board is called by default, whether it
 * is on the wall right now. No React, no network — tests in `list.test.ts`.
 */

/** A deleted board waits in the bin as long as a note does (D-95 §4). */
export const BOARD_TRASH_DAYS = 3;
const DAY_MS = 86_400_000;

const byPlace = (a: Note, b: Note) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);

/** The live points of one board, in the order of the board. */
export function pointsOf(notes: readonly Note[], boardId: string): Note[] {
  return notes.filter((note) => note.board_id === boardId && note.deleted_at === null).sort(byPlace);
}

export type BoardSummary = { total: number; done: number; lastAt: string | null };

/** What a board card and the status screen say: how many points, how many ticked, the latest. */
export function boardSummary(points: readonly Note[]): BoardSummary {
  let done = 0;
  let lastAt: string | null = null;
  for (const point of points) {
    if (point.done_at) done += 1;
    if (!lastAt || point.created_at > lastAt) lastAt = point.created_at;
  }
  return { total: points.length, done, lastAt };
}

/** Summaries of every board at once, from the one notes cache. */
export function summariesOf(notes: readonly Note[]): Map<string, BoardSummary> {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    if (note.board_id === null || note.deleted_at !== null) continue;
    const list = groups.get(note.board_id) ?? [];
    list.push(note);
    groups.set(note.board_id, list);
  }
  return new Map([...groups].map(([id, points]) => [id, boardSummary(points)]));
}

/** The place after the last point: the new point goes to the bottom of the board. */
export function nextPosition(points: readonly Pick<Note, "position">[]): number {
  let max = 0;
  for (const point of points) if ((point.position ?? 0) > max) max = point.position ?? 0;
  return Math.floor(max) + 1;
}

/**
 * The place between two neighbours after a move — one row written, the others keep theirs.
 * At an edge the point steps one past its neighbour.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

const TITLE_DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Aqtobe" });

/** «Доска · 24 сент.» — a name nobody has to type; the director renames it with one tap. */
export function defaultTitle(now: Date): string {
  return `Доска · ${TITLE_DATE.format(now)}`;
}

/** The title as it will be saved: trimmed, one to 120 characters, else the old one stays. */
export function cleanTitle(input: string, previous: string): string {
  const title = input.replace(/\s+/g, " ").trim().slice(0, 120);
  return title || previous;
}

/** Is this board on the wall right now: the board scene, this board, its time not over (D-102 §6). */
export function boardOnWall(state: TvState | null | undefined, boardId: string, now: Date): boolean {
  if (!state || state.scene !== "board" || state.board_id !== boardId || !state.board_until) return false;
  return new Date(state.board_until).getTime() > now.getTime();
}

/** When the sweep takes a deleted board out of the bin for good. */
export function boardExpiresAt(board: MindBoard): Date {
  return new Date(new Date(board.deleted_at ?? board.updated_at).getTime() + BOARD_TRASH_DAYS * DAY_MS);
}

/** Live boards (latest touched first) and the bin (latest deletion first, not past its three days). */
export function splitBoards(boards: readonly MindBoard[], now: Date): { live: MindBoard[]; trash: MindBoard[] } {
  const live: MindBoard[] = [];
  const trash: MindBoard[] = [];
  for (const board of boards) {
    if (board.deleted_at === null) live.push(board);
    else if (boardExpiresAt(board).getTime() > now.getTime()) trash.push(board);
  }
  live.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  trash.sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
  return { live, trash };
}
