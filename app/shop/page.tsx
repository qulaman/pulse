"use client";

import { AdminShop } from "@/components/shop/AdminShop";
import { ShopFront } from "@/components/shop/ShopFront";
import { ShopSkeleton } from "@/components/shop/ShopSkeleton";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * The rewards shop (D-71). One route, two kinds of reader: the director gets the console (the
 * hand-out queue, the range, the company's points), everyone else the shop window with their own
 * balance. Who is looking is decided here, so no screen draws somebody else's buttons.
 */
export default function ShopPage() {
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  if (me.isLoading || pointsEnabled.isLoading) return <ShopSkeleton />;
  if (me.data?.role === "director") return <AdminShop me={me.data} />;
  return <ShopFront me={me.data} pointsEnabled={pointsEnabled.data === true} />;
}
