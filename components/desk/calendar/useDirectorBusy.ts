"use client";

import { useQuery } from "@tanstack/react-query";

import { ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";
import type { BusySpan } from "@/lib/desk/busy";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** A meeting moved or added shows within this. */
const POLL_MS = 60_000;
/** Until the RPC answers (the migration not applied yet) it is not asked every minute. */
const REFUSED_POLL_MS = 10 * 60_000;

/**
 * The director's busy spans of the days `from` up to, not including, `to` (owner, 2026-11-04). A
 * poll, not Realtime: `events` reaches a socket only under RLS, and the secretary's RLS leaves her
 * own meetings, so a change of the director's calendar would never arrive. An error stays quiet:
 * no data, and the screens draw nothing rather than a wrong «свободен».
 */
export function useDirectorBusy(from: Ymd, to: Ymd, enabled = true) {
  return useQuery({
    queryKey: ["director-busy", from, to],
    queryFn: async (): Promise<BusySpan[]> => {
      const { data, error } = await createBrowserSupabase().rpc("director_busy", {
        p_from: ymdHmToAqtobeIso(from, "00:00") as string,
        p_to: ymdHmToAqtobeIso(to, "00:00") as string,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled,
    retry: false,
    staleTime: POLL_MS / 2,
    // a poll sleeps in a hidden tab: back at the desk the answer is fresh at once
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.status === "error" ? REFUSED_POLL_MS : POLL_MS),
  });
}
