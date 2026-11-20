"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/**
 * «К вам посетитель» (D-96) and «Сообщение на экран» (D-116): visits are read by the director and the
 * secretaries of their company (RLS); the kiosk does not read the table — `tv_overlay()` gives it the words.
 */

export type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
export type VisitKind = "visitor" | "message";
/** To a visitor — the door; to a message — «прочитал» («Понятно»). */
export type VisitAnswer = "invited" | "wait" | "declined" | "read";

export type Visit = VisitRow & { author: { full_name: string } | null };

export const visitKeys = {
  root: ["visits"] as const,
  list: () => ["visits", "list"] as const,
};

const SELECT = "*, author:profiles!visits_author_id_fkey(full_name)";

/** A visit lives minutes; a week — to remind the secretary who came lately. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchVisits(): Promise<Visit[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("visits")
    .select(SELECT)
    .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []) as Visit[];
}

/** Live: the director's answer lights the secretary's card without a reload, and the other way round. */
export function useVisits(enabled = true) {
  return useRealtimeQuery<Visit[], VisitRow>({
    queryKey: visitKeys.list(),
    queryFn: fetchVisits,
    channel: { table: "visits" },
    enabled,
  });
}
