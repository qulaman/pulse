"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Menu } from "@/components/desk/ui/Menu";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { useDraftTasks } from "@/lib/desk/drafts";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useTaskReactions } from "@/lib/points/game";
import { isReactable, showsReactionBar } from "@/lib/points/reactions";
import type { BoardTask } from "@/lib/pulse/board";
import { answersFor } from "@/lib/tasks/answers";
import { queueOf, type DeskAction, type DeskItem } from "@/lib/tasks/desk";
import { nearestDeadline } from "@/lib/tasks/grouping";
import { useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import { REASON_TONE, REASON_WORD } from "@/lib/tasks/overview";
import { useMe, usePulseBoard, type Me, type TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";
import { useHydrated } from "@/lib/useHydrated";

import { enterMove, inPlaceOf, loadStateOf, reasonHeadline, stackMoves, withSkipped, type LoadState, type Move } from "@/lib/desk/tasks";
import { DeskComposer, DeskThread } from "./DeskThread";
import { FailedScreen, LoadFailure, LoadNote } from "./LoadState";
import { DraftMark, MoveRow } from "./RowMoves";
import { deskLayerOpen } from "./TaskPanel";
import { DeskReactions, focusReply, MORE_WORD, TaskFacts, TaskHead } from "./TaskParts";
import { useDeskTask, type DeskTask } from "./useDeskTask";

/**
 * Moves that finish the director's turn at once — the stack goes on to the next task by itself. A
 * move that may ask first (a new deadline for the colleague, a reason for the rework) is not here:
 * its popover or dialog belongs to this card, and the card goes when the task leaves the queue.
 */
const DONE_AT_ONCE: ReadonlySet<DeskAction> = new Set<DeskAction>(["approve", "grant", "keep", "nudge", "insist"]);

/** The task in hand and the queue beside it (D-154): the rules run the sheet's width, the queue stays in sight. */
const LAYOUT = "grid grid-cols-[minmax(0,1fr)_288px] items-start gap-x-8";

/** The task while it lands: why it waits, who, the title, its fields, the path, the moves. */
function TaskBone() {
  return (
    <div className="flex flex-col">
      <Bone h={20} w="44%" />
      <Bone h={20} w={96} className="mt-2" />
      <Bone h={32} w="62%" className="mt-2" />
      <Bone h={20} w={220} className="mt-3" />
      <Bone h={44} className="mt-3" />
      <div className="mt-4 border-t border-text pt-3">
        <Bone h={36} w={220} />
      </div>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <DeskPage>
      {/* the walk's room is kept: the head does not move when the stack lands */}
      <PageTitle title="Разобрать" actions={<span className="block h-9" />} />
      <SkeletonGroup className={LAYOUT}>
        <TaskBone />
        <div className="flex flex-col gap-1">
          <div className="flex h-6 items-center">
            <Bone h={12} w="34%" />
          </div>
          <div className="desk-list">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex h-[45px] items-center">
                <Bone h={14} w="82%" />
              </div>
            ))}
          </div>
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/**
 * «Разобрать» (tasks/022 A п.6, D-154): everything waiting for the director as a stack, one task at
 * a time — why it waits as the first line in its ink, the task at the height of what it says, the
 * reason's buttons with their keys inside, the thread under it with the answer field, the rest of
 * the queue beside it. Made for the keyboard (wave 3): ←/→ or J/K walk, Enter presses the main move, the
 * letters the others, digits answer a question, S skips, «.» opens everything else. The queue is
 * the nav badge's own (`queueOf` of the board, `REASON_ORDER`); what is skipped goes to its end.
 */
export function InboxScreen() {
  useNamesKey();
  const me = useMe();
  const board = usePulseBoard(me.data);
  const load = loadStateOf(board);
  const retry = () => void board.refetch();
  // a start with no network pauses the query before this boundary hydrates: the first render stays the server's skeleton
  const hydrated = useHydrated();
  if (!hydrated || me.isPending || !me.data || load.kind === "loading") return <InboxSkeleton />;
  // never «Всё разобрано» over a queue that did not come
  if (load.kind === "failed") return <FailedScreen title="Разобрать" what="очередь решений" offline={load.offline} busy={board.isFetching} onRetry={retry} />;
  return <InboxView me={me.data} board={board.data ?? []} load={load} onRetry={retry} />;
}

function InboxView({ me, board, load, onRetry }: { me: Me; board: readonly BoardTask[]; load: LoadState; onRetry: () => void }) {
  const router = useRouter();
  const actions = useTaskActions(me);
  const now = useMinute();
  const queue = useMemo(() => queueOf(board, now), [board, now]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const order = useMemo(() => withSkipped(queue, (item) => item.task.id, skipped), [queue, skipped]);
  const ids = useMemo(() => order.map((item) => item.task.id), [order]);
  const drafts = useDraftTasks(me.userId);

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

  useShortcuts("Разобрать", [
    { keys: ["←", "→"], label: "Предыдущая, следующая (или K / J)" },
    { keys: ["Enter"], label: "Главное действие карточки" },
    { keys: ["A"], label: "Принять" },
    { keys: ["R"], label: "На доработку" },
    { keys: ["O"], label: "Ответить — курсор в поле" },
    { keys: ["N"], label: "Напомнить" },
    { keys: ["D"], label: "Срок" },
    { keys: ["T"], label: "Передать" },
    { keys: ["1…4"], label: "Быстрый ответ на вопрос" },
    { keys: ["S"], label: "Пропустить — в конец очереди" },
    { keys: ["."], label: "Все действия задачи" },
    { keys: ["Enter"], label: "В поле ответа — отправить (Shift+Enter — новая строка)" },
    { keys: ["Esc"], label: "Отпустить поле" },
  ]);

  const staleMark = <LoadNote state={load} failed="" now={now} onRetry={onRetry} />;
  if (!item) {
    // the good kind of empty: what comes next is the nearest deadline still ahead
    const soon = nearestDeadline([...board], now);
    const next = soon ? board.find((task) => task.deadline === soon && task.status !== "declined") : undefined;
    return (
      <DeskPage width="narrow">
        <PageTitle title="Разобрать" actions={staleMark} />
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
        actions={
          <>
            {staleMark}
            {/* where the director is in the stack: the one figure of the screen, and the walk beside it */}
            <span className="flex items-center gap-1" data-testid="desk-inbox-progress">
              <span className="nums mr-2 text-[14px] leading-5">
                {index + 1} из {total}
              </span>
              <Tooltip label="Предыдущая" keys={["←"]}>
                <Button size="sm" variant="ghost" aria-label="Предыдущая" disabled={index === 0} onClick={() => go(-1)} className="!min-h-8 !px-2">
                  ←
                </Button>
              </Tooltip>
              <Tooltip label="Следующая" keys={["→"]}>
                <Button size="sm" variant="ghost" aria-label="Следующая" disabled={index >= total - 1} onClick={() => go(1)} className="!min-h-8 !px-2">
                  →
                </Button>
              </Tooltip>
              <Tooltip label="В конец очереди" keys={["S"]}>
                <Button size="sm" variant="ghost" disabled={total < 2} onClick={skip} className="!min-h-8 gap-1.5 !px-2" data-testid="desk-inbox-skip">
                  Пропустить <Kbd>S</Kbd>
                </Button>
              </Tooltip>
            </span>
            <Button size="sm" variant="secondary" onClick={() => router.push("/desk/tasks")}>
              К задачам
            </Button>
          </>
        }
      />

      <div className={LAYOUT}>
        <div className="flex min-w-0 flex-col gap-5">
          <InboxCard key={item.task.id} item={item} me={me} base={actions} now={now} onPrev={() => go(-1)} onNext={() => go(1)} onSkip={skip} onDone={advance} />
        </div>

        <QueueAside order={order} current={shown} now={now} onPick={setCurrent} drafts={drafts} />
      </div>
    </DeskPage>
  );
}

/** The rest of the queue beside the card: who and what, why — the one in hand marked, any one a click away. */
function QueueAside({
  order,
  current,
  now,
  onPick,
  drafts,
}: {
  order: readonly DeskItem[];
  current: string | null;
  now: Date;
  onPick: (id: string) => void;
  drafts: ReadonlySet<string>;
}) {
  const LIMIT = 12;
  const shown = order.slice(0, LIMIT);
  return (
    <aside className="sticky top-4 flex flex-col gap-1" data-testid="desk-inbox-queue">
      <SectionLabel count={order.length}>Очередь</SectionLabel>
      <ol className="desk-list">
        {shown.map((item) => {
          const on = item.task.id === current;
          return (
            <li key={item.task.id}>
              <button
                type="button"
                onClick={() => onPick(item.task.id)}
                aria-current={on ? "true" : undefined}
                className="desk-row flex w-full items-start gap-2.5 py-1 text-left focus-visible:outline-none"
              >
                <span className="mt-0.5 shrink-0">
                  <StatusGlyph status={item.task.status} overdue={isOverdue(item.task, now)} size={16} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate text-[13px] leading-5 ${on ? "font-semibold" : ""}`}>{item.task.title}</span>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-[12px] leading-4 text-muted">
                      {shortName(item.task.assignee?.full_name)} · {REASON_WORD[item.reason]}
                    </span>
                    {drafts.has(item.task.id) ? <DraftMark /> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {order.length > LIMIT ? <p className="pt-1 text-[12px] leading-4 text-muted">и ещё {order.length - LIMIT}</p> : null}
    </aside>
  );
}

/** The reason's buttons with their keys inside, «Ещё» with everything else, and the reaction row of D-133 under them. */
function StackKeys({
  desk,
  me,
  moves,
  onPress,
  pointsEnabled,
}: {
  desk: DeskTask;
  me: Me;
  moves: readonly Move[];
  onPress: (move: Move, target: HTMLElement) => void;
  pointsEnabled: boolean;
}) {
  const task = desk.task as TaskWithPeople;
  const reactions = useTaskReactions();
  const reacted = Boolean(reactions.data?.[task.id]);
  const canReact = isReactable(task, me.userId) && showsReactionBar(task.status, reacted);
  const main = enterMove(moves);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  return (
    <div data-testid="desk-task-keys">
      <div className="flex flex-wrap items-center gap-3">
        <MoveRow moves={moves} onPress={onPress} size="md" fillMain />
        {main ? (
          <span className="flex items-center gap-1 text-[12px] leading-4 text-muted">
            <Kbd>Enter</Kbd> {main.label.charAt(0).toLowerCase() + main.label.slice(1)}
          </span>
        ) : null}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAt)}
          title="Все действия · ."
          data-testid="desk-task-more"
          data-desk-more={task.id}
          onClick={(event) => setMenuAt(menuAt ? null : event.currentTarget)}
          className={MORE_WORD}
        >
          Ещё
          <span aria-hidden className="nums text-[11px] leading-4 opacity-60">
            .
          </span>
        </button>
        <Menu open={Boolean(menuAt)} onClose={() => setMenuAt(null)} anchor={menuAt} items={desk.acts.menu(task)} align="end" width={280} label="Все действия" />
      </div>
      {canReact ? (
        <div className="mt-3">
          <DeskReactions taskId={task.id} pointsEnabled={pointsEnabled} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One task of the stack: why it waits in its ink, the task (the panel's head and facts, larger) with
 * the reason's buttons at its foot, the thread with its field under it. Its keys are on the window
 * — the stack has no table to hold the focus.
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
  const card = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const desk = useDeskTask({
    taskId: item.task.id,
    me,
    row: item.task,
    base,
    now,
    onOpenTask: (id) => router.push(`/desk/tasks?id=${encodeURIComponent(id)}`),
    onReply: () => focusReply(thread.current),
  });
  const task = desk.task;
  const moves = task
    ? stackMoves(task, item.reason, { request: desk.signals.request, suggestion: desk.signals.suggestion, nudgedAt: desk.signals.nudgedAt }, now)
    : [];
  const keys = desk.letters;

  const press = (action: DeskAction | "reply", target?: HTMLElement) => {
    if (!task) return;
    if (action === "answer" || action === "reply") {
      focusReply(thread.current);
      return;
    }
    desk.acts.press(action, task, { at: target, scope: card.current });
    if (DONE_AT_ONCE.has(action)) onDone();
  };
  const pressMove = (move: Move, target?: HTMLElement) => {
    if (!move.held) press(move.action, target);
  };

  // the latest handlers for the window's listener, which is added once
  const latest = useRef({ press, onPrev, onNext, onSkip, main: enterMove(moves), keys, desk, now });
  useLayoutEffect(() => {
    latest.current = { press, onPrev, onNext, onSkip, main: enterMove(moves), keys, desk, now };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey) return;
      if (isTypingTarget(event.target) || deskLayerOpen()) return;
      const k = latest.current;
      const onControl = (event.target as HTMLElement | null)?.closest?.("button, a, [role=button]");
      switch (event.code) {
        case "ArrowLeft":
        case "KeyK":
          event.preventDefault();
          k.onPrev();
          return;
        case "ArrowRight":
        case "KeyJ":
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
        case "Period": {
          const current = k.desk.task;
          if (!current) return;
          event.preventDefault();
          card.current?.querySelector<HTMLElement>(`[data-desk-more="${CSS.escape(current.id)}"]`)?.click();
          return;
        }
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit && k.desk.task && k.desk.signals.question) {
        const answer = answersFor(k.desk.signals.question, k.desk.task.deadline, k.now)[Number(digit[1]) - 1];
        if (!answer) return;
        event.preventDefault();
        k.desk.acts.answer(k.desk.task, answer.text, answer.deadlineIso);
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
    if (desk.failure) return <LoadFailure what="задачу" offline={desk.failure.offline} busy={desk.retrying} onRetry={desk.retry} />;
    return (
      <SkeletonGroup>
        <TaskBone />
      </SkeletonGroup>
    );
  }

  const tone = TONE_VAR[REASON_TONE[item.reason]];
  const headline = reasonHeadline(item.reason, { ...item.task, ...task, time_request: desk.signals.request ?? item.task.time_request ?? null }, now);
  return (
    <>
      <section ref={card} className="flex flex-col" data-testid="desk-inbox-card" data-task-id={task.id} data-desk-task={task.id}>
        <p className="mb-2 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]" style={{ color: tone }} data-testid="desk-inbox-reason">
          {headline}
        </p>
        <TaskHead desk={desk} now={now} large scope={() => card.current} />
        <TaskFacts desk={desk} now={now} onWords={() => focusReply(thread.current)} />
        <div className="mt-4 border-t border-text pt-3">
          <StackKeys desk={desk} me={me} moves={moves} onPress={pressMove} pointsEnabled={pointsEnabled} />
        </div>
      </section>

      <section ref={thread} className="flex flex-col gap-1" data-testid="desk-inbox-thread">
        <SectionLabel>Переписка</SectionLabel>
        <div className="border-t border-text pt-1">
          <DeskThread taskId={task.id} me={me} messages={desk.messages} loading={desk.messagesLoading} load={desk.threadLoad} onRetry={desk.retry} actions={desk.acts.actions} />
        </div>
        {task.status === "revoked" ? (
          <p className="text-[13px] leading-5 text-muted" data-testid="thread-closed">
            Задача отозвана — переписка закрыта
          </p>
        ) : (
          // the answer field rides at the window's foot while the thread scrolls
          <div className="sticky bottom-0 z-[1] bg-bg pb-3 pt-2">
            <DeskComposer taskId={task.id} me={me} actions={desk.acts.actions} placeholder={desk.signals.question ? "Ответить на вопрос…" : "Написать…"} />
          </div>
        )}
      </section>

      {/* the letters stand on the buttons above: the hint keeps to the walk */}
      <p className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted" data-testid="desk-inbox-hint">
        <span>
          <Kbd>←</Kbd> <Kbd>→</Kbd> соседняя
        </span>
        {desk.signals.question ? (
          <span>
            <Kbd>1</Kbd>…<Kbd>{Math.min(9, answersFor(desk.signals.question, task.deadline, now).length)}</Kbd> быстрый ответ
          </span>
        ) : null}
        <span>
          <Kbd>?</Kbd> все клавиши
        </span>
      </p>

      {desk.acts.node}
    </>
  );
}
