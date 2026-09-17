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
  orders: ["shop", "orders"] as const,
  balance: (userId: string) => ["shop", "balance", userId] as const,
};

const ORDER_SELECT =
  "*, item:shop_items(title, icon), user:profiles!orders_user_id_fkey(full_name)";

/** Витрина: активные товары, дешёвое — первым (sort, затем цена). */
export function useShopItems() {
  return useRealtimeQuery<ShopItem[]>({
    queryKey: shopKeys.items,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .eq("is_active", true)
        .order("sort")
        .order("price");
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
