"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { warmRecurrenceRules } from "@/lib/recurrence/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { myMoveFilter } from "./my-move";
import { CLOSED_PAGE, CLOSED_STATUSES, TASK_SELECT, taskKeys, useTaskDeletes, type Me, type TaskRow, type TaskWithPeople } from "./query-core";
import { isOverdue } from "./status-text";

/*
 * The task queries of the app, by area: this file holds the person's own lists (useMe, «Мои дела»,
 * «Задачи» of the director); the archive and search, one task with its thread, and the live board
 * live beside it and are re-exported here, so a screen imports every task query from one place.
 */
export { CLOSED_PAGE, taskKeys } from "./query-core";
export type { Me, Role, TaskMessage, TaskMessageRow, TaskRow, TaskWithPeople } from "./query-core";
export { SEARCH_HITS, useTaskArchive, useTaskSearch, type ArchiveFilter, type TaskSearch } from "./archive-queries";
export {
  fetchEarlierMessages,
  isPendingMessage,
  prependMessages,
  THREAD_PAGE,
  useOwnReadSeq,
  useTask,
  useTaskMessages,
  useTaskThread,
} from "./thread-queries";
export {
  EMPTY_INBOX,
  inboxCounts,
  inboxOf,
  markBoardRead,
  pruneClosed,
  useDirectorInbox,
  usePulseBoard,
  type DeclinedTask,
  type DirectorInbox,
  type QuestionTask,
} from "./board-queries";

/* -------------------------------------------------------------------------- */
/* Who am I                                                                    */
/* -------------------------------------------------------------------------- */

