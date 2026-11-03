"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { BoardTask } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { Me } from "@/lib/tasks/queries";

import { focusReply, TaskFacts, TaskHead, TaskKeys, TaskThreadPane } from "./TaskParts";
import { useDeskTask } from "./useDeskTask";

/** The task has left the tab it was opened from (accepted, returned, answered): one press to the next. */
export type PanelNext = { id: string | null; onGo: () => void };

/**
 * One task in the right-hand panel of «Задачи» (tasks/022 A п.4): the head, what waits on it,
 * the thread with its field, and at the foot — kept in sight — the phone's buttons for this
 * state and «⋯». After a move the panel stays on the task; a task gone from its tab says
 * «Готово · следующая →». `focusToken` — the reply field is wanted (KeyO).
 */
export function TaskPanel({
  taskId,
  me,
  row,
  base,
  now,
  pointsEnabled,
  onOpenTask,
  onClose,
  next,
  focusToken,
  onFocused,
}: {
  taskId: string;
  me: Me;
  row: BoardTask | undefined;
  base: TaskActions;
  now: Date;
  pointsEnabled: boolean;
  onOpenTask: (id: string) => void;
  onClose: () => void;
  next: PanelNext | null;
  focusToken: number;
  /** the reply field has the caret: the screen drops its wish */
  onFocused: () => void;
}) {
  const desk = useDeskTask({ taskId, me, row, base, now, onOpenTask, afterRemove: onClose });
  const root = useRef<HTMLDivElement>(null);
  const ready = Boolean(desk.task);

  const focused = useRef(onFocused);
  useLayoutEffect(() => {
    focused.current = onFocused;
  });
  useEffect(() => {
    if (focusToken === 0 || !ready) return;
    focusReply(root.current);
    focused.current();
  }, [focusToken, ready]);

  if (!desk.task) {
    return desk.loading ? (
      <SkeletonGroup className="flex flex-col gap-3 pr-9">
        <Bone h={28} w="60%" />
        <Bone h={24} />
        <Bone h={16} w="40%" />
        <Bone h={48} />
      </SkeletonGroup>
    ) : (
      <p className="pr-9 text-[14px] leading-5 text-muted" data-testid="desk-task-panel">
        Задача не найдена — возможно, её удалили
      </p>
    );
  }

  return (
    // as tall as the panel at least: the buttons stand at its foot even under a short thread
    <div ref={root} className="flex min-h-[calc(100dvh-40px)] flex-col" data-testid="desk-task-panel" data-task-id={taskId}>
      {next ? (
        <div className="mb-3 mr-9 flex items-center gap-2 rounded-[12px] border border-ok/35 bg-ok/10 px-3 py-2 text-[13px] leading-5" data-testid="desk-panel-next">
          <span className="font-semibold text-ok">Готово</span>
          {next.id ? (
            <button type="button" onClick={next.onGo} className="ml-auto font-semibold text-accent hover:underline" data-testid="desk-panel-next-go">
              следующая →
            </button>
          ) : (
            <span className="ml-auto text-muted">во вкладке пусто</span>
          )}
        </div>
      ) : null}

      <TaskHead desk={desk} now={now} />
      <TaskFacts desk={desk} now={now} onWords={() => focusReply(root.current)} />

      <h3 className="mt-5 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">Переписка</h3>
      {/* the desk's reading size in the field (the phone keeps 16 px against the iPhone's zoom) */}
      <div className="mb-4 mt-2 flex flex-col [&_textarea]:!text-[14px] [&_textarea]:!leading-5">
        <TaskThreadPane desk={desk} me={me} />
      </div>

      {/* the foot stays in sight while the thread scrolls under it */}
      <div className="sticky bottom-0 z-[1] -mx-5 mt-auto border-t border-border bg-surface px-5 pb-1 pt-3">
        <TaskKeys desk={desk} me={me} now={now} pointsEnabled={pointsEnabled} />
      </div>

      {desk.controls.sheets}
    </div>
  );
}

