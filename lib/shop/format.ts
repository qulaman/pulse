import type { Database } from "@/lib/supabase/types";
import { pluralRu } from "@/lib/tasks/status-text";

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

/**
 * Сколько заказ уже ждёт — словами, как сказал бы человек: «только что», «12 минут»,
 * «3 часа», «2 дня». Директору важно не время заказа, а то, сколько он висит.
 */
export function waitingRu(created: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (minutes < 2) return "только что";
  if (minutes < 60) return `${minutes} ${pluralRu(minutes, ["минуту", "минуты", "минут"])}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${pluralRu(hours, ["час", "часа", "часов"])}`;
  const days = Math.floor(hours / 24);
  return `${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
}

/** Ближайшая по цене награда, на которую этому балансу ещё не хватает. */
export function nearestGoal(
  balance: number,
  items: { title: string; price: number; is_active: boolean }[],
): { title: string; missing: number } | null {
  const ahead = items
    .filter((item) => item.is_active && item.price > balance)
    .sort((a, b) => a.price - b.price)[0];
  return ahead ? { title: ahead.title, missing: ahead.price - balance } : null;
}

/* -------------------------------------------------------------------------- */
/* Жизнь магазина: что берут, что выдали                                       */
/* -------------------------------------------------------------------------- */

export type OrderFact = {
  item_id: string;
  status: OrderStatus;
  created_at: string;
  delivered_at: string | null;
};

/** Сколько раз награду уносили: считается любой заказ, кроме отменённого. */
export function takenCounts(orders: OrderFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    counts[order.item_id] = (counts[order.item_id] ?? 0) + 1;
  }
  return counts;
}

/** Сколько наград выдано за последние `days` дней — цифра героя экрана. */
export function deliveredInPeriod(orders: OrderFact[], now: Date = new Date(), days = 30): number {
  const from = now.getTime() - days * 86_400_000;
  return orders.filter(
    (order) => order.status === "delivered" && order.delivered_at !== null && new Date(order.delivered_at).getTime() >= from,
  ).length;
}

/** Последние выдачи, свежие первыми — лента «кому что досталось». */
export function recentDeliveries<T extends OrderFact>(orders: T[], limit = 3): T[] {
  return orders
    .filter((order) => order.status === "delivered" && order.delivered_at !== null)
    .sort((a, b) => new Date(b.delivered_at as string).getTime() - new Date(a.delivered_at as string).getTime())
    .slice(0, limit);
}

/** «взяли 3 раза» / «пока не брали» — подпись под ценой на плитке. */
export function takenLabel(count: number): string {
  if (count === 0) return "пока не брали";
  return `взяли ${count} ${pluralRu(count, ["раз", "раза", "раз"])}`;
}
