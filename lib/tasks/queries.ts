"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  lastSeqOf,
  mergeBySeq,
  useRealtimeInvalidate,
  useRealtimeQuery,
} from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";
import { isOverdue, type TaskStatus } from "./status-text";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskMessageRow = Database["public"]["Tables"]["task_messages"]["Row"];
export type Role = Database["public"]["Enums"]["user_role"];

type Person = { full_name: string } | null;

export type TaskWithPeople = TaskRow & { assignee: Person; author: Person };
export type TaskMessage = TaskMessageRow & { sender: Person };

export type Me = {
  userId: string;
  companyId: string;
  role: Role;
  isActive: boolean;
  fullName: string;
};

const TASK_SELECT =
  "*, assignee:profiles!tasks_assignee_id_fkey(full_name), author:profiles!tasks_author_id_fkey(full_name)";
const MESSAGE_SELECT = "*, sender:profiles!task_messages_sender_id_fkey(full_name)";

/** Statuses an employee still has to act on — «Мои дела». */
export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  "sent",
  "accepted",
  "rework",
  "pending_review",
];

const OVERDUE_STATUSES: readonly TaskStatus[] = ["sent", "accepted", "rework"];

export const taskKeys = {
  root: ["tasks"] as const,
  mine: (userId: string) => ["tasks", "mine", userId] as const,
  sent: (userId: string) => ["tasks", "sent", userId] as const,
  inbox: () => ["tasks", "inbox"] as const,
  detail: (taskId: string) => ["tasks", "detail", taskId] as const,
  thread: (taskId: string) => ["task-thread", taskId] as const,
  me: () => ["me"] as const,
};

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
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("assignee_id", userId);
  if (error) throw new Error(error.message);
  return sortByUrgency((data ?? []) as unknown as TaskWithPeople[]);
}

/**
 * The employee's own tasks. The Realtime filter narrows the socket to this user;
 * RLS narrows it again on the server, so the two never disagree.
 */
