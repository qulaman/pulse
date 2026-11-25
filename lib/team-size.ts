import { useQuery } from "@tanstack/react-query";

import { TEAM_ROLES } from "@/lib/routes";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * How many active people of the company owe the team's work (`TEAM_ROLES`) — the «из N» of an
 * announcement's acknowledgements. RLS keeps the count to the reader's company. The same rule as
 * `isTeamMember` (lib/people/team.ts), counted by the database instead of over a list.
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
