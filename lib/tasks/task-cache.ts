"use client";

import type { QueryClient } from "@tanstack/react-query";

import type { BoardTask } from "@/lib/pulse/board";

import { taskKeys, type TaskRow, type TaskWithPeople } from "./query-core";

/* -------------------------------------------------------------------------- */
/* Optimistic patching across every cached shape that holds tasks              */
/* -------------------------------------------------------------------------- */

export type TaskPatch = Partial<TaskRow>;

/** Every `tasks`-prefixed cache as it is now, so a failed call can be rolled back. */
export type TaskSnapshot = ReturnType<typeof snapshotTasks>;

function patchOne<T extends TaskWithPeople>(task: T, taskId: string, patch: TaskPatch): T {
  return task.id === taskId ? { ...task, ...patch } : task;
}

/** The task's row patched wherever a cache holds it: in a list, or as the task's own object. */
export function patchCached(old: unknown, taskId: string, patch: TaskPatch): unknown {
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

export function snapshotTasks(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: taskKeys.root });
}

export function restoreTasks(queryClient: QueryClient, snapshot: TaskSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

/**
 * The head of every optimistic tap: the task reads in flight stop (their answer would land over
 * the patch), every task cache is kept for a rollback, and the patch — when there is one — goes
 * over all of them at once. Returns the snapshot taken before the patch.
 */
export async function optimistic(queryClient: QueryClient, patch?: (old: unknown) => unknown): Promise<TaskSnapshot> {
  await queryClient.cancelQueries({ queryKey: taskKeys.root });
  const snapshot = snapshotTasks(queryClient);
  if (patch) queryClient.setQueriesData({ queryKey: taskKeys.root }, patch);
  return snapshot;
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
export function rollbackTask(queryClient: QueryClient, snapshot: TaskSnapshot, taskId: string) {
  for (const [key, before] of snapshot) queryClient.setQueryData(key, (now: unknown) => restoreOne(before, now, taskId));
}

/** The board row carries what the task row does not — a request for time, a reminder (D-128). */
export function patchBoard(queryClient: QueryClient, taskId: string, patch: Partial<BoardTask>) {
  queryClient.setQueryData<BoardTask[]>(taskKeys.board(), (old) =>
    old ? old.map((row) => (row.id === taskId ? { ...row, ...patch } : row)) : old,
  );
}

/**
 * After a change to one task: the task and its thread read anew at once; the lists are only
 * marked stale. The Realtime echo of this very change patches or refetches the lists on screen,
 * and a list opened later reads anew — refetching them all here (the board, «Отправленные» with
 * 200 rows, «Мои дела», the loads) would be eight requests per tap (D-126).
 */
export function invalidateTasks(queryClient: QueryClient, taskId: string) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.root, refetchType: "none" });
  void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
  void queryClient.invalidateQueries({ queryKey: taskKeys.thread(taskId) });
}
