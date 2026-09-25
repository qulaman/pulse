"use client";

import { useMemo } from "react";

import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { useNotes } from "@/lib/notes/queries";
import { useMe } from "@/lib/tasks/queries";
import type { TvState } from "@/lib/tv/queries";
import { boardCounts, presenterPoints, type BoardCount, type PresenterPoint } from "@/lib/tv/presenter";
import { boardLive } from "@/lib/tv/state";

export type WallBoard = {
  /** The board on the wall right now (live scene, time not over) — whoever's it is. */
  boardId: string | null;
  /** That board among the director's own (null — another director's, or not loaded yet). */
  board: MindBoard | null;
  /** Its steps: points of the top level with words, in the order of the board. */
  points: PresenterPoint[];
  /** Every live board of the director, and each board's count as the wall keeps it. */
  boards: MindBoard[];
  counts: Map<string, BoardCount>;
  /** The notes or the boards are still on their way. */
  loading: boolean;
};

/**
 * The board on the wall as the remote sees it (D-121): which one, its points for the
 * presenter and the display, the shelf of the director's boards. The points come from the
 * notes cache the board screen writes to, so «Отметить» on the remote and a tick on the
 * phone are the same optimistic row.
 */
export function useWallBoard(row: TvState | null, now: Date): WallBoard {
  const me = useMe();
  const boards = useBoards(me.data?.userId);
  const notes = useNotes(me.data?.userId);
  const boardId = boardLive(row, now) ? (row?.board_id ?? null) : null;

  const points = useMemo(() => (boardId ? presenterPoints(notes.data ?? [], boardId) : []), [notes.data, boardId]);
  const counts = useMemo(() => boardCounts(notes.data ?? []), [notes.data]);

  return {
    boardId,
    board: boardId ? (boards.data?.find((board) => board.id === boardId) ?? null) : null,
    points,
    boards: boards.data ?? [],
    counts,
    loading: me.isLoading || boards.isLoading || notes.isLoading,
  };
}
