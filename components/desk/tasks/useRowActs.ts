"use client";

import type { BoardTask } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import { taggedActions } from "./flow";
import { useDeskActs } from "./useDeskActs";

/**
 * The director's moves over a list of tasks — the table of «Задачи», the decisions of «Сегодня»:
 * the phone's actions, each telling `mark` which task it moved (the panel's flow, `taggedActions`),
 * «Передать» and «Выдать снова» opening the new task in the panel, and the desk's own pickers and
 * dialogs (`useDeskActs`). `rowOf` — what the board knows of a task besides its status.
 */
export function useRowActs({
  actions,
  mark,
  tasks,
  rowOf,
  now,
  companyId,
  openId,
  openTask,
  closeTask,
  onReply,
  onEdit,
}: {
  actions: TaskActions;
  mark: (taskId: string) => void;
  /** every task these moves may be asked about */
  tasks: readonly TaskWithPeople[];
  rowOf: (taskId: string) => Pick<BoardTask, "question" | "time_request" | "suggestion"> | undefined;
  now: Date;
  companyId: string;
  /** the task open in the panel: «Удалить» of it closes the panel */
  openId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;
  /** «Ответить» (O): the panel with the caret in its answer field */
  onReply: (task: TaskWithPeople) => void;
  /** «Изменить» (E): the panel of the task in its form (D-203) */
  onEdit: (task: TaskWithPeople) => void;
}) {
  const base = taggedActions(
    {
      ...actions,
      reissue: (input) => actions.reissue({ ...input, onOpen: openTask }),
      reassign: (input) => actions.reassign({ ...input, onOpen: openTask }),
      edit: (input) => actions.edit({ ...input, onOpen: openTask }),
    },
    mark,
  );
  return useDeskActs({
    base,
    tasks,
    flagsOf: (id) => {
      const row = rowOf(id);
      return { question: row?.question ?? null, request: row?.time_request ?? null, suggestion: row?.suggestion ?? null };
    },
    now,
    companyId,
    onReply,
    onEdit,
    onOpen: openTask,
    afterRemove: (id) => {
      if (openId === id) closeTask();
    },
  });
}
