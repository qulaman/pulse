"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  applyMessage,
  applyRead,
  applyTaskChange,
  BOARD_STATUSES,
  CHAT_TYPES,
  isOnBoard,
  lanesOf,
  toBoardTask,
  withoutTask,
  type BoardMessage,
  type BoardNote,
  type BoardTask,
} from "@/lib/pulse/board";
import {
  lastSeqOf,
  mergeBySeq,
  useRealtimeInvalidate,
  useRealtimeListener,
  useRealtimeQuery,
} from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { isOverdue, type TaskStatus } from "./status-text";
import { applyMessageUpdate } from "./thread";

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

const TASK_SELECT =
  "*, assignee:profiles!tasks_assignee_id_fkey(full_name), author:profiles!tasks_author_id_fkey(full_name), passed:profiles!tasks_passed_to_fkey(full_name)";
const MESSAGE_SELECT = "*, sender:profiles!task_messages_sender_id_fkey(full_name)";

/** Statuses an employee still has to act on — «Мои дела». */
export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  "sent",
  "accepted",
  "rework",
  "pending_review",
];


export const taskKeys = {
  root: ["tasks"] as const,
  mine: (userId: string) => ["tasks", "mine", userId] as const,
  sent: (userId: string) => ["tasks", "sent", userId] as const,
  board: () => ["tasks", "board"] as const,
  detail: (taskId: string) => ["tasks", "detail", taskId] as const,
  thread: (taskId: string) => ["task-thread", taskId] as const,
  me: () => ["me"] as const,
  fresh: (userId: string) => ["tasks", "fresh", userId] as const,
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
  // newest first: past max_rows (1000) PostgREST cuts the read, and an unordered cut was any
  // thousand of the person's tasks — ordered, it is the recent ones (D-126)
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assignee_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return sortByUrgency((data ?? []) as unknown as TaskWithPeople[]);
}

/**
 * A deleted task leaves every cached list at once, the way «Удалить» on the author's own phone
 * does it. Realtime delivers no DELETE to a filtered channel, and the employee's lists listen on
 * `assignee_id=eq.<me>` — so an order deleted on the director's phone used to stay in Лента and
 * «Мои дела» until the next snapshot (a return to the tab), and the face never played its
 * «рассыпалась» (tasks/020). This channel has no filter and takes DELETE only: the event carries
 * the id and nothing else, RLS has no row to check, and an id that is in no list changes nothing.
 * Every hook that mounts it shares one socket join (the registry keys the topic).
 */
function useTaskDeletes(enabled: boolean) {
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
 * How many of the employee's tasks wait for «Принял» — the badge on «Дела». A count, not the
 * list: the badge is on every screen, and the list is the person's whole history with its
 * people (D-126). It listens on the list's own socket (and the shared DELETE one), so the
 * number moves on the same events as the list behind it.
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
        .eq("status", "sent");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
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

/**
 * The same task as it sits in any cached list (feed, «Мои дела», inbox stacks,
 * «Отправленные»): opening a card must paint it at once, not after a skeleton.
 */
function findCachedTask(queryClient: ReturnType<typeof useQueryClient>, taskId: string) {
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
  return ((data ?? []) as unknown as TaskMessage[]).reverse();
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
        return ((data ?? []) as unknown as TaskMessage[]).reverse();
      }

      const { data, error } = await supabase
        .from("task_messages")
        .select(MESSAGE_SELECT)
        .eq("task_id", taskId)
        .gt("seq", lastSeq)
        .order("seq", { ascending: true });
      if (error) throw new Error(error.message);
      return mergeBySeq(cached, (data ?? []) as unknown as TaskMessage[]);
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

/* -------------------------------------------------------------------------- */
/* Director: the live board — one query, two channels, patches from payloads   */
/* -------------------------------------------------------------------------- */

/** A task the employee could not take, with the reason they gave («Не могу» + chip or words). */
export type DeclinedTask = TaskWithPeople & { decline_reason: string | null };

/** A task with an open question from the employee — the newest unanswered words. */
export type QuestionTask = TaskWithPeople & { question: string | null };

/** The board split the old way — the tab badge and «Задачи» still read these stacks. */
export type DirectorInbox = {
  overdue: TaskWithPeople[];
  declined: DeclinedTask[];
  questions: QuestionTask[];
  review: TaskWithPeople[];
};

export const EMPTY_INBOX: DirectorInbox = { overdue: [], declined: [], questions: [], review: [] };

/**
 * Tasks with their question and decline notes (a short list), the newest real message
 * of the thread (one row) and the caller's read cursor (their own row, by RLS).
 */
const BOARD_SELECT = `${TASK_SELECT}, notes:task_messages(id, content, meta, created_at, sender_id), last:task_messages(id, content, type, sender_id, seq, created_at), reads:task_reads(last_seq)`;

type BoardRow = TaskWithPeople & { notes: BoardNote[] | null; last: BoardMessage[] | null; reads: { last_seq: number }[] | null };

/**
 * Everything on the board in one request: tasks in work or waiting for the director,
 * each with the messages that matter to the board (open questions, decline reasons).
 * Company scoping is RLS's job — a director sees their company and nothing else.
 * Everybody but the director asks for their own rows only: RLS would also hand a manager
 * their subordinates', and Лента is about the person (the same narrowing as useMyTasks).
 */
async function fetchBoard(assigneeId?: string): Promise<BoardTask[]> {
  const supabase = createBrowserSupabase();
  let request = supabase
    .from("tasks")
    .select(BOARD_SELECT)
    .in("status", [...BOARD_STATUSES]);
  if (assigneeId) request = request.eq("assignee_id", assigneeId);
  const { data, error } = await request
    // the words the board reads: questions, refusals, requests for time, reminders, «не всё» (D-128)
    .or(
      "meta->>is_question.eq.true,meta->>decline_reason.eq.true,meta->>time_request.eq.true,meta->>nudge.eq.true,meta->>partial.eq.true",
      { referencedTable: "notes" },
    )
    .order("created_at", { referencedTable: "notes", ascending: false })
    .in("last.type", [...CHAT_TYPES])
    .order("seq", { referencedTable: "last", ascending: false })
    .limit(1, { referencedTable: "last" });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as BoardRow[]).map(({ notes, last, reads, ...task }) => toBoardTask(task, notes ?? [], last?.[0] ?? null, reads?.[0]?.last_seq ?? 0));
}

