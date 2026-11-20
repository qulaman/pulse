"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { lastSeqOf, mergeBySeq, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { MESSAGE_SELECT, TASK_SELECT, taskKeys, type TaskMessage, type TaskMessageRow, type TaskRow, type TaskWithPeople } from "./query-core";
import { applyMessageUpdate } from "./thread";

/* -------------------------------------------------------------------------- */
/* One task and its thread                                                     */
/* -------------------------------------------------------------------------- */

async function fetchTask(taskId: string): Promise<TaskWithPeople> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The same task as it sits in any cached list (feed, «Мои дела», inbox stacks,
 * «Отправленные»): opening a card must paint it at once, not after a skeleton.
 */
function findCachedTask(queryClient: QueryClient, taskId: string) {
  for (const [, data] of queryClient.getQueriesData<unknown>({ queryKey: taskKeys.root })) {
    const lists: unknown[] = Array.isArray(data)
      ? [data]
      : data && typeof data === "object"
        ? Object.values(data as Record<string, unknown>)
        : [];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      const hit = (list as TaskWithPeople[]).find((task) => task?.id === taskId);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function useTask(taskId: string) {
  const queryClient = useQueryClient();
  return useRealtimeQuery<TaskWithPeople, TaskRow>({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => fetchTask(taskId),
    channel: { table: "tasks", filter: `id=eq.${taskId}` },
    placeholderData: () => findCachedTask(queryClient, taskId),
  });
}

/** A message still in flight carries `meta.pending` and no server seq yet. */
export function isPendingMessage(message: TaskMessage): boolean {
  const meta = message.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).pending === true;
}

/** How many messages the thread opens with, and how many «Показать раньше» adds. */
export const THREAD_PAGE = 50;

/** One page of older messages, before `beforeSeq` — the button above the thread. */
export async function fetchEarlierMessages(taskId: string, beforeSeq: number): Promise<TaskMessage[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("task_messages")
    .select(MESSAGE_SELECT)
    .eq("task_id", taskId)
    .lt("seq", beforeSeq)
    .order("seq", { ascending: false })
    .limit(THREAD_PAGE);
  if (error) throw new Error(error.message);
  return (data ?? []).reverse();
}

/** An older page in front of the cached tail — «Показать раньше» folds it in by seq. */
export function prependMessages(queryClient: QueryClient, taskId: string, older: TaskMessage[]): void {
  queryClient.setQueryData<TaskMessage[]>(taskKeys.thread(taskId), (cached) => mergeBySeq(older, cached ?? []));
}

/**
 * Thread messages with the seq cursor: a refetch after a dead socket asks only
 * for `seq > lastSeq` and folds the answer into the cached page
 * (docs/FRONTEND.md "State management"). An empty cache reads the tail — the last
 * THREAD_PAGE messages, the ones a person opens a thread to see; older ones come
 * page by page through `fetchEarlierMessages`.
 * Optimistic rows are excluded from the cursor — their seq is a placeholder and
 * would otherwise skip the real row that replaces them.
 */
export function useTaskMessages(taskId: string, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = taskKeys.thread(taskId);

  return useRealtimeQuery<TaskMessage[], TaskMessageRow>({
    queryKey,
    enabled,
    queryFn: async () => {
      const cached = queryClient.getQueryData<TaskMessage[]>(queryKey) ?? [];
      const lastSeq = lastSeqOf(cached.filter((message) => !isPendingMessage(message)));

      const supabase = createBrowserSupabase();
      if (lastSeq === 0) {
        const { data, error } = await supabase
          .from("task_messages")
          .select(MESSAGE_SELECT)
          .eq("task_id", taskId)
          .order("seq", { ascending: false })
          .limit(THREAD_PAGE);
        if (error) throw new Error(error.message);
        return (data ?? []).reverse();
      }

      const { data, error } = await supabase
        .from("task_messages")
        .select(MESSAGE_SELECT)
        .eq("task_id", taskId)
        .gt("seq", lastSeq)
        .order("seq", { ascending: true });
      if (error) throw new Error(error.message);
      // merged into the cache as it is NOW, not as it was when the request left: an UPDATE that
      // lands meanwhile (the answered_at of a question, closed by the very reply that set off
      // this fetch) stays — overwritten, «ждёт ответа» would hang until a reload (D-142)
      const latest = queryClient.getQueryData<TaskMessage[]>(queryKey) ?? cached;
      return mergeBySeq(latest, data ?? []);
    },
    channel: { table: "task_messages", filter: `task_id=eq.${taskId}` },
    onEvent: (payload, client) => {
      if (payload.eventType === "UPDATE") {
        // An UPDATE is the answered_at stamp on a question (or a transcript landing on a
        // voice message): the payload is the whole row, so the cached row is patched in
        // place. An invalidate here would repaint the thread the person is reading (Д-2).
        client.setQueryData<TaskMessage[]>(queryKey, (old) => applyMessageUpdate(old, payload.new as TaskMessageRow));
        return;
      }
      // An INSERT carries no joined sender name, a DELETE carries no row at all —
      // go back through the cursor.
      void client.invalidateQueries({ queryKey });
    },
  });
}

export function useTaskThread(taskId: string) {
  const task = useTask(taskId);
  const messages = useTaskMessages(taskId);
  return { task, messages };
}

/**
 * The person's own read cursor on a thread, asked once (`task_reads`, their own row by RLS):
 * 0 when there is no row yet. Not live and never refetched — the task's screen freezes it at
 * opening (`useSeenAtOpen`), before the thread on screen moves it.
 */
export function useOwnReadSeq(taskId: string, userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...taskKeys.root, "seen-at-open", taskId, userId ?? ""],
    queryFn: async () => {
      const { data, error } = await createBrowserSupabase()
        .from("task_reads")
        .select("last_seq")
        .eq("task_id", taskId)
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.last_seq ?? 0;
    },
    enabled: enabled && Boolean(userId),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}
