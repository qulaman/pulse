"use client";

import Link from "next/link";

import { RatingList } from "@/components/rating/RatingList";
import { PageHead } from "@/components/ui/PageHead";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

/** Рейтинг: who earned what this week or month; the director awards from here (D-48). */
export default function RatingPage() {
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead title="Рейтинг" sub="Очки за закрытые в срок задачи и поощрения директора" />

      {/* куда очки тратятся — сразу под тем, где они считаются (D-71) */}
      <Link
        href="/shop"
        className="mt-4 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]"
      >
        Магазин
        <span className="text-[13px] leading-4 text-muted">обменять очки ›</span>
      </Link>

      <RatingList
        canAward={me.data?.role === "director"}
        isDirector={me.data?.role === "director"}
        pointsEnabled={pointsEnabled.data === true}
      />
    </main>
  );
}
