"use client";

import { motion, type PanInfo } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { AssigneePicker } from "@/components/confirm/AssigneePicker";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { dismissToast, toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { ATTENTION_LANES, LANE_ORDER, quoteTitleOf, workRowLabel, type BoardTask, type Lane, type Lanes } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import { BUTTON, TEXT } from "@/lib/tasks/status-text";
import { TaskTile } from "./TaskTile";

/** A horizontal pull past this (or a flick) turns the page. */
const PAGE_PX = 56;
const FLICK = 450;
/** A vertical pull past this acts (up) or postpones (down). */
const ACT_PX = 88;
/** A finger that stays this long without moving opens the quick menu. */
const LONG_PRESS_MS = 480;
/** A deferred action can be taken back this long; the toast lives a little longer. */
const UNDO_MS = 4000;

type DeckItem = { kind: "task"; task: BoardTask; lane: Lane } | { kind: "work"; tasks: BoardTask[] };

type Primary = { label: string; run: () => void };

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
  /** Bumped by a tap on the mascot: the cards fly out again. */
  throwKey: number;
  /** A tap on a strip chip: jump to the first card of that lane. */
  focus: { lane: Lane; key: number } | null;
  onLaneChange?: (lane: Lane | null) => void;
};

/**
 * The deck (D-60): what needs the director as a stack of cards under the mascot — the
 * top card is the one to act on, the next peeks from behind. Swipe left or right to
 * browse, up to do the lane's one action (with «Отменить» for four seconds), down to
 * put the card at the end, tap to open the full card, hold for the quick menu. The
 * calm lane is one closing card that opens «Задачи».
 */
