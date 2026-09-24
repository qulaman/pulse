"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError, NetworkError } from "@/lib/net";
import { dequeue, enqueue } from "@/lib/outbox";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import {
  markBoardRead,
  taskKeys,
  type Me,
  type TaskMessage,
  type TaskRow,
  type TaskWithPeople,
} from "./queries";
import type { TaskStatus } from "./status-text";
import { markFailed } from "./thread";

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

type ApiErrorBody = { error?: { code?: string; message_ru?: string } };

async function postJson(path: string, payload: unknown): Promise<void> {
  // the idempotency key doubles as the outbox key: a replay after a reload is the same call
  const key = (payload as { client_request_id?: string } | null)?.client_request_id ?? `${path}:${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // the mutation pauses and resumes when the network is back (QueryProvider, networkMode
    // offlineFirst); the persisted copy survives a closed tab and replays on the next start
    enqueue({ id: key, path, payload });
    throw new NetworkError("Нет связи. Отправлю, как появится");
  }
  dequeue(key);

  if (res.ok) return;
  if (res.status === 401 && typeof window !== "undefined") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drop every client cache of the dead session
    window.location.assign(`${window.location.origin}/login`);
    throw new Error("Сессия истекла. Войди заново");
  }

  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  throw new Error(body?.error?.message_ru ?? GENERIC_ERROR);
}

/* -------------------------------------------------------------------------- */
/* Optimistic patching across every cached shape that holds tasks              */
/* -------------------------------------------------------------------------- */

type TaskPatch = Partial<TaskRow>;

function patchOne<T extends TaskWithPeople>(task: T, taskId: string, patch: TaskPatch): T {
  return task.id === taskId ? { ...task, ...patch } : task;
}

function patchCached(old: unknown, taskId: string, patch: TaskPatch): unknown {
  if (Array.isArray(old)) {
    return (old as TaskWithPeople[]).map((task) => patchOne(task, taskId, patch));
  }
  if (old && typeof old === "object") {
    const record = old as Record<string, unknown>;
    if (typeof record.id === "string") {
      return patchOne(old as TaskWithPeople, taskId, patch);
    }
  }
  return old;
}

/** Snapshot every `tasks`-prefixed cache so a failed call can be rolled back. */
function snapshotTasks(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: taskKeys.root });
}

function restoreTasks(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotTasks>) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

function invalidateTasks(queryClient: QueryClient, taskId: string) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.root });
  void queryClient.invalidateQueries({ queryKey: taskKeys.thread(taskId) });
}

/* -------------------------------------------------------------------------- */
/* Transitions — the single door is POST /api/tasks/:id/transition             */
/* -------------------------------------------------------------------------- */

export type TransitionInput = {
  taskId: string;
  toStatus: TaskStatus;
  /** Idempotency key, minted once per tap (useTaskActions) so a paused/retried call stays one call. */
  requestId: string;
  /** «Не могу»: chip + free text, becomes a visible message. */
  reason?: string;
  /** Rework note from the director, likewise a visible message. */
  comment?: string;
  /** «Выполнено»: the report rides inside the transition — one call, one transaction (D-64 §3). */
  report?: { text?: string; file_path?: string };
};

export function useTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransitionInput) => {
      await postJson(`/api/tasks/${input.taskId}/transition`, {
        to_status: input.toStatus,
        reason: input.reason,
        comment: input.comment,
        report: input.report,
        client_request_id: input.requestId,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
        patchCached(old, input.taskId, { status: input.toStatus }),
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

export function useRevoke() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, requestId }: { taskId: string; requestId: string }) => {
      await postJson(`/api/tasks/${taskId}/revoke`, {
        client_request_id: requestId,
      });
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
        patchCached(old, taskId, { status: "revoked" }),
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, { taskId }) => invalidateTasks(queryClient, taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* «Продлить» and «Переназначить» — RPCs behind their own routes                 */
/* -------------------------------------------------------------------------- */

export type ExtendInput = { taskId: string; deadlineIso: string | null; requestId: string };

export function useExtendDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ExtendInput) => {
      await postJson(`/api/tasks/${input.taskId}/deadline`, {
        deadline_iso: input.deadlineIso,
        client_request_id: input.requestId,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
        patchCached(old, input.taskId, { deadline: input.deadlineIso }),
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

export type ReassignInput = { taskId: string; assigneeId: string; assigneeName: string; requestId: string };

export function useReassign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReassignInput) => {
      await postJson(`/api/tasks/${input.taskId}/reassign`, {
        assignee_id: input.assigneeId,
        client_request_id: input.requestId,
      });
    },
    // no optimistic clone: the new task's id comes from the server, the lists refetch at once
    onSuccess: (_data, input) => toast(`Передал: ${input.assigneeName}`),
    onError: (error) => toast(error instanceof Error ? error.message : GENERIC_ERROR),
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* Read cursor — «I have seen this thread up to here» (D-61)                    */
/* -------------------------------------------------------------------------- */

/** `companyId` is unused by the RPC (it reads the caller's own company) — kept for the callers. */
export type MarkReadInput = { taskId: string; companyId: string; seq: number };

/**
 * The person's read cursor on a thread: opening the thread, «Прочитал» on the card, a
 * reply. The board row loses its unread mark at once; the RPC follows. Nothing to
 * roll back on failure — the next fetch tells the truth.
 *
 * The cursor moves through `mark_thread_read` and nowhere else: it takes `greatest(old,
 * new)`, so a replay of an older «Прочитал» (the outbox after a reconnect, a second tab)
 * can no longer drag the cursor back and light the row up again.
 */
export function useMarkRead(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkReadInput) => {
      if (!me) return;
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("mark_thread_read", { task_id: input.taskId, seq: input.seq });
      if (error) throw new Error(error.message);
    },
    // a board request already in flight carries the old cursor: it must not land over the
    // optimistic one (the employee's face went back to «nervous» after «Прочитал», D-110), so
    // it is cancelled here and the board asks again once the server has the cursor
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.board() });
      markBoardRead(queryClient, input.taskId, input.seq);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.board() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Cleanup — hard deletes, the director's only (delete_task / purge_closed_tasks) */
/* -------------------------------------------------------------------------- */

function dropCached(old: unknown, taskId: string): unknown {
  if (Array.isArray(old)) return (old as TaskWithPeople[]).filter((task) => task.id !== taskId);
  return old;
}

/** «Удалить»: the order leaves every list at once; the server call follows. */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      await postJson(`/api/tasks/${taskId}/delete`, {});
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) => dropCached(old, taskId));
      return { snapshot };
    },
    onSuccess: () => toast("Удалил"),
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: taskKeys.root }),
  });
}

/** «Очистить закрытые»: done / declined / revoked orders of the company, gone for good. */
export function usePurgeClosed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      const res = await fetch("/api/tasks/purge", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(GENERIC_ERROR);
      const body = (await res.json()) as { deleted?: number };
      return body.deleted ?? 0;
    },
    onSuccess: (deleted) => toast(deleted > 0 ? `Удалил: ${deleted}` : "Закрытых задач не было"),
    onError: (error) => toast(error instanceof Error ? error.message : GENERIC_ERROR),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: taskKeys.root }),
  });
}

/* -------------------------------------------------------------------------- */
/* Messages — straight into task_messages under RLS                            */
/* -------------------------------------------------------------------------- */

export type SendMessageInput = {
  taskId: string;
  companyId: string;
  text: string;
  /** `{ is_question: true }` for «Уточнить» (D-03). */
  meta?: Record<string, unknown>;
  /** Storage path of the attachment — `photos` for a photo, `voice` for a recording. */
  filePath?: string | null;
  /** Derived from `filePath` when omitted; a voice message says so itself. */
  type?: "text" | "photo" | "voice";
  /** A retry sends the very same row again — same id, so nothing is duplicated (принцип 7). */
  id?: string;
};

function typeOf(input: Pick<SendMessageInput, "type" | "filePath">): "text" | "photo" | "voice" {
  return input.type ?? (input.filePath ? "photo" : "text");
}

/**
 * The id is generated on the client and inserted explicitly, so the optimistic
 * row and the row that comes back are the same row — mergeBySeq dedupes them
 * instead of showing the message twice.
 */
export function useSendMessage(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput & { id: string }) => {
      if (!me) throw new Error(GENERIC_ERROR);
      const supabase = createBrowserSupabase();
      const row = {
        id: input.id,
        task_id: input.taskId,
        company_id: input.companyId,
        sender_id: me.userId,
        type: typeOf(input),
        content: input.text || null,
        file_path: input.filePath ?? null,
        meta: (input.meta ?? {}) as Json,
      };
      const { error } = await supabase.from("task_messages").insert(row);
      if (error && isNetworkError(error)) {
        // the row waits in the persisted outbox too — a closed tab must not lose the words
        enqueue({ id: input.id, kind: "message", path: "task_messages", payload: row });
        throw new NetworkError();
      }
      if (error) throw new Error(GENERIC_ERROR);
      dequeue(input.id);
      // the other side hears it now, not on the minute sweep (D-114)
      kickPush();
    },
    onMutate: async (input) => {
      const queryKey = taskKeys.thread(input.taskId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskMessage[]>(queryKey);

      // a retry of a failed row replaces it in place; a new row goes to the end
      const withoutRetry = (previous ?? []).filter((message) => message.id !== input.id);

      if (me) {
        const pending: TaskMessage = {
          id: input.id,
          task_id: input.taskId,
          company_id: input.companyId,
          sender_id: me.userId,
          // Placeholder ordering only: pending rows are excluded from the cursor.
          seq: (previous?.length ? previous[previous.length - 1].seq : 0) + 0.5,
          type: typeOf(input),
          content: input.text || null,
          file_path: input.filePath ?? null,
          meta: { ...(input.meta ?? {}), pending: true } as Json,
          created_at: new Date().toISOString(),
          sender: { full_name: me.fullName },
        };
        queryClient.setQueryData<TaskMessage[]>(queryKey, [...withoutRetry, pending]);
      }

      return { previous, queryKey };
    },
    onError: (error, input, context) => {
      if (!context) return;
      // No network: the row is in the persisted outbox and will arrive — it stays on
      // screen with its clock, because taking the words away is the one thing that
      // would make the person write them twice (принцип 5, DoD «оффлайн»).
      if (error instanceof NetworkError || isNetworkError(error)) return;
      queryClient.setQueryData<TaskMessage[]>(context.queryKey, (old) => markFailed(old, input.id));
      toast(GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* The action surface the card talks to                                        */
/* -------------------------------------------------------------------------- */

export type TaskActions = {
  transition: (input: Omit<TransitionInput, "requestId">) => void;
  /** rework → accepted → pending_review: two calls, two client_request_id. */
  complete: (input: { taskId: string; fromStatus: TaskStatus; report?: { text?: string; file_path?: string } }) => void;
  revoke: (taskId: string) => void;
  /** «Продлить»: a new deadline (null — «без срока») on an open task. */
  extend: (input: Omit<ExtendInput, "requestId">) => void;
  /** «Переназначить»: the same order to another person; the old task is revoked. */
  reassign: (input: Omit<ReassignInput, "requestId">) => void;
  sendMessage: (input: SendMessageInput) => void;
  /** «Удалить»: hard delete, no trace — cleanup of wrong and test orders. */
  remove: (taskId: string) => void;
  /** «Прочитал» / the thread opened: the read cursor up to this seq. */
  markRead: (input: MarkReadInput) => void;
  busy: boolean;
};

export function useTaskActions(me: Me | undefined): TaskActions {
  const transition = useTransition();
  const revoke = useRevoke();
  const extend = useExtendDeadline();
  const reassign = useReassign();
  const sendMessage = useSendMessage(me);
  const remove = useDeleteTask();
  const markRead = useMarkRead(me);

  return {
    transition: (input) => transition.mutate({ ...input, requestId: crypto.randomUUID() }),
    extend: (input) => extend.mutate({ ...input, requestId: crypto.randomUUID() }),
    reassign: (input) => reassign.mutate({ ...input, requestId: crypto.randomUUID() }),
    complete: ({ taskId, fromStatus, report }) => {
      if (fromStatus === "rework") {
        // The employee taps once; the matrix still demands rework → accepted first.
        // The report goes with the second call — the one that is the handover.
        transition.mutate(
          { taskId, toStatus: "accepted", requestId: crypto.randomUUID() },
          {
            onSuccess: () => transition.mutate({ taskId, toStatus: "pending_review", requestId: crypto.randomUUID(), report }),
          },
        );
        return;
      }
      transition.mutate({ taskId, toStatus: "pending_review", requestId: crypto.randomUUID(), report });
    },
    revoke: (taskId) => revoke.mutate({ taskId, requestId: crypto.randomUUID() }),
    sendMessage: (input) => sendMessage.mutate({ ...input, id: input.id ?? crypto.randomUUID() }),
    remove: (taskId) => remove.mutate({ taskId }),
    markRead: (input) => markRead.mutate(input),
    // sending a message is not «busy»: the composer stays live, the row carries its own clock
    busy: transition.isPending || revoke.isPending || extend.isPending || reassign.isPending,
  };
}
