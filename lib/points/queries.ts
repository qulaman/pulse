"use client";


import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { toast } from "@/components/ui/Toast";
import { useRealtimeInvalidate, useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type RatingPeriod = "week" | "month" | "all";

export type RatingRow = {
  user_id: string;
  display_name: string;
  points: number;
  rank: number;
  delta_vs_prev: number;
  on_time_pct: number | null;
  is_me: boolean;
};

export function periodBounds(period: RatingPeriod, now = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getTime() + 60_000);
  const from = new Date(now);
  if (period === "week") from.setDate(from.getDate() - 7);
  else if (period === "month") from.setMonth(from.getMonth() - 1);
  else return { from: new Date("2000-01-01T00:00:00Z"), to };
  return { from, to };
}

export const pointKeys = {
  rating: (period: RatingPeriod) => ["points", "rating", period] as const,
  balance: (userId: string) => ["points", "balance", userId] as const,
  history: (userId: string) => ["points", "history", userId] as const,
};

export function useRating(period: RatingPeriod, enabled = true) {
  return useQuery({
    queryKey: pointKeys.rating(period),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<RatingRow[]> => {
      const { from, to } = periodBounds(period);
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("fn_rating", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as RatingRow[];
    },
  });
}

export type PointRow = {
  id: string;
  amount: number;
  reason: string;
  source: string;
  created_at: string;
};

/**
 * A person's balance = SUM(point_transactions), summed by the database (`point_balances`,
 * D-126): the history below is capped, and PostgREST cuts any read at max_rows, so a sum made
 * on the phone goes wrong once the ledger grows. RLS applies through the view — a person reads
 * their own line, the director anyone's. A new row of this person refreshes it live.
 */
export function useBalance(userId: string | undefined) {
  const query = useQuery({
    queryKey: pointKeys.balance(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_balances")
        .select("balance")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.balance ?? 0;
    },
  });
  // a hold and a release are rows of this table too — the balance follows the shop live
  useRealtimeInvalidate(
    { table: "point_transactions", filter: userId ? `user_id=eq.${userId}` : undefined },
    pointKeys.balance(userId ?? ""),
    Boolean(userId),
  );
  return query;
}

/** The last transactions of a person under RLS — the list, not the balance (`useBalance`). */
export function usePointHistory(userId: string | undefined) {
  return useQuery({
    queryKey: pointKeys.history(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PointRow[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_transactions")
        .select("id, amount, reason, source, created_at")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as PointRow[];
    },
  });
}

/** Every balance of the company, one row a person (director RLS) — the team list's «очк.». */
export function useTeamBalances(enabled: boolean) {
  return useQuery({
    queryKey: ["points", "team-balances"],
    enabled,
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("point_balances").select("user_id, balance");
      if (error) throw new Error(error.message);
      const sums: Record<string, number> = {};
      for (const row of data ?? []) if (row.user_id) sums[row.user_id] = row.balance ?? 0;
      return sums;
    },
  });
}

/**
 * Points that have just come in to the person (D-110, game feel behind `points_enabled`): the
 * face on Лента catches a coin and «+N» floats up. Only an award — a deduction is dry UI, the
 * face stays neutral (D-45). The socket is narrowed to the person; RLS narrows it again.
 */
export function usePointsArrival(userId: string | undefined, enabled: boolean): { amount: number; key: number } {
  const [arrival, setArrival] = useState({ amount: 0, key: 0 });
  useRealtimeListener<{ amount?: number }>(
    { table: "point_transactions", filter: userId ? `user_id=eq.${userId}` : undefined },
    (payload) => {
      if (payload.eventType !== "INSERT") return;
      const amount = Number((payload.new as { amount?: number }).amount ?? 0);
      if (amount > 0) setArrival((current) => ({ amount, key: current.key + 1 }));
    },
    // a missed award after a reconnect is not replayed: the balance on Профиль has it
    () => {},
    "points-arrival",
    enabled && Boolean(userId),
  );
  return arrival;
}

export function useAwardPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; amount: number; reason: string }) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("award_points", {
        p_user_id: input.userId,
        p_amount: input.amount,
        p_reason: input.reason,
        client_request_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
      return data as { balance: number };
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["points"] });
      toast(input.amount > 0 ? `🔥 +${input.amount} — ${input.reason}` : `${input.amount}: ${input.reason}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      toast(message.includes("reason_required") ? "Снятие очков — только с причиной" : "Не получилось начислить");
    },
  });
}

/** points_enabled is readable by everyone: the company row is visible to its members (D-48). */
/** `company.settings.delivery_window` — what /confirm promises about quiet hours (the RPC decides for real). */
export function useDeliveryWindow() {
  return useQuery({
    queryKey: ["company", "delivery_window"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ from?: string; to?: string } | undefined> => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      const settings = data?.settings as { delivery_window?: { from?: string; to?: string } } | null;
      return settings?.delivery_window;
    },
  });
}

export function usePointsEnabled() {
  return useQuery({
    queryKey: ["company", "points_enabled"],
    queryFn: async (): Promise<boolean> => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      const settings = data?.settings as { points_enabled?: boolean } | null;
      return settings?.points_enabled === true;
    },
  });
}