export function CardDeck({ lanes, now, since, actions, companyId, throwKey, focus, onLaneChange }: CardDeckProps) {
  const [postponed, setPostponed] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const items = useMemo<DeckItem[]>(() => {
    const attention: DeckItem[] = [];
    for (const lane of LANE_ORDER) {
      if (!ATTENTION_LANES.has(lane)) continue;
      for (const task of lanes[lane]) if (!hidden.has(task.id)) attention.push({ kind: "task", task, lane });
    }
    const later = attention.filter((item) => item.kind === "task" && postponed.includes(item.task.id));
    const soon = attention.filter((item) => !later.includes(item));
    const list = [...soon, ...later];
    if (lanes.work.length > 0) list.push({ kind: "work", tasks: lanes.work });
    return list;
  }, [lanes, hidden, postponed]);

  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const current = items[safeIndex];

  // a tap on a lane chip: the first card of that lane comes to the top (derived state:
  // applied once per tap, during render, so a later change of the list never re-jumps)
  const [appliedFocus, setAppliedFocus] = useState<number | null>(null);
  if (focus && focus.key !== appliedFocus) {
    setAppliedFocus(focus.key);
    const at = items.findIndex((item) => item.kind === "task" && item.lane === focus.lane);
    if (at >= 0) setIndex(at);
  }

  const laneRef = useRef<Lane | null | undefined>(undefined);
  useEffect(() => {
    const lane = current?.kind === "task" ? current.lane : null;
    if (laneRef.current === lane) return;
    laneRef.current = lane;
    onLaneChange?.(lane);
  }, [current, onLaneChange]);

  const [open, setOpen] = useState<BoardTask | null>(null);
  const [menu, setMenu] = useState<BoardTask | null>(null);
  const [menuStep, setMenuStep] = useState<"list" | "reassign" | "revoke" | "delete">("list");
  const closeMenu = () => {
    setMenu(null);
    setMenuStep("list");
  };

  // ---- deferred action with undo -------------------------------------------------------
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const defer = useCallback((task: BoardTask, primary: Primary) => {
    setHidden((set) => new Set(set).add(task.id));
    const title = quoteTitleOf(task.title);
    let toastId = 0;
    const timer = setTimeout(() => {
      timers.current.delete(task.id);
      primary.run();
      dismissToast(toastId);
    }, UNDO_MS);
    timers.current.set(task.id, timer);
    toastId = toast(`${primary.label}: ${title}`, {
      lifetimeMs: UNDO_MS + 400,
      action: {
        label: "Отменить",
        onClick: () => {
          clearTimeout(timer);
          timers.current.delete(task.id);
          setHidden((set) => {
            const next = new Set(set);
            next.delete(task.id);
            return next;
          });
        },
      },
    });
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      // leaving the screen commits what was not taken back
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

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
        setTimeout(() => {
          setFlying(null);
          defer(current.task, primary);
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
    [actions, current, defer, items.length, safeIndex],
  );

  // long press: the quick menu; the click that follows the release is swallowed
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; fired: boolean }>({ timer: null, x: 0, y: 0, fired: false });
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!current || current.kind !== "task") return;
    const task = current.task;
    press.current = { x: event.clientX, y: event.clientY, fired: false, timer: setTimeout(() => {
      press.current.fired = true;
      haptic(20);
      setMenu(task);
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
  const onClickCapture = (event: React.MouseEvent) => {
    if (press.current.fired) {
      press.current.fired = false;
      event.stopPropagation();
      event.preventDefault();
    }
  };

  if (items.length === 0) return null;

  const roles: { item: DeckItem; role: "prev" | "current" | "next" }[] = [];
  if (items[safeIndex - 1]) roles.push({ item: items[safeIndex - 1]!, role: "prev" });
  roles.push({ item: items[safeIndex]!, role: "current" });
  if (items[safeIndex + 1]) roles.push({ item: items[safeIndex + 1]!, role: "next" });

  const keyOf = (item: DeckItem) => (item.kind === "task" ? item.task.id : "work");

  return (
    <section aria-label="Стопка задач" className="mt-3" data-testid="deck" data-index={safeIndex} data-count={items.length}>
      <div key={throwKey} className="relative grid" style={{ touchAction: "pan-y" }}>
        {roles.map(({ item, role }) => {
          const id = keyOf(item);
          const isCurrent = role === "current";
          const fly = flying && item.kind === "task" && flying.id === item.task.id ? flying.dir : null;
          return (
            <motion.div
              key={id}
              className="[grid-area:1/1]"
              style={{ zIndex: role === "current" ? 2 : role === "next" ? 1 : 3, touchAction: isCurrent ? "none" : "auto" }}
              // thrown from the face: from above, small, then settling into the stack
              initial={{ y: -180, scale: 0.4, opacity: 0 }}
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
              onClickCapture={isCurrent ? onClickCapture : undefined}
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
                />
              ) : (
                <WorkCard tasks={item.tasks} />
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[13px] leading-4 text-muted">
        <span>{current?.kind === "task" ? (primaryOf(current, actions) ? `вверх — ${primaryOf(current, actions)!.label.toLowerCase()} · вниз — позже` : "вниз — позже · тап — карточка") : ""}</span>
        <span className="nums">
          {safeIndex + 1} / {items.length}
        </span>
      </div>

      {/* the full card: every button of the director, in a sheet over the deck */}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? quoteTitleOf(open.title) : undefined}>
        {open ? (
          <TaskCard task={open} variant="director" actions={actions} companyId={companyId} href={`/tasks/${open.id}`} question={open.question} declineReason={open.decline_reason} />
        ) : null}
      </Sheet>

      {/* the quick menu of a long press */}
      <Sheet open={menu !== null && menuStep !== "reassign"} onClose={closeMenu} title={menu ? quoteTitleOf(menu.title) : undefined}>
        {menu && menuStep === "list" ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              block
              onClick={() => {
                const task = menu;
                closeMenu();
                setOpen(task);
              }}
            >
              Открыть карточку
            </Button>
            <Button variant="secondary" block onClick={() => setMenuStep("reassign")}>
              {BUTTON.reassign}
            </Button>
            <Button variant="ghost" block onClick={() => setMenuStep("revoke")}>
              {BUTTON.revoke}
            </Button>
            <Button variant="ghost" block className="!text-danger/80" onClick={() => setMenuStep("delete")}>
              {BUTTON.remove}
            </Button>
          </div>
        ) : null}
        {menu && menuStep === "revoke" ? (
          <>
            <p className="text-[16px] leading-[22px] text-muted">{TEXT.revokeConfirm}</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="danger"
                block
                onClick={() => {
                  actions.revoke(menu.id);
                  closeMenu();
                }}
              >
                {BUTTON.revoke}
              </Button>
              <Button variant="secondary" block onClick={closeMenu}>
                Не сейчас
              </Button>
            </div>
          </>
        ) : null}
        {menu && menuStep === "delete" ? (
          <>
            <p className="text-[16px] leading-[22px] text-muted">{TEXT.removeConfirm}</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="danger"
                block
                onClick={() => {
                  actions.remove(menu.id);
                  closeMenu();
                }}
              >
                {BUTTON.remove}
              </Button>
              <Button variant="secondary" block onClick={closeMenu}>
                Не сейчас
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>
      <AssigneePicker
        open={menu !== null && menuStep === "reassign"}
        onClose={closeMenu}
        title="Кому передать?"
        hint="Задача уйдёт этому человеку как новая, у прежнего исполнителя закроется с пометкой"
        candidates={[]}
        onPick={(user) => {
          if (menu) actions.reassign({ taskId: menu.id, assigneeId: user.user_id, assigneeName: user.full_name });
          closeMenu();
        }}
      />
    </section>
  );
}

/** The last card: the calm lane in one glance and the way to the whole list. */
function WorkCard({ tasks }: { tasks: BoardTask[] }) {
  return (
    <Link
      href="/sent"
      className="relative block overflow-hidden rounded-[20px] border border-border bg-surface p-4 pl-5"
      data-testid="work-card"
    >
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: "var(--accent)" }} />
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
      <span className="mt-2 block text-[14px] leading-[18px] text-accent">Все задачи ›</span>
    </Link>
  );
}
