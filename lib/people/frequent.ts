"use client";

import { useQuery } from "@tanstack/react-query";

import type { ComposePin } from "@/lib/store/compose";
import { shortName } from "@/lib/people/names";
import { useRoster, type RosterEntry } from "@/lib/people/roster";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { firstNameOf } from "@/lib/text/normalize";

/** How many people the typed input offers over the field (D-192). */
export const FREQUENT_LIMIT = 5;
/** The director's own orders of the last month say whom he gives work to. */
const WINDOW_DAYS = 30;
const ROWS_CAP = 500;

/**
 * The people this director hands work to most, most first, from the assignees of his orders of
 * the last month (one id per order, as read): only active members of the team — never himself,
 * another director or the wall; equal counts by name. Nobody given work yet — nobody offered.
 */
export function rankFrequent(assignees: readonly (string | null)[], roster: readonly RosterEntry[], me: string | undefined, limit = FREQUENT_LIMIT): RosterEntry[] {
  const counts = new Map<string, number>();
  for (const id of assignees) if (id && id !== me) counts.set(id, (counts.get(id) ?? 0) + 1);
  return roster
    .filter((person) => counts.has(person.id) && person.role !== "director" && person.role !== "tv")
    .sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || a.full_name.localeCompare(b.full_name, "ru"))
    .slice(0, limit);
}

/**
 * The pin a chip puts over the typed field: by id (D-84), the first name in front — never a
 * dictionary form, which may be a mishearing the dictionary learned (D-192); the parser gets the id.
 */
export function pinOf(person: Pick<RosterEntry, "id" | "full_name">): ComposePin {
  return { id: person.id, name: shortName(person.full_name), address: `${firstNameOf(person.full_name)}, ` };
}

/** The director's frequent assignees for the chips of the typed input (И-7, D-192). */
export function useFrequentAssignees(me: string | undefined, enabled: boolean) {
  const roster = useRoster();
  const recent = useQuery({
    queryKey: ["frequent-assignees", me],
    enabled: enabled && Boolean(me),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<(string | null)[]> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const { data, error } = await createBrowserSupabase()
        .from("tasks")
        .select("assignee_id")
        .eq("author_id", me!)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(ROWS_CAP);
      if (error) throw error;
      return (data ?? []).map((row) => row.assignee_id);
    },
  });
  return rankFrequent(recent.data ?? [], roster.data ?? [], me);
}
