"use client";

import { useQuery } from "@tanstack/react-query";

import { RatingList } from "@/components/rating/RatingList";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/tasks/queries";

/** points_enabled is readable by everyone: the company row is visible to its members. */
function usePointsEnabled() {
  return useQuery({
    queryKey: ["company", "points_enabled"],
    queryFn: async (): Promise<boolean> => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      const settings = data?.settings as { points_enabled?: boolean } | null;
      return settings?.points_enabled === true;
    },
  });
}

/** Рейтинг: who earned what this week or month; the director awards from here (D-48). */
export default function RatingPage() {
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Рейтинг</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Очки за закрытые в срок задачи и поощрения директора</p>
      <RatingList canAward={me.data?.role === "director"} pointsEnabled={pointsEnabled.data === true} />
    </main>
  );
}