export function useMyTasks(userId: string | undefined) {
  return useRealtimeQuery<TaskWithPeople[], TaskRow>({
    queryKey: taskKeys.mine(userId ?? ""),
    queryFn: () => fetchMyTasks(userId as string),
    channel: { table: "tasks", filter: userId ? `assignee_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
  });
}

async function fetchSentTasks(userId: string): Promise<TaskWithPeople[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaskWithPeople[];
}

/** Everything the director sent, newest first — «Отправленные». Scheduled ones included (author sees them). */
export function useSentTasks(userId: string | undefined) {
  return useRealtimeQuery<TaskWithPeople[], TaskRow>({
    queryKey: taskKeys.sent(userId ?? ""),
    queryFn: () => fetchSentTasks(userId as string),
    channel: { table: "tasks", filter: userId ? `author_id=eq.${userId}` : undefined },
    enabled: Boolean(userId),
  });
}

export function activeOnly(tasks: TaskWithPeople[] | undefined): TaskWithPeople[] {
  return (tasks ?? []).filter((task) => ACTIVE_STATUSES.includes(task.status));
}

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
  return data as unknown as TaskWithPeople;
}

export function useTask(taskId: string) {
  return useRealtimeQuery<TaskWithPeople, TaskRow>({
    queryKey: taskKeys.detail(taskId),
    queryFn: () => fetchTask(taskId),
    channel: { table: "tasks", filter: `id=eq.${taskId}` },
  });
}

/** A message still in flight carries `meta.pending` and no server seq yet. */
export function isPendingMessage(message: TaskMessage): boolean {
  const meta = message.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).pending === true;
}

/**
 * Thread messages with the seq cursor: a refetch after a dead socket asks only
 * for `seq > lastSeq` and folds the answer into the cached page
 * (docs/FRONTEND.md "State management"). An empty cache reads the whole thread.
 * Optimistic rows are excluded from the cursor — their seq is a placeholder and
 * would otherwise skip the real row that replaces them.
 */
export function useTaskMessages(taskId: string) {
  const queryClient = useQueryClient();
  const queryKey = taskKeys.thread(taskId);

  return useRealtimeQuery<TaskMessage[], TaskMessageRow>({
    queryKey,
    queryFn: async () => {
      const cached = queryClient.getQueryData<TaskMessage[]>(queryKey) ?? [];
      const lastSeq = lastSeqOf(cached.filter((message) => !isPendingMessage(message)));

      const supabase = createBrowserSupabase();
      let request = supabase
        .from("task_messages")
        .select(MESSAGE_SELECT)
        .eq("task_id", taskId)
        .order("seq", { ascending: true });
      if (lastSeq > 0) request = request.gt("seq", lastSeq);

      const { data, error } = await request;
      if (error) throw new Error(error.message);
      return mergeBySeq(cached, (data ?? []) as unknown as TaskMessage[]);
    },
    channel: { table: "task_messages", filter: `task_id=eq.${taskId}` },
    onEvent: (_payload, client) => {
      // The payload carries no joined sender name, and an UPDATE may be the
      // answered_at stamp on an older question — go back through the cursor.
      void client.invalidateQueries({ queryKey });
    },
  });
}

export function useTaskThread(taskId: string) {
  const task = useTask(taskId);
  const messages = useTaskMessages(taskId);
  return { task, messages };
}

/* -------------------------------------------------------------------------- */
/* Director: «Требует вас» — three stacks in D-05 order                        */
/* -------------------------------------------------------------------------- */

export type DirectorInbox = {
  overdue: TaskWithPeople[];
  questions: TaskWithPeople[];
  review: TaskWithPeople[];
};

export const EMPTY_INBOX: DirectorInbox = { overdue: [], questions: [], review: [] };

function isQuestionOpen(meta: Json): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const record = meta as Record<string, unknown>;
  return record.is_question === true && !record.answered_at;
}

async function fetchDirectorInbox(): Promise<DirectorInbox> {
  const supabase = createBrowserSupabase();
  const nowIso = new Date().toISOString();

  // Company scoping is RLS's job — a director sees their company and nothing else.
  const [review, overdue, questionRows] = await Promise.all([
    supabase.from("tasks").select(TASK_SELECT).eq("status", "pending_review"),
    supabase
      .from("tasks")
      .select(TASK_SELECT)
      .in("status", [...OVERDUE_STATUSES])
      .lt("deadline", nowIso),
    supabase
      .from("task_messages")
      .select(`meta, task:tasks!task_messages_task_id_fkey(${TASK_SELECT})`)
      .eq("meta->>is_question", "true")
      .is("meta->>answered_at", null),
  ]);

  for (const result of [review, overdue, questionRows]) {
    if (result.error) throw new Error(result.error.message);
  }

  const questionsById = new Map<string, TaskWithPeople>();
  for (const row of (questionRows.data ?? []) as unknown as Array<{
    meta: Json;
    task: TaskWithPeople | null;
  }>) {
    // The server filter already narrowed this; repeating the check client-side
    // keeps a malformed meta from widening the stack.
    if (!row.task || !isQuestionOpen(row.meta)) continue;
    if (row.task.status === "done" || row.task.status === "revoked") continue;
    questionsById.set(row.task.id, row.task);
  }

  return {
    overdue: sortByUrgency((overdue.data ?? []) as unknown as TaskWithPeople[]),
    questions: sortByUrgency([...questionsById.values()]),
    review: sortByUrgency((review.data ?? []) as unknown as TaskWithPeople[]),
  };
}

export function useDirectorInbox() {
  const queryKey = taskKeys.inbox();

  const query = useRealtimeQuery<DirectorInbox, TaskRow>({
    queryKey,
    queryFn: fetchDirectorInbox,
    channel: { table: "tasks" },
  });

  // An open question is a task_messages row — the tasks channel never sees it.
  useRealtimeInvalidate({ table: "task_messages" }, queryKey);

  return query;
}

export function inboxCounts(inbox: DirectorInbox | undefined) {
  const value = inbox ?? EMPTY_INBOX;
  return {
    overdue: value.overdue.length,
    questions: value.questions.length,
    review: value.review.length,
    total: value.overdue.length + value.questions.length + value.review.length,
  };
}
