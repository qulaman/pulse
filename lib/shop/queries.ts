"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { kickPush } from "@/lib/push/client";
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
};

const ORDER_SELECT =
  "*, item:shop_items(title, icon), user:profiles!orders_user_id_fkey(full_name)";

/** The shop window: active items, the cheap ones first. */
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

/** The whole range, hidden items too — the shop window as the director sees it. */
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
 * Orders under RLS: an employee sees their own, the director and the storekeeper — the whole company's. One
 * query serves both sections of the page — there is no second source of truth about an order.
 */
export function useOrders(enabled = true) {
  return useRealtimeQuery<Order[]>({
    queryKey: shopKeys.orders,
    enabled,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    channel: { table: "orders" },
  });
}

/**
 * Balance = SUM(point_transactions) as a whole (principle 4): the shop checks a price against the exact
 * number, or the button would lie. One source for the whole app — lib/points (D-126).
 */
export { useBalance } from "@/lib/points/queries";

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
    mutationFn: async (input: TInput) => {
      const result = await call(input, crypto.randomUUID());
      // the shopkeeper / the buyer hears it now, not on the minute sweep (D-114)
      kickPush();
      return result;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: shopKeys.root });
      void queryClient.invalidateQueries({ queryKey: ["points"] });
      toast(done(input));
    },
    onError: (error) => toast(messageRu(error, fallback)),
  });
}

/** An order: the points hold and the item reserve in one transaction (RPC, idempotent). */
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

/** A cancel: exactly the held points come back (D-10). */
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

/** The storekeeper runs an order: confirmed → handed out. Handing out writes no new transactions. */
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
/* The director's admin: the range and the company's points                       */
/* -------------------------------------------------------------------------- */

export type ItemDraft = {
  /** Known in advance: a repeated save is the same upsert, not a second item (principle 7). */
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  price: number;
  /** null — no limit. */
  stock: number | null;
  is_active: boolean;
};

/**
 * Saving a reward is an upsert by an id handed out in advance: the screen knows no difference between
 * «создать» and «изменить», and a request that arrived twice does not make a second item.
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

/** A reward can be deleted only while nobody has ordered it: otherwise it is hidden. */
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
      // on delete restrict: orders point at the item — the history of orders matters more than the delete
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

/** The company's points as one feed — the director's right by RLS, an employee gets only their own. */
export function useCompanyLedger(enabled: boolean, limit = 200) {
  const query = useQuery({
    queryKey: [...shopKeys.ledger, limit],
    enabled,
    // a longer page (the desk's «Показать ещё», D-153) keeps the rows on screen while it loads
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LedgerRow[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_transactions")
        .select("id, user_id, amount, reason, source, created_at, user:profiles!point_transactions_user_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  useRealtimeInvalidate({ table: "point_transactions" }, shopKeys.ledger, enabled);
  return query;
}

export type ShopSummary = {
  /** The points people hold right now (the sum of all the company's transactions). */
  onHands: number;
  /** The points taken to the shop and not back (holds minus returns). */
  spent: number;
  /** Awarded over the last 30 days — what the company gave, without shop returns. */
  earned30: number;
  /** Balances by person, the richest first — «кто копит» on the director's panel. */
  balances: { userId: string; points: number }[];
};

/**
 * Every figure of the panel from one row per person (`point_balances`, D-126): how much is held,
 * how much went to the shop, how much was given this month and who has how much. The base sums
 * the transactions itself — there is no second source of truth about points (principle 4), and the phone
 * no longer pulls the whole feed, which PostgREST would cut at max_rows anyway.
 */
export function useShopSummary(enabled: boolean) {
  const query = useQuery({
    queryKey: [...shopKeys.ledger, "summary"],
    enabled,
    queryFn: async (): Promise<ShopSummary> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("point_balances").select("user_id, balance, spent, earned_30d");
      if (error) throw new Error(error.message);
      let onHands = 0;
      let spent = 0;
      let earned30 = 0;
      const balances: ShopSummary["balances"] = [];
      for (const row of data ?? []) {
        if (!row.user_id) continue;
        const points = row.balance ?? 0;
        onHands += points;
        spent += row.spent ?? 0;
        earned30 += row.earned_30d ?? 0;
        balances.push({ userId: row.user_id, points });
      }
      balances.sort((a, b) => b.points - a.points);
      return { onHands, spent, earned30, balances };
    },
  });
  useRealtimeInvalidate({ table: "point_transactions" }, [...shopKeys.ledger, "summary"], enabled);
  return query;
}
