"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import type { Database } from "@/lib/supabase/types";

/**
 * What every task query shares: the row shapes, the joined selects and the cache keys, and the
 * one unfiltered DELETE channel. The hooks live by area — queries.ts (the person's lists),
 * archive-queries.ts, thread-queries.ts, board-queries.ts — and queries.ts re-exports them all.
 */

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskMessageRow = Database["public"]["Tables"]["task_messages"]["Row"];
export type Role = Database["public"]["Enums"]["user_role"];

type Person = { full_name: string } | null;

/** `passed` — who took over a reassigned task (D-128); absent on rows fetched without the join. */
export type TaskWithPeople = TaskRow & { assignee: Person; author: Person; passed?: Person };
export type TaskMessage = TaskMessageRow & { sender: Person };

export type Me = {
  userId: string;
  companyId: string;
  role: Role;
  isActive: boolean;
  fullName: string;
};

export const TASK_SELECT =
  "*, assignee:profiles!tasks_assignee_id_fkey(full_name), author:profiles!tasks_author_id_fkey(full_name), passed:profiles!tasks_passed_to_fkey(full_name)";
export const MESSAGE_SELECT = "*, sender:profiles!task_messages_sender_id_fkey(full_name)";

export const taskKeys = {
  root: ["tasks"] as const,
  mine: (userId: string) => ["tasks", "mine", userId] as const,
  sent: (userId: string) => ["tasks", "sent", userId] as const,
  board: () => ["tasks", "board"] as const,
  detail: (taskId: string) => ["tasks", "detail", taskId] as const,
  thread: (taskId: string) => ["task-thread", taskId] as const,
  me: () => ["me"] as const,
  fresh: (userId: string) => ["tasks", "fresh", userId] as const,
  // plain lists under the root: every optimistic patch and every delete reaches them as it does the others
  archive: (scope: string) => ["tasks", "archive", scope] as const,
  search: (scope: string) => ["tasks", "search", scope] as const,
};

/** Closed tasks come a page at a time (D-130); the open ones always all of them. */
export const CLOSED_PAGE = 100;
export const CLOSED_STATUSES = ["done", "declined", "revoked"] as const;

/**
 * A deleted task leaves every cached list at once, the way «Удалить» on the author's own phone
 * does it. Realtime delivers no DELETE to a filtered channel, and the employee's lists listen on
 * `assignee_id=eq.<me>` — so without this channel an order deleted on the director's phone stays
 * in Лента and «Мои дела» until the next snapshot (a return to the tab), and the face never plays
 * its «рассыпалась» (tasks/020). This channel has no filter and takes DELETE only: the event
 * carries the id and nothing else, RLS has no row to check, and an id that is in no list changes
 * nothing. Every hook that mounts it shares one socket join (the registry keys the topic).
 */
export function useTaskDeletes(enabled: boolean) {
  const queryClient = useQueryClient();
  useRealtimeListener<TaskRow>(
    { table: "tasks", event: "DELETE" },
    (payload) => {
      const id = (payload.old as Partial<TaskRow> | undefined)?.id;
      if (!id) return;
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
        Array.isArray(old) && old.some((row) => (row as { id?: string } | null)?.id === id)
          ? old.filter((row) => (row as { id?: string } | null)?.id !== id)
          : old,
      );
    },
    // nothing to catch up on: a delete missed while the socket was down is dropped by the
    // snapshot every list takes on resubscribe
    () => {},
    "task-deletes",
    enabled,
  );
}
