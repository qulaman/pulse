"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Mascot } from "@/components/brand/Mascot";
import { RatingList } from "@/components/rating/RatingList";
import { Chip } from "@/components/ui/Chip";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/tasks/queries";

type Tab = "announcements" | "rating";

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

/** Эфир: announcements for everybody and the rating tab (docs/CONCEPT.md §3.1). */
export default function EtherPage() {
  const [tab, setTab] = useState<Tab>("rating");
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Эфир</h1>

      <div className="mt-4 flex gap-2" role="tablist">
        <Chip tone={tab === "announcements" ? "accent" : "neutral"} onClick={() => setTab("announcements")} role="tab" aria-selected={tab === "announcements"}>
          Объявления
        </Chip>
        <Chip tone={tab === "rating" ? "accent" : "neutral"} onClick={() => setTab("rating")} role="tab" aria-selected={tab === "rating"}>
          Рейтинг
        </Chip>
      </div>

      {tab === "announcements" ? (
        <div className="mt-6 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
          <Mascot state="calm" size={72} />
          <p className="mt-4 text-[16px] leading-[22px]">Объявлений пока нет</p>
          <p className="mt-1 text-[13px] leading-4 text-muted">
            Здесь появятся объявления директора для всех и «Ознакомился» под каждым
          </p>
        </div>
      ) : (
        <RatingList canAward={me.data?.role === "director"} pointsEnabled={pointsEnabled.data === true} />
      )}
    </main>
  );
}
