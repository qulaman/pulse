"use client";

import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { applyMessage, applyRead, applyTaskChange, HELD_STATUS, CHAT_TYPES, isOnBoard, lanesOf, toBoardTask, withoutTask, type BoardTask } from "@/lib/pulse/board";
import { useRealtimeListener, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { TASK_SELECT, taskKeys, useTaskDeletes, type Me, type TaskMessageRow, type TaskRow, type TaskWithPeople } from "./query-core";
import { ON_BOARD } from "@/lib/tasks/lifecycle";

/* -------------------------------------------------------------------------- */
/* Director: the live board — one query, two channels, patches from payloads   */
/* -------------------------------------------------------------------------- */

/** A task the employee could not take, with the reason they gave («Не могу» + chip or words). */
export type DeclinedTask = TaskWithPeople & { decline_reason: string | null };

/** A task with an open question from the employee — the newest unanswered words. */
export type QuestionTask = TaskWithPeople & { question: string | null };

/** The board split into the four stacks of D-05 — the tab badge and «Задачи» read these. */
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
const BOARD_SELECT =
  `${TASK_SELECT}, notes:task_messages(id, content, meta, created_at, sender_id), last:task_messages(id, content, type, sender_id, seq, created_at), reads:task_reads(last_seq)` as const;

/**
 * Everything on the board in one request: tasks in work or waiting for the director,
 * each with the messages that matter to the board (open questions, decline reasons).
 * Company scoping is RLS's job — a director sees their company and nothing else.
 * Everybody but the director asks for their own rows only: RLS would also hand a manager
 * their subordinates', and Лента is about the person (the same narrowing as useMyTasks).
 */
async function fetchBoard(assigneeId?: string): Promise<BoardTask[]> {
  const supabase = createBrowserSupabase();
  // the director's board also holds what waits for the morning — the team on Пульс shows it (D-139);
  // a person's own board never does: a held task is not theirs yet (D-38)
  let request = supabase
    .from("tasks")
    .select(BOARD_SELECT)
    .in("status", assigneeId ? [...ON_BOARD] : [...ON_BOARD, HELD_STATUS]);
  if (assigneeId) request = request.eq("assignee_id", assigneeId);
  const { data, error } = await request
    // the words the board reads: questions, refusals, requests for time, reminders, «не всё» (D-128),
    // the director's words with a return for rework (D-173)
    .or(
      "meta->>is_question.eq.true,meta->>decline_reason.eq.true,meta->>time_request.eq.true,meta->>nudge.eq.true,meta->>partial.eq.true,meta->>rework_comment.eq.true",
      { referencedTable: "notes" },
    )
    .order("created_at", { referencedTable: "notes", ascending: false })
    .in("last.type", [...CHAT_TYPES])
    .order("seq", { referencedTable: "last", ascending: false })
    .limit(1, { referencedTable: "last" });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ notes, last, reads, ...task }) => toBoardTask(task, notes ?? [], last?.[0] ?? null, reads?.[0]?.last_seq ?? 0));
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
  // subordinates' tasks — a secretary's task would then play on the manager's mascot as theirs.
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
      const next = applyTaskChange(cached, row, { held: !assigneeId });
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
