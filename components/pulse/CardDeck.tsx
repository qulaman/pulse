"use client";

import { AnimatePresence, motion, type PanInfo, type TargetAndTransition } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import { ATTENTION_LANES, hasUnread, LANE_ORDER, quoteTitleOf, workRowLabel, type BoardTask, type Lane, type Lanes } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import { BUTTON, pluralRu } from "@/lib/tasks/status-text";
import { toast } from "@/components/ui/Toast";
import { TaskTile } from "./TaskTile";

/**
 * «Вниз — позже» outlives the deck (D-142): closing the ball, opening the other one or going to
 * another tab used to bring the card put off back on top. Kept for the life of the page.
 */
let putOff: string[] = [];

/** A horizontal pull past this (or a flick) turns the page. */
const PAGE_PX = 56;
const FLICK = 450;
/** A vertical pull past this acts (up) or postpones (down). */
const ACT_PX = 88;
/** A finger that stays this long without moving opens «Все действия». */
const LONG_PRESS_MS = 480;

type DeckItem = { kind: "task"; task: BoardTask; lane: Lane } | { kind: "work"; tasks: BoardTask[]; held: BoardTask[] };

type Primary = { label: string; run: () => void };

/**
 * Where a card that appears later comes from: from behind the one on top, into its place — not
 * thrown from the face again. The throw is the deck's arrival; after that a card showing up behind
 * (a swipe, a card that left) is only uncovered.
 */
const RISE: Record<"prev" | "current" | "next", TargetAndTransition> = {
  prev: { x: "-118%", y: 0, scale: 1, opacity: 0, rotate: -8 },
  current: { x: 0, y: 6, scale: 0.96, opacity: 0, rotate: 0 },
  next: { x: 0, y: 12, scale: 0.9, opacity: 0, rotate: 0 },
};
/**
 * A card that leaves the board on its own (settled elsewhere, deleted): it sinks and fades — over the
 * card rising into its place, or that one would hide the leaving.
 */
const LEAVE: TargetAndTransition = { opacity: 0, scale: 0.96, y: 10, zIndex: 4, transition: { duration: 0.18, ease: "easeOut", zIndex: { duration: 0 } } };

/**
 * The finger that held the card is still down when «Все действия» slides up, and its release
 * would press whatever the sheet has just put under it — «Настоять» on a refusal (found live,
 * D-139). The click that comes with that release is swallowed, wherever it lands; a release the
 * browser itself kept quiet (Android's own long press) leaves nothing to swallow, so the trap
 * closes shortly after the finger is up.
 */
function swallowRelease() {
  let timer = setTimeout(done, 1500);
  function stop(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    done();
  }
  function up() {
    clearTimeout(timer);
    timer = setTimeout(done, 350);
  }
  function done() {
    clearTimeout(timer);
    window.removeEventListener("click", stop, true);
    window.removeEventListener("pointerup", up, true);
  }
  window.addEventListener("click", stop, true);
  window.addEventListener("pointerup", up, true);
}

/** The one action a swipe up means on a lane — none where a choice or a date is needed. */
function primaryOf(item: DeckItem, actions: TaskActions): Primary | null {
  if (item.kind !== "task") return null;
  switch (item.lane) {
    case "review":
      return { label: BUTTON.approve, run: () => actions.transition({ taskId: item.task.id, toStatus: "done" }) };
    case "declined":
      return { label: BUTTON.insist, run: () => actions.transition({ taskId: item.task.id, toStatus: "sent" }) };
    default:
      return null;
  }
}

