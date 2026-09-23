"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/**
 * «К вам посетитель» (D-96): визиты читают директор и секретари своей компании (RLS);
 * киоск таблицу не читает — надпись ему отдаёт `tv_overlay()`.
 */

export type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
export type VisitAnswer = "invited" | "wait" | "declined";

export type Visit = VisitRow & { author: { full_name: string } | null };

export const visitKeys = {
  root: ["visits"] as const,
  list: () => ["visits", "list"] as const,
};

const SELECT = "*, author:profiles!visits_author_id_fkey(full_name)";

/** Визит живёт минуты; неделя — чтобы подсказать секретарю, кто приходил недавно. */
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

/** Живьём: ответ директора зажигает карточку секретаря без перезагрузки, и наоборот. */
export function useVisits(enabled = true) {
  return useRealtimeQuery<Visit[], VisitRow>({
    queryKey: visitKeys.list(),
    queryFn: fetchVisits,
    channel: { table: "visits" },
    enabled,
  });
}