/** Bursts of events (a batch confirmed, a cron tick) ask for one refetch, not one each. */
const REFETCH_COALESCE_MS = 150;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBoardRefetch(queryClient: QueryClient) {
  if (refetchTimer !== null) return;
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    void queryClient.invalidateQueries({ queryKey: taskKeys.board() });
  }, REFETCH_COALESCE_MS);
}

/**
 * The director's board, live. A `tasks` event patches the cached row from its payload
 * — the tile recolours before any request is made; only an unknown row (a new task) or
 * a new assignee needs the joined names and asks for one coalesced refetch. A
 * `task_messages` event lands a question or a reason the same way. Closed rows keep
 * their closed status until the screen has said goodbye (`pruneClosed`).
 */
export function usePulseBoard(me: Me | undefined, enabled = true) {
  const queryKey = taskKeys.board();
  const queryClient = useQueryClient();
  const meId = me?.userId ?? "";
  // the person's own rows, on the socket as in the query; only the director takes the
  // whole company. A manager lands on Лента like anyone else, and RLS would hand them their
  // subordinates' tasks — a secretary's task then played on the manager's mascot as theirs.
  const assigneeId = me && me.role !== "director" ? meId : undefined;
  const live = enabled && Boolean(me);
  // the filtered socket of Лента never hears a DELETE: deletes come on their own channel; the
  // director's socket has no filter and takes them below
  useTaskDeletes(live && Boolean(assigneeId));

  const query = useRealtimeQuery<BoardTask[], TaskRow>({
    queryKey,
    queryFn: () => fetchBoard(assigneeId),
    channel: { table: "tasks", filter: assigneeId ? `assignee_id=eq.${assigneeId}` : undefined },
    enabled: live,
    onEvent: (payload, client) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<TaskRow>).id;
        if (id) client.setQueryData<BoardTask[]>(queryKey, (old) => (old ? withoutTask(old, id) : old));
        return;
      }
      const row = payload.new as TaskRow;
      const cached = client.getQueryData<BoardTask[]>(queryKey);
      if (!cached) return; // nothing to patch yet — the first fetch will have it
      const next = applyTaskChange(cached, row);
      if (next === "refetch") scheduleBoardRefetch(client);
      else if (next) client.setQueryData(queryKey, next);
    },
  });

  // No filter on this channel on purpose: a `task_messages` row carries no assignee_id,
  // so there is nothing to narrow it by. RLS cuts it on the server — the socket only ever
  // delivers messages of threads the reader is part of — and applyMessage drops whatever
  // belongs to a task the board does not hold.
  useRealtimeListener<TaskMessageRow>(
    { table: "task_messages" },
    (payload) => {
      if (payload.eventType === "DELETE") return;
      const message = payload.new as TaskMessageRow;
      const cached = queryClient.getQueryData<BoardTask[]>(queryKey);
      if (!cached) return;
      const next = applyMessage(cached, message, meId);
      if (next) queryClient.setQueryData(queryKey, next);
    },
    // the settle snapshot after a (re)subscribe belongs to the tasks channel; nothing to do here
    () => {},
    "board-messages",
    live,
  );

  return query;
}

/** The read cursor moved: the row's unread mark goes at once (the server row follows). */
export function markBoardRead(queryClient: QueryClient, taskId: string, seq: number) {
  queryClient.setQueryData<BoardTask[]>(taskKeys.board(), (old) => (old ? (applyRead(old, taskId, seq) ?? old) : old));
}

/** A closed row has said goodbye: drop it from the cache (a refetch would too). */
export function pruneClosed(queryClient: QueryClient, taskId: string) {
  queryClient.setQueryData<BoardTask[]>(taskKeys.board(), (old) => (old ? withoutTask(old, taskId) : old));
}

/** The board as the four stacks of D-05 — derived, never fetched on its own. */
export function inboxOf(rows: readonly BoardTask[], now: Date, meId: string): DirectorInbox {
  const lanes = lanesOf(rows, now, meId);
  return {
    overdue: lanes.overdue,
    declined: lanes.declined,
    // every open question, whichever lane the task sits in — «Задачи» marks them all; a request
    // for time is a question to the director too (D-128)
    questions: rows.filter(
      (task) => (task.question || (task.time_request && task.time_request.senderId !== meId)) && isOnBoard(task.status),
    ),
    review: lanes.review,
  };
}

export function useDirectorInbox(me: Me | undefined, enabled = true) {
  const board = usePulseBoard(me, enabled);
  const rows = board.data;
  const meId = me?.userId ?? "";
  const data = useMemo(() => (rows ? inboxOf(rows, new Date(), meId) : undefined), [rows, meId]);
  return { data, isLoading: board.isLoading, isError: board.isError };
}

export function inboxCounts(inbox: DirectorInbox | undefined) {
  const value = inbox ?? EMPTY_INBOX;
  return {
    overdue: value.overdue.length,
    declined: value.declined.length,
    questions: value.questions.length,
    review: value.review.length,
    total: value.overdue.length + value.declined.length + value.questions.length + value.review.length,
  };
}
