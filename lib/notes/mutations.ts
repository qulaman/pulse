"use client";

import { useMutation, useMutationState, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError, NetworkError } from "@/lib/net";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { claim, dropCreate, hasCreate, keepCreate, keepEdit, release, settleEdit, type NoteFields } from "./pending";
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
  /** A point of a board (D-102). */
  board_id?: string | null;
  position?: number | null;
  /** A sub-point of a board (D-121). */
  parent_id?: string | null;
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
const KEPT_OFFLINE = "Нет связи — сохранил на телефоне, отправлю сам";
/** The server's branch rule said no (D-121): the move is undone on screen too. */
const REFUSED_BRANCH = "Не получилось сложить ветку — вернул как было";

/** The server refused a branch (`bad_parent`, D-121): not a point of this board, or one level too deep. */
export function refusedBranch(error: unknown): boolean {
  return error instanceof Error && /bad_parent/.test(error.message);
}

/**
 * A sub-point whose point is still only on the phone (D-121): the server refuses it until the
 * point lands. That is not a failure — it waits like a thought without network: retried on
 * the network's beat, then left to the replay, which always sends the point first.
 */
export class WaitsForPoint extends NetworkError {
  constructor() {
    super("Подпункт ждёт свой пункт");
    this.name = "WaitsForPoint";
  }
}

/**
 * Creates and edits of notes run one after another (TanStack `scope`): an edit made
 * while its note is still on its way must not reach the server before the note does.
 */
const SERIAL = { id: "notes" };

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
  toast(refusedBranch(error) ? REFUSED_BRANCH : error instanceof Error ? error.message : GENERIC_ERROR);
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
    scope: SERIAL,
    mutationFn: async (row: NewNote) => {
      try {
        return await insertNote(me as Me, row);
      } catch (error) {
        // a sub-point typed under a point that has not left the phone yet (D-121)
        if (row.parent_id && refusedBranch(error) && (await hasCreate(row.parent_id))) throw new WaitsForPoint();
        throw error;
      }
    },
    onMutate: async (row) => {
      if (!me) return;
      const now = new Date().toISOString();
      // on the phone first: a tab closed before the insert lands must not lose the thought (D-95);
      // while this mutation owns it (even paused offline), the replay leaves it alone
      claim(row.id);
      void keepCreate({
        id: row.id,
        userId: me.userId,
        companyId: me.companyId,
        crid: row.client_request_id,
        text: row.text,
        createdAt: now,
        audio: null,
        audioPath: null,
        inboxId: null,
        boardId: row.board_id ?? null,
        position: row.position ?? null,
        parentId: row.parent_id ?? null,
      });
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      upsertCached(queryClient, me.userId, {
        company_id: me.companyId,
        user_id: me.userId,
        raw_transcript: null,
        audio_path: null,
        inbox_item_id: null,
        pinned: false,
        board_id: null,
        position: null,
        parent_id: null,
        done_at: null,
        converted_task_id: null,
        converted_announcement_id: null,
        converted_at: null,
        deleted_at: null,
        remind_at: null,
        reminded_at: null,
        created_at: now,
        updated_at: now,
        ...row,
      });
    },
    onSuccess: (row) => {
      void dropCreate(row.id);
      if (me) upsertCached(queryClient, me.userId, row);
    },
    onError: (error, row) => {
      // a dead network after all retries: the note stays on screen and on the phone,
      // the replay sends it when the network is back (a sub-point — right after its point)
      if (isNetworkError(error)) {
        if (!(error instanceof WaitsForPoint)) toast(KEPT_OFFLINE);
        return;
      }
      void dropCreate(row.id);
      if (me) queryClient.setQueryData<Note[]>(keyOf(me.userId), (rows) => (rows ?? []).filter((note) => note.id !== row.id));
      fail(error);
    },
    onSettled: (_data, _error, row) => {
      release(row.id);
    },
  });
}

const UPDATE_KEY = ["notes", "update"] as const;

/**
 * Text (autosave), «Закрепить» and «Напомнить» — the last writer wins, as on any note
 * app. The fields are kept on the phone until the server has them (D-95).
 */
