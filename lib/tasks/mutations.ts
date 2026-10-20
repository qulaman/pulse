"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { isNetworkError, NetworkError } from "@/lib/net";
import { dequeue, enqueue, release } from "@/lib/outbox";
import type { BoardTask } from "@/lib/pulse/board";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import { voiceApi, VoiceApiError } from "@/lib/voice/api";
import { forgetHold, holdForUndo, Undone } from "./grace";
import {
  markBoardRead,
  taskKeys,
  type Me,
  type TaskMessage,
  type TaskRow,
  type TaskWithPeople,
} from "./queries";
import { heldKeys } from "./held";
import { NUDGE_EVERY_MS } from "./lifecycle";
import { receiptKeys } from "./receipts";
import type { TaskStatus } from "./status-text";
import { markFailed } from "./thread";

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

type ApiErrorBody = { error?: { code?: string; message_ru?: string } };

/** The answer's JSON body on success (null when there is none); a failure throws. */
async function postJson(path: string, payload: unknown): Promise<unknown> {
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
    // offlineFirst); the persisted copy survives a closed tab and replays on the next start.
    // A tap fresh out of its «Отменить» window waited there unseen; now it really waits (D-139)
    enqueue({ id: key, path, payload });
    release(key);
    throw new NetworkError("Нет связи. Отправлю, как появится");
  }
  dequeue(key);

  if (res.ok) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
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

/** One row back to how a snapshot had it — in a list at its old place, or the task's own object. */
export function restoreOne(before: unknown, now: unknown, taskId: string): unknown {
  if (Array.isArray(before) && Array.isArray(now)) {
    const index = (before as TaskWithPeople[]).findIndex((task) => task?.id === taskId);
    if (index === -1) return now;
    const row = before[index];
    const at = (now as TaskWithPeople[]).findIndex((task) => task?.id === taskId);
    const copy = [...now];
    if (at >= 0) copy[at] = row;
    else copy.splice(Math.min(index, copy.length), 0, row);
    return copy;
  }
  if (before && typeof before === "object" && (before as { id?: unknown }).id === taskId) return before;
  return now;
}

/**
 * A tap taken back or refused inside its window (D-139): only that task goes back. The whole
 * snapshot would also take back a neighbour's tap still in its own window and whatever the
 * socket brought meanwhile.
 */
function rollbackTask(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotTasks>, taskId: string) {
  for (const [key, before] of snapshot) queryClient.setQueryData(key, (now: unknown) => restoreOne(before, now, taskId));
}

/**
 * The patches of the «Отменить» windows open right now (D-139), by call. The server has not
 * heard of these taps yet, so any list fetched meanwhile — a new task's refetch, a resubscribe,
 * another screen — brings the task back as it was; the patch goes over it again at once.
 */
const overlays = new Map<string, (old: unknown) => unknown>();
const overlaid = new WeakSet<QueryClient>();

function keepOverlays(queryClient: QueryClient) {
  if (overlaid.has(queryClient)) return;
  overlaid.add(queryClient);
  queryClient.getQueryCache().subscribe((event) => {
    if (overlays.size === 0 || event.type !== "updated" || event.action.type !== "success") return;
    // our own setQueryData is `manual`: only a fetch is laid over, so this never loops
    if (event.action.manual || event.query.queryKey[0] !== taskKeys.root[0]) return;
    const data = event.query.state.data;
    let next: unknown = data;
    for (const apply of overlays.values()) next = apply(next);
    if (next !== data) queryClient.setQueryData(event.query.queryKey, next);
  });
}

/** The board row carries what the task row does not — a request for time, a reminder (D-128). */
function patchBoard(queryClient: QueryClient, taskId: string, patch: Partial<BoardTask>) {
  queryClient.setQueryData<BoardTask[]>(taskKeys.board(), (old) =>
    old ? old.map((row) => (row.id === taskId ? { ...row, ...patch } : row)) : old,
  );
}

/**
 * After a change to one task: the task and its thread read anew at once; the lists are only
 * marked stale. The Realtime echo of this very change patches or refetches the lists on screen,
 * and a list opened later reads anew — refetching them all here (the board, «Отправленные» with
 * 200 rows, «Мои дела», the loads) was eight requests per tap (D-126).
 */
