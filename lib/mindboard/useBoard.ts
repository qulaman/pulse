"use client";

import { useMemo } from "react";

import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import type { PendingBoard } from "@/lib/notes/pending";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { usePendingOverlay } from "@/lib/notes/usePendingOverlay";
import { useMe, type Me } from "@/lib/tasks/queries";
import { useTvBoardControl, useTvControl, useTvWeekBoard } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";

import { useCreateBoard, useDeleteBoard, useFinishBoard, useMovePoint, usePinBoard, useRenameBoard, useRestoreBoard } from "./mutations";
import { useBoards, type MindBoard } from "./queries";

const NONE: Note[] = [];

/** A board made without network, as the screens draw it until the server has it. */
function keptBoard(kept: PendingBoard): MindBoard {
  return {
    id: kept.id,
    company_id: kept.companyId,
    user_id: kept.userId,
    title: kept.title,
    deleted_at: null,
    pinned_at: null,
    finished_at: null,
    client_request_id: kept.crid,
    created_at: kept.createdAt,
    updated_at: kept.createdAt,
  };
}

/**
 * The data behind a board screen (D-102, D-121, D-140, D-177), phone and desk alike: the board —
 * from the server or, made without network, from this device — and its live lines from the one
 * notes cache with what still waits here laid over them (D-95, `usePendingOverlay`). `typed` —
 * lines the desk shows from the keystroke until the cache has them; they never cover a line that
 * already is here.
 */
export function useBoardRows(id: string, typed: readonly Note[] = NONE) {
  const me = useMe();
  const userId = me.data?.userId;
  const notes = useNotes(userId);
  const boards = useBoards(userId);
  const heard = useReplayHearing();
  const tv = useTvState();
  const pending = usePendingNotes(userId);
  const overlay = usePendingOverlay(pending, notes.data ?? NONE, { board: id });

  const board: MindBoard | null = useMemo(() => {
    const found = boards.data?.find((row) => row.id === id);
    if (found) return found;
    const kept = pending.boards.find((entry) => entry.id === id);
    return kept ? keptBoard(kept) : null;
  }, [boards.data, pending.boards, id]);

  const rows = useMemo(() => {
    if (typed.length === 0) return overlay.rows;
    const here = new Set(overlay.rows.map((row) => row.id));
    return [...overlay.rows, ...typed.filter((row) => !here.has(row.id) && row.deleted_at === null)];
  }, [overlay.rows, typed]);
  const phone: ReadonlySet<string> = useMemo(() => new Set(overlay.phone.keys()), [overlay.phone]);

  return {
    id,
    me,
    notes,
    boards,
    heard,
    tv,
    board,
    rows,
    /** Lines only on this device so far: nothing to edit or move until they land. */
    phone,
    /** Made on this device and not on the server yet (in the cache or not). */
    owed: overlay.owed,
    /** «ждёт связи»: owed with no network, or stuck for a while. */
    late: overlay.waiting,
    online: overlay.online,
    loading: me.isLoading || notes.isLoading || boards.isLoading || !me.data,
  };
}

export type BoardData = ReturnType<typeof useBoardRows>;

/** Every write a board screen makes: its lines, the board itself, and the wall. */
export function useBoardWrites(me: Me | undefined) {
  return {
    create: useCreateNote(me),
    update: useUpdateNote(me),
    remove: useDeleteNote(me),
    rename: useRenameBoard(me),
    deleteBoard: useDeleteBoard(me),
    restoreBoard: useRestoreBoard(me),
    pin: usePinBoard(me),
    finish: useFinishBoard(me),
    createBoard: useCreateBoard(me),
    movePoint: useMovePoint(me),
    control: useTvControl(),
    boardControl: useTvBoardControl(),
    weekBoard: useTvWeekBoard(),
  };
}

export type BoardWrites = ReturnType<typeof useBoardWrites>;
