"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];

export const noteKeys = {
  root: ["notes"] as const,
  mine: (userId: string) => ["notes", "mine", userId] as const,
};

/** Active notes only; 300 is far past what one director writes before the trgm index (D-75 §8). */
const LIMIT = 300;

async function fetchNotes(): Promise<Note[]> {
  const supabase = createBrowserSupabase();
  // no user filter: RLS already leaves the author nothing but his own notes
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A row that left the feed: deleted, or somebody else's (the socket filter aside). */
function isGone(row: Note | undefined, userId: string): boolean {
  return !row || row.deleted_at !== null || row.user_id !== userId;
}

/**
 * The director's own notes, live. The Realtime filter narrows the socket to this
 * author and RLS narrows it again on the server — a note is private to whoever
 * wrote it (D-75 §2).
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
          // a soft-deleted note simply leaves the feed — «Отменить» brings it back as an UPDATE
          if (isGone(row, userId as string)) return rest;
          return [row, ...rest].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
        });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
