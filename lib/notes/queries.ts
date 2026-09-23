"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];

export const noteKeys = {
  root: ["notes"] as const,
  mine: (userId: string) => ["notes", "mine", userId] as const,
  count: (userId: string) => ["notes", "count", userId] as const,
  search: (userId: string, query: string) => ["notes", "search", userId, query] as const,
};

/** The first read: a few months of thoughts; older ones come by «Показать раньше» (D-95). */
const LIMIT = 300;
/** One tap of «Показать раньше». */
const OLDER_PAGE = 200;
/** The bin keeps three days of deletions (D-95); this is only a ceiling for a busy week. */
const TRASH_LIMIT = 200;
/** Server hits beyond the loaded feed. */
const SEARCH_LIMIT = 50;
/** Points of live boards (D-102): boards are short, so all of them come at once. */
const BOARD_POINTS_LIMIT = 1000;

/**
 * How many live rows the feed holds per author: grows with «Показать раньше», so a
 * refetch (reconnect, focus) brings back what the director already paged in.
 */
const depth = new Map<string, number>();

const newestFirst = (a: Note, b: Note) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

async function fetchNotes(userId: string): Promise<Note[]> {
  const supabase = createBrowserSupabase();
  // no user filter: RLS already leaves the author nothing but his own notes
  const [live, bin, points] = await Promise.all([
    supabase
      .from("notes")
      .select("*")
      .is("deleted_at", null)
      .is("board_id", null)
      .order("created_at", { ascending: false })
      .limit(depth.get(userId) ?? LIMIT),
    supabase
      .from("notes")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(TRASH_LIMIT),
    // the points of the boards live in the same cache: every edit, the replay and Realtime
    // treat them as the notes they are (D-102)
    supabase
      .from("notes")
      .select("*")
      .is("deleted_at", null)
      .not("board_id", "is", null)
      .order("position", { ascending: true })
      .limit(BOARD_POINTS_LIMIT),
  ]);
  if (live.error) throw new Error(live.error.message);
  if (bin.error) throw new Error(bin.error.message);
  if (points.error) throw new Error(points.error.message);
  return [...(live.data ?? []), ...(bin.data ?? []), ...(points.data ?? [])].sort(newestFirst);
}

/**
 * The director's own notes, live — the feed, «В деле» and the bin in one cache: a soft
 * delete moves a row to the bin and «Вернуть» moves it back, both as an UPDATE (D-81).
 * The Realtime filter narrows the socket to this author and RLS narrows it again on
 * the server — a note is private to whoever wrote it (D-75 §3).
 */
export function useNotes(userId: string | undefined) {
  return useRealtimeQuery<Note[], Note>({
    queryKey: noteKeys.mine(userId ?? ""),
    queryFn: () => fetchNotes(userId as string),
    channel: { table: "notes", filter: userId ? `user_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
    onEvent: (payload, queryClient) => {
      const key = noteKeys.mine(userId as string);
      // the counters of the status screen and the tabs follow every change
      void queryClient.invalidateQueries({ queryKey: noteKeys.count(userId as string) });
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<Note> | undefined)?.id;
        if (!id) return;
        queryClient.setQueryData<Note[]>(key, (rows) => (rows ?? []).filter((note) => note.id !== id));
        return;
      }
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        const row = payload.new as Note | undefined;
        if (!row?.id) {
          void queryClient.invalidateQueries({ queryKey: key });
          return;
        }
        queryClient.setQueryData<Note[]>(key, (rows) => {
          const rest = (rows ?? []).filter((note) => note.id !== row.id);
          // somebody else's row never lands here, the socket filter aside
          if (row.user_id !== userId) return rest;
          return [row, ...rest].sort(newestFirst);
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export type NoteCounts = { live: number; thoughts: number; converted: number };

/**
 * What the server holds, not what the screen loaded: the thoughts (live, not turned into
 * anything) and «В деле». Points of boards are counted by their boards (D-102). Two head-only counts, each of its own rows — a note landing
 * between the two requests can make one stale, never invent a row in the other.
 */
export function useNoteCounts(userId: string | undefined) {
  return useQuery({
    queryKey: noteKeys.count(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<NoteCounts> => {
      const supabase = createBrowserSupabase();
      const [thoughts, converted] = await Promise.all([
        supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("board_id", null)
          .is("converted_task_id", null)
          .is("converted_announcement_id", null),
        supabase
          .from("notes")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("board_id", null)
          .or("converted_task_id.not.is.null,converted_announcement_id.not.is.null"),
      ]);
      if (thoughts.error) throw new Error(thoughts.error.message);
      if (converted.error) throw new Error(converted.error.message);
      const counts = { thoughts: thoughts.count ?? 0, converted: converted.count ?? 0 };
      return { ...counts, live: counts.thoughts + counts.converted };
    },
  });
}

/**
 * «Показать раньше»: the next page of live notes below the oldest one on screen goes
 * into the same cache — edits, pins and Realtime then treat them like any other row.
 */
export function useOlderNotes(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) return 0;
      const key = noteKeys.mine(userId);
      const rows = queryClient.getQueryData<Note[]>(key) ?? [];
      const live = rows.filter((note) => note.deleted_at === null && note.board_id === null);
      const oldest = live.reduce<string | null>((min, note) => (min === null || note.created_at < min ? note.created_at : min), null);
      const supabase = createBrowserSupabase();
      let request = supabase.from("notes").select("*").is("deleted_at", null).is("board_id", null).order("created_at", { ascending: false }).limit(OLDER_PAGE);
      if (oldest) request = request.lt("created_at", oldest);
      const { data, error } = await request;
      if (error) throw new Error(error.message);
      const older = data ?? [];
      depth.set(userId, live.length + older.length);
      queryClient.setQueryData<Note[]>(key, (current) => {
        const list = current ?? [];
        const known = new Set(list.map((note) => note.id));
        return [...list, ...older.filter((note) => !known.has(note.id))].sort(newestFirst);
      });
      return older.length;
    },
  });
}

/** `%` and `_` are wildcards of ilike: a typed «50%» must mean the characters. */
function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The search past the loaded feed: live notes whose text or spoken original holds the
 * words, newest first. Only while older notes exist on the server — otherwise the
 * screen already searches everything it has.
 */
export function useNoteSearch(userId: string | undefined, query: string, enabled: boolean) {
  const needle = query.trim();
  return useQuery({
    queryKey: noteKeys.search(userId ?? "", needle.toLowerCase()),
    enabled: Boolean(userId) && enabled && needle.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<Note[]> => {
      const supabase = createBrowserSupabase();
      const pattern = `%${likeEscape(needle)}%`;
      // two plain filters instead of one `or=`: the words need no PostgREST quoting then
      const [byText, bySpeech] = await Promise.all([
        supabase.from("notes").select("*").is("deleted_at", null).is("board_id", null).ilike("text", pattern).order("created_at", { ascending: false }).limit(SEARCH_LIMIT),
        supabase.from("notes").select("*").is("deleted_at", null).is("board_id", null).ilike("raw_transcript", pattern).order("created_at", { ascending: false }).limit(SEARCH_LIMIT),
      ]);
      if (byText.error) throw new Error(byText.error.message);
      if (bySpeech.error) throw new Error(bySpeech.error.message);
      const seen = new Map<string, Note>();
      for (const note of [...(byText.data ?? []), ...(bySpeech.data ?? [])]) seen.set(note.id, note);
      return [...seen.values()].sort(newestFirst);
    },
  });
}
