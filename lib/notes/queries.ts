"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];

export const noteKeys = {
  root: ["notes"] as const,
  mine: (userId: string) => ["notes", "mine", userId] as const,
};

/** Live notes: 300 is far past what one director writes before the trgm index (D-75 §6). */
const LIMIT = 300;
/** The bin shows the latest deletions; older ones stay in the table, out of sight. */
const TRASH_LIMIT = 100;

const newestFirst = (a: Note, b: Note) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

async function fetchNotes(): Promise<Note[]> {
  const supabase = createBrowserSupabase();
  // no user filter: RLS already leaves the author nothing but his own notes
  const [live, bin] = await Promise.all([
    supabase.from("notes").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(LIMIT),
    supabase
      .from("notes")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(TRASH_LIMIT),
  ]);
  if (live.error) throw new Error(live.error.message);
  if (bin.error) throw new Error(bin.error.message);
  return [...(live.data ?? []), ...(bin.data ?? [])].sort(newestFirst);
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
    queryFn: fetchNotes,
    channel: { table: "notes", filter: userId ? `user_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
    onEvent: (payload, queryClient) => {
      const key = noteKeys.mine(userId as string);
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
