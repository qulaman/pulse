"use client";

import { useQuery } from "@tanstack/react-query";

import { Mascot } from "@/components/brand/Mascot";
import { AnnouncementCard } from "@/components/ether/AnnouncementCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { useAcknowledge, useEther } from "@/lib/ether/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/tasks/queries";

function useTeamSize() {
  return useQuery({
    queryKey: ["people", "team-size"],
    queryFn: async (): Promise<number> => {
      const supabase = createBrowserSupabase();
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("role", ["employee", "manager", "shopkeeper"]);
      return count ?? 0;
    },
  });
}

/** Эфир: the director's announcements for everybody, «Ознакомился» under each (CONCEPT §3.1). */
export default function EtherPage() {
  const me = useMe();
  const feed = useEther();
  const team = useTeamSize();
  const ack = useAcknowledge(me.data?.userId);
  const isDirector = me.data?.role === "director";
  const items = feed.data ?? [];

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Эфир</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {isDirector ? "Скажи «всем: …» — объявление появится здесь у каждого" : "Объявления директора для всей компании"}
      </p>

      {feed.isLoading || me.isLoading ? (
        <div className="mt-6">
          <TaskSkeleton count={2} />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
          <Mascot state="calm" size={72} />
          <p className="mt-4 text-[16px] leading-[22px]">Объявлений пока нет</p>
          <p className="mt-1 text-[13px] leading-4 text-muted">
            {isDirector ? "Зажми кнопку и начни со слова «всем»" : "Здесь появятся объявления директора и «Ознакомился» под каждым"}
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {items.map((item) => (
            <AnnouncementCard
              key={item.id}
              item={item}
              userId={me.data?.userId}
              isDirector={isDirector}
              teamSize={team.data ?? 0}
              onAck={(id) => ack.mutate(id)}
              acking={ack.isPending}
            />
          ))}
        </div>
      )}
    </main>
  );
}
