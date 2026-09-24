"use client";

import { useQuery } from "@tanstack/react-query";

import { channelHealth, type Health, type HealthRow } from "@/lib/push/health";
import { createBrowserSupabase } from "@/lib/supabase/client";

export const pushHealthKey = ["push-health"] as const;

/**
 * Whose push channel works (D-114) — the director and the secretary run the team and read it;
 * the RPC returns nothing to anybody else. A minute of staleness is fine: it changes with a
 * phone, not with a tap.
 */
export function usePushHealth(enabled = true) {
  return useQuery({
    queryKey: pushHealthKey,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, Health>> => {
      const { data, error } = await createBrowserSupabase().rpc("push_health");
      if (error) throw new Error(error.message);
      const now = new Date();
      return new Map(((data ?? []) as HealthRow[]).map((row) => [row.user_id, channelHealth(row, now)]));
    },
  });
}
