import { useQuery } from "@tanstack/react-query";

import { TEAM_ROLES } from "@/lib/routes";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * How many active people of the company owe the team's work (`TEAM_ROLES`) — the «из N» of an
 * announcement's acknowledgements. RLS keeps the count to the reader's company.
 */
export function useTeamSize() {
  return useQuery({
    queryKey: ["people", "team-size"],
    queryFn: async (): Promise<number> => {
      const { count } = await createBrowserSupabase()
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("role", [...TEAM_ROLES]);
      return count ?? 0;
    },
  });
}