export function useUpdateNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: UPDATE_KEY,
    scope: SERIAL,
    mutationFn: async ({ id, ...fields }: { id: string } & NoteFields) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id, ...fields }) => {
      if (!me) return undefined;
      void keepEdit(me.userId, id, fields);
      await queryClient.cancelQueries({ queryKey: keyOf(me.userId) });
      // a new time rings again: the cache says so before the trigger does
      const shown: Partial<Note> = "remind_at" in fields ? { ...fields, reminded_at: null } : fields;
      return { snapshot: patch(queryClient, me.userId, id, shown) };
    },
    onSuccess: (_data, { id, ...fields }) => {
      void settleEdit(id, fields);
    },
    onError: (error, { id, ...fields }, context) => {
      // the edit stays on screen and on the phone; the replay writes it later
      if (isNetworkError(error)) {
        toast(KEPT_OFFLINE);
        return;
      }
      void settleEdit(id, fields);
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

/** The toast of a delete: what happened, and the way back. */
export type DeleteWords = { done: string; undo: string };

const DELETE_WORDS: DeleteWords = { done: "Удалил · в корзине", undo: "Отменить" };

const instant = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/**
 * Soft delete (D-75 §7): the row moves to the bin at once, «Отменить» in the toast
 * brings it back. The bin keeps it after the toast is gone (D-81). A point of a board takes
 * its live sub-points along — one UPDATE, the server's trigger stamps the branch with the
 * same time (D-121); the cache hides them at once instead of waiting for Realtime. `at` —
 * the time to stamp, so the phone and the server agree on it to the millisecond; `words` —
 * this delete's own toast («Пункт и 2 подпункта в корзине»).
 */
export function useDeleteNote(me: { userId: string } | undefined, words: DeleteWords = DELETE_WORDS) {
  const queryClient = useQueryClient();
  const restore = useRestoreNote(me);

  return useMutation({
    mutationFn: async ({ id, at }: { id: string; at?: string; words?: DeleteWords }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("notes").update({ deleted_at: at ?? new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id, at }) => {
      if (!me) return undefined;
      const key = keyOf(me.userId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<Note[]>(key);
      const stamp = at ?? new Date().toISOString();
      queryClient.setQueryData<Note[]>(key, (rows) =>
        (rows ?? []).map((note) =>
          note.id === id || (note.parent_id === id && note.deleted_at === null) ? { ...note, deleted_at: stamp } : note,
        ),
      );
      return { snapshot };
    },
    onSuccess: (_data, { id, words: said = words }) => {
      toast(said.done, {
        action: { label: said.undo, onClick: () => restore.mutate({ id }) },
      });
    },
    onError: (error, _input, context) => {
      if (me && context) rollback(queryClient, me.userId, context.snapshot);
      fail(error);
    },
  });
}

/**
 * «Вернуть» from the bin, and «Отменить» of a delete: the same row, audio included. A point
 * brings back exactly the sub-points that went with it (the same `deleted_at`); a sub-point
 * back without its point comes back as a point where its point stood — the server's rules
 * (D-121), drawn by the cache before Realtime confirms them.
 */
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
      const key = keyOf(me.userId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<Note[]>(key);
      const rows = snapshot ?? [];
      const row = rows.find((note) => note.id === id);
      const went = instant(row?.deleted_at ?? null);
      const point = row?.parent_id ? rows.find((note) => note.id === row.parent_id) : undefined;
      const alone = Boolean(row?.parent_id) && (!point || point.deleted_at !== null || point.parent_id !== null);
      queryClient.setQueryData<Note[]>(key, (list) =>
        (list ?? []).map((note) => {
          if (note.id === id) return { ...note, deleted_at: null, ...(alone ? { parent_id: null, position: point?.position ?? note.position } : {}) };
          if (note.parent_id === id && note.deleted_at !== null && instant(note.deleted_at) === went) return { ...note, deleted_at: null };
          return note;
        }),
      );
      return { snapshot };
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
