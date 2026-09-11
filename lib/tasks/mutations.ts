"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import {
  taskKeys,
  type DirectorInbox,
  type Me,
  type TaskMessage,
  type TaskRow,
  type TaskWithPeople,
} from "./queries";
import type { TaskStatus } from "./status-text";

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

type ApiErrorBody = { error?: { code?: string; message_ru?: string } };

async function postJson(path: string, payload: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Нет связи. Повторю по тапу");
  }

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

function patchOne(task: TaskWithPeople, taskId: string, patch: TaskPatch): TaskWithPeople {
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
    if (Array.isArray(record.overdue)) {
      const inbox = old as DirectorInbox;
      return {
        overdue: inbox.overdue.map((task) => patchOne(task, taskId, patch)),
        declined: (inbox.declined ?? []).map((task) => ({ ...patchOne(task, taskId, patch), decline_reason: task.decline_reason })),
        questions: inbox.questions.map((task) => patchOne(task, taskId, patch)),
        review: inbox.review.map((task) => patchOne(task, taskId, patch)),
      } satisfies DirectorInbox;
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
  /** «Не могу»: chip + free text, becomes a visible message. */
  reason?: string;
  /** Rework note from the director, likewise a visible message. */
  comment?: string;
};

export function useTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransitionInput) => {
      await postJson(`/api/tasks/${input.taskId}/transition`, {
        to_status: input.toStatus,
        reason: input.reason,
        comment: input.comment,
        client_request_id: crypto.randomUUID(),
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
    mutationFn: async (taskId: string) => {
      await postJson(`/api/tasks/${taskId}/revoke`, {
        client_request_id: crypto.randomUUID(),
      });
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
        patchCached(old, taskId, { status: "revoked" }),
      );
      return { snapshot };
    },
    onError: (error, _taskId, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, taskId) => invalidateTasks(queryClient, taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* «Продлить» and «Переназначить» — RPCs behind their own routes                 */
/* -------------------------------------------------------------------------- */

export type ExtendInput = { taskId: string; deadlineIso: string | null };

export function useExtendDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ExtendInput) => {
      await postJson(`/api/tasks/${input.taskId}/deadline`, {
        deadline_iso: input.deadlineIso,
        client_request_id: crypto.randomUUID(),
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

export type ReassignInput = { taskId: string; assigneeId: string; assigneeName: string };

export function useReassign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReassignInput) => {
      await postJson(`/api/tasks/${input.taskId}/reassign`, {
        assignee_id: input.assigneeId,
        client_request_id: crypto.randomUUID(),
      });
    },
    // no optimistic clone: the new task's id comes from the server, the lists refetch at once
    onSuccess: (_data, input) => toast(`Передал: ${input.assigneeName}`),
    onError: (error) => toast(error instanceof Error ? error.message : GENERIC_ERROR),
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
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
  /** Storage path in the `photos` bucket — the message becomes type `photo`, text is the caption. */
  filePath?: string | null;
};

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
      const { error } = await supabase.from("task_messages").insert({
        id: input.id,
        task_id: input.taskId,
        company_id: input.companyId,
        sender_id: me.userId,
        type: input.filePath ? "photo" : "text",
        content: input.text || null,
        file_path: input.filePath ?? null,
        meta: (input.meta ?? {}) as Json,
      });
      if (error) throw new Error(GENERIC_ERROR);
    },
    onMutate: async (input) => {
      const queryKey = taskKeys.thread(input.taskId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskMessage[]>(queryKey);

      if (me) {
        const pending: TaskMessage = {
          id: input.id,
          task_id: input.taskId,
          company_id: input.companyId,
          sender_id: me.userId,
          // Placeholder ordering only: pending rows are excluded from the cursor.
          seq: (previous?.length ? previous[previous.length - 1].seq : 0) + 0.5,
          type: input.filePath ? "photo" : "text",
          content: input.text || null,
          file_path: input.filePath ?? null,
          meta: { ...(input.meta ?? {}), pending: true } as Json,
          created_at: new Date().toISOString(),
          sender: { full_name: me.fullName },
        };
        queryClient.setQueryData<TaskMessage[]>(queryKey, [...(previous ?? []), pending]);
      }

      return { previous, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) queryClient.setQueryData(context.queryKey, context.previous);
      toast(GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* The action surface the card talks to                                        */
/* -------------------------------------------------------------------------- */

export type TaskActions = {
  transition: (input: TransitionInput) => void;
  /** rework → accepted → pending_review: two calls, two client_request_id. */
  complete: (input: { taskId: string; fromStatus: TaskStatus }) => void;
  revoke: (taskId: string) => void;
  /** «Продлить»: a new deadline (null — «без срока») on an open task. */
  extend: (input: ExtendInput) => void;
  /** «Переназначить»: the same order to another person; the old task is revoked. */
  reassign: (input: ReassignInput) => void;
  sendMessage: (input: SendMessageInput) => void;
  busy: boolean;
};

export function useTaskActions(me: Me | undefined): TaskActions {
  const transition = useTransition();
  const revoke = useRevoke();
  const extend = useExtendDeadline();
  const reassign = useReassign();
  const sendMessage = useSendMessage(me);

  return {
    transition: (input) => transition.mutate(input),
    extend: (input) => extend.mutate(input),
    reassign: (input) => reassign.mutate(input),
    complete: ({ taskId, fromStatus }) => {
      if (fromStatus === "rework") {
        // The employee taps once; the matrix still demands rework → accepted first.
        transition.mutate(
          { taskId, toStatus: "accepted" },
          {
            onSuccess: () => transition.mutate({ taskId, toStatus: "pending_review" }),
          },
        );
        return;
      }
      transition.mutate({ taskId, toStatus: "pending_review" });
    },
    revoke: (taskId) => revoke.mutate(taskId),
    sendMessage: (input) => sendMessage.mutate({ ...input, id: crypto.randomUUID() }),
    busy: transition.isPending || revoke.isPending || sendMessage.isPending,
  };
}
