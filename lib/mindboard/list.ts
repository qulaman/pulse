import type { Note } from "@/lib/notes/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import type { TvState } from "@/lib/tv/queries";

import type { MindBoard } from "./queries";
import { hasContent, pointLabel } from "./sketch";

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

/**
 * What a board card and the status screen say (D-121): the points of the agenda, their
 * sub-points apart, how many points are ticked — counted as the wall counts them, by the
 * points — and the latest line said. A sub-point whose point is not among the rows is drawn
 * as a point (`branchesOf`), so it is counted as one.
 */
export type BoardSummary = { total: number; subs: number; done: number; lastAt: string | null };

export function boardSummary(points: readonly Note[]): BoardSummary {
  const ids = new Set(points.map((point) => point.id));
  let total = 0;
  let subs = 0;
  let done = 0;
  let lastAt: string | null = null;
  for (const point of points) {
    const sub = point.parent_id !== null && ids.has(point.parent_id);
    if (sub) subs += 1;
    else {
      total += 1;
      if (point.done_at) done += 1;
    }
    if (!lastAt || point.created_at > lastAt) lastAt = point.created_at;
  }
  return { total, subs, done, lastAt };
}

/** «5 пунктов · 3 подпункта · 2 отмечено» — or «Пока пусто» for a board with nothing on it yet. */
export function summaryLine(summary: BoardSummary | undefined): string {
  const total = summary?.total ?? 0;
  if (total === 0) return "Пока пусто";
  const subs = summary?.subs ?? 0;
  const done = summary?.done ?? 0;
  return [
    `${total} ${pluralRu(total, ["пункт", "пункта", "пунктов"])}`,
    subs > 0 ? `${subs} ${pluralRu(subs, ["подпункт", "подпункта", "подпунктов"])}` : "",
    done > 0 ? `${done} ${pluralRu(done, ["отмечен", "отмечено", "отмечено"])}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
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

/**
 * The boards in the order of the list (D-140): live ones — the one on the wall first, then
 * the pinned (the latest pinned first), then the latest touched; finished ones apart (the
 * latest finished first) — their meeting is over, the board stays whole; the bin — the latest
 * deletion first, not past its three days.
 */
export function splitBoards(
  boards: readonly MindBoard[],
  now: Date,
  onWallId: string | null = null,
): { live: MindBoard[]; finished: MindBoard[]; trash: MindBoard[] } {
  const live: MindBoard[] = [];
  const finished: MindBoard[] = [];
  const trash: MindBoard[] = [];
  for (const board of boards) {
    if (board.deleted_at !== null) {
      if (boardExpiresAt(board).getTime() > now.getTime()) trash.push(board);
    } else if (board.finished_at) finished.push(board);
    else live.push(board);
  }
  const rank = (board: MindBoard) => (board.id === onWallId ? 0 : board.pinned_at ? 1 : 2);
  live.sort((a, b) => rank(a) - rank(b) || (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "") || b.updated_at.localeCompare(a.updated_at));
  finished.sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));
  trash.sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
  return { live, finished, trash };
}

/** « · 24 сент.» — the tail `defaultTitle` and `nextTitle` write: a day and a short month, nothing else. */
const DATED = /\s*·\s*\d{1,2}\s+(?:янв|февр?|мар|апр|мая|июн|июл|авг|сент?|окт|нояб?|дек)\.?$/i;

/**
 * The name of «Новая доска из этой» (D-140): the same meeting on another day —
 * «Планёрка · 20 окт.» → «Планёрка · 27 окт.»; a name without a date gets one.
 */
export function nextTitle(title: string, now: Date): string {
  const base = title.replace(DATED, "").trim() || "Доска";
  return cleanTitle(`${base} · ${TITLE_DATE.format(now)}`, title);
}

/**
 * The points «Новая доска из этой» takes (the same rule as `mind_board_copy`): live points
 * with words, not ticked, not handed over. Their open sub-points go with them.
 */
export function openPoints(rows: readonly Note[]): Note[] {
  const ids = new Set(rows.map((row) => row.id));
  return rows
    .filter((row) => (row.parent_id === null || !ids.has(row.parent_id)) && row.deleted_at === null)
    .filter((row) => hasContent(row) && row.done_at === null && row.converted_task_id === null)
    .sort(byPlace);
}

/** The first lines of the first points — what a closed board card shows of the board. */
export function previewOf(rows: readonly Note[], count = 2): string[] {
  const ids = new Set(rows.map((row) => row.id));
  return rows
    .filter((row) => (row.parent_id === null || !ids.has(row.parent_id)) && row.deleted_at === null && hasContent(row))
    .sort(byPlace)
    .slice(0, count)
    .map((row) => pointLabel(row.text, row.sketch).split("\n")[0].trim());
}

/**
 * The board as text for a messenger (D-140): the title, the points numbered as the wall
 * numbers them, a tick on the done ones, the sub-points under their point.
 */
export function boardText(title: string, rows: readonly Note[]): string {
  const ids = new Set(rows.map((row) => row.id));
  const live = rows.filter((row) => row.deleted_at === null && hasContent(row));
  const top = live.filter((row) => row.parent_id === null || !ids.has(row.parent_id)).sort(byPlace);
  const lines = [title.trim(), ""];
  top.forEach((point, index) => {
    const [head, ...rest] = pointLabel(point.text, point.sketch).split("\n");
    // a drawing does not travel as text: the line says there is one
    const drawn = point.sketch && point.text.trim() ? " (рисунок)" : "";
    lines.push(`${index + 1}. ${point.done_at ? "✓ " : ""}${head.trim()}${drawn}`);
    for (const more of rest) if (more.trim()) lines.push(`   ${more.trim()}`);
    for (const sub of live.filter((row) => row.parent_id === point.id).sort(byPlace)) {
      lines.push(`   – ${sub.done_at ? "✓ " : ""}${pointLabel(sub.text, sub.sketch).replace(/\s*\n\s*/g, " ")}`);
    }
  });
  return lines.join("\n").trim();
}
