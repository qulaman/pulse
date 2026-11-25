"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

/** `waiting` — given and not accepted yet (`sent`): open, but nobody has taken it. */
export type Load = { active: number; overdue: number; review: number; nearest: string | null; waiting?: number };
export type LoadColor = "gray" | "green" | "yellow" | "red";

export const LOAD_COLOR: Record<LoadColor, string> = {
  gray: "var(--text-muted)",
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};

export const LOAD_LABEL: Record<LoadColor, string> = {
  gray: "нет дел в работе",
  green: "в срок",
  yellow: "дедлайн близко",
  red: "просрочка",
};

const OPEN: Database["public"]["Enums"]["task_status"][] = ["sent", "accepted", "in_progress", "rework", "pending_review"];

/**
 * Load rules, computed on the client; a database view only if measurement asks for it (IDEAS И-98).
 * Green is work somebody has taken: tasks given and not accepted yet are not «в срок» — a person
 * with nothing but those stays grey (the state map, lib/tasks/tone.ts: not accepted is never green).
 */
export function loadColor(load: Load | undefined, available: boolean, now = Date.now()): LoadColor {
  if (!available || !load || load.active === 0) return "gray";
  if (load.overdue > 0) return "red";
  if (load.nearest && new Date(load.nearest).getTime() < now + 24 * 3_600_000) return "yellow";
  if (load.active - (load.waiting ?? 0) <= 0) return "gray";
  return "green";
}

/**
 * Every open task of the company folded per assignee — the same query the Пульс grid
 * uses (shared cache key), live over `tasks`. Director RLS sees the whole company;
 * a manager sees their subordinates, which is exactly their team.
 */
export function useTeamLoads() {
  return useRealtimeQuery<Record<string, Load>>({
    queryKey: ["tasks", "team-loads"],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .select("assignee_id, deadline, status")
        .in("status", OPEN);
      if (error) throw new Error(error.message);
      const now = Date.now();
      const loads: Record<string, Load> = {};
      for (const task of data ?? []) {
        const load = (loads[task.assignee_id] ??= { active: 0, overdue: 0, review: 0, nearest: null, waiting: 0 });
        load.active += 1;
        if (task.status === "sent") load.waiting = (load.waiting ?? 0) + 1;
        if (task.status === "pending_review") load.review += 1;
        if (task.deadline) {
          if (task.status !== "pending_review" && new Date(task.deadline).getTime() < now) load.overdue += 1;
          if (!load.nearest || task.deadline < load.nearest) load.nearest = task.deadline;
        }
      }
      return loads;
    },
    channel: { table: "tasks" },
  });
}
