"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useNamesKey } from "@/lib/people/names";
import type { BoardTask } from "@/lib/pulse/board";
import { KEY_LABEL, queueOf, type DeskAction, type DeskItem, type DeskReason } from "@/lib/tasks/desk";
import { useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import { REASON_TITLE, REASON_TONE } from "@/lib/tasks/overview";
import { useMe, usePulseBoard, type Me } from "@/lib/tasks/queries";

import { inPlaceOf, withSkipped } from "@/lib/desk/tasks";
import { focusReply, TaskFacts, TaskHead, TaskKeys, TaskThreadPane } from "./TaskParts";
import { useDeskTask } from "./useDeskTask";

/** Enter on the stack: the move each reason asks for first (tasks/022 A п.6). */
const MAIN: Record<DeskReason, DeskAction> = {
  review: "approve",
  question: "answer",
  declined: "reassign",
  time: "grant",
  overdue: "nudge",
};

/** Moves that finish the director's turn at once — the stack goes on to the next task by itself. */
const DONE_AT_ONCE: ReadonlySet<DeskAction> = new Set<DeskAction>(["approve", "grant", "nudge"]);

export function InboxSkeleton() {
  return (
    <DeskPage>
      <PageTitle title="Разобрать" />
      <SkeletonGroup className="flex flex-col gap-4">
        <Bone h={8} />
        <div className="grid grid-cols-2 gap-4">
          <Bone h={420} className="!rounded-[16px]" />
          <Bone h={420} className="!rounded-[16px]" />
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Разобрать» (tasks/022 A п.6): everything waiting for the director as a stack, one task at a
 * time — the card on the left, its thread on the right, the keys of the reason under the hand.
 * The queue is the nav badge's own (`queueOf` of the board, `REASON_ORDER`); what is skipped
 * goes to the end of it for this visit.
 */
export function InboxScreen() {
  useNamesKey();
  const me = useMe();
  const board = usePulseBoard(me.data);
  if (me.isPending || board.isPending || !me.data) return <InboxSkeleton />;
  return <InboxView me={me.data} board={board.data ?? []} />;
}

function InboxView({ me, board }: { me: Me; board: readonly BoardTask[] }) {
  const router = useRouter();
  const actions = useTaskActions(me);
  const now = useMinute();
  const queue = useMemo(() => queueOf(board, now), [board, now]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const order = useMemo(() => withSkipped(queue, (item) => item.task.id, skipped), [queue, skipped]);
  const ids = useMemo(() => order.map((item) => item.task.id), [order]);

  // the task in hand by its id; when it leaves the queue (accepted, answered) the one in its place comes
  const [current, setCurrent] = useState<string | null>(null);
  const [place, setPlace] = useState(0);
  const at = current ? ids.indexOf(current) : -1;
  if (at >= 0 && at !== place) setPlace(at);
  const shown = at >= 0 ? current : inPlaceOf(ids, current ? place : 0);
  if (shown !== current) setCurrent(shown);
  const index = shown ? ids.indexOf(shown) : -1;
  const item = index >= 0 ? order[index] : null;

  const go = (delta: number) => {
    if (index < 0) return;
    const next = ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
    if (next) setCurrent(next);
  };
  const skip = () => {
    if (!shown) return;
    const after = ids[index + 1] ?? null;
    setSkipped((list) => [...list.filter((id) => id !== shown), shown]);
    if (after) setCurrent(after);
  };
  // after a move that ends the turn: the next one, whether or not this one has left the queue yet
  const advance = () => {
    const next = ids[index + 1] ?? ids[index - 1] ?? null;
    setCurrent(next);
  };

  if (!item) {
    return (
      <DeskPage width="narrow">
        <PageTitle title="Разобрать" />
        <EmptyState
          title="Всё разобрано"
          hint="Приёмка, вопросы, отказы и просрочки встанут сюда по одной"
          action={
            <Button size="sm" onClick={() => router.push("/desk/tasks")}>
              К задачам
            </Button>
          }
        />
      </DeskPage>
    );
  }

  const total = ids.length;
  return (
    <DeskPage>
      <PageTitle
        title="Разобрать"
        state={{ text: REASON_TITLE[item.reason], tone: REASON_TONE[item.reason] }}
        actions={
          <Button size="sm" variant="secondary" onClick={() => router.push("/desk/tasks")}>
            К задачам
          </Button>
        }
      />

      <div className="flex items-center gap-3" data-testid="desk-inbox-progress">
        <span className="nums shrink-0 font-display text-[14px] font-semibold leading-5">
          {index + 1} из {total}
        </span>
        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-[240ms] ease-out"
            style={{ width: `${((index + 1) / total) * 100}%`, background: TONE_VAR[REASON_TONE[item.reason]] }}
          />
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="secondary" aria-label="Предыдущая" title="Предыдущая (←)" disabled={index === 0} onClick={() => go(-1)}>
            ←
          </Button>
          <Button size="sm" variant="secondary" aria-label="Следующая" title="Следующая (→)" disabled={index >= total - 1} onClick={() => go(1)}>
            →
          </Button>
          <Button size="sm" variant="ghost" title="Пропустить (S)" disabled={total < 2} onClick={skip} data-testid="desk-inbox-skip">
            Пропустить
          </Button>
        </span>
      </div>

      <InboxCard key={item.task.id} item={item} me={me} base={actions} now={now} onPrev={() => go(-1)} onNext={() => go(1)} onSkip={skip} onDone={advance} />
    </DeskPage>
  );
}

/**
 * One task of the stack across the screen: the card on the left (the panel's, larger), the
 * thread with its field on the right, the reason's keys under the hand. Its keys are on the
 * window — the stack has no table to hold the focus.
 */
function InboxCard({
  item,
  me,
  base,
  now,
  onPrev,
  onNext,
  onSkip,
  onDone,
}: {
  item: DeskItem;
  me: Me;
  base: TaskActions;
  now: Date;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { pointsEnabled } = useDeskScope();
  const desk = useDeskTask({
    taskId: item.task.id,
    me,
    row: item.task,
    base,
    now,
    onOpenTask: (id) => router.push(`/desk/tasks?id=${encodeURIComponent(id)}`),
  });
  const thread = useRef<HTMLDivElement>(null);
  const task = desk.task;
  const main = MAIN[item.reason];

  const press = (action: DeskAction) => {
    if (!task) return;
    if (action === "answer") {
      focusReply(thread.current);
      return;
    }
    desk.controls.press(action, task);
    if (DONE_AT_ONCE.has(action)) onDone();
  };

  // the latest handlers for the window's listener, which is added once
  const keys = useRef({ press, onPrev, onNext, onSkip, main, status: task?.status });
  useLayoutEffect(() => {
    keys.current = { press, onPrev, onNext, onSkip, main, status: task?.status };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const body = document.body;
      if (body.hasAttribute("data-sheet-open") || body.hasAttribute("data-dialog-open")) return;
      const k = keys.current;
      const onControl = (event.target as HTMLElement | null)?.closest?.("button, a, [role=button]");
      switch (event.code) {
        case "ArrowLeft":
          event.preventDefault();
          k.onPrev();
          return;
        case "ArrowRight":
          event.preventDefault();
          k.onNext();
          return;
        case "Enter":
        case "NumpadEnter":
          // a focused button takes its own Enter
          if (onControl) return;
          event.preventDefault();
          k.press(k.main);
          return;
        case "KeyA":
        case "KeyR":
          if (k.status !== "pending_review") return;
          event.preventDefault();
          k.press(event.code === "KeyA" ? "approve" : "rework");
          return;
        case "KeyO":
          event.preventDefault();
          k.press("answer");
          return;
        case "KeyS":
          event.preventDefault();
          k.onSkip();
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!task) {
    return (
      <SkeletonGroup className="grid grid-cols-2 gap-4">
        <Bone h={420} className="!rounded-[16px]" />
        <Bone h={420} className="!rounded-[16px]" />
      </SkeletonGroup>
    );
  }

  return (
    <>
      <div className="grid min-h-[440px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4" style={{ height: "calc(100dvh - 280px)" }} data-testid="desk-inbox-card" data-task-id={task.id}>
        <section className="card no-bar flex min-h-0 flex-col overflow-y-auto px-5 py-4">
          <TaskHead desk={desk} now={now} large />
          <TaskFacts desk={desk} now={now} onWords={() => focusReply(thread.current)} />
          <div className="mt-auto pt-5">
            <TaskKeys desk={desk} me={me} now={now} pointsEnabled={pointsEnabled} />
          </div>
        </section>
        <section ref={thread} className="card flex min-h-0 flex-col px-4 pb-3 pt-4" data-testid="desk-inbox-thread">
          <h3 className="mb-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">Переписка</h3>
          <TaskThreadPane desk={desk} me={me} />
        </section>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted">
        <span>
          <Kbd>Enter</Kbd> {KEY_LABEL[main].toLowerCase()}
        </span>
        {task.status === "pending_review" ? (
          <>
            <span>
              <Kbd>A</Kbd> принять
            </span>
            <span>
              <Kbd>R</Kbd> на доработку
            </span>
          </>
        ) : null}
        <span>
          <Kbd>O</Kbd> ответить
        </span>
        <span>
          <Kbd>S</Kbd> пропустить
        </span>
        <span>
          <Kbd>←</Kbd> <Kbd>→</Kbd> соседняя
        </span>
      </p>

      {desk.controls.sheets}
    </>
  );
}
