"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type RatingPeriod = "week" | "month";

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
  else from.setMonth(from.getMonth() - 1);
  return { from, to };
}

export const pointKeys = {
  rating: (period: RatingPeriod) => ["points", "rating", period] as const,
  balance: (userId: string) => ["points", "balance", userId] as const,
  history: (userId: string) => ["points", "history", userId] as const,
};

export function useRating(period: RatingPeriod) {
  return useQuery({
    queryKey: pointKeys.rating(period),
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

/** Own transactions under RLS — the balance is their sum, never a stored field. */
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

export function balanceOf(rows: PointRow[] | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + row.amount, 0);
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
