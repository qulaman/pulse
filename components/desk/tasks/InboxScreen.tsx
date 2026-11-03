"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { ReactionBar } from "@/components/points/ReactionBar";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useTaskReactions } from "@/lib/points/game";
import { isReactable, showsReactionBar } from "@/lib/points/reactions";
import type { BoardTask } from "@/lib/pulse/board";
import { queueOf, type DeskAction, type DeskItem } from "@/lib/tasks/desk";
import { nearestDeadline } from "@/lib/tasks/grouping";
import { useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import { REASON_TONE, REASON_WORD } from "@/lib/tasks/overview";
import { useMe, usePulseBoard, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";

import { enterMove, inPlaceOf, KEY_CAP, reasonHeadline, rowKeys, stackMoves, withSkipped, type Move } from "@/lib/desk/tasks";
import { MoreButton, MoveRow } from "./RowMoves";
import { focusReply, TaskFacts, TaskHead, TaskThreadPane } from "./TaskParts";
import { useDeskTask, type DeskTask } from "./useDeskTask";

/**
 * Moves that finish the director's turn at once — the stack goes on to the next task by itself. A
 * move that may ask first (a new deadline for the colleague, a reason for the rework) is not here:
 * its dialog belongs to this card, and the card goes when the task leaves the queue.
 */
const DONE_AT_ONCE: ReadonlySet<DeskAction> = new Set<DeskAction>(["approve", "grant", "keep", "nudge", "insist"]);

/** The stack's column and the queue beside it (D-154): the card reads at a page's width, the queue stays in sight. */
const LAYOUT = "grid grid-cols-[minmax(0,880px)_256px] items-start gap-6";

export function InboxSkeleton() {
  return (
    <DeskPage>
      <PageTitle title="Разобрать" />
      <SkeletonGroup className={LAYOUT}>
        <div className="flex flex-col gap-4">
          <Bone h={20} />
          <Bone h={360} className="!rounded-[16px]" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Bone key={index} h={40} />
          ))}
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Разобрать» (tasks/022 A п.6, D-154): everything waiting for the director as a stack, one task at
 * a time — why it waits as the headline, the card at the height of what it says, the reason's
 * buttons with their keys inside, the thread under it, the rest of the queue beside it. The queue
 * is the nav badge's own (`queueOf` of the board, `REASON_ORDER`); what is skipped goes to the end
 * of it for this visit.
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
    // the good kind of empty: what comes next is the nearest deadline still ahead
    const soon = nearestDeadline([...board], now);
    const next = soon ? board.find((task) => task.deadline === soon && task.status !== "declined") : undefined;
    return (
      <DeskPage width="narrow">
        <PageTitle title="Разобрать" light="ok" />
        <EmptyState
          tone="ok"
          title="Всё разобрано"
          hint={
            next ? (
              <>
                Следующий срок — <span className="nums text-text">{humanAqtobe(new Date(next.deadline as string), now)}</span>, {shortName(next.assignee?.full_name)} ·{" "}
                «{next.title}»
              </>
            ) : (
              "Приёмка, вопросы, отказы и просрочки встанут сюда по одной"
            )
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => router.push("/desk/tasks")}>
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
        light={REASON_TONE[item.reason]}
        actions={
          <Button size="sm" variant="secondary" onClick={() => router.push("/desk/tasks")}>
            К задачам
          </Button>
        }
      />

      <div className={LAYOUT}>
        <div className="flex min-w-0 flex-col gap-4">
          {/* the director's own progress: the accent, not the tone of what is late */}
          <div className="flex items-center gap-4" data-testid="desk-inbox-progress">
            <span className="nums shrink-0 font-display text-[14px] font-semibold leading-5">
              <span className="text-accent">{index + 1}</span>
              <span className="text-muted"> из </span>
              {total}
            </span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-[240ms] ease-out" style={{ width: `${((index + 1) / total) * 100}%` }} />
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" aria-label="Предыдущая" title="Предыдущая (←)" disabled={index === 0} onClick={() => go(-1)} className="!min-h-8 !px-2">
                ←
              </Button>
              <Button size="sm" variant="ghost" aria-label="Следующая" title="Следующая (→)" disabled={index >= total - 1} onClick={() => go(1)} className="!min-h-8 !px-2">
                →
              </Button>
              <Button size="sm" variant="ghost" title="Пропустить (S)" disabled={total < 2} onClick={skip} className="!min-h-8 gap-1.5 !px-2" data-testid="desk-inbox-skip">
                Пропустить <Kbd>S</Kbd>
              </Button>
            </span>
          </div>

          <InboxCard key={item.task.id} item={item} me={me} base={actions} now={now} onPrev={() => go(-1)} onNext={() => go(1)} onSkip={skip} onDone={advance} />
        </div>

        <QueueAside order={order} current={shown} now={now} onPick={setCurrent} />
      </div>
    </DeskPage>
  );
}