function invalidateTasks(queryClient: QueryClient, taskId: string) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.root, refetchType: "none" });
  void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
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
  /** «Это к другому» (D-128): the colleague suggested with the refusal. */
  suggestAssigneeId?: string;
  /** Rework note from the director, likewise a visible message. */
  comment?: string;
  /** «Выполнено»: the report rides inside the transition — one call, one transaction (D-64 §3). */
  report?: Report;
  /** The receipt of a director's «Принять» / «Настоять»: the call waits out «Отменить» (D-139). */
  undo?: string;
};

/** The words and the photo of a handover; `partial` — «сделано не всё» (D-128). */
export type Report = { text?: string; file_path?: string; partial?: boolean };

export function useTransition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: TransitionInput) => {
      const path = `/api/tasks/${input.taskId}/transition`;
      const payload = {
        to_status: input.toStatus,
        reason: input.reason,
        comment: input.comment,
        suggest_assignee_id: input.suggestAssigneeId,
        report: input.report,
        client_request_id: input.requestId,
      };
      // the lists show the move already; the server hears of it once «Отменить» is over (D-139)
      if (input.undo) await holdForUndo({ id: input.requestId, path, payload, taskId: input.taskId, text: input.undo });
      await postJson(path, payload);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      const patch = (old: unknown) => patchCached(old, input.taskId, { status: input.toStatus });
      queryClient.setQueriesData({ queryKey: taskKeys.root }, patch);
      if (input.undo) overlays.set(input.requestId, patch);
      return { snapshot };
    },
    onError: (error, input, context) => {
      if (input.undo) overlays.delete(input.requestId);
      if (context) {
        if (input.undo) rollbackTask(queryClient, context.snapshot, input.taskId);
        else restoreTasks(queryClient, context.snapshot);
      }
      if (error instanceof Undone) return;
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => {
      settleWindow(input.requestId);
      invalidateTasks(queryClient, input.taskId);
    },
  });
}

/** The call is over, one way or another: its window's patch and mark are not needed any more. */
function settleWindow(requestId: string) {
  overlays.delete(requestId);
  forgetHold(requestId);
}

export function useRevoke() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, requestId, undo }: { taskId: string; requestId: string; undo?: string }) => {
      const path = `/api/tasks/${taskId}/revoke`;
      const payload = { client_request_id: requestId };
      if (undo) await holdForUndo({ id: requestId, path, payload, taskId, text: undo });
      await postJson(path, payload);
    },
    onMutate: async ({ taskId, requestId, undo }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      const patch = (old: unknown) => patchCached(old, taskId, { status: "revoked" });
      queryClient.setQueriesData({ queryKey: taskKeys.root }, patch);
      if (undo) overlays.set(requestId, patch);
      return { snapshot };
    },
    onError: (error, { taskId, requestId, undo }, context) => {
      if (undo) overlays.delete(requestId);
      if (context) {
        if (undo) rollbackTask(queryClient, context.snapshot, taskId);
        else restoreTasks(queryClient, context.snapshot);
      }
      if (error instanceof Undone) return;
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, { taskId, requestId }) => {
      settleWindow(requestId);
      invalidateTasks(queryClient, taskId);
    },
  });
}

/** Only a held task changes its status; a task already out only lets its held words go. */
function releaseCached(old: unknown, taskId: string, at: string): unknown {
  const held = (task: unknown) => (task as TaskWithPeople | null)?.id === taskId && (task as TaskWithPeople).status === "scheduled";
  const release = (task: TaskWithPeople): TaskWithPeople => (held(task) ? { ...task, status: "sent", scheduled_send_at: at } : task);
  if (Array.isArray(old)) return (old as TaskWithPeople[]).map(release);
  if (!old || typeof old !== "object") return old;
  if (typeof (old as { id?: unknown }).id === "string") return release(old as TaskWithPeople);
  // the board keeps its lanes as arrays inside one object — the task's screen shows it from
  // there (placeholderData) until its own fetch lands, so it must move there too
  const entries = Object.entries(old as Record<string, unknown>);
  const holds = (value: unknown) => Array.isArray(value) && value.some(held);
  if (!entries.some(([, value]) => holds(value))) return old;
  return Object.fromEntries(entries.map(([key, value]) => [key, holds(value) ? (value as TaskWithPeople[]).map(release) : value]));
}

