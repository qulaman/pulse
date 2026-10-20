"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError, NetworkError } from "@/lib/net";
import { dropBoard, keepBoard } from "@/lib/notes/pending";
import { noteKeys, type Note } from "@/lib/notes/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { boardKeys, type MindBoard } from "./queries";

/**
 * Boards (D-102) are written straight through PostgREST under RLS, like notes. A new
 * board is kept on the phone until it lands — its points may be dictated without network
 * and must not reach the server before it (the replay sends boards first). Renaming,
 * deleting and restoring need the network: they are rare, and a board renamed «later»
 * is worse than an honest «нет связи».
 */

type Me = { userId: string; companyId: string };

type NewBoard = { id: string; title: string; client_request_id: string };

const OFFLINE = "Нет связи — не получилось, попробуйте ещё раз";
const KEPT_OFFLINE = "Нет связи — доска на телефоне, отправлю сам";
const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

/** Creates of boards and notes run in one line: a point never overtakes its board. */
const SERIAL = { id: "notes" };

/** One insert keyed by `client_request_id` (принцип 7): a replay reads the landed row back. */
export async function insertBoard(me: Me, row: NewBoard): Promise<MindBoard> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("mind_boards")
    .insert({ ...row, company_id: me.companyId, user_id: me.userId })
    .select("*")
    .single();
  if (!error) return data;
  if (error.code === "23505") {
    const again = await supabase.from("mind_boards").select("*").eq("client_request_id", row.client_request_id).single();
    if (!again.error) return again.data;
  }
  throw new Error(error.message);
}

/** A board the cache has not seen goes on top; a known one is replaced in place. */
export function upsertBoardCached(queryClient: QueryClient, userId: string, row: MindBoard) {
  queryClient.setQueryData<MindBoard[]>(boardKeys.mine(userId), (rows) => {
    const list = rows ?? [];
    return list.some((board) => board.id === row.id) ? list.map((board) => (board.id === row.id ? row : board)) : [row, ...list];
  });
}

function patchBoard(queryClient: QueryClient, userId: string, id: string, fields: Partial<MindBoard>): MindBoard[] | undefined {
  const key = boardKeys.mine(userId);
  const before = queryClient.getQueryData<MindBoard[]>(key);
  queryClient.setQueryData<MindBoard[]>(key, (rows) => (rows ?? []).map((board) => (board.id === id ? { ...board, ...fields } : board)));
  return before;
}

/** The server's refusals in words; anything else unknown is the generic line, never a code. */
const REFUSALS: Record<string, string> = {
  bad_board: "Этой доски уже нет — обновил список",
  bad_parent: "Доска изменилась — вернул как было",
  forbidden: "Эта доска не ваша",
  "row-level security": "Эта доска не ваша",
};

function fail(error: unknown) {
  if (isNetworkError(error)) {
    toast(OFFLINE);
    return;
  }
  const message = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  const known = Object.keys(REFUSALS).find((code) => message.includes(code));
  toast(known ? REFUSALS[known] : GENERIC_ERROR);
}

/** «Новая доска»: on screen from the tap, on the phone until the server has it. */
export function useCreateBoard(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["notes", "board-create"],
    scope: SERIAL,
    mutationFn: (row: NewBoard) => insertBoard(me as Me, row),
    onMutate: async (row) => {
      if (!me) return;
      const now = new Date().toISOString();
      void keepBoard({ id: row.id, userId: me.userId, companyId: me.companyId, crid: row.client_request_id, title: row.title, createdAt: now });
      await queryClient.cancelQueries({ queryKey: boardKeys.mine(me.userId) });
      upsertBoardCached(queryClient, me.userId, {
        company_id: me.companyId,
        user_id: me.userId,
        deleted_at: null,
        pinned_at: null,
        finished_at: null,
        created_at: now,
        updated_at: now,
        ...row,
      });
    },
    onSuccess: (row) => {
      void dropBoard(row.id);
      if (me) upsertBoardCached(queryClient, me.userId, row);
    },
    onError: (error, row) => {
      // no network: the board stays on screen and on the phone, the replay sends it
      if (isNetworkError(error)) {
        toast(KEPT_OFFLINE);
        return;
      }
      void dropBoard(row.id);
      if (me) queryClient.setQueryData<MindBoard[]>(boardKeys.mine(me.userId), (rows) => (rows ?? []).filter((board) => board.id !== row.id));
      fail(error);
    },
  });
}

/** What a board's own row can be told from the phone. */
type BoardFields = Partial<Pick<MindBoard, "title" | "deleted_at" | "pinned_at" | "finished_at">>;
const BOARD_FIELDS = ["title", "deleted_at", "pinned_at", "finished_at"] as const;

type BoardInput = { id: string; title?: string; on?: boolean };