/** The rest of the queue beside the card: who and what, why — the one in hand marked, any one a click away. */
function QueueAside({ order, current, now, onPick }: { order: readonly DeskItem[]; current: string | null; now: Date; onPick: (id: string) => void }) {
  const LIMIT = 10;
  const shown = order.slice(0, LIMIT);
  return (
    <aside className="sticky top-6 flex flex-col gap-2" data-testid="desk-inbox-queue">
      <SectionLabel count={order.length}>Очередь</SectionLabel>
      <ol className="flex flex-col">
        {shown.map((item) => {
          const on = item.task.id === current;
          return (
            <li key={item.task.id}>
              <button
                type="button"
                onClick={() => onPick(item.task.id)}
                aria-current={on ? "true" : undefined}
                className={`relative flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-[120ms] ${on ? "bg-accent/8" : "hover:bg-surface-2/60"}`}
              >
                {on ? <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" /> : null}
                <span className="mt-0.5 shrink-0">
                  <StatusGlyph status={item.task.status} overdue={isOverdue(item.task, now)} size={16} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate text-[13px] leading-[18px] ${on ? "font-semibold text-text" : "text-text/90"}`}>{item.task.title}</span>
                  <span className="truncate text-[12px] leading-4 text-muted">
                    {shortName(item.task.assignee?.full_name)} · {REASON_WORD[item.reason]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {order.length > LIMIT ? <p className="px-2.5 text-[12px] leading-4 text-muted">и ещё {order.length - LIMIT}</p> : null}
    </aside>
  );
}

/** The reason's buttons with their keys inside, «⋯», and the reaction row of D-133 under them. */
function StackKeys({ desk, me, moves, onPress, pointsEnabled }: { desk: DeskTask; me: Me; moves: readonly Move[]; onPress: (move: Move) => void; pointsEnabled: boolean }) {
  const task = desk.task as TaskWithPeople;
  const reactions = useTaskReactions();
  const reacted = Boolean(reactions.data?.[task.id]);
  const canReact = isReactable(task, me.userId) && showsReactionBar(task.status, reacted);
  const main = enterMove(moves);
  return (
    <div data-testid="desk-task-keys">
      <div className="flex flex-wrap items-center gap-2">
        <MoveRow moves={moves} onPress={onPress} size="md" />
        {main ? (
          <span className="flex items-center gap-1 text-[12px] leading-4 text-muted">
            <Kbd>Enter</Kbd> {main.label.charAt(0).toLowerCase() + main.label.slice(1)}
          </span>
        ) : null}
        <span className="ml-auto">
          <MoreButton onPress={() => desk.controls.more(task)} testId="desk-task-more" />
        </span>
      </div>
      {canReact ? <ReactionBar taskId={task.id} pointsEnabled={pointsEnabled} className="mt-3" /> : null}
    </div>
  );
}

/**
 * One task of the stack: the headline of why it waits in its tone, the card (the panel's head and
 * facts, larger) with the reason's buttons at its foot, the thread with its field under it. Its
 * keys are on the window — the stack has no table to hold the focus.
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
  const moves = task
    ? stackMoves(task, item.reason, { request: desk.signals.request, suggestion: desk.signals.suggestion, nudgedAt: desk.signals.nudgedAt }, now)
    : [];
  const keys = task ? rowKeys(task, { request: Boolean(desk.signals.request) }) : [];

  const press = (action: DeskAction | "reply") => {
    if (!task) return;
    if (action === "answer" || action === "reply") {
      focusReply(thread.current);
      return;
    }
    desk.controls.press(action, task);
    if (DONE_AT_ONCE.has(action)) onDone();
  };
  const pressMove = (move: Move) => {
    if (!move.held) press(move.action);
  };

  // the latest handlers for the window's listener, which is added once
  const latest = useRef({ press, onPrev, onNext, onSkip, main: enterMove(moves), keys });
  useLayoutEffect(() => {
    latest.current = { press, onPrev, onNext, onSkip, main: enterMove(moves), keys };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const body = document.body;
      if (body.hasAttribute("data-sheet-open") || body.hasAttribute("data-dialog-open")) return;
      const k = latest.current;
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
          if (onControl || !k.main) return;
          event.preventDefault();
          k.press(k.main.action);
          return;
        case "KeyS":
          event.preventDefault();
          k.onSkip();
          return;
      }
      const key = k.keys.find((one) => one.code === event.code);
      if (!key) return;
      event.preventDefault();
      k.press(key.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!task) {
    return (
      <SkeletonGroup className="flex flex-col gap-4">
        <Bone h={360} className="!rounded-[16px]" />
        <Bone h={120} />
      </SkeletonGroup>
    );
  }

  const tone = TONE_VAR[REASON_TONE[item.reason]];
  const headline = reasonHeadline(item.reason, { ...item.task, ...task, time_request: desk.signals.request ?? item.task.time_request ?? null }, now);
  return (
    <>
      <section
        className="card flex flex-col px-6 pb-5 pt-5"
        style={{ boxShadow: "var(--shadow-card), var(--shadow-raised)" }}
        data-testid="desk-inbox-card"
        data-task-id={task.id}
      >
        <p className="mb-4 flex items-center gap-2.5 font-display text-[20px] font-semibold leading-[26px] tracking-[-0.015em]" style={{ color: tone }} data-testid="desk-inbox-reason">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 12px ${tone}` }} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{headline}</span>
        </p>
        <TaskHead desk={desk} now={now} large />
        <TaskFacts desk={desk} now={now} onWords={() => focusReply(thread.current)} />
        <div className="mt-5 border-t border-border/70 pt-4">
          <StackKeys desk={desk} me={me} moves={moves} onPress={pressMove} pointsEnabled={pointsEnabled} />
        </div>
      </section>

      <section ref={thread} className="flex flex-col gap-2 [&_textarea]:!text-[14px] [&_textarea]:!leading-5" data-testid="desk-inbox-thread">
        <SectionLabel>Переписка</SectionLabel>
        <TaskThreadPane desk={desk} me={me} />
      </section>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted">
        {keys.map((key) => (
          <span key={key.code}>
            <Kbd>{KEY_CAP[key.code]}</Kbd> {key.label}
          </span>
        ))}
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