/** The first name of the task's assignee, from whatever list holds the task — for the toast. */
function assigneeOf(snapshot: ReturnType<typeof snapshotTasks>, taskId: string): string {
  for (const [, data] of snapshot) {
    const list = Array.isArray(data) ? (data as TaskWithPeople[]) : data && typeof data === "object" ? [data as TaskWithPeople] : [];
    const task = list.find((item) => item?.id === taskId);
    const name = task?.assignee?.full_name?.trim().split(/\s+/)[0];
    if (name) return name;
  }
  return "";
}

/**
 * «Отправить сейчас» after the fact (D-129): a task held for the morning goes out now, and
 * what it queued for the morning to the team (a message, «Доработать», «Настоять») with it.
 */
export function useSendNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, requestId }: { taskId: string; requestId: string }) => {
      await postJson(`/api/tasks/${taskId}/send-now`, {
        client_request_id: requestId,
      });
    },
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      const at = new Date().toISOString();
      queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) => releaseCached(old, taskId, at));
      // the receipt in words at the tap, as every move of the director has (useDirectorControls)
      const who = assigneeOf(snapshot, taskId);
      toast(who ? `Отправлено · ${who}` : "Отправлено");
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, { taskId }) => {
      invalidateTasks(queryClient, taskId);
      // the receipts that said «отправлю утром»
      void queryClient.invalidateQueries({ queryKey: heldKeys.task(taskId) });
      void queryClient.invalidateQueries({ queryKey: receiptKeys(taskId) });
    },
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

export type ReassignInput = {
  taskId: string;
  assigneeId: string;
  assigneeName: string;
  requestId: string;
  /** D-128: a new deadline for the new person — only when `changeDeadline` (null: «без срока») */
  deadlineIso?: string | null;
  changeDeadline?: boolean;
  /** D-128: the director's word to the new person */
  note?: string;
};

export function useReassign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReassignInput) => {
      await postJson(`/api/tasks/${input.taskId}/reassign`, {
        assignee_id: input.assigneeId,
        client_request_id: input.requestId,
        ...(input.changeDeadline ? { change_deadline: true, deadline_iso: input.deadlineIso ?? null } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      });
    },
    // no optimistic clone: the new task's id comes from the server, the lists refetch at once
    onSuccess: (_data, input) => toast(`Передал: ${input.assigneeName}`),
    onError: (error) => toast(error instanceof Error ? error.message : GENERIC_ERROR),
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

/* -------------------------------------------------------------------------- */
/* D-128: «Нужно больше времени», its answer, «Напомнить»                      */
/* -------------------------------------------------------------------------- */

export type RequestTimeInput = {
  taskId: string;
  /** a new task is taken by the request — «возьму, но к …» */
  fromStatus: TaskStatus;
  proposedIso: string;
  words?: string;
  requestId: string;
};

/** The employee asks for another deadline; the card shows «ждёт ответа» at once. */
export function useRequestDeadline(me: Me | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RequestTimeInput) => {
      await postJson(`/api/tasks/${input.taskId}/deadline-request`, {
        proposed_iso: input.proposedIso,
        words: input.words?.trim() || undefined,
        client_request_id: input.requestId,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      if (input.fromStatus === "sent") {
        queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
          patchCached(old, input.taskId, { status: "accepted" }),
        );
      }
      patchBoard(queryClient, input.taskId, {
        time_request: {
          id: `pending:${input.requestId}`,
          proposed: input.proposedIso,
          words: input.words?.trim() || null,
          at: new Date().toISOString(),
          senderId: me?.userId ?? null,
        },
      });
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

export type AnswerTimeInput = { taskId: string; approve: boolean; proposedIso: string | null; requestId: string };

/** «Согласовать» / «Оставить прежний»: the request leaves the card at once, the deadline follows. */
export function useAnswerDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AnswerTimeInput) => {
      await postJson(`/api/tasks/${input.taskId}/deadline-answer`, {
        approve: input.approve,
        client_request_id: input.requestId,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      if (input.approve && input.proposedIso) {
        queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) =>
          patchCached(old, input.taskId, { deadline: input.proposedIso }),
        );
      }
      patchBoard(queryClient, input.taskId, { time_request: null });
      return { snapshot };
    },
    onError: (error, _input, context) => {
      if (context) restoreTasks(queryClient, context.snapshot);
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, _error, input) => invalidateTasks(queryClient, input.taskId),
  });
}