/** One field of a board, online only; the cache moves first and comes back on an error. */
function useBoardPatch(me: { userId: string } | undefined, fields: (input: BoardInput) => BoardFields) {
  const queryClient = useQueryClient();

  return useMutation({
    scope: SERIAL,
    mutationFn: async (input: BoardInput) => {
      const supabase = createBrowserSupabase();
      const change = fields(input);
      const row: BoardFields = {};
      for (const key of BOARD_FIELDS) if (key in change) Object.assign(row, { [key]: change[key] });
      const { error } = await supabase.from("mind_boards").update(row).eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!me) return undefined;
      await queryClient.cancelQueries({ queryKey: boardKeys.mine(me.userId) });
      return { snapshot: patchBoard(queryClient, me.userId, input.id, fields(input)) };
    },
    onError: (error, _input, context) => {
      if (me && context?.snapshot) queryClient.setQueryData(boardKeys.mine(me.userId), context.snapshot);
      fail(error);
    },
  });
}

export function useRenameBoard(me: { userId: string } | undefined) {
  return useBoardPatch(me, ({ title }) => ({ title: title ?? "" }));
}

/** Soft delete: the board and its points wait in the bin three days (D-102 §3). */
export function useDeleteBoard(me: { userId: string } | undefined) {
  return useBoardPatch(me, () => ({ deleted_at: new Date().toISOString() }));
}

export function useRestoreBoard(me: { userId: string } | undefined) {
  return useBoardPatch(me, () => ({ deleted_at: null }));
}

/** «Закрепить» (`on: true`) / «Открепить»: a pinned board stays at the top of the list (D-140). */
export function usePinBoard(me: { userId: string } | undefined) {
  return useBoardPatch(me, ({ on }) => ({ pinned_at: on ? new Date().toISOString() : null }));
}

/** «Завершить доску» (`on: true`) / «Вернуть в работу»: the meeting is over, the board stays whole (D-140). */
export function useFinishBoard(me: { userId: string } | undefined) {
  return useBoardPatch(me, ({ on }) => ({ finished_at: on ? new Date().toISOString() : null }));
}

export type CopyBoard = { source: string; id: string; title: string; client_request_id: string };

/**
 * «Новая доска из этой» (D-140): the open points of a board with their open sub-points on a
 * new board — `mind_board_copy`, one transaction, a replay with the same key hands back the
 * same board. Online only, like a rename: a copy made «later» would be a different board from
 * the one meant. A plain call, not a hook: a toast's «2 → в новую доску» may be pressed after
 * the screen that showed it is gone (the remote, a board left behind), and still must work.
 */
export async function copyBoard(queryClient: QueryClient, me: Me | undefined, input: CopyBoard): Promise<MindBoard> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError();
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.rpc("mind_board_copy", {
    p_source: input.source,
    p_id: input.id,
    p_title: input.title,
    p_client_request_id: input.client_request_id,
  });
  if (error) throw new Error(error.message);
  const row = data as MindBoard;
  if (me) {
    upsertBoardCached(queryClient, me.userId, row);
    // the copied points come by Realtime too; reading them now draws the new board whole at once
    await queryClient.invalidateQueries({ queryKey: noteKeys.mine(me.userId) });
  }
  return row;
}

/** What went wrong with a board write, in words — for callers outside a mutation. */
export function boardFailure(error: unknown) {
  fail(error);
}

/** Where a line goes: a board and its place there, as a point. */
export type MoveTo = { boardId: string; position: number };

/**
 * «Перенести на доску…» of a point, «На доску…» of a thought (D-140): one row written — the
 * server carries the point's sub-points with it (`trg_notes_branch_follow`); the cache moves
 * the whole branch at the tap so neither board shows an orphan for the Realtime second. A
 * thought on a board is a point: no pin, no reminder. Online only — a board changed «later»
 * under the director's eyes is worse than an honest «нет связи».
 */
export function useMovePoint(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    scope: { id: "notes" },
    mutationFn: async ({ note, to }: { note: Note; to: MoveTo }) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError();
      const supabase = createBrowserSupabase();
      const { error } = await supabase
        .from("notes")
        .update({ board_id: to.boardId, position: to.position, parent_id: null, pinned: false, remind_at: null })
        .eq("id", note.id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ note, to }) => {
      if (!me) return undefined;
      const key = noteKeys.mine(me.userId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (rows) =>
        (rows ?? []).map((row) =>
          row.id === note.id
            ? { ...row, board_id: to.boardId, position: to.position, parent_id: null, pinned: false, remind_at: null }
            : row.parent_id === note.id
              ? { ...row, board_id: to.boardId }
              : row,
        ),
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (me && context?.snapshot) queryClient.setQueryData(noteKeys.mine(me.userId), context.snapshot);
      fail(error);
    },
  });
}

/** «Удалить навсегда» from the bin: the row goes, its points go with it (cascade). */
export function usePurgeBoards(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      if (ids.length === 0) return;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("mind_boards").delete().in("id", ids).not("deleted_at", "is", null);
      if (error) throw error;
    },
    onMutate: async ({ ids }) => {
      if (!me) return undefined;
      const key = boardKeys.mine(me.userId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<MindBoard[]>(key);
      const gone = new Set(ids);
      queryClient.setQueryData<MindBoard[]>(key, (rows) => (rows ?? []).filter((board) => !gone.has(board.id)));
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (me && context?.snapshot) queryClient.setQueryData(boardKeys.mine(me.userId), context.snapshot);
      fail(error);
    },
  });
}
