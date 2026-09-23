"use client";

import { useMutation, useMutationState, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { noteKeys, type Note } from "./queries";

/**
 * Notes are soft-deleted (D-75 §7): «Отменить» in the toast must bring back the very
 * same row, audio and raw transcript included. Both helpers are plain functions, not
 * hooks — the toast that calls them lives in the ingest store, outside React.
 */

export async function softDeleteNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createBrowserSupabase();
  await supabase.from("notes").update({ deleted_at: new Date().toISOString() }).in("id", ids);
}

export async function restoreNotes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createBrowserSupabase();
  await supabase.from("notes").update({ deleted_at: null }).in("id", ids);
}

type Me = { userId: string; companyId: string };

type NewNote = {
  id: string;
  text: string;
  client_request_id: string;
  audio_path?: string | null;
  inbox_item_id?: string | null;
};

/**
 * One insert under RLS, keyed by `client_request_id` (принцип 7). A replay after a lost
 * response hits the unique index — the row is already there, so it is read back
 * instead of failing the tap that created it.
 */
export async function insertNote(me: Me, row: NewNote): Promise<Note> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("notes")
    .insert({ ...row, company_id: me.companyId, user_id: me.userId })
    .select("*")
    .single();
  if (!error) return data;
  if (error.code === "23505") {
    const again = await supabase.from("notes").select("*").eq("client_request_id", row.client_request_id).single();
    if (!again.error) return again.data;
  }
  throw new Error(error.message);
}

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

function keyOf(userId: string) {
  return noteKeys.mine(userId);
}

/** A row the cache has not seen goes on top; a known one is replaced in place. */
export function upsertCached(queryClient: QueryClient, userId: string, row: Note) {
  queryClient.setQueryData<Note[]>(keyOf(userId), (rows) => {
    const list = rows ?? [];
    return list.some((note) => note.id === row.id)
      ? list.map((note) => (note.id === row.id ? row : note))
      : [row, ...list];
  });
}

/** Optimistic edit of one row; the snapshot is the way back on an error. */
function patch(queryClient: QueryClient, userId: string, id: string, fields: Partial<Note>): Note[] | undefined {
  const key = keyOf(userId);
  const before = queryClient.getQueryData<Note[]>(key);
  queryClient.setQueryData<Note[]>(key, (rows) =>
    (rows ?? []).map((note) => (note.id === id ? { ...note, ...fields } : note)),
  );
  return before;
}

function rollback(queryClient: QueryClient, userId: string, snapshot: Note[] | undefined) {
  if (snapshot) queryClient.setQueryData<Note[]>(keyOf(userId), snapshot);
}

function fail(error: unknown) {
  toast(error instanceof Error ? error.message : GENERIC_ERROR);
}

/**
 * Typing on the notes screen is already a note: the parser has nothing to decide here,
 * so the row goes straight through PostgREST. It is on screen from the tap — id and
 * idempotency key are minted on the client, a tap without network lands once later.
 */
export function useCreateNote(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["notes", "create"],
    mutationFn: (row: NewNote) => insertNote(me as Me, row),
    onMutate: async (row) => {
      if (!me) return;
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      const now = new Date().toISOString();
      upsertCached(queryClient, me.userId, {
        company_id: me.companyId,
        user_id: me.userId,
        raw_transcript: null,
        audio_path: null,
        inbox_item_id: null,
        pinned: false,
        converted_task_id: null,
        converted_announcement_id: null,
        converted_at: null,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        ...row,
      });
    },
    onSuccess: (row) => {
      if (me) upsertCached(queryClient, me.userId, row);
    },
    onError: (error, row) => {
      if (me) queryClient.setQueryData<Note[]>(keyOf(me.userId), (rows) => (rows ?? []).filter((note) => note.id !== row.id));
      fail(error);
    },
  });
}

const UPDATE_KEY = ["notes", "update"] as const;

/** Text (autosave) and «Закрепить» — the last writer wins, as on any note app. */
export function useUpdateNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: UPDATE_KEY,
    mutationFn: async ({ id, ...fields }: { id: string; text?: string; pinned?: boolean }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id, ...fields }) => {
      if (!me) return undefined;
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      return { snapshot: patch(queryClient, me.userId, id, fields) };
    },
    onError: (error, _input, context) => {
      if (me && context) rollback(queryClient, me.userId, context.snapshot);
      fail(error);
    },
  });
}

export type SaveState = "idle" | "saving" | "offline";

/** How the text of one note is doing on its way to the server — the receipt under the editor. */
export function useNoteSaveState(id: string): SaveState {
  const states = useMutationState({
    filters: { mutationKey: UPDATE_KEY, status: "pending" },
    select: (mutation) => ({
      id: (mutation.state.variables as { id?: string } | undefined)?.id,
      paused: mutation.state.isPaused,
    }),
  });
  const mine = states.filter((state) => state.id === id);
  if (mine.length === 0) return "idle";
  return mine.some((state) => state.paused) ? "offline" : "saving";
}

/**
 * Soft delete (D-75 §7): the row moves to the bin at once, «Отменить» in the toast
 * brings it back. The bin keeps it after the toast is gone (D-81).
 */
export function useDeleteNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();
  const restore = useRestoreNote(me);

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id }) => {
      if (!me) return undefined;
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      return { snapshot: patch(queryClient, me.userId, id, { deleted_at: new Date().toISOString() }) };
    },
    onSuccess: (_data, { id }) => {
      toast("Удалил · в корзине", {
        action: { label: "Отменить", onClick: () => restore.mutate({ id }) },
      });
    },
    onError: (error, _input, context) => {
      if (me && context) rollback(queryClient, me.userId, context.snapshot);
      fail(error);
    },
  });
}

/** «Вернуть» from the bin, and «Отменить» of a delete: the same row, audio included. */
export function useRestoreNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").update({ deleted_at: null }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id }) => {
      if (!me) return undefined;
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      return { snapshot: patch(queryClient, me.userId, id, { deleted_at: null }) };
    },
    onError: (error, _input, context) => {
      if (me && context) rollback(queryClient, me.userId, context.snapshot);
      fail(error);
    },
  });
}

/**
 * «Удалить навсегда» and «Очистить корзину» — the only hard delete of a note, and only
 * from the bin. The recording stays in the voice bucket: storage retention is D-18's.
 */
export function usePurgeNotes(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      if (ids.length === 0) return;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").delete().in("id", ids).not("deleted_at", "is", null);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ ids }) => {
      if (!me) return undefined;
      const key = keyOf(me.userId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<Note[]>(key);
      const gone = new Set(ids);
      queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).filter((note) => !gone.has(note.id)));
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (me && context) rollback(queryClient, me.userId, context.snapshot);
      fail(error);
    },
  });
}
