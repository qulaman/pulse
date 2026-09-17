"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type ShopItem = Database["public"]["Tables"]["shop_items"]["Row"];
type OrderRow = Database["public"]["Tables"]["orders"]["Row"];

export type Order = OrderRow & {
  item: { title: string; icon: string | null } | null;
  user: { full_name: string } | null;
};

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export const shopKeys = {
  root: ["shop"] as const,
  items: ["shop", "items"] as const,
  allItems: ["shop", "items", "all"] as const,
  orders: ["shop", "orders"] as const,
  ledger: ["shop", "ledger"] as const,
  balance: (userId: string) => ["shop", "balance", userId] as const,
};

const ORDER_SELECT =
  "*, item:shop_items(title, icon), user:profiles!orders_user_id_fkey(full_name)";

/** Витрина: активные товары, дешёвое — первым. */
export function useShopItems() {
  return useRealtimeQuery<ShopItem[]>({
    queryKey: shopKeys.items,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .eq("is_active", true)
        .order("price")
        .order("title");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    channel: { table: "shop_items" },
  });
}

/** Весь ассортимент, включая скрытые — витрина глазами директора. */
export function useAllShopItems(enabled: boolean) {
  return useRealtimeQuery<ShopItem[]>({
    queryKey: shopKeys.allItems,
    enabled,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .order("price")
        .order("title");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    channel: { table: "shop_items" },
  });
}

/**
 * Заказы под RLS: сотрудник видит свои, директор и завхоз — все компании. Один и тот же
 * запрос обслуживает обе секции страницы — второго источника правды о заказе нет.
 */
export function useOrders() {
  return useRealtimeQuery<Order[]>({
    queryKey: shopKeys.orders,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Order[];
    },
    channel: { table: "orders" },
  });
}

/**
 * Баланс = SUM(point_transactions) целиком, а не по последним строкам истории
 * (принцип 4): в магазине цена сверяется с точным числом, иначе кнопка соврёт.
 */
export function useBalance(userId: string | undefined) {
  const query = useQuery({
    queryKey: shopKeys.balance(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_transactions")
        .select("amount")
        .eq("user_id", userId as string);
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
    },
  });
  // a hold and a release are rows of another table — the balance follows them live
  useRealtimeInvalidate({ table: "point_transactions" }, shopKeys.balance(userId ?? ""), Boolean(userId));
  return query;
}

const ERRORS_RU: Record<string, string> = {
  insufficient_points: "Не хватает очков",
  out_of_stock: "Товар закончился",
  item_not_found: "Товара больше нет в магазине",
  order_not_found: "Заказ не найден",
  wrong_status: "Заказ уже в другом статусе",
  forbidden: "Нет доступа",
};

function messageRu(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  for (const [code, text] of Object.entries(ERRORS_RU)) {
    if (raw.includes(code)) return text;
  }
  return fallback;
}

function useShopMutation<TInput>(
  call: (input: TInput, requestId: string) => Promise<unknown>,
  done: (input: TInput) => string,
  fallback: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => call(input, crypto.randomUUID()),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: shopKeys.root });
      void queryClient.invalidateQueries({ queryKey: ["points"] });
      toast(done(input));
    },
    onError: (error) => toast(messageRu(error, fallback)),
  });
}

