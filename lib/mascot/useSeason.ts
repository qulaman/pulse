"use client";

import { useQuery } from "@tanstack/react-query";

import { seasonOf, type MascotSeason } from "@/lib/mascot/season";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * What the home faces wear today (D-119): the holiday of the company's calendar, unless the
 * company has turned the dressing off. Read once an hour — a holiday does not start by the minute;
 * the settings screen invalidates the key when the switch is saved. No company row (a sandbox, a
 * signed-out page) — nothing to wear.
 */
export function useMascotSeason(): MascotSeason | null {
  const query = useQuery({
    queryKey: ["company", "mascot_seasons"],
    queryFn: async (): Promise<MascotSeason | null> => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      if (!data) return null;
      const settings = data.settings as { mascot_seasons?: boolean } | null;
      return settings?.mascot_seasons === false ? null : seasonOf(new Date());
    },
    staleTime: 60 * 60_000,
  });
  return query.data ?? null;
}
