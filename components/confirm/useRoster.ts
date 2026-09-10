"use client";

import { useQuery } from "@tanstack/react-query";

import { createBrowserSupabase } from "@/lib/supabase/client";

export type RosterEntry = { id: string; full_name: string; position: string | null };

/**
 * Roster for the assignee picker. Read under the director's own RLS — no service role
 * on the client — and owned by TanStack Query like every other piece of server state.
 */
export function useRoster() {
  return useQuery({
    queryKey: ["roster"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RosterEntry[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, position")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
