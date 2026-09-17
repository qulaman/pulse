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

/**
 * Строка под заголовком пульта: что с магазином прямо сейчас. Одна мысль, факты —
 * сначала то, что ждёт директора, потом то, чем живёт витрина (тон — DESIGN §5).
 */
export function shopVerdict(waiting: number, active: number, hidden: number): { text: string; tone: ShopTone } {
  if (waiting > 0) {
    const verb = pluralRu(waiting, ["ждёт", "ждут", "ждут"]);
    const noun = pluralRu(waiting, ["заказ", "заказа", "заказов"]);
    return { text: `${waiting} ${noun} ${verb} выдачи`, tone: "warn" };
  }
  if (active === 0) {
    return { text: "На витрине пока пусто — добавь первую награду", tone: "muted" };
  }
  const hiddenTail = hidden > 0 ? `, скрыто ${hidden}` : "";
  const noun = pluralRu(active, ["награда", "награды", "наград"]);
  return { text: `Всё выдано. На витрине ${active} ${noun}${hiddenTail}`, tone: "muted" };
}
