import type { Note } from "@/lib/notes/queries";
import type { HandedStage, TvBoardData, TvBoardLeaf } from "@/lib/tv/board";
import { mapFits } from "@/lib/tv/board";
import type { BoardView } from "@/lib/tv/state";

import { hasContent, sketchFrom } from "./sketch";
import { branchesOf } from "./tree";

/**
 * The board as the wall will draw it (D-140), from the phone's own cache — the preview of the
 * board screen. The same rule as `tv_board()` (D-121 §8, D-141): points of the top level with words
 * or a drawing, each with its sub-points alike, in the order of the board; «→ Марат · в работе» beside a
 * handed line unless it was revoked (D-144); the spotlight only on a point that is there. The wall is not
 * asked: the preview must show the board before it goes up. Pure — tests in `wall.test.ts`.
 */

/** What a handed line became, as the wall says it: a first name, whether it is done, how far it went (D-144). */
export type Handed = { assignee: string | null; done: boolean; stage?: HandedStage | null };

export function wallBoardOf(
  board: { id: string; title: string; updated_at: string },
  rows: readonly Note[],
  wall: { view: BoardView; focus: string | null },
  handed: (row: Note) => Handed | null,
): TvBoardData {
  const leaf = (row: Note): TvBoardLeaf => {
    const task = row.converted_task_id ? handed(row) : null;
    return {
      id: row.id,
      text: row.text,
      done: row.done_at !== null,
      created_at: row.created_at,
      assignee: task?.assignee ?? null,
      handed_done: task?.done ?? false,
      stage: task?.stage ?? null,
      sketch: sketchFrom(row.sketch),
    };
  };
  // the wall draws no orphans: a sub-point whose point has no words nor drawing is not on it at all
  const items = branchesOf(rows.filter((row) => row.deleted_at === null && hasContent(row)))
    .filter((branch) => branch.point.parent_id === null)
    .map((branch) => ({ ...leaf(branch.point), children: branch.children.map(leaf) }));
  return {
    id: board.id,
    title: board.title,
    total: items.length,
    done: items.filter((item) => item.done).length,
    updated_at: board.updated_at,
    view: wall.view,
    focus: wall.focus && items.some((item) => item.id === wall.focus) ? wall.focus : null,
    items,
  };
}

/** What the preview says under the picture: the map asked for but too big for it — the wall draws the list. */
export function wallNote(board: Pick<TvBoardData, "view" | "items">): string | null {
  if (board.items.length === 0) return "Пока пусто — пункты появятся, как только их скажут";
  if (board.view === "map" && !mapFits(board.items.length)) return "Больше 12 пунктов — карта не поместится, стена покажет список";
  return null;
}
