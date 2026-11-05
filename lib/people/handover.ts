import type { Database } from "@/lib/supabase/types";

type TaskStatus = Database["public"]["Enums"]["task_status"];

/** What `reassign_task` takes (`declined` too, but that is the director's decision, not open work). */
export const MOVABLE: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];
/** Open work the person's card counts: on top of the movable, what waits for «Принято» and what is not sent yet. */
export const OPEN: readonly TaskStatus[] = [...MOVABLE, "pending_review", "scheduled"];

export type OpenTask = { id: string; title: string; status: TaskStatus; deadline: string | null };

/** The person's open work as the fire dialog says it. `tasks` — the movable ones, the director's only. */
export type OpenWork = { total: number; movable: number; review: number; scheduled: number; tasks: OpenTask[] };

/** Folds the open tasks; a viewer who may not read them gets the numbers alone. */
export function openWork(rows: readonly OpenTask[], withTasks: boolean): OpenWork {
  const movable = rows.filter((task) => MOVABLE.includes(task.status));
  return {
    total: rows.length,
    movable: movable.length,
    review: rows.filter((task) => task.status === "pending_review").length,
    scheduled: rows.filter((task) => task.status === "scheduled").length,
    tasks: withTasks ? movable : [],
  };
}

export type Failed<T> = { task: T; reason: string };

/**
 * Hands each task over, a few at a time: one failure stays that task's, the rest go on. `pass`
 * throws to say it failed, the error's message is the reason. Nothing is ever dropped silently:
 * every task comes back in one of the two lists.
 */
export async function passAll<T>(tasks: readonly T[], pass: (task: T) => Promise<unknown>, width = 3): Promise<{ passed: T[]; failed: Failed<T>[] }> {
  const passed: T[] = [];
  const failed: Failed<T>[] = [];
  const queue = [...tasks];
  const worker = async () => {
    for (let task = queue.shift(); task !== undefined; task = queue.shift()) {
      try {
        await pass(task);
        passed.push(task);
      } catch (error) {
        failed.push({ task, reason: error instanceof Error && error.message ? error.message : "Не получилось передать" });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, tasks.length)) }, worker));
  return { passed, failed };
}
