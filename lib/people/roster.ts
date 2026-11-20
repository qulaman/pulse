"use client";

import { useQuery } from "@tanstack/react-query";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/**
 * The people a director hands work to or invites (D-108): every active profile but the
 * TV kiosk, read under the director's own RLS. One list for every picker of the app — the
 * assignee of a task, the new owner of a reassigned one, the people of a meeting, the
 * owner of a board's point — so a name, a photo or an order cannot differ between them.
 */

export type RosterEntry = {
  id: string;
  full_name: string;
  position: string | null;
  avatar_url: string | null;
  role: Database["public"]["Enums"]["user_role"];
  /** Nicknames: every picker on the roster finds a person by them too (lib/people/search.ts). */
  aliases?: string[];
};

export const rosterKey = ["roster"] as const;

export function useRoster() {
  return useQuery({
    queryKey: rosterKey,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RosterEntry[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, position, avatar_url, role, aliases")
        .eq("is_active", true)
        // a task goes to a person, never to the TV kiosk
        .neq("role", "tv")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** @deprecated import `foldRu` and `searchPeople` from lib/people/search.ts */
export { foldRu, searchPeople } from "./search";

/** @deprecated import `initialsOf` from lib/people/names.ts */
export { initialsOf } from "@/lib/people/names";
