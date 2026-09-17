import type { Database } from "@/lib/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Chip tones the shop uses; a subset of components/ui/Chip's palette. */
export type ShopTone = "warn" | "accent" | "ok" | "muted";

/**
 * Что значит статус заказа для человека. Сотруднику и завхозу показывается одно и то же
 * слово — «подтверждён» у обоих означает, что очки уже списаны, а вещь ещё не на руках.
 */
export const ORDER_STATUS: Record<OrderStatus, { text: string; tone: ShopTone }> = {
  pending: { text: "Ждёт подтверждения", tone: "warn" },
  approved: { text: "Подтверждён", tone: "accent" },
  delivered: { text: "Выдан", tone: "ok" },
  cancelled: { text: "Отменён", tone: "muted" },
};

/** Склонение: 1 очко, 2 очка, 5 очков. */
export function pointsWord(n: number): string {
  const abs = Math.abs(n) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return "очков";
  if (tail === 1) return "очко";
  if (tail >= 2 && tail <= 4) return "очка";
  return "очков";
}

/** Сколько ещё копить до товара; 0 — уже хватает. */
export function shortfall(price: number, balance: number): number {
  return Math.max(0, price - balance);
}

/** Насколько полоска накопления закрашена, 0…100. */
export function progressPct(price: number, balance: number): number {
  if (price <= 0) return 100;
  const pct = (balance / price) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Заказ ещё можно отменить самому: до подтверждения завхозом (D-37). */
export function cancellableByOwner(status: OrderStatus): boolean {
  return status === "pending";
}

/** Заказ ещё в работе у завхоза — он висит в очереди выдачи. */
export function isOpenOrder(status: OrderStatus): boolean {
  return status === "pending" || status === "approved";
}