export type NudgeInput = { taskId: string; name: string; requestId: string };

type NudgeResult = { too_soon?: boolean; last_at?: string; deliver_after?: string | null };

/**
 * «Напомнить»: the server says whether the push went now, waits for the window, or was not
 * sent because the last one is less than half an hour old — the toast says which.
 */
export function useNudge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NudgeInput): Promise<NudgeResult> => {
      const body = (await postJson(`/api/tasks/${input.taskId}/nudge`, { client_request_id: input.requestId })) as {
        result?: NudgeResult;
      } | null;
      return body?.result ?? {};
    },
    onSuccess: (result, input) => {
      const now = new Date();
      if (result.too_soon && result.last_at) {
        const left = Math.max(1, Math.ceil((new Date(result.last_at).getTime() + NUDGE_EVERY_MS - now.getTime()) / 60_000));
        toast(`Уже напомнили ${humanAqtobe(new Date(result.last_at), now)} · снова можно через ${left} мин`);
        return;
      }
      if (result.last_at) patchBoard(queryClient, input.taskId, { nudged_at: result.last_at });
      toast(
        result.deliver_after
          ? `Напомню ${humanAqtobe(new Date(result.deliver_after), now)} — сейчас тихие часы`
          : input.name
            ? `Напомнил · ${input.name}`
            : "Напомнил",
      );
    },
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

/**
 * «Удалить»: the order leaves every list at once; the server call follows the «Отменить»
 * window (D-139). The key rides in the body only to be the outbox's key — the route has no
 * body, and deleting what is already gone answers «ok», so a repeat is harmless.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, requestId, undo }: { taskId: string; requestId: string; undo?: string }) => {
      const path = `/api/tasks/${taskId}/delete`;
      const payload = { client_request_id: requestId };
      if (undo) await holdForUndo({ id: requestId, path, payload, taskId, text: undo });
      await postJson(path, payload);
    },
    onMutate: async ({ taskId, requestId, undo }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.root });
      const snapshot = snapshotTasks(queryClient);
      const patch = (old: unknown) => dropCached(old, taskId);
      queryClient.setQueriesData({ queryKey: taskKeys.root }, patch);
      if (undo) overlays.set(requestId, patch);
      return { snapshot };
    },
    // with a window the receipt was its toast
    onSuccess: (_data, { undo }) => {
      if (!undo) toast("Удалил");
    },
    onError: (error, { taskId, requestId, undo }, context) => {
      if (undo) overlays.delete(requestId);
      if (context) {
        if (undo) rollbackTask(queryClient, context.snapshot, taskId);
        else restoreTasks(queryClient, context.snapshot);
      }
      if (error instanceof Undone) return;
      toast(error instanceof Error ? error.message : GENERIC_ERROR);
    },
    onSettled: (_data, error, { requestId }) => {
      settleWindow(requestId);
      // taken back: the task is as it was everywhere already — nothing to read anew
      if (!(error instanceof Undone)) void queryClient.invalidateQueries({ queryKey: taskKeys.root });
    },
  });
}

export type ReissueInput = {
  /** the closed task to hand out again */
  task: TaskWithPeople;
  assigneeId: string;
  assigneeName: string;
  /** null — without a deadline */
  deadlineIso: string | null;
  /** «Открыть» on the toast: the new task's screen */
  onOpen?: (taskId: string) => void;
};

