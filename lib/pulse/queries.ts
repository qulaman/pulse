"use client";

import { useMemo, useState } from "react";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { TaskRow, TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";
import type { AnswerTask } from "./answers";
import type { BriefTask } from "./briefing";
import { firstNameOf } from "@/lib/text/normalize";

const LAST_VISIT_KEY = "pulse.brief.seen_at";
/** The «since» of the current tab session: coming back from another tab is the same visit. */
const SESSION_SINCE_KEY = "pulse.brief.since";
/** A PWA kept alive in the background for days: after this long the next opening is a new visit. */
const VISIT_MAX_AGE_MS = 8 * 3_600_000;
/** A first visit (or a wiped storage) reads the news of the last day. */
const FIRST_VISIT_WINDOW_MS = 24 * 3_600_000;

export { firstNameOf };

export function toBriefTask(
  task: Pick<TaskWithPeople, "id" | "title" | "deadline" | "assignee"> & { assignee_id?: string | null },
): BriefTask {
  return {
    id: task.id,
    title: task.title,
    deadline: task.deadline,
    assignee: task.assignee?.full_name ? firstNameOf(task.assignee.full_name) : null,
    assigneeId: task.assignee_id ?? null,
  };
}

/**
 * When the director last opened Пульс on this phone. Read once per mount, then the
 * stamp moves to now — so the next opening tells what happened in between, while the
 * current screen keeps its own «since» for the whole visit (Realtime appends to it).
 */
/** A new person signs in on this tab: their first opening is a first visit. */
export function forgetVisit(): void {
  try {
    window.sessionStorage.removeItem(SESSION_SINCE_KEY);
    window.sessionStorage.removeItem(`${SESSION_SINCE_KEY}:at`);
  } catch {
    // nothing stored, nothing to forget
  }
}

export function useLastVisit(): string {
  const [since] = useState(() => {
    const now = Date.now();
    try {
      // the same tab session keeps its «since»: a trip to «Задачи» and back is not a new visit
      const session = window.sessionStorage.getItem(SESSION_SINCE_KEY);
      const raw = window.localStorage.getItem(LAST_VISIT_KEY);
      window.localStorage.setItem(LAST_VISIT_KEY, String(now));
      const sessionStarted = Number(window.sessionStorage.getItem(`${SESSION_SINCE_KEY}:at`) ?? "0");
      if (session && now - sessionStarted < VISIT_MAX_AGE_MS) return session;
      const previous = raw ? Number(raw) : null;
      const from = previous && Number.isFinite(previous) ? previous : now - FIRST_VISIT_WINDOW_MS;
      const iso = new Date(from).toISOString();
      window.sessionStorage.setItem(SESSION_SINCE_KEY, iso);
      window.sessionStorage.setItem(`${SESSION_SINCE_KEY}:at`, String(now));
      return iso;
    } catch {
      return new Date(now - FIRST_VISIT_WINDOW_MS).toISOString();
    }
  });
  return since;
}

type AcceptedRow = {
  created_at: string;
  task: {
    id: string;
    title: string;
    deadline: string | null;
    assignee_id?: string | null;
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
        .select("created_at, task:tasks!task_messages_task_id_fkey(id, title, deadline, assignee_id, assignee:profiles!tasks_assignee_id_fkey(full_name))")
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

/** Everything still in work — for the quiet line, the nearest deadline and the answers. */
export function useOpenTasks() {
  return useRealtimeQuery<AnswerTask[], TaskRow>({
    queryKey: ["pulse", "open"],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, deadline, status, assignee_id, assignee:profiles!tasks_assignee_id_fkey(full_name)")
        .in("status", [...OPEN]);
      if (error) throw new Error(error.message);
      type Row = Pick<TaskWithPeople, "id" | "title" | "deadline" | "status" | "assignee" | "assignee_id">;
      return ((data ?? []) as unknown as Row[]).map((row) => ({ ...toBriefTask(row), status: row.status }));
    },
    channel: { table: "tasks" },
  });
}

/** Stable reference for the briefing builder: the clock ticks once per mount. */
export function useNow(): Date {
  return useMemo(() => new Date(), []);
}
