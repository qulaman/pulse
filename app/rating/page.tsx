"use client";

import { RatingList } from "@/components/rating/RatingList";
import { ShopRow } from "@/components/rating/ShopRow";
import { PageHead } from "@/components/ui/PageHead";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

/** Рейтинг: who earned what this week or month; the director awards from here (D-48). */
export default function RatingPage() {
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Рейтинг" />

      {/* куда очки тратятся — сразу под тем, где они считаются (D-71) */}
      <ShopRow />

      <RatingList
        canAward={me.data?.role === "director"}
        isDirector={me.data?.role === "director"}
        pointsEnabled={pointsEnabled.isPending ? null : pointsEnabled.data === true}
      />
    </main>
  );
}
