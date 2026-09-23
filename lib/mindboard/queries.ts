"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/** A board of the director (D-102): a title and an order; its points are notes with `board_id`. */
export type MindBoard = Database["public"]["Tables"]["mind_boards"]["Row"];

export const boardKeys = {
  mine: (userId: string) => ["mind_boards", "mine", userId] as const,
};

/** A director keeps a handful of boards; this is only a ceiling. */
const LIMIT = 200;
/** The bin keeps a deleted board three days (D-95 §4): no need to read older ones. */
const TRASH_MS = 3 * 86_400_000;

const latestFirst = (a: MindBoard, b: MindBoard) => b.updated_at.localeCompare(a.updated_at);

async function fetchBoards(): Promise<MindBoard[]> {
  const supabase = createBrowserSupabase();
  const since = new Date(Date.now() - TRASH_MS).toISOString();
  // no user filter: RLS leaves the author nothing but the own boards (D-75 §3)
  const { data, error } = await supabase
    .from("mind_boards")
    .select("*")
    .or(`deleted_at.is.null,deleted_at.gt.${since}`)
    .order("updated_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The director's boards, live — the list, the bin and the remote read the same cache. A
 * point changing on a board touches the board's `updated_at` (trigger), so the latest
 * worked-on board comes first everywhere.
 */
export function useBoards(userId: string | undefined) {
  return useRealtimeQuery<MindBoard[], MindBoard>({
    queryKey: boardKeys.mine(userId ?? ""),
    queryFn: fetchBoards,
    channel: { table: "mind_boards", filter: userId ? `user_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
    onEvent: (payload, queryClient) => {
      const key = boardKeys.mine(userId as string);
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<MindBoard> | undefined)?.id;
        if (!id) return;
        queryClient.setQueryData<MindBoard[]>(key, (rows) => (rows ?? []).filter((board) => board.id !== id));
        return;
      }
      const row = payload.new as MindBoard | undefined;
      if (!row?.id || row.user_id !== userId) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      queryClient.setQueryData<MindBoard[]>(key, (rows) => [row, ...(rows ?? []).filter((board) => board.id !== row.id)].sort(latestFirst));
    },
  });
}
