"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

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

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

type Cache = Note[] | undefined;

function keyOf(userId: string) {
  return noteKeys.mine(userId);
}

/** Optimistic edit of one row in the feed; the snapshot is the way back on an error. */
function patch(queryClient: QueryClient, userId: string, id: string, fields: Partial<Note>): Cache {
  const key = keyOf(userId);
  const before = queryClient.getQueryData<Note[]>(key);
  queryClient.setQueryData<Note[]>(key, (rows) =>
    (rows ?? []).map((note) => (note.id === id ? { ...note, ...fields } : note)),
  );
  return before;
}

function restore(queryClient: QueryClient, userId: string, snapshot: Cache) {
  if (snapshot) queryClient.setQueryData<Note[]>(keyOf(userId), snapshot);
}

/**
 * Typing on the notes screen is already a note: the parser has nothing to decide here,
 * so the row is inserted straight through PostgREST (RLS checks the author).
 */
export function useCreateNote(me: { userId: string; companyId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ text }: { text: string }): Promise<Note> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notes")
        .insert({
          text,
          company_id: (me as { companyId: string }).companyId,
          user_id: (me as { userId: string }).userId,
          client_request_id: crypto.randomUUID(),
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (row) => {
      if (!me) return;
      queryClient.setQueryData<Note[]>(keyOf(me.userId), (rows) =>
        (rows ?? []).some((note) => note.id === row.id) ? (rows ?? []) : [row, ...(rows ?? [])],
      );
    },
    onError: (error) => toast(error instanceof Error ? error.message : GENERIC_ERROR),
  });
}

/** Text (autosave) and «Закрепить» — the last writer wins, as on any note app. */
export function useUpdateNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
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
      if (me && context) restore(queryClient, me.userId, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
  });
}

/** Soft delete with a way back: the row leaves the feed at once, «Отменить» returns it. */
export function useDeleteNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await softDeleteNotes([id]);
    },
    onMutate: async ({ id }) => {
      if (!me) return undefined;
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      const key = keyOf(me.userId);
      const snapshot = queryClient.getQueryData<Note[]>(key);
      queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).filter((note) => note.id !== id));
      return { snapshot };
    },
    onSuccess: (_data, { id }) => {
      toast("Удалил", {
        action: {
          label: "Отменить",
          onClick: () => {
            void restoreNotes([id]).then(() => {
              if (me) void queryClient.invalidateQueries({ queryKey: keyOf(me.userId) });
            });
          },
        },
      });
    },
    onError: (error, _input, context) => {
      if (me && context) restore(queryClient, me.userId, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
  });
}
