"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { DEFAULT_REACTION_PRICES, REACTION_GLYPH, reactionPricesOf, type ReactionCode, type ReactionPrices } from "@/lib/points/reactions";
import { useRealtimeInvalidate } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Game feel of points (D-133): the director's reactions to tasks, «Оспорить» a minus, the price
 * list the screens show and the employee face's worry switch. The rules themselves live in the
 * database (`tasks_points`, `react_to_task`, `dispute_points`): the phone only asks and shows.
 */

async function companySettings(): Promise<Record<string, unknown> | null> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
  return (data?.settings as Record<string, unknown> | null) ?? null;
}

/** `settings.points_rules.reactions` — the «+10» under each reaction; the settings screen invalidates it. */
export function useReactionPrices(): ReactionPrices {
  const query = useQuery({
    queryKey: ["company", "points_rules"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReactionPrices> => {
      const settings = await companySettings();
      const rules = settings?.points_rules as { reactions?: unknown } | undefined;
      return reactionPricesOf(rules?.reactions);
    },
  });
  return query.data ?? DEFAULT_REACTION_PRICES;
}

/**
 * `settings.mascot_telegraph` (D-133, В-5): may the employee's face worry over their own work —
 * call, panic, fret. Off, the face stays calm; scenes, dreams and the celebration stay.
 */
export function useMascotTelegraph(): boolean {
  const query = useQuery({
    queryKey: ["company", "mascot_telegraph"],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<boolean> => (await companySettings())?.mascot_telegraph !== false,
  });
  return query.data ?? true;
}

// ---------------------------------------------------------------------------
// reactions
// ---------------------------------------------------------------------------

export const reactionKeys = { all: ["reactions"] as const };

/**
 * The reactions this person may see, by task: the director's own, or the ones on the employee's
 * tasks (RLS). One read for every card of a list; a reaction anywhere refreshes it live.
 */
export function useTaskReactions(enabled = true) {
  const query = useQuery({
    queryKey: reactionKeys.all,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ReactionCode>> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("task_reactions")
        .select("task_id, code")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      const byTask: Record<string, ReactionCode> = {};
      for (const row of data ?? []) byTask[row.task_id] ??= row.code as ReactionCode;
      return byTask;
    },
  });
  useRealtimeInvalidate({ table: "task_reactions" }, reactionKeys.all, enabled);
  return query;
}

export function useReactToTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; code: ReactionCode | null }) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("react_to_task", {
        p_task: input.taskId,
        p_code: input.code,
        client_request_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
      return data as { points?: number };
    },
    // the chip lights at the tap; a refusal puts the old reaction back
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: reactionKeys.all });
      const before = queryClient.getQueryData<Record<string, ReactionCode>>(reactionKeys.all);
      queryClient.setQueryData<Record<string, ReactionCode>>(reactionKeys.all, (map) => {
        const next = { ...(map ?? {}) };
        if (input.code) next[input.taskId] = input.code;
        else delete next[input.taskId];
        return next;
      });
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context?.before) queryClient.setQueryData(reactionKeys.all, context.before);
      toast("Не получилось поставить реакцию");
    },
    onSuccess: (data, input) => {
      const points = Number(data?.points ?? 0);
      if (points !== 0) void queryClient.invalidateQueries({ queryKey: ["points"] });
      if (input.code && points > 0) toast(`${REACTION_GLYPH[input.code]} +${points}`);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: reactionKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// «Оспорить» (D-14)
// ---------------------------------------------------------------------------

export type DisputeStatus = "open" | "refunded" | "kept";

export type MyDispute = { transaction_id: string; status: DisputeStatus; answer: string | null };

export type OpenDispute = {
  id: string;
  text: string;
  created_at: string;
  user_id: string;
  user: { full_name: string } | null;
  tx: { amount: number; reason: string; created_at: string } | null;
};

export const disputeKeys = {
  mine: (userId: string) => ["points", "disputes", "mine", userId] as const,
  open: ["points", "disputes", "open"] as const,
};

/** The person's own disputes, by the minus they dispute — the history line shows where each stands. */
export function useMyDisputes(userId: string | undefined) {
  const query = useQuery({
    queryKey: disputeKeys.mine(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Record<string, MyDispute>> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_disputes")
        .select("transaction_id, status, answer")
        .eq("user_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      const map: Record<string, MyDispute> = {};
      for (const row of data ?? []) map[row.transaction_id] = row as MyDispute;
      return map;
    },
  });
  useRealtimeInvalidate(
    { table: "point_disputes", filter: userId ? `user_id=eq.${userId}` : undefined },
    disputeKeys.mine(userId ?? ""),
    Boolean(userId),
  );
  return query;
}

/** The director's queue: disputes nobody has answered yet, oldest first. */
export function useOpenDisputes(enabled: boolean) {
  const query = useQuery({
    queryKey: disputeKeys.open,
    enabled,
    queryFn: async (): Promise<OpenDispute[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("point_disputes")
        .select(
          "id, text, created_at, user_id, user:profiles!point_disputes_user_id_fkey(full_name), tx:point_transactions!point_disputes_transaction_id_fkey(amount, reason, created_at)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OpenDispute[];
    },
  });
  useRealtimeInvalidate({ table: "point_disputes" }, disputeKeys.open, enabled);
  return query;
}

export function useDisputePoints(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { transactionId: string; text: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("dispute_points", {
        p_transaction: input.transactionId,
        p_text: input.text,
        client_request_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: disputeKeys.mine(userId ?? "") });
      toast("Отправил директору");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "";
      toast(message.includes("already_disputed") ? "Это начисление уже оспорено" : "Не получилось отправить. Попробуй ещё раз");
    },
  });
}

export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; refund: boolean; answer?: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("resolve_points_dispute", {
        p_dispute: input.id,
        p_refund: input.refund,
        p_answer: input.answer || undefined,
        client_request_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
    },
    // the answered line leaves the queue at once
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: disputeKeys.open });
      const before = queryClient.getQueryData<OpenDispute[]>(disputeKeys.open);
      queryClient.setQueryData<OpenDispute[]>(disputeKeys.open, (list) => list?.filter((item) => item.id !== input.id));
      return { before };
    },
    onError: (error, _input, context) => {
      if (context?.before) queryClient.setQueryData(disputeKeys.open, context.before);
      const message = error instanceof Error ? error.message : "";
      toast(message.includes("already_resolved") ? "На это уже ответили" : "Не получилось. Попробуй ещё раз");
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ["points"] });
      toast(input.refund ? "Вернул очки" : "Оставил как есть");
    },
  });
}
