import type { Note } from "@/lib/notes/queries";

/** What «В мысли» puts back on a thought: the reminder and the pin «На доску» cleared (D-177). */
export type ThoughtRestore = { remind_at: string | null; pinned: boolean };

/**
 * Why a line of a board cannot go back to «Мысли», in words; null — it can. Only a plain line
 * goes back: a point with sub-points would leave them orphaned on the board (the branch
 * follows only to another board), a drawing lives only on a board (`notes_sketch_check`), and a
 * handed-out point is a task's record of the meeting.
 */
export function pointToThoughtRefusal(note: Pick<Note, "id" | "board_id" | "parent_id" | "sketch" | "converted_task_id">, rows: readonly Pick<Note, "parent_id">[]): string | null {
  if (!note.board_id) return null;
  // its «Отменить» puts a line back as a point: a sub-point would come back in the wrong place
  if (note.parent_id) return "Подпункт остаётся на доске — сначала сделайте его пунктом (Shift+Tab)";
  if (note.sketch) return "Рисунок живёт только на доске";
  if (note.converted_task_id) return "Пункт уже поручен — он остаётся на доске";
  if (rows.some((row) => row.parent_id === note.id)) return "У пункта есть подпункты — он остаётся на доске";
  return null;
}