/** Заказ: холд очков и резерв товара одной транзакцией (RPC, идемпотентно). */
export function useCreateOrder() {
  return useShopMutation<ShopItem>(
    async (item, requestId) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("create_shop_order", {
        p_item_id: item.id,
        client_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    (item) => `Заказано: ${item.title}`,
    "Не получилось заказать",
  );
}

/** Отмена: очки возвращаются ровно на сумму холда (D-10). */
export function useCancelOrder() {
  return useShopMutation<Order>(
    async (order, requestId) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("cancel_shop_order", {
        p_order_id: order.id,
        client_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    () => "Заказ отменён, очки вернулись",
    "Не получилось отменить",
  );
}

/** Завхоз ведёт заказ: подтвердил → выдал. Новых транзакций выдача не пишет. */
export function useSetOrderStatus() {
  return useShopMutation<{ order: Order; status: Extract<OrderStatus, "approved" | "delivered"> }>(
    async ({ order, status }, requestId) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("set_shop_order_status", {
        p_order_id: order.id,
        p_status: status,
        client_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    ({ status }) => (status === "approved" ? "Заказ подтверждён" : "Заказ выдан"),
    "Не получилось обновить заказ",
  );
}

/* -------------------------------------------------------------------------- */
/* Админка директора: ассортимент и очки компании                              */
/* -------------------------------------------------------------------------- */

export type ItemDraft = {
  /** Известен заранее: повтор сохранения — тот же upsert, а не второй товар (принцип 7). */
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  price: number;
  /** null — без ограничения. */
  stock: number | null;
  is_active: boolean;
};

/**
 * Сохранение награды — upsert по заранее выданному id: экран не знает разницы между
 * «создать» и «изменить», а доехавший дважды запрос не родит второй товар.
 */
export function useSaveShopItem(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ItemDraft) => {
      if (!companyId) throw new Error("no company");
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("shop_items").upsert(
        {
          id: draft.id,
          company_id: companyId,
          title: draft.title.trim(),
          description: draft.description?.trim() || null,
          icon: draft.icon?.trim() || null,
          price: draft.price,
          stock: draft.stock,
          is_active: draft.is_active,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shopKeys.root });
      toast("Сохранено");
    },
    onError: () => toast("Не получилось сохранить"),
  });
}

/** Удаление возможно, только пока награду никто не заказывал: иначе её прячут. */
export function useDeleteShopItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: ShopItem) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("shop_items").delete().eq("id", item.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shopKeys.root });
      toast("Награда удалена");
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : "";
      // on delete restrict: заказы ссылаются на товар — история заказов важнее удаления
      toast(
        raw.includes("violates foreign key") || raw.includes("23503")
          ? "Награду уже заказывали — её можно только скрыть"
          : "Не получилось удалить",
      );
    },
  });
}

export type LedgerRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  source: string;
  created_at: string;
  user: { full_name: string } | null;
};

/** Очки компании одной лентой — директорское право по RLS, сотруднику придут только свои. */
export function useCompanyLedger(enabled: boolean, limit = 200) {
  const query = useQuery({
    queryKey: [...shopKeys.ledger, limit],
    enabled,
    queryFn: async (): Promise<LedgerRow[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_transactions")
        .select("id, user_id, amount, reason, source, created_at, user:profiles!point_transactions_user_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LedgerRow[];
    },
  });
  useRealtimeInvalidate({ table: "point_transactions" }, shopKeys.ledger, enabled);
  return query;
}

export type ShopSummary = {
  /** Столько очков сейчас на руках у людей (сумма всех транзакций компании). */
  onHands: number;
  /** Столько унесено в магазин и не вернулось (холды минус возвраты). */
  spent: number;
  /** Начислено за последние 30 дней — что компания раздала, без магазинных возвратов. */
  earned30: number;
  /** Балансы по людям, богатые первыми — «кто копит» на пульте директора. */
  balances: { userId: string; points: number }[];
};

/**
 * Одна выборка транзакций — все цифры пульта: сколько на руках, сколько унесено в
 * магазин, сколько роздано за месяц и у кого сколько. Второго источника правды об
 * очках не существует (принцип 4), поэтому считаем здесь, а не храним.
 */
export function useShopSummary(enabled: boolean) {
  const query = useQuery({
    queryKey: [...shopKeys.ledger, "summary"],
    enabled,
    queryFn: async (): Promise<ShopSummary> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("point_transactions").select("amount, source, user_id, created_at");
      if (error) throw new Error(error.message);
      const monthAgo = Date.now() - 30 * 86_400_000;
      const perUser = new Map<string, number>();
      let onHands = 0;
      let spent = 0;
      let earned30 = 0;
      for (const row of data ?? []) {
        onHands += row.amount;
        perUser.set(row.user_id, (perUser.get(row.user_id) ?? 0) + row.amount);
        if (row.source === "shop_hold" || row.source === "shop_release") spent -= row.amount;
        else if (row.amount > 0 && new Date(row.created_at).getTime() >= monthAgo) earned30 += row.amount;
      }
      const balances = [...perUser.entries()]
        .map(([userId, points]) => ({ userId, points }))
        .sort((a, b) => b.points - a.points);
      return { onHands, spent, earned30, balances };
    },
  });
  useRealtimeInvalidate({ table: "point_transactions" }, [...shopKeys.ledger, "summary"], enabled);
  return query;
}
