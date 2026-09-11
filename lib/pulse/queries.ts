"use client";

import { useMemo, useState } from "react";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { TaskRow, TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";
import type { BriefTask } from "./briefing";

const LAST_VISIT_KEY = "pulse.brief.seen_at";
/** A first visit (or a wiped storage) reads the news of the last day. */
const FIRST_VISIT_WINDOW_MS = 24 * 3_600_000;

export function firstNameOf(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}

export function toBriefTask(task: Pick<TaskWithPeople, "id" | "title" | "deadline" | "assignee">): BriefTask {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline,
    assignee: task.assignee?.full_name ? firstNameOf(task.assignee.full_name) : null,
  };
}

/**
 * When the director last opened Пульс on this phone. Read once per mount, then the
 * stamp moves to now — so the next opening tells what happened in between, while the
 * current screen keeps its own «since» for the whole visit (Realtime appends to it).
 */
export function useLastVisit(): string {
  const [since] = useState(() => {
    const now = Date.now();
    let previous: number | null = null;
    try {
      const raw = window.localStorage.getItem(LAST_VISIT_KEY);
      previous = raw ? Number(raw) : null;
      window.localStorage.setItem(LAST_VISIT_KEY, String(now));
    } catch {
      previous = null;
    }
    const from = previous && Number.isFinite(previous) ? previous : now - FIRST_VISIT_WINDOW_MS;
    return new Date(from).toISOString();
  });
  return since;
}

type AcceptedRow = {
  created_at: string;
  task: {
    id: string;
    title: string;
    deadline: string | null;
    assignee: { full_name: string } | null;
  } | null;
};

/** Tasks that went to `accepted` since the previous visit — the good news of the briefing. */
export function useAcceptedSince(since: string) {
  return useRealtimeQuery<{ task: BriefTask; at: string }[], Record<string, unknown>>({
    queryKey: ["pulse", "accepted", since],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("task_messages")
        .select("created_at, task:tasks!task_messages_task_id_fkey(id, title, deadline, assignee:profiles!tasks_assignee_id_fkey(full_name))")
        .eq("type", "status_change")
        .eq("meta->>new_status", "accepted")
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as AcceptedRow[])
        .filter((row) => row.task)
        .map((row) => ({ at: row.created_at, task: toBriefTask(row.task as NonNullable<AcceptedRow["task"]>) }));
    },
    channel: { table: "task_messages" },
  });
}

const OPEN: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

/** Everything still in work — for the quiet line and the nearest deadline. */
export function useOpenTasks() {
  return useRealtimeQuery<BriefTask[], TaskRow>({
    queryKey: ["pulse", "open"],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, deadline, assignee:profiles!tasks_assignee_id_fkey(full_name)")
        .in("status", [...OPEN]);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Pick<TaskWithPeople, "id" | "title" | "deadline" | "assignee">[]).map(toBriefTask);
    },
    channel: { table: "tasks" },
  });
}

/** Stable reference for the briefing builder: the clock ticks once per mount. */
export function useNow(): Date {
  return useMemo(() => new Date(), []);
}
