"use client";

import { useQuery } from "@tanstack/react-query";

import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/**
 * The people a director hands work to or invites (D-107): every active profile but the
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
        .select("id, full_name, position, avatar_url, role")
        .eq("is_active", true)
        // a task goes to a person, never to the TV kiosk
        .neq("role", "tv")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Lower case, «ё» as «е»: «Семён» is found by «семен». */
export function foldRu(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

/**
 * The search of a picker: every typed word must start a word of the name or the position —
 * «ер б» finds «Ерлан Бекмуханов», «бух» finds the accountant. An empty query keeps all.
 */
export function searchPeople<T extends Pick<RosterEntry, "full_name" | "position">>(people: readonly T[], query: string): T[] {
  const needles = foldRu(query).split(/\s+/).filter(Boolean);
  if (needles.length === 0) return [...people];
  return people.filter((person) => {
    const words = foldRu(`${person.full_name} ${person.position ?? ""}`).split(/[\s\-—,.()]+/).filter(Boolean);
    return needles.every((needle) => words.some((word) => word.startsWith(needle)));
  });
}

/** Two letters of a name for the round face: «Марат Оспанов» → «МО». */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

/** «Марат» — the first word, what a chip or a toast says. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