export function useMe() {
  return useQuery({
    queryKey: taskKeys.me(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Me> => {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) throw new Error("me failed");
      const body = (await res.json()) as { profile: Me };
      return body.profile;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Sorting — D-05: overdue first, then by deadline, undated last               */
/* -------------------------------------------------------------------------- */

function urgencyRank(task: TaskRow, now: Date): number {
  if (isOverdue(task, now)) return 0;
  return task.deadline ? 1 : 2;
}

export function sortByUrgency<T extends TaskRow>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const rank = urgencyRank(a, now) - urgencyRank(b, now);
    if (rank !== 0) return rank;
    if (a.deadline && b.deadline) {
      const byDeadline = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (byDeadline !== 0) return byDeadline;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/* -------------------------------------------------------------------------- */
/* Employee: the feed and «Мои дела»                                           */
/* -------------------------------------------------------------------------- */

async function fetchMyTasks(userId: string): Promise<TaskWithPeople[]> {
  const supabase = createBrowserSupabase();
  // No status filter: RLS already hides `scheduled` from everyone but its author.
  // assignee filter: a manager also sees subordinates' tasks under RLS — not in «Лента».
  // newest first: past max_rows (1000) PostgREST cuts the read, and an unordered cut was any
  // thousand of the person's tasks — ordered, it is the recent ones (D-126)
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assignee_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return sortByUrgency(data ?? []);
}

/**
 * The employee's own tasks. The Realtime filter narrows the socket to this user;
 * RLS narrows it again on the server, so the two never disagree. Deletes come on their own
 * unfiltered channel (`useTaskDeletes`).
 */
export function useMyTasks(userId: string | undefined) {
  useTaskDeletes(Boolean(userId));
  return useRealtimeQuery<TaskWithPeople[], TaskRow>({
    queryKey: taskKeys.mine(userId ?? ""),
    queryFn: () => fetchMyTasks(userId as string),
    channel: { table: "tasks", filter: userId ? `assignee_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
  });
}

/**
 * How many of the employee's orders wait for their move — new, returned for rework, overdue in
 * work (`myMoveFilter`, D-173) — the badge on «Дела», the same number as the «Дела» ball on Лента.
 * A count, not the list: the badge is on every screen, and the list is the person's whole history
 * with its people (D-126). It listens on the list's own socket (and the shared DELETE one), so the
 * number moves on the same events as the list behind it; a deadline passing with no event is
 * picked up on the next read (the app coming back to the front, any change to the person's tasks).
 */
export function useFreshTaskCount(userId: string | undefined) {
  const key = taskKeys.fresh(userId ?? "");
  useRealtimeInvalidate({ table: "tasks", event: "DELETE" }, key, Boolean(userId));
  return useRealtimeQuery<number, TaskRow>({
    queryKey: key,
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", userId as string)
        .or(myMoveFilter(new Date()));
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    channel: { table: "tasks", filter: userId ? `assignee_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
  });
}

/** A guard, not a page: no director holds this many open orders — the list stays whole. */
const OPEN_CAP = 2000;

/**
 * How many closed tasks «Задачи» holds for a director right now and how many there are. Kept
 * outside the query key on purpose: every optimistic patch finds the list under the same key,
 * and a Realtime refetch keeps the pages the director has already opened.
 */
export const useSentPages = create<{ limit: Record<string, number>; total: Record<string, number> }>(() => ({
  limit: {},
  total: {},
}));

const newestFirst = (a: TaskRow, b: TaskRow) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0);

/**
 * Every open task of this director — an order from three weeks ago still in work must never
 * fall off the list (the old single «last 200» cut it off in about a week of a live pilot) —
 * and the closed ones, most recently closed first, a page at a time.
 */
async function fetchSentTasks(userId: string): Promise<TaskWithPeople[]> {
  const supabase = createBrowserSupabase();
  const limit = useSentPages.getState().limit[userId] ?? CLOSED_PAGE;
  const [open, closed] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("author_id", userId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(OPEN_CAP),
    supabase
      .from("tasks")
      .select(TASK_SELECT, { count: "exact" })
      .eq("author_id", userId)
      .in("status", [...CLOSED_STATUSES])
      .order("closed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (closed.error) throw new Error(closed.error.message);
  useSentPages.setState((state) => ({ total: { ...state.total, [userId]: closed.count ?? 0 } }));
  const rows: TaskWithPeople[] = [...(open.data ?? []), ...(closed.data ?? [])];
  return rows.sort(newestFirst);
}

/**
 * The tab bar fills a tab's list before its first open (D-136): the key and the fetch of
 * `useSentTasks` / `useMyTasks`, so the screen paints at once instead of its skeleton. Data
 * already fresh in the cache is left alone.
 */
export function warmSentTasks(client: QueryClient, userId: string): Promise<void> {
  return Promise.all([
    client.prefetchQuery({ queryKey: taskKeys.sent(userId), queryFn: () => fetchSentTasks(userId) }),
    // «Повторы» stand above the tabs of the same screen (D-148): the screen waits for them too
    warmRecurrenceRules(client),
  ]).then(() => undefined);
}

export function warmMyTasks(client: QueryClient, userId: string): Promise<void> {
  return client.prefetchQuery({ queryKey: taskKeys.mine(userId), queryFn: () => fetchMyTasks(userId) });
}

/**
 * Everything the director sent, newest first — «Отправленные». Scheduled ones included (author
 * sees them). Deletes come on their own unfiltered channel (`useTaskDeletes`).
 */
export function useSentTasks(userId: string | undefined) {
  useTaskDeletes(Boolean(userId));
  return useRealtimeQuery<TaskWithPeople[], TaskRow>({
    queryKey: taskKeys.sent(userId ?? ""),
    queryFn: () => fetchSentTasks(userId as string),
    channel: { table: "tasks", filter: userId ? `author_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
  });
}

/**
 * The closed tasks of «Задачи»: how many there are on the server, how many are loaded, and
 * «Показать ещё» — the next page, fetched under the same key (D-130).
 */
export function useClosedPages(userId: string | undefined) {
  const queryClient = useQueryClient();
  const total = useSentPages((state) => (userId ? state.total[userId] : undefined));
  const limit = useSentPages((state) => (userId ? (state.limit[userId] ?? CLOSED_PAGE) : CLOSED_PAGE));
  const more = () => {
    if (!userId) return Promise.resolve();
    useSentPages.setState((state) => ({ limit: { ...state.limit, [userId]: limit + CLOSED_PAGE } }));
    return queryClient.refetchQueries({ queryKey: taskKeys.sent(userId), exact: true });
  };
  return { total, limit, more };
}
