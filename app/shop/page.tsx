"use client";

import { AdminShop } from "@/components/shop/AdminShop";
import { ShopFront } from "@/components/shop/ShopFront";
import { ShopSkeleton } from "@/components/shop/ShopSkeleton";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * Магазин поощрений (D-71). Один маршрут, две роли-читателя: директор получает пульт
 * управления (очередь выдачи, ассортимент, очки компании), все остальные — витрину со
 * своим балансом. Кто именно смотрит, решается здесь, чтобы ни один экран не рисовал
 * чужих кнопок.
 */
export default function ShopPage() {
  const me = useMe();
  const pointsEnabled = usePointsEnabled();

  if (me.isLoading || pointsEnabled.isLoading) return <ShopSkeleton />;
  if (me.data?.role === "director") return <AdminShop me={me.data} />;
  return <ShopFront me={me.data} pointsEnabled={pointsEnabled.data === true} />;
}
