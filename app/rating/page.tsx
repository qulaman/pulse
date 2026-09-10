"use client";

import { RatingList } from "@/components/rating/RatingList";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

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