export type CardDeckProps = {
  lanes: Lanes;
  now: Date;
  since: string;
  actions: TaskActions;
  companyId: string;
  /** Who is reading: their own cursor decides what counts as an unread message. */
  meId: string;
  /** «Ответить» on a card opens the thread over the deck (D-64 §5). */
  onReply?: (task: BoardTask) => void;
  /** The «Сообщения» deck: the card in front shows the thread tail and a reply line. */
  replyLine?: boolean;
  /** A tap on a ball: that task's card comes to the top ("work" — the closing card). */
  focus: { id: string; key: number } | null;
  /** The card on top changed (a swipe): the ball to light up, "work" for the closing card. */
  onCurrentChange?: (id: string | null) => void;
  /** The closing «В работе · N» card; off for a deck of one kind (questions). */
  showWork?: boolean;
  /** Tasks held for the morning (D-38): named on the closing card (D-139). */
  held?: readonly BoardTask[];
  /** «Все действия» of a task — a long press on the top card or its «⋯» (D-139). */
  onMore: (task: BoardTask) => void;
};

/**
 * The deck (D-60): what needs the director as a stack of cards under the mascot — the
 * top card is the one to act on, the next peeks from behind. Swipe left or right to
 * browse, up to do the lane's one action, down to put the card at the end, tap to open
 * the full card, hold (or «⋯») for every move the task allows. «Отменить» after the swipe
 * is the action's own (lib/tasks/grace.ts, D-139): it outlives the deck, so closing the
 * panel or leaving the screen neither loses the tap nor takes it back. The calm lane is
 * one closing card that opens «Задачи».
 */
