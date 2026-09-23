"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError } from "@/lib/net";
import { dropBoard, keepBoard } from "@/lib/notes/pending";
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

function fail(error: unknown) {
  toast(isNetworkError(error) ? OFFLINE : error instanceof Error ? error.message : GENERIC_ERROR);
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

/** One field of a board, online only; the cache moves first and comes back on an error. */
function useBoardPatch(me: { userId: string } | undefined, fields: (input: { id: string; title?: string }) => Partial<MindBoard>) {
  const queryClient = useQueryClient();

  return useMutation({
    scope: SERIAL,
    mutationFn: async (input: { id: string; title?: string }) => {
      const supabase = createBrowserSupabase();
      const change = fields(input);
      const { error } = await supabase
        .from("mind_boards")
        .update({ ...("title" in change ? { title: change.title } : {}), ...("deleted_at" in change ? { deleted_at: change.deleted_at } : {}) })
        .eq("id", input.id);
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