type ReissueResult = { taskId: string | null; scheduled: boolean };

/**
 * «Выдать снова» (D-139): a closed task — revoked by mistake, or accepted and needed again —
 * goes out as a new one: the same words, the same recording (принцип 5), to the same person or
 * the one picked, through the batch every task is born in (`confirm_voice_batch`, as «Поручить»
 * of a note, D-108). The old one stays as it was. Outside the delivery window the new one waits
 * for the morning (D-38). Online only, as «Поручить»: a task handed out «later» is worse than an
 * honest «нет связи», and the button stays where it was.
 */
export function useReissue() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    // an answer now or an honest «нет связи» — never a task handed out a minute later by a retry
    retry: false,
    mutationFn: async (input: ReissueInput & { requestId: string }): Promise<ReissueResult> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError();
      const { task } = input;
      const words = [task.title, task.body].filter(Boolean).join("\n");
      // what the director said and the recording of it travel with the new task, as a reassign's copy does
      const res = await voiceApi.confirm({
        client_request_id: input.requestId,
        source: task.source ?? "typed",
        audio_path: task.source_audio_path,
        transcript: task.source_transcript ?? words,
        parsed_entities: [],
        confirmed_entities: [
          {
            kind: "task",
            assignee_queries: [],
            assignee_id: input.assigneeId,
            assignee_name: input.assigneeName,
            assignee_confidence: 1,
            group_id: null,
            title: task.title,
            body: task.body,
            deadline_iso: input.deadlineIso,
            deadline_confidence: null,
            deadline_source_text: null,
            priority: task.priority,
            scheduled_send_at: null,
            source_span: words,
          },
        ],
      });
      const ids = (res.result.task_ids as string[] | null | undefined) ?? [];
      return { taskId: ids[0] ?? null, scheduled: res.result.scheduled === true };
    },
    onSuccess: (result, input) => {
      const who = input.assigneeName.trim().split(/\s+/)[0] ?? input.assigneeName;
      const text = result.scheduled ? `Выдал снова: ${who} · получит утром` : `Выдал снова: ${who}`;
      const id = result.taskId;
      const open = input.onOpen;
      toast(text, id && open ? { action: { label: "Открыть", onClick: () => open(id) }, lifetimeMs: 5_000 } : undefined);
      // the new task is the director's own move: the push goes now, not on the minute sweep
      if (!result.scheduled) kickPush();
    },
    onError: (error) => {
      if (isNetworkError(error) || error instanceof NetworkError || (error instanceof VoiceApiError && (error.code === "network" || error.status === 0))) {
        toast("Нет связи — не выдал, попробуйте ещё раз");
        return;
      }
      const words = error instanceof VoiceApiError ? (error.body as ApiErrorBody | null)?.error?.message_ru : null;
      toast(words ?? "Не получилось выдать снова. Попробуйте ещё раз");
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

/**
 * A handover kept on the phone — a report with a photo made without network (D-130): every
 * list shows the task handed in at once, as a paused transition would; the replay
 * (components/MediaReplay.tsx) makes it true on the server and the next snapshot agrees.
 */
export function showHandedIn(queryClient: QueryClient, taskId: string): void {
  queryClient.setQueriesData({ queryKey: taskKeys.root }, (old: unknown) => patchCached(old, taskId, { status: "pending_review" }));
}

/* -------------------------------------------------------------------------- */
/* The action surface the card talks to                                        */
/* -------------------------------------------------------------------------- */

export type TaskActions = {
  transition: (input: Omit<TransitionInput, "requestId">) => void;
  /** «Выполнено» — from a rework too: the RPC walks rework → accepted itself, one call (D-130). */
  complete: (input: { taskId: string; fromStatus: TaskStatus; report?: Report }) => void;
  revoke: (taskId: string) => void;
  /** «Отправить сейчас»: what this task holds for the morning goes out now (D-129). */
  sendNow: (taskId: string) => void;
  /** «Продлить»: a new deadline (null — «без срока») on an open task. */
  extend: (input: Omit<ExtendInput, "requestId">) => void;
  /** «Переназначить»: the same order to another person; the old task is revoked. */
  reassign: (input: Omit<ReassignInput, "requestId">) => void;
  /** «Нужно больше времени» / «Возьму, но к …» (D-128). */
  requestTime: (input: Omit<RequestTimeInput, "requestId">) => void;
  /** «Согласовать» / «Оставить прежний» (D-128). */
  answerTime: (input: Omit<AnswerTimeInput, "requestId">) => void;
  /** «Напомнить» (D-128). */
  nudge: (input: Omit<NudgeInput, "requestId">) => void;
  sendMessage: (input: SendMessageInput) => void;
  /** «Удалить»: hard delete, no trace — cleanup of wrong and test orders. */
  remove: (taskId: string) => void;
  /** «Выдать снова»: a closed task goes out again as a new one (D-139). */
  reissue: (input: ReissueInput) => void;
  /** «Прочитал» / the thread opened: the read cursor up to this seq. */
  markRead: (input: MarkReadInput) => void;
  busy: boolean;
};

/** The director's taps that wait out «Отменить» (D-139), by the status they move to. */
const UNDO_WORDS: Partial<Record<TaskStatus, string>> = {
  done: "Принято",
  sent: "Снова отправлено",
};

export function useTaskActions(me: Me | undefined): TaskActions {
  const queryClient = useQueryClient();
  keepOverlays(queryClient);
  // the receipt names the assignee, from whatever list holds the task: «Принято · Ерлан»
  const named = (text: string, taskId: string) => {
    const who = assigneeOf(snapshotTasks(queryClient), taskId);
    return who ? `${text} · ${who}` : text;
  };
  const transition = useTransition();
  const revoke = useRevoke();
  const sendNow = useSendNow();
  const extend = useExtendDeadline();
  const reassign = useReassign();
  const requestTime = useRequestDeadline(me);
  const answerTime = useAnswerDeadline();
  const nudge = useNudge();
  const sendMessage = useSendMessage(me);
  const remove = useDeleteTask();
  const reissue = useReissue();
  const markRead = useMarkRead(me);

  return {
    transition: (input) => {
      const words = UNDO_WORDS[input.toStatus];
      transition.mutate({ ...input, requestId: crypto.randomUUID(), undo: words ? named(words, input.taskId) : undefined });
    },
    extend: (input) => extend.mutate({ ...input, requestId: crypto.randomUUID() }),
    reassign: (input) => reassign.mutate({ ...input, requestId: crypto.randomUUID() }),
    requestTime: (input) => requestTime.mutate({ ...input, requestId: crypto.randomUUID() }),
    answerTime: (input) => answerTime.mutate({ ...input, requestId: crypto.randomUUID() }),
    nudge: (input) => nudge.mutate({ ...input, requestId: crypto.randomUUID() }),
    // One tap, one call, the report inside it: from a rework the RPC walks rework → accepted
    // itself, in the same transaction (D-130). It used to be two calls, and a tab closed between
    // them left the task «в работе» with the report gone.
    complete: ({ taskId, report }) => transition.mutate({ taskId, toStatus: "pending_review", requestId: crypto.randomUUID(), report }),
    revoke: (taskId) => revoke.mutate({ taskId, requestId: crypto.randomUUID(), undo: named("Отозвано", taskId) }),
    sendNow: (taskId) => sendNow.mutate({ taskId, requestId: crypto.randomUUID() }),
    sendMessage: (input) => sendMessage.mutate({ ...input, id: input.id ?? crypto.randomUUID() }),
    remove: (taskId) => remove.mutate({ taskId, requestId: crypto.randomUUID(), undo: named("Удалено", taskId) }),
    reissue: (input) => reissue.mutate({ ...input, requestId: crypto.randomUUID() }),
    markRead: (input) => markRead.mutate(input),
    // sending a message is not «busy»: the composer stays live, the row carries its own clock
    busy:
      transition.isPending ||
      revoke.isPending ||
      sendNow.isPending ||
      extend.isPending ||
      reassign.isPending ||
      requestTime.isPending ||
      answerTime.isPending ||
      nudge.isPending ||
      reissue.isPending,
  };
}
