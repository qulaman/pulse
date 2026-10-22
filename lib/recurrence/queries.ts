"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

import type { RepeatEvery, RepeatRule } from "./schedule";

/**
 * The company's repeating orders and meeting series (D-148). Everyone but the wall reads them
 * (RLS) — an employee for the line on her task; only the director changes them, and only the
 * rule's own fields: the next day, the anchor and the stop reason are the trigger's and the tick's.
 */

export type RuleRow = Database["public"]["Tables"]["recurrence_rules"]["Row"];
export type Rule = RuleRow & { assignee: { full_name: string } | null };

export const ruleKeys = {
  root: ["recurrence"] as const,
  list: () => ["recurrence", "list"] as const,
};

const SELECT = "*, assignee:profiles!recurrence_rules_assignee_id_fkey(full_name)";
const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

/** The row as the schedule module reads it. */
export function ruleOf(row: Pick<RuleRow, "every" | "interval_n" | "weekdays" | "month_day">): RepeatRule {
  return { every: row.every as RepeatEvery, interval: row.interval_n, weekdays: row.weekdays, month_day: row.month_day };
}

/** «18:00» of «18:00:00». */
export function hmOf(time: string): string {
  return time.slice(0, 5);
}

async function fetchRules(): Promise<Rule[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase.from("recurrence_rules").select(SELECT).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Rule[];
}

/** Every rule of the company, live: the tick moves `next_on`, the list follows. */
export function useRecurrenceRules(enabled = true) {
  return useRealtimeQuery<Rule[], RuleRow>({
    queryKey: ruleKeys.list(),
    queryFn: fetchRules,
    channel: { table: "recurrence_rules" },
    enabled,
  });
}

/**
 * The rules come with the list of «Задачи» before its first open (D-136, `warmSentTasks`):
 * their row stands above the tabs, and landing after the list it pushed the list down.
 */
export function warmRecurrenceRules(client: QueryClient): Promise<void> {
  return client.prefetchQuery({ queryKey: ruleKeys.list(), queryFn: fetchRules });
}

/**
 * Whether the rules are in (or failed, or wait for the network): «Задачи» holds its skeleton
 * till then, so «Повторы» is drawn with the list instead of shoving it down on arrival. The
 * query of `useRecurrenceRules` without a socket of its own — the row listens.
 */
export function useRecurrenceRulesSettled(): boolean {
  const query = useQuery({ queryKey: ruleKeys.list(), queryFn: fetchRules });
  return !query.isPending || query.fetchStatus === "paused";
}

export type RulePatch = Partial<
  Pick<RuleRow, "title" | "assignee_id" | "every" | "interval_n" | "weekdays" | "month_day" | "at_time" | "is_active">
>;

/**
 * Change a rule — pause, resume, a new day or hour, another person. The values are absolute, so a
 * replay sends the same row twice and changes nothing (principle 7); the trigger recomputes the
 * next day from now. Offline, TanStack holds the call until the network is back.
 */
export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RulePatch; toast?: string }) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("recurrence_rules").update(patch).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("not_found");
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ruleKeys.list() });
      const before = queryClient.getQueryData<Rule[]>(ruleKeys.list());
      queryClient.setQueryData<Rule[]>(ruleKeys.list(), (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, ...patch, stopped_reason: patch.is_active ? null : row.stopped_reason } : row)),
      );
      return { before };
    },
    onSuccess: (_data, vars) => {
      if (vars.toast) toast(vars.toast);
    },
    onError: (error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(ruleKeys.list(), context.before);
      toast(error.message.includes("assignee_required") ? "Этот человек не из вашей компании" : GENERIC_ERROR);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ruleKeys.list() }),
  });
}

/** «Удалить повтор»: the rule goes; the tasks and meetings it made stay, without the link. */
export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("recurrence_rules").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ruleKeys.list() });
      const before = queryClient.getQueryData<Rule[]>(ruleKeys.list());
      queryClient.setQueryData<Rule[]>(ruleKeys.list(), (rows) => rows?.filter((row) => row.id !== id));
      return { before };
    },
    onSuccess: () => toast("Повтор удалён. Задачи, что он выдал, остались"),
    onError: (_error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(ruleKeys.list(), context.before);
      toast(GENERIC_ERROR);
    },
    // the tasks lose their mark: the lists read the link again
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }).then(() => queryClient.invalidateQueries({ queryKey: ruleKeys.list() })),
  });
}