export function CardDeck({ lanes, now, since, actions, companyId, meId, onReply, replyLine = false, focus, onCurrentChange, showWork = true, held = [], onMore }: CardDeckProps) {
  const [postponed, setPostponedState] = useState<string[]>(() => putOff);
  const setPostponed = (update: (list: string[]) => string[]) =>
    setPostponedState((list) => {
      putOff = update(list);
      return putOff;
    });
  // «Сообщения»: plain words nobody answered pile up for weeks — one tap reads them all (D-142);
  // a question or a request for time is the director's move and stays
  const plainWords = replyLine
    ? lanes.question.filter((task) => !task.question && !(task.time_request && task.time_request.senderId !== meId) && hasUnread(task, meId))
    : [];
  const readAll = () => {
    for (const task of plainWords) actions.markRead({ taskId: task.id, companyId, seq: task.last_message?.seq ?? 0 });
    toast(`Прочитано: ${plainWords.length}`);
  };

  const items = useMemo<DeckItem[]>(() => {
    const attention: DeckItem[] = [];
    for (const lane of LANE_ORDER) {
      if (!ATTENTION_LANES.has(lane)) continue;
      for (const task of lanes[lane]) attention.push({ kind: "task", task, lane });
    }
    const later = attention.filter((item) => item.kind === "task" && postponed.includes(item.task.id));
    const soon = attention.filter((item) => !later.includes(item));
    const list = [...soon, ...later];
    if (showWork && (lanes.work.length > 0 || held.length > 0)) list.push({ kind: "work", tasks: lanes.work, held: [...held] });
    return list;
  }, [lanes, postponed, showWork, held]);

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  // the deck has been on screen: cards mounted from now on rise from behind instead of being thrown
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const current = items[safeIndex];

  // a tap on a ball: that card comes to the top (derived state: applied once per tap,
  // during render, so a later change of the list never re-jumps)
  const [appliedFocus, setAppliedFocus] = useState<number | null>(null);
  if (focus && focus.key !== appliedFocus) {
    setAppliedFocus(focus.key);
    const at = items.findIndex((item) => (item.kind === "task" ? item.task.id : "work") === focus.id);
    if (at >= 0) setIndex(at);
  }

  const currentId = current ? (current.kind === "task" ? current.task.id : "work") : null;
  const reported = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (reported.current === currentId) return;
    reported.current = currentId;
    onCurrentChange?.(currentId);
  }, [currentId, onCurrentChange]);

  const [open, setOpen] = useState<BoardTask | null>(null);

  // ---- gestures on the top card ---------------------------------------------------------
  const [flying, setFlying] = useState<{ id: string; dir: "up" | "down" } | null>(null);
  const onDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      if (!current) return;
      const { x, y } = info.offset;
      if (Math.abs(x) >= Math.abs(y)) {
        if ((x < -PAGE_PX || info.velocity.x < -FLICK) && safeIndex < items.length - 1) {
          haptic(8);
          setIndex(safeIndex + 1);
        } else if ((x > PAGE_PX || info.velocity.x > FLICK) && safeIndex > 0) {
          haptic(8);
          setIndex(safeIndex - 1);
        }
        return;
      }
      if (current.kind !== "task") return;
      const id = current.task.id;
      if (y < -ACT_PX) {
        const primary = primaryOf(current, actions);
        if (!primary) {
          // a lane without one answer: the full card, where the choices are
          setOpen(current.task);
          return;
        }
        haptic(15);
        setFlying({ id, dir: "up" });
        // the card has flown: the move lands in every list now, with «Отменить» on its toast (D-139)
        setTimeout(() => {
          setFlying(null);
          primary.run();
        }, 220);
      } else if (y > ACT_PX) {
        haptic(8);
        setFlying({ id, dir: "down" });
        setTimeout(() => {
          setFlying(null);
          setPostponed((list) => [...list.filter((other) => other !== id), id]);
        }, 220);
      }
    },
    [actions, current, items.length, safeIndex],
  );

  // long press: «Все действия»; the click that follows the release is swallowed
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number }>({ timer: null, x: 0, y: 0 });
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || current.kind !== "task") return;
    const task = current.task;
    press.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => {
      press.current.timer = null;
      haptic(20);
      swallowRelease();
      onMore(task);
    }, LONG_PRESS_MS) };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p.timer && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 8) {
      clearTimeout(p.timer);
      p.timer = null;
    }
  };
  const onPointerEnd = () => {
    const p = press.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
  };

  if (items.length === 0) return null;

  const roles: { item: DeckItem; role: "prev" | "current" | "next" }[] = [];
  if (items[safeIndex - 1]) roles.push({ item: items[safeIndex - 1]!, role: "prev" });
  roles.push({ item: items[safeIndex]!, role: "current" });
  if (items[safeIndex + 1]) roles.push({ item: items[safeIndex + 1]!, role: "next" });

  const keyOf = (item: DeckItem) => (item.kind === "task" ? item.task.id : "work");

  return (
    <section aria-label="Стопка задач" className="mt-3" data-testid="deck" data-index={safeIndex} data-count={items.length}>
      <div className="relative grid" style={{ touchAction: "pan-y" }}>
        {/* popLayout: a card that leaves is lifted out of the stack at once, so the deck's height
            and the next card do not wait for its fade */}
        <AnimatePresence mode="popLayout">
        {roles.map(({ item, role }) => {
          const id = keyOf(item);
          const isCurrent = role === "current";
          const fly = flying && item.kind === "task" && flying.id === item.task.id ? flying.dir : null;
          return (
            <motion.div
              key={id}
              className="[grid-area:1/1]"
              style={{ zIndex: role === "current" ? 2 : role === "next" ? 1 : 3, touchAction: isCurrent ? "none" : "auto" }}
              // thrown from the face when the deck arrives: from above, small, then settling into the
              // stack; a card uncovered later (a swipe, a card that left) rises from behind
              initial={arrived ? RISE[role] : { y: -180, scale: 0.4, opacity: 0 }}
              // a flown card has already gone (swipe up or down); one that leaves by itself sinks
              exit={fly ? { opacity: 0, transition: { duration: 0 } } : LEAVE}
              animate={
                fly === "up"
                  ? { y: -560, opacity: 0, rotate: -6, transition: { duration: 0.22, ease: "easeIn" } }
                  : fly === "down"
                    ? { y: 560, opacity: 0, rotate: 4, transition: { duration: 0.22, ease: "easeIn" } }
                    : role === "prev"
                      ? { x: "-118%", y: 0, scale: 1, opacity: 0, rotate: -8 }
                      : role === "next"
                        ? { x: 0, y: 12, scale: 0.94, opacity: 0.7, rotate: 0 }
                        : { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
              }
              transition={{ type: "spring", stiffness: 260, damping: 24, delay: role === "next" ? 0.06 : 0 }}
              drag={isCurrent && !fly}
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.9}
              dragMomentum={false}
              onDragEnd={isCurrent ? onDragEnd : undefined}
              onPointerDown={isCurrent ? onPointerDown : undefined}
              onPointerMove={isCurrent ? onPointerMove : undefined}
              onPointerUp={isCurrent ? onPointerEnd : undefined}
              onPointerCancel={isCurrent ? onPointerEnd : undefined}
              data-testid="deck-card"
              data-role={role}
            >
              {item.kind === "task" ? (
                <TaskTile
                  task={item.task}
                  lane={item.lane}
                  now={now}
                  fresh={item.task.updated_at > since}
                  leaving={false}
                  expanded={false}
                  onToggle={() => setOpen(item.task)}
                  actions={actions}
                  companyId={companyId}
                  meId={meId}
                  onReply={onReply}
                  showReply={replyLine && isCurrent}
                  onMore={isCurrent ? () => onMore(item.task) : undefined}
                />
              ) : (
                <WorkCard tasks={item.tasks} held={item.held} now={now} />
              )}
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[13px] leading-4 text-muted">
        <span>{current?.kind === "task" ? (primaryOf(current, actions) ? `вверх — ${primaryOf(current, actions)!.label.toLowerCase()} · вниз — позже` : "вниз — позже · тап — карточка") : ""}</span>
        <span className="flex items-center gap-3">
          {plainWords.length >= 2 ? (
            <button type="button" onClick={readAll} className="font-display text-[13px] font-semibold text-accent" data-testid="read-all">
              Прочитал все · {plainWords.length}
            </button>
          ) : null}
          <span className="nums">
            {safeIndex + 1} / {items.length}
          </span>
        </span>
      </div>

      {/* the full card: every button of the director, in a sheet over the deck */}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? quoteTitleOf(open.title) : undefined}>
        {open ? (
          <TaskCard task={open} variant="director" actions={actions} companyId={companyId} href={`/tasks/${open.id}`} question={open.question} declineReason={open.decline_reason} />
        ) : null}
      </Sheet>

    </section>
  );
}

/**
 * The last card: the calm lane in one glance and the way to the whole list — and what waits for
 * the morning (D-139), so a task dictated at night is not lost from sight until it goes.
 */
function WorkCard({ tasks, held, now }: { tasks: BoardTask[]; held: BoardTask[]; now: Date }) {
  const first = held[0];
  const heldLine = first
    ? held.length === 1
      ? `Отправлю позже: ${quoteTitleOf(first.title)}${first.scheduled_send_at ? ` · ${humanAqtobe(new Date(first.scheduled_send_at), now)}` : ""}`
      : `Отправлю позже · ${held.length} ${pluralRu(held.length, ["задача", "задачи", "задач"])}`
    : null;
  return (
    <Link
      href="/sent"
      className="relative block overflow-hidden rounded-[20px] border border-border bg-surface p-4 pl-5"
      data-testid="work-card"
    >
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: "var(--accent)" }} />
      {tasks.length > 0 ? (
        <>
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] leading-4 text-muted">{workRowLabel(tasks.length)}</span>
            <span className="font-display text-[12px] font-semibold uppercase tracking-[0.06em] text-accent">в работе</span>
          </span>
          <ul className="mt-2 flex flex-col gap-1">
            {tasks.slice(0, 3).map((task) => (
              <li key={task.id} className="truncate text-[16px] font-semibold leading-[22px]">
                {task.title}
              </li>
            ))}
            {tasks.length > 3 ? <li className="text-[14px] leading-[18px] text-muted">и ещё {tasks.length - 3}</li> : null}
          </ul>
        </>
      ) : null}
      {heldLine ? (
        <span className={`${tasks.length > 0 ? "mt-2" : ""} block truncate text-[14px] leading-[18px] text-muted`} data-testid="work-held">
          {heldLine}
        </span>
      ) : null}
      <span className="mt-2 block text-[14px] leading-[18px] text-accent">Все задачи ›</span>
    </Link>
  );
}
