"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import type { BoardTask } from "@/lib/pulse/board";
import { answersFor } from "@/lib/tasks/answers";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { Me } from "@/lib/tasks/queries";

import { DeskComposer, DeskThread } from "./DeskThread";
import { LoadFailure } from "./LoadState";
import { focusReply, openMoreOf, TaskFacts, TaskHead, TaskKeys } from "./TaskParts";
import { useDeskTask, type DeskTask } from "./useDeskTask";

/** The task has left the tab it was opened from (accepted, returned, answered): one press to the next. */
export type PanelNext = { id: string | null; onGo: () => void };

/** Something of the desk holds the keys right now: a dialog, a sheet, a popover or a menu. */
export function deskLayerOpen(): boolean {
  const body = document.body;
  return body.hasAttribute("data-dialog-open") || body.hasAttribute("data-sheet-open") || document.querySelector(".desk-pop") !== null;
}

/**
 * The keys of one task on screen (the panel, the stack): its letters (A, R, O, N, D, T — the
 * table's own), «.» for «Ещё», the digits for the quick answers to an open question. They work
 * while the caret is inside `root` (not in a field), and — `onBody` — when it is nowhere at all.
 */
export function useTaskKeys(desk: DeskTask, root: RefObject<HTMLElement | null>, onBody: boolean, now: Date) {
  const latest = useRef({ desk, now });
  useLayoutEffect(() => {
    latest.current = { desk, now };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey) return;
      const box = root.current;
      const target = event.target as HTMLElement | null;
      if (!box) return;
      const inside = Boolean(target && box.contains(target));
      const nowhere = !target || target === document.body;
      if (!inside && !(onBody && nowhere)) return;
      if (isTypingTarget(target) || deskLayerOpen()) return;
      const { desk: current, now: at } = latest.current;
      const task = current.task;
      if (!task) return;
      if (event.code === "Period") {
        event.preventDefault();
        openMoreOf(task.id, box);
        return;
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit && current.signals.question) {
        const answer = answersFor(current.signals.question, task.deadline, at)[Number(digit[1]) - 1];
        if (!answer) return;
        event.preventDefault();
        current.acts.answer(task, answer.text, answer.deadlineIso);
        return;
      }
      const key = current.letters.find((one) => one.code === event.code);
      if (!key) return;
      event.preventDefault();
      if (key.action === "reply") focusReply(box);
      else current.acts.press(key.action, task, { scope: box });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [root, onBody]);
}

/**
 * One task in the right-hand panel (tasks/022 A п.4, D-154 wave 3) — the desk's own, not the
 * phone's card: the head with the fields a click changes (who — «Передать», the deadline — a
 * popover), what waits on it, the director's buttons with their letters and «Ещё», the thread at
 * the desk's density, and the answer field kept at the panel's foot (Enter sends). After a move
 * the panel stays on the task; a task gone from its list says «Готово · следующая →».
 * `focusToken` — the answer field is wanted (O); `bodyKeys` — the task's letters work with the
 * caret nowhere (the table's screen; «Сегодня» keeps them for its own cursor).
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
  bodyKeys = true,
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
  bodyKeys?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const desk = useDeskTask({ taskId, me, row, base, now, onOpenTask, onReply: () => focusReply(root.current), afterRemove: onClose });
  const ready = Boolean(desk.task);
  useTaskKeys(desk, root, bodyKeys, now);
  useShortcuts("Панель задачи", [
    { keys: ["A", "R", "N", "D", "T"], label: "Принять, доработать, напомнить, срок, передать" },
    { keys: ["O"], label: "Курсор в поле ответа" },
    { keys: ["1…4"], label: "Быстрый ответ на вопрос" },
    { keys: ["."], label: "Ещё — все действия" },
    { keys: ["Enter"], label: "В поле — отправить" },
    { keys: ["Shift Enter"], label: "В поле — новая строка" },
    { keys: ["Ctrl V"], label: "В поле — вставить фото" },
    { keys: ["Esc"], label: "Отпустить поле, закрыть панель" },
  ]);

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
    ) : desk.failure ? (
      <div className="pr-9" data-testid="desk-task-panel">
        <LoadFailure what="задачу" offline={desk.failure.offline} busy={desk.retrying} onRetry={desk.retry} />
      </div>
    ) : (
      <p className="pr-9 text-[14px] leading-5 text-muted" data-testid="desk-task-panel">
        Задача не найдена — возможно, её удалили
      </p>
    );
  }
  const task = desk.task;
  const scope = () => root.current;

  return (
    // as tall as the panel at least: the answer field stands at its foot even under a short thread
    <div ref={root} className="flex min-h-[calc(100dvh-40px)] flex-col" data-testid="desk-task-panel" data-task-id={taskId} data-desk-task={taskId}>
      {next ? (
        <div className="mb-3 mr-9 flex items-baseline gap-2 border-b border-border pb-2 text-[13px] leading-5" data-testid="desk-panel-next">
          <span className="font-semibold">Готово</span>
          {next.id ? (
            <button type="button" onClick={next.onGo} className="ml-auto font-medium text-accent hover:underline" data-testid="desk-panel-next-go">
              следующая →
            </button>
          ) : (
            <span className="ml-auto text-muted">в списке пусто</span>
          )}
        </div>
      ) : null}

      <TaskHead desk={desk} now={now} scope={scope} />
      <TaskFacts desk={desk} now={now} onWords={() => focusReply(root.current)} />

      <div className="mt-4 border-t border-text pt-3">
        <TaskKeys desk={desk} me={me} now={now} pointsEnabled={pointsEnabled} scope={scope} />
      </div>

      <h3 className="desk-label mt-5 uppercase">Переписка</h3>
      <div className="mb-3 mt-1 border-t border-text pt-1">
        <DeskThread taskId={task.id} me={me} messages={desk.messages} loading={desk.messagesLoading} load={desk.threadLoad} onRetry={desk.retry} actions={desk.acts.actions} />
      </div>

      {/* the answer field stays in sight while the thread scrolls under it */}
      <div className="sticky bottom-0 z-[1] -mx-5 mt-auto bg-surface px-5 pb-1 pt-2">
        {task.status === "revoked" ? (
          <p className="pb-2 text-[13px] leading-5 text-muted" data-testid="thread-closed">
            Задача отозвана — переписка закрыта
          </p>
        ) : (
          <DeskComposer taskId={task.id} me={me} actions={desk.acts.actions} placeholder={desk.signals.question ? "Ответить на вопрос…" : "Написать…"} />
        )}
      </div>

      {desk.acts.node}
    </div>
  );
}
