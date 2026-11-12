"use client";

/**
 * The second layer: what rises from the ground when the director taps a section, a person or
 * the secretary's desk. The deck of moves, the messages with one-tap answers, Эфир, the day,
 * the rating, a person's card, the secretary's keys and the door (visitor, her message).
 */
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  COMPANY,
  DISPUTES,
  EVENTS,
  LANE_KEYS,
  MEETING_NOW,
  NOW,
  QUICK_ANSWERS,
  RATING,
  SECRETARY_ACTIONS,
  TIME_REQUEST_KEYS,
  hhmm,
  minutesAgo,
  personById,
  whenLabel,
  dayLabel,
  type CalendarEvent,
  type Errand,
  type EtherPost,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { ERRAND_TIMES } from "./data";
import {
  LANE_TITLE,
  LANE_TONE,
  calmTasks,
  dueShort,
  heldTasks,
  minutesUntil,
  overdueBy,
  plural,
  receiptSteps,
  todayEvents,
  verb,
  type Counts,
  type Crew,
} from "./model";
import { C, Clip, Disc, Icon, Key, MONO, Press, Receipt, TONE, buzz, useReduced, type IconName } from "./ui";

// ---- sections: the board's drawers, with counts --------------------------------------------------

export type SectionId = "tasks" | "messages" | "ether" | "calendar" | "rating";

export function Sections({ counts, ether, disputes, soon, onOpen, empty = false }: { counts: Counts; ether: number; disputes: number; soon: boolean; onOpen: (id: SectionId) => void; empty?: boolean }) {
  const today = todayEvents(EVENTS).length;
  const items: { id: SectionId; label: string; n: number; tone: string | null; icon: IconName }[] = [
    { id: "tasks", label: "Задачи", n: counts.tasks, tone: counts.overdue ? C.amber : counts.declined ? C.lav : counts.review ? C.mint : null, icon: "task" },
    { id: "messages", label: "Сообщения", n: counts.question, tone: counts.question ? C.blue : null, icon: "chat" },
    { id: "ether", label: "Эфир", n: ether, tone: null, icon: "broadcast" },
    { id: "calendar", label: "Календарь", n: empty ? 0 : today, tone: soon ? C.amber : null, icon: "calendar" },
  ];
  if (COMPANY.pointsEnabled) items.push({ id: "rating", label: "Рейтинг", n: disputes, tone: disputes ? C.lav : null, icon: "trophy" });
  // one instrument strip, not five buttons: the counts read in a single glance
  return (
    <div className="mx-3 flex overflow-hidden rounded-[22px]" style={{ background: C.ink2, boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)" }}>
      {items.map((it, i) => (
        <Press
          key={it.id}
          onClick={() => onOpen(it.id)}
          className="relative flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1"
          style={{ boxShadow: i ? `inset 1px 0 0 ${C.line}` : "none" }}
          scale={0.92}
        >
          <span className="relative">
            <motion.span key={it.n} className="block text-[21px] leading-[24px]" style={{ ...MONO, color: it.n ? C.onInk : C.onInk3 }} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}>
              {it.id === "rating" && !it.n ? "—" : it.n}
            </motion.span>
            {it.tone ? <span className="absolute -right-2.5 top-0.5 h-[6px] w-[6px] rounded-full" style={{ background: it.tone, boxShadow: `0 0 8px ${it.tone}` }} /> : null}
          </span>
          <span className="max-w-full truncate px-0.5 text-[10.5px] font-medium leading-[13px] tracking-[-0.01em]" style={{ color: C.onInk2 }}>
            {it.label}
          </span>
        </Press>
      ))}
    </div>
  );
}

// ---- panel header ---------------------------------------------------------------------------------

export function PanelHeader({ title, count, sub, onClose, right }: { title: string; count?: number | string; sub?: ReactNode; onClose: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-2 px-4 pb-2 pt-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[22px] font-semibold leading-7 tracking-[-0.015em]" style={{ color: C.onInk }}>
            {title}
          </h2>
          {count !== undefined ? (
            <span className="text-[15px]" style={{ ...MONO, color: C.onInk3 }}>
              {count}
            </span>
          ) : null}
        </div>
        {sub ? (
          <div className="mt-0.5 text-[13px] leading-[18px]" style={{ color: C.onInk2 }}>
            {sub}
          </div>
        ) : null}
      </div>
      {right}
      <Press onClick={onClose} label="Закрыть" className="-mr-1.5 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: C.ink3, color: C.onInk2 }}>
        <Icon name="chevDown" size={20} />
      </Press>
    </div>
  );
}

// ---- lane chip, person line, the lane's words ------------------------------------------------------

export function LaneChip({ t }: { t: Task }) {
  const tone = TONE[LANE_TONE[t.lane]];
  const label = t.lane === "overdue" ? `Просрочка · ${overdueBy(t).replace("просрочено на ", "")}` : t.lane === "review" && t.report?.partial ? "Приёмка · сделано не всё" : t.lane === "question" ? (t.question ? "Вопрос" : t.timeRequest ? "Просит срок" : "Написал") : LANE_TITLE[t.lane];
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12px] font-semibold" style={{ background: `${tone.fill}1F`, color: tone.fill }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fill }} />
      {label}
    </span>
  );
}

function Who({ id, size = 34, right }: { id: string; size?: number; right?: ReactNode }) {
  const p = personById(id);
  if (!p) return null;
  return (
    <div className="flex items-center gap-2.5">
      <Disc initials={p.initials} look="onInk" size={size} />
      <div className="min-w-0 flex-1 leading-[17px]">
        <div className="truncate text-[14px] font-semibold" style={{ color: C.onInk }}>
          {p.short}
        </div>
        <div className="truncate text-[12px]" style={{ color: C.onInk3 }}>
          {p.position}
        </div>
      </div>
      {right}
    </div>
  );
}

function Photos({ n }: { n: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className="grid h-12 w-14 place-items-center rounded-[10px]"
          style={{ background: `linear-gradient(${135 + i * 30}deg, #3A434B, #262C31)`, color: C.onInk3 }}
        >
          <Icon name="photo" size={18} />
        </span>
      ))}
    </div>
  );
}

/** What the lane says: the reason of a decline with its suggestion, the report, how late it is. */
export function LaneWords({ t }: { t: Task }) {
  if (t.lane === "declined" && t.decline) {
    return (
      <div className="rounded-2xl px-3 py-2.5" style={{ background: "rgba(167,151,255,.1)" }}>
        <p className="text-[14px] leading-[19px]" style={{ color: C.onInk }}>
          «{t.decline.reason}»
        </p>
        {t.decline.suggestion ? (
          <p className="mt-1 text-[13px] leading-[18px]" style={{ color: "#CFC6FF" }}>
            {t.decline.suggestion}
          </p>
        ) : null}
      </div>
    );
  }
  if (t.lane === "review" && t.report) {
    return (
      <div className="rounded-2xl px-3 py-2.5" style={{ background: "rgba(95,211,154,.09)" }}>
        {t.report.partial ? (
          <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(240,167,60,.16)", color: C.amber }}>
            сделано не всё
          </span>
        ) : null}
        <p className="text-[14px] leading-[19px]" style={{ color: C.onInk }}>
          «{t.report.text}»
        </p>
        {t.report.photos ? (
          <div className="mt-2">
            <Photos n={t.report.photos} />
          </div>
        ) : null}
      </div>
    );
  }
  if (t.lane === "overdue") {
    return (
      <div className="rounded-2xl px-3 py-2.5 text-[13.5px] leading-[19px]" style={{ background: "rgba(240,167,60,.09)", color: C.onInk2 }}>
        Срок был {t.deadline ? hhmm(t.deadline) : "—"}, {verb(t.assigneeId, "отчёта пока нет", "отчёта пока нет")}. {t.receipt.acceptedAt ? `${verb(t.assigneeId, "Принял", "Приняла")} в ${hhmm(t.receipt.acceptedAt)}.` : ""}
      </div>
    );
  }
  return null;
}

// ---- the deck of moves (tasks) -------------------------------------------------------------------

type DeckItem = { kind: "task"; task: Task } | { kind: "calm" };

export function TasksDeck({
  deck,
  tasks,
  onKey,
  onOpen,
  onAll,
  onCurrent,
}: {
  deck: Task[];
  tasks: Task[];
  onKey: (taskId: string, key: string) => void;
  onOpen: (taskId: string) => void;
  onAll: (taskId: string) => void;
  /** the person on the top card — the folded sky rings them */
  onCurrent: (personId: string | null) => void;
}) {
  const reduce = useReduced();
  const items: DeckItem[] = [...deck.map((t) => ({ kind: "task" as const, task: t })), { kind: "calm" as const }];
  const [idx, setIdx] = useState(0);
  const [later, setLater] = useState<string[]>([]);
  // «позже» sends a card to the back without touching its data
  const ordered = [...items.filter((i) => i.kind !== "task" || !later.includes(i.task.id)), ...items.filter((i) => i.kind === "task" && later.includes(i.task.id))];
  const at = Math.min(idx, ordered.length - 1);
  const [exit, setExit] = useState<"up" | "down" | "left" | "right">("up");

  const main = (t: Task) => LANE_KEYS[t.lane][0]!;
  const go = (d: number) => {
    setExit(d > 0 ? "left" : "right");
    setIdx((i) => Math.max(0, Math.min(ordered.length - 1, i + d)));
  };
  const onDragEnd = (item: DeckItem, info: PanInfo) => {
    const { x, y } = info.offset;
    if (Math.abs(y) > Math.abs(x)) {
      if (y < -90 && item.kind === "task") {
        setExit("up");
        buzz(14);
        onKey(item.task.id, main(item.task));
      } else if (y > 90 && item.kind === "task") {
        setExit("down");
        setLater((l) => [...l.filter((id) => id !== item.task.id), item.task.id]);
      }
    } else if (x < -70) go(1);
    else if (x > 70) go(-1);
  };

  const current = ordered[at]!;
  const currentWho = current.kind === "task" ? current.task.assigneeId : null;
  useEffect(() => {
    onCurrent(currentWho);
  }, [currentWho, onCurrent]);
  const exitVariant = { up: { y: -520, opacity: 0, scale: 0.7, rotate: -2 }, down: { y: 140, opacity: 0, scale: 0.9 }, left: { x: -420, opacity: 0, rotate: -6 }, right: { x: 420, opacity: 0, rotate: 6 } }[exit];

  return (
    <div className="flex h-full flex-col">
      <div className="relative mx-4 min-h-0 flex-1">
        {/* the two cards behind peek out under the current one */}
        {ordered.slice(at + 1, at + 3).map((it, i) => (
          <motion.div
            key={`peek-${it.kind === "task" ? it.task.id : "calm"}`}
            className="absolute inset-0 rounded-[24px]"
            style={{ background: i === 0 ? C.ink3 : C.ink2, zIndex: 1 - i }}
            initial={false}
            animate={{ y: 10 + i * 9, scale: 0.955 - i * 0.04, opacity: 1 - i * 0.35 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        ))}
        <AnimatePresence initial={false} custom={exit}>
          <motion.div
            key={current.kind === "task" ? current.task.id : "calm"}
            className="absolute inset-0 z-10"
            initial={{ y: 12, scale: 0.96, opacity: 0.6 }}
            animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
            exit={reduce ? { opacity: 0 } : { ...exitVariant, transition: { duration: 0.42, ease: [0.3, 0.6, 0.3, 1] } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            drag={reduce ? false : true}
            dragSnapToOrigin
            dragElastic={0.55}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDragEnd={(_, info) => onDragEnd(current, info)}
          >
            {current.kind === "task" ? (
              <MoveCard t={current.task} onKey={(k) => { setExit(k === main(current.task) ? "up" : "up"); onKey(current.task.id, k); }} onOpen={() => onOpen(current.task.id)} onAll={() => onAll(current.task.id)} />
            ) : (
              <CalmCard tasks={tasks} onOpen={onOpen} onAll={onAll} onKey={onKey} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between px-5 pb-1 pt-3">
        <div className="flex items-center gap-1.5">
          {ordered.map((it, i) => (
            <button
              key={it.kind === "task" ? it.task.id : "calm"}
              type="button"
              aria-label={`Карточка ${i + 1}`}
              onClick={() => {
                setExit(i > at ? "left" : "right");
                setIdx(i);
              }}
              className="grid h-6 place-items-center"
              style={{ width: i === at ? 22 : 10 }}
            >
              <motion.span
                className="block h-1.5 rounded-full"
                animate={{ width: i === at ? 18 : 6, background: i === at ? C.onInk : it.kind === "task" ? TONE[LANE_TONE[it.task.lane]].fill : C.onInk3 }}
                style={{ opacity: i === at ? 1 : 0.7 }}
              />
            </button>
          ))}
        </div>
        <span className="text-[11.5px]" style={{ color: C.onInk3 }}>
          {current.kind === "task" ? `↑ ${main(current.task)} · ↓ позже · ↔ листать` : "↔ листать"}
        </span>
      </div>
    </div>
  );
}

function useLongPress(onLong: () => void, ms = 520) {
  const t = useRef<number | null>(null);
  const fired = useRef(false);
  return {
    onPointerDown: () => {
      fired.current = false;
      t.current = window.setTimeout(() => {
        fired.current = true;
        buzz(18);
        onLong();
      }, ms);
    },
    onPointerUp: () => {
      if (t.current) window.clearTimeout(t.current);
    },
    onPointerLeave: () => {
      if (t.current) window.clearTimeout(t.current);
    },
    onPointerCancel: () => {
      if (t.current) window.clearTimeout(t.current);
    },
    wasLong: () => fired.current,
  };
}

function MoveCard({ t, onKey, onOpen, onAll }: { t: Task; onKey: (k: string) => void; onOpen: () => void; onAll: () => void }) {
  const lp = useLongPress(onAll);
  const keys = LANE_KEYS[t.lane];
  return (
    <div className="flex h-full flex-col rounded-[24px] p-4" style={{ background: C.ink2, boxShadow: "0 20px 40px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)" }}>
      <div className="flex items-center justify-between">
        <LaneChip t={t} />
        <Press onClick={onAll} label="Все действия" className="-mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-full" style={{ color: C.onInk2 }}>
          <Icon name="more" size={20} />
        </Press>
      </div>
      <div
        role="button"
        tabIndex={0}
        className="mt-2 flex min-h-0 flex-1 cursor-pointer flex-col gap-3 overflow-y-auto"
        onPointerDown={lp.onPointerDown}
        onPointerUp={lp.onPointerUp}
        onPointerLeave={lp.onPointerLeave}
        onPointerCancel={lp.onPointerCancel}
        onClick={() => {
          if (!lp.wasLong()) onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
      >
        <Who id={t.assigneeId} />
        <div>
          <h3 className="text-[19px] font-semibold leading-[24px] tracking-[-0.01em]" style={{ color: C.onInk }}>
            {t.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: t.lane === "overdue" ? C.amber : C.onInk2 }}>
            <Icon name="clock" size={14} />
            <span>{t.deadline ? whenLabel(t.deadline) : "без срока"}</span>
          </div>
          <div className="mt-1">
            <Receipt steps={receiptSteps(t)} />
          </div>
        </div>
        <LaneWords t={t} />
      </div>
      <div className="mt-3 flex gap-1.5">
        {keys.map((k, i) => (
          <Key key={k} kind={i === 0 ? "primary" : "quiet"} className="min-w-0 flex-1 px-2" onClick={() => onKey(k)}>
            {k}
          </Key>
        ))}
      </div>
    </div>
  );
}

function CalmCard({ tasks, onOpen, onAll, onKey }: { tasks: Task[]; onOpen: (id: string) => void; onAll: (id: string) => void; onKey: (taskId: string, key: string) => void }) {
  const calm = calmTasks(tasks);
  const held = heldTasks(tasks);
  return (
    <div className="flex h-full flex-col rounded-[24px] p-4" style={{ background: C.ink2, boxShadow: "0 20px 40px -20px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.05)" }}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[19px] font-semibold" style={{ color: C.onInk }}>
          В работе
        </h3>
        <span className="text-[14px]" style={{ ...MONO, color: C.onInk3 }}>
          {calm.length}
        </span>
        <span className="ml-auto text-[12px]" style={{ color: C.onInk3 }}>
          ход за ними
        </span>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {calm.map((t) => {
          const p = personById(t.assigneeId);
          const steps = receiptSteps(t);
          const last = steps[steps.length - 1]!;
          return (
            <Row key={t.id} onClick={() => onOpen(t.id)} onLong={() => onAll(t.id)}>
              <Disc initials={p?.initials ?? "?"} look="onInk" size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium" style={{ color: C.onInk }}>
                  {t.title}
                </div>
                <div className="truncate text-[12px]" style={{ color: last.state === "wait" ? C.onInk : C.onInk3 }}>
                  {p?.short} · {dueShort(t.deadline)} · {last.label}
                  {last.at ? ` ${last.at}` : ""}
                  {t.status === "rework" ? " · на доработке" : ""}
                </div>
              </div>
            </Row>
          );
        })}
        {held.length ? (
          <>
            <div className="mb-1 mt-3 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
              <Icon name="moon" size={13} /> Утром уйдёт · {held.length}
            </div>
            {held.map((t) => {
              const p = personById(t.assigneeId);
              return (
                <div key={t.id} className="rounded-2xl p-2.5" style={{ background: "rgba(255,255,255,.035)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" }}>
                  <div className="flex items-center gap-2.5">
                    <Disc initials={p?.initials ?? "?"} look="onInk" size={30} style={{ opacity: 0.6 }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium" style={{ color: C.onInk }}>
                        {t.title}
                      </div>
                      <div className="text-[12px]" style={{ color: C.onInk3 }}>
                        {p?.short} · уйдёт в 08:00 · никто ещё не видит
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {LANE_KEYS.held.map((k, i) => (
                      <Key key={k} small kind={i === 0 ? "light" : "quiet"} onClick={() => onKey(t.id, k)}>
                        {k}
                      </Key>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Row({ children, onClick, onLong }: { children: ReactNode; onClick: () => void; onLong: () => void }) {
  const lp = useLongPress(onLong);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onPointerDown={lp.onPointerDown}
      onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerLeave}
      onPointerCancel={lp.onPointerCancel}
      onClick={() => {
        if (!lp.wasLong()) onClick();
      }}
      className="flex min-h-[54px] w-full items-center gap-2.5 border-b py-2 text-left"
      style={{ borderColor: C.line }}
    >
      {children}
    </motion.button>
  );
}

// ---- messages: questions, time requests, unread words -------------------------------------------------

export function Messages({
  items,
  onAnswer,
  onThread,
  onTime,
  onRead,
}: {
  items: Task[];
  onAnswer: (taskId: string, answer: string) => void;
  onThread: (taskId: string) => void;
  onTime: (taskId: string, key: string) => void;
  onRead: (taskId: string) => void;
}) {
  if (!items.length) return <Calm text="Вопросов нет. Все знают, что делать." />;
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const p = personById(t.assigneeId);
          const said = t.question ?? (t.timeRequest ? { text: t.timeRequest.why, at: t.timeRequest.at } : t.unread);
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -60, scale: 0.9, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] } }}
              className="rounded-[22px] p-3.5"
              style={{ background: C.ink2 }}
            >
              <div className="flex items-center gap-2.5">
                <Disc initials={p?.initials ?? "?"} look="onInk" size={32} />
                <div className="min-w-0 flex-1 leading-[16px]">
                  <div className="text-[14px] font-semibold" style={{ color: C.onInk }}>
                    {p?.short} <span className="font-normal" style={{ color: C.onInk3 }}>· {t.question ? "спрашивает" : t.timeRequest ? "просит срок" : verb(t.assigneeId, "написал", "написала")}</span>
                  </div>
                  <div className="truncate text-[12px]" style={{ color: C.onInk3 }}>
                    {t.title}
                  </div>
                </div>
                <span className="text-[11px]" style={{ ...MONO, color: C.onInk3 }}>
                  {said ? hhmm(said.at) : ""}
                </span>
              </div>
              <p className="mt-2.5 rounded-[16px] rounded-tl-[6px] px-3 py-2 text-[15px] leading-[20px]" style={{ background: C.ink3, color: C.onInk }}>
                {t.question ? t.question.text : t.timeRequest ? (
                  <>
                    Перенести на <b className="font-semibold">{whenLabel(t.timeRequest.proposed)}</b>
                    <span className="block text-[13px]" style={{ color: C.onInk2 }}>
                      «{t.timeRequest.why}» · сейчас {dueShort(t.deadline)}
                    </span>
                  </>
                ) : (
                  t.unread?.text
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {t.question
                  ? QUICK_ANSWERS[t.question.kind].map((a) => (
                      <Key key={a} small kind="quiet" onClick={() => (a === "Ответить словами" ? onThread(t.id) : onAnswer(t.id, a))}>
                        {a}
                      </Key>
                    ))
                  : t.timeRequest
                    ? TIME_REQUEST_KEYS.map((k, i) => (
                        <Key key={k} small kind={i === 0 ? "primary" : "quiet"} onClick={() => onTime(t.id, k)}>
                          {k}
                        </Key>
                      ))
                    : (
                        <Key small kind="quiet" onClick={() => onRead(t.id)}>
                          <Icon name="check" size={15} /> Прочитал
                        </Key>
                      )}
                <Key small kind="ghost" onClick={() => onThread(t.id)}>
                  <Icon name="chat" size={15} /> Ответить
                </Key>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Calm({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: "rgba(210,245,92,.12)", color: C.lime }}>
        <Icon name="check" size={26} stroke={2.2} />
      </span>
      <p className="text-[15px] leading-[21px]" style={{ color: C.onInk2 }}>
        {text}
      </p>
    </div>
  );
}

// ---- Эфир ------------------------------------------------------------------------------------------------

export function Ether({ posts }: { posts: EtherPost[] }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      {posts.map((e, i) => (
        <motion.div key={e.id} className="rounded-[22px] p-3.5" style={{ background: C.ink2 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: C.onInk3 }}>
            <Icon name="broadcast" size={14} />
            <span className="font-semibold uppercase tracking-[0.08em]">Всем</span>
            <span className="ml-auto">
              {dayLabel(e.at)} · <span style={MONO}>{hhmm(e.at)}</span>
            </span>
          </div>
          <p className="mt-1.5 text-[16px] leading-[22px]" style={{ color: C.onInk }}>
            {e.text}
          </p>
          {e.voiceSec ? (
            <div className="mt-2">
              <Clip sec={e.voiceSec} seed={i + 2} />
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2.5">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: C.ink4 }}>
              <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: e.read === e.of ? C.mint : C.lime }} initial={{ width: 0 }} animate={{ width: `${(e.read / e.of) * 100}%` }} transition={{ duration: 0.8, delay: 0.15 + i * 0.05, ease: [0.2, 0.7, 0.2, 1] }} />
            </div>
            <span className="shrink-0 text-[12px]" style={{ color: C.onInk2 }}>
              прочитали <span style={MONO}>{e.read}</span> из <span style={MONO}>{e.of}</span>
            </span>
          </div>
          {e.reactions?.length ? (
            <div className="mt-2.5 flex gap-1.5">
              {e.reactions.map((r) => (
                <span key={r.emoji} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px]" style={{ background: C.ink3, color: C.onInk }}>
                  {r.emoji} <span style={{ ...MONO, fontSize: 11 }}>{r.count}</span>
                </span>
              ))}
            </div>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

// ---- the day ---------------------------------------------------------------------------------------------

function Answers({ e }: { e: CalendarEvent }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {e.people.slice(0, 6).map(({ id, answer }) => {
        const p = personById(id);
        if (!p) return null;
        return (
          <span key={id} className="inline-flex h-7 items-center gap-1 rounded-full pl-0.5 pr-2 text-[12px]" style={{ background: C.ink3, color: answer === "no" ? C.onInk3 : C.onInk }}>
            <Disc initials={p.initials} look="onInk" size={24} style={{ background: "#3A4148", fontSize: 9 }} />
            {p.short}
            <span style={{ color: answer === "yes" ? C.mint : answer === "no" ? C.lav : C.onInk3 }}>{answer === "yes" ? "✓" : answer === "no" ? "✕" : "·"}</span>
          </span>
        );
      })}
      {e.people.length > 6 ? (
        <span className="text-[12px]" style={{ color: C.onInk3 }}>
          и ещё {e.people.length - 6}
        </span>
      ) : null}
    </div>
  );
}

export function CalendarPanel({ onEvent }: { onEvent: (id: string) => void }) {
  const today = todayEvents(EVENTS);
  const tomorrow = EVENTS.filter((e) => dayLabel(e.startsAt) === "завтра");
  const nowAt = today.findIndex((e) => minutesUntil(e.startsAt) > 0);
  return (
    <div className="px-4 pb-4">
      <div className="relative pl-[62px]">
        <span className="absolute bottom-2 left-[50px] top-2 w-px" style={{ background: C.ink4 }} />
        {today.map((e, ei) => {
          const until = minutesUntil(e.startsAt);
          const showNow = ei === nowAt;
          return (
            <div key={e.id}>
              {showNow ? (
                <div className="relative mb-2 flex h-6 items-center">
                  <span className="absolute -left-[62px] w-[40px] text-right text-[12px]" style={{ ...MONO, color: C.lime }}>
                    {hhmm(NOW.toISOString())}
                  </span>
                  <span className="absolute -left-[16.5px] h-[9px] w-[9px] rounded-full" style={{ background: C.lime, boxShadow: `0 0 0 4px rgba(210,245,92,.18)` }} />
                  <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${C.lime}, transparent)` }} />
                  <span className="ml-2 text-[11.5px] font-semibold" style={{ color: C.lime }}>
                    сейчас
                  </span>
                </div>
              ) : null}
              <Press onClick={() => onEvent(e.id)} className="relative mb-2 block w-full rounded-[20px] p-3 text-left" style={{ background: until > 0 && until <= 30 ? C.ink3 : C.ink2 }} scale={0.98}>
                <span className="absolute -left-[62px] top-3 w-[40px] text-right leading-4" style={MONO}>
                  <span className="block text-[13px]" style={{ color: C.onInk }}>
                    {hhmm(e.startsAt)}
                  </span>
                  <span className="block text-[11px]" style={{ color: C.onInk3 }}>
                    {hhmm(e.endsAt)}
                  </span>
                </span>
                <span className="absolute -left-[16px] top-[17px] h-2 w-2 rounded-full" style={{ background: until > 0 ? C.onInk : C.onInk3 }} />
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5" style={{ color: C.onInk }}>
                    {e.title}
                  </span>
                  {until > 0 && until <= 60 ? (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: until <= 15 ? "rgba(240,167,60,.18)" : "rgba(210,245,92,.14)", color: until <= 15 ? C.amber : C.lime }}>
                      через {until} мин
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[12.5px]" style={{ color: C.onInk2 }}>
                  <Icon name="place" size={13} /> {e.place}
                </div>
                <Answers e={e} />
              </Press>
            </div>
          );
        })}
      </div>
      {tomorrow.length ? (
        <>
          <div className="mb-2 mt-4 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
            Завтра
          </div>
          {tomorrow.map((e) => {
            const none = e.people.filter((x) => x.answer === "none").length;
            return (
              <Press key={e.id} onClick={() => onEvent(e.id)} className="mb-2 flex w-full items-center gap-3 rounded-[20px] p-3 text-left" style={{ background: C.ink2 }} scale={0.98}>
                <span className="w-[42px] text-right text-[13px]" style={{ ...MONO, color: C.onInk }}>
                  {hhmm(e.startsAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-5" style={{ color: C.onInk }}>
                    {e.title}
                  </span>
                  <span className="block text-[12.5px]" style={{ color: C.onInk2 }}>
                    {e.place} · {e.people.length} {plural(e.people.length, ["приглашён", "приглашены", "приглашены"])} · {none === e.people.length ? "ответов пока нет" : `ждём ${none}`}
                  </span>
                </span>
                <Icon name="chev" size={18} style={{ color: C.onInk3 }} />
              </Press>
            );
          })}
        </>
      ) : null}
    </div>
  );
}

// ---- the rating ------------------------------------------------------------------------------------------

export function RatingPanel({ disputes, onDispute }: { disputes: typeof DISPUTES; onDispute: (id: string, key: string) => void }) {
  return (
    <div className="px-4 pb-4">
      <AnimatePresence initial={false}>
        {disputes.map((d) => {
          const p = personById(d.personId);
          return (
            <motion.div key={d.id} layout exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.28 } }} className="mb-3 overflow-hidden rounded-[22px] p-3.5" style={{ background: C.ink2, boxShadow: `inset 0 0 0 1px rgba(167,151,255,.25)` }}>
              <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.lav }}>
                <Icon name="flag" size={14} /> Спор · ждёт вас
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <Disc initials={p?.initials ?? "?"} look="onInk" size={34} />
                <div className="min-w-0 flex-1 leading-[18px]">
                  <div className="text-[15px] font-semibold" style={{ color: C.onInk }}>
                    {p?.short} <span style={{ ...MONO, color: C.lav }}>{d.amount}</span>
                  </div>
                  <div className="text-[12.5px]" style={{ color: C.onInk2 }}>
                    {d.reason}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 rounded-[16px] rounded-tl-[6px] px-3 py-2 text-[14.5px] leading-[20px]" style={{ background: C.ink3, color: C.onInk }}>
                «{d.plea}»
              </p>
              <div className="mt-2.5 flex gap-1.5">
                {d.keys.map((k, i) => (
                  <Key key={k} kind={i === 0 ? "primary" : "quiet"} className="flex-1" onClick={() => onDispute(d.id, k)}>
                    {k}
                  </Key>
                ))}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
          Неделя · топ 5
        </span>
        <span className="text-[11.5px]" style={{ color: C.onInk3 }}>
          очки
        </span>
      </div>
      {RATING.map((r, i) => {
        const p = personById(r.personId);
        return (
          <motion.div key={r.personId} className="flex h-[54px] items-center gap-3 border-b" style={{ borderColor: C.line }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
            <span className="w-5 text-[15px]" style={{ ...MONO, color: r.place === 1 ? C.lime : C.onInk3 }}>
              {r.place}
            </span>
            <span className="relative">
              <Disc initials={p?.initials ?? "?"} look="onInk" size={34} />
              {r.place === 1 ? <span className="absolute -inset-[3px] rounded-full" style={{ boxShadow: `0 0 0 2px ${C.lime}` }} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium" style={{ color: C.onInk }}>
              {p?.short}
            </span>
            <span className="w-10 text-right text-[12px]" style={{ ...MONO, color: r.delta > 0 ? C.mint : r.delta < 0 ? C.lav : C.onInk3 }}>
              {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : "—"}
            </span>
            <span className="w-10 text-right text-[17px]" style={{ ...MONO, color: C.onInk }}>
              {r.points}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---- a person's card ---------------------------------------------------------------------------------------

export function PersonPanel({
  crew,
  onKey,
  onAnswer,
  onTime,
  onRead,
  onThread,
  onAll,
}: {
  crew: Crew;
  onKey: (taskId: string, key: string) => void;
  onAnswer: (taskId: string, answer: string) => void;
  onTime: (taskId: string, key: string) => void;
  onRead: (taskId: string) => void;
  onThread: (taskId: string) => void;
  onAll: (taskId: string) => void;
}) {
  const order: Record<string, number> = { overdue: 0, declined: 1, review: 2, question: 3, work: 4, held: 5 };
  const tasks = [...crew.tasks].sort((a, b) => order[a.lane]! - order[b.lane]!);
  return (
    <div className="px-4 pb-4">
      {tasks.length === 0 ? (
        <p className="rounded-[20px] px-4 py-5 text-center text-[14.5px] leading-5" style={{ background: C.ink2, color: C.onInk2 }}>
          {crew.altitude === "away" ? `${crew.person.short} ${crew.reason}. Задача подождёт возвращения.` : `Задач нет — ${verb(crew.id, "свободен", "свободна")}. Удержите клавишу и скажите, что сделать.`}
        </p>
      ) : null}
      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <motion.div key={t.id} layout exit={{ opacity: 0, y: -50, transition: { duration: 0.3 } }} className="rounded-[22px] p-3.5" style={{ background: C.ink2 }}>
              <div className="flex items-center justify-between">
                <LaneChip t={t} />
                <Press onClick={() => onAll(t.id)} label="Все действия" className="-mr-2 -mt-1 grid h-11 w-11 place-items-center rounded-full" style={{ color: C.onInk2 }}>
                  <Icon name="more" size={20} />
                </Press>
              </div>
              <button type="button" onClick={() => onThread(t.id)} className="mt-1 block w-full text-left">
                <span className="block text-[16px] font-semibold leading-[21px]" style={{ color: C.onInk }}>
                  {t.title}
                </span>
                <span className="mt-1 block text-[12.5px]" style={{ color: C.onInk2 }}>
                  {t.deadline ? whenLabel(t.deadline) : "без срока"}
                </span>
              </button>
              <div className="mt-1">
                <Receipt steps={receiptSteps(t)} />
              </div>
              {t.lane === "question" ? (
                <p className="mt-2 rounded-[14px] rounded-tl-[6px] px-3 py-2 text-[14.5px] leading-5" style={{ background: C.ink3, color: C.onInk }}>
                  {t.question?.text ?? (t.timeRequest ? `Перенести на ${whenLabel(t.timeRequest.proposed)} — «${t.timeRequest.why}»` : t.unread?.text)}
                </p>
              ) : (
                <div className="mt-2">
                  <LaneWords t={t} />
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {t.lane === "question"
                  ? t.question
                    ? QUICK_ANSWERS[t.question.kind].slice(0, 3).map((a) => (
                        <Key key={a} small kind="quiet" onClick={() => (a === "Ответить словами" ? onThread(t.id) : onAnswer(t.id, a))}>
                          {a}
                        </Key>
                      ))
                    : t.timeRequest
                      ? TIME_REQUEST_KEYS.map((k, i) => (
                          <Key key={k} small kind={i === 0 ? "primary" : "quiet"} onClick={() => onTime(t.id, k)}>
                            {k}
                          </Key>
                        ))
                      : (
                          <>
                            <Key small kind="quiet" onClick={() => onRead(t.id)}>
                              Прочитал
                            </Key>
                            <Key small kind="ghost" onClick={() => onThread(t.id)}>
                              Ответить
                            </Key>
                          </>
                        )
                  : LANE_KEYS[t.lane].map((k, i) => (
                      <Key key={k} small kind={i === 0 && t.lane !== "work" ? "primary" : "quiet"} onClick={() => onKey(t.id, k)}>
                        {k}
                      </Key>
                    ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---- the secretary -------------------------------------------------------------------------------------------

const ERRAND_WORDS: Record<Errand["status"], string> = { waiting: "ждёт сети", asked: "отправлено", seen: "увидела", doing: "делает", done: "готово" };

export function errandLine(e: Errand): string {
  if (e.status === "doing" && e.code === "coffee") return `несёт кофе${e.etaMin ? ` · ${e.etaMin} мин` : ""}`;
  if (e.status === "doing" && e.code === "tea") return `несёт чай${e.etaMin ? ` · ${e.etaMin} мин` : ""}`;
  return `${e.label}${e.note ? ` → ${e.note}` : ""} · ${ERRAND_WORDS[e.status]}`;
}

export function SecretaryPanel({
  errands,
  away,
  offline,
  dndOffer,
  dndOn,
  onDnd,
  onSend,
  onVoice,
  onThanks,
}: {
  errands: Errand[];
  away: string | null;
  offline: boolean;
  dndOffer: boolean;
  dndOn: boolean;
  onDnd: (on: boolean) => void;
  onSend: (code: string, note?: string, when?: string) => void;
  onVoice: () => void;
  onThanks: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(ERRAND_TIMES[0]!);
  const icon = (code: string) => SECRETARY_ACTIONS.find((a) => a.code === code)?.icon ?? "🗣️";
  return (
    <div className="px-4 pb-4">
      {dndOffer ? (
        <motion.div layout className="mb-3 rounded-[22px] p-3.5" style={{ background: "rgba(167,151,255,.1)", boxShadow: "inset 0 0 0 1px rgba(167,151,255,.22)" }}>
          <p className="text-[13px] leading-[18px]" style={{ color: "#CFC6FF" }}>
            Вы на «{MEETING_NOW.title}» до {hhmm(MEETING_NOW.endsAt)}.
          </p>
          <p className="mt-0.5 text-[16px] font-semibold leading-[22px]" style={{ color: C.onInk }}>
            🔕 Не беспокоить до {hhmm(MEETING_NOW.endsAt)}?
          </p>
          <div className="mt-2.5 flex gap-1.5">
            <Key kind="primary" className="flex-1" onClick={() => onDnd(true)}>
              Да, до {hhmm(MEETING_NOW.endsAt)}
            </Key>
            <Key kind="quiet" className="flex-1" onClick={() => onDnd(false)}>
              Не надо
            </Key>
          </div>
        </motion.div>
      ) : null}
      {dndOn ? (
        <div className="mb-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[13.5px]" style={{ background: C.ink2, color: C.onInk2 }}>
          🔕 Жанна никого не пускает до {hhmm(MEETING_NOW.endsAt)}
          <button type="button" className="ml-auto min-h-[36px] px-2 text-[13px] font-semibold" style={{ color: C.lime }} onClick={() => onDnd(false)}>
            Снять
          </button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {errands.map((e) => (
            <motion.div key={e.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex min-h-[52px] items-center gap-3 rounded-[18px] px-3 py-2" style={{ background: C.ink2 }}>
              <span className="text-[20px]">{icon(e.code)}</span>
              <div className="min-w-0 flex-1 leading-[17px]">
                <div className="text-[14px] font-medium" style={{ color: C.onInk }}>
                  {e.label}
                  {e.note ? <span style={{ color: C.onInk2 }}> → {e.note}</span> : null}
                </div>
                <div className="text-[12px]" style={{ color: e.status === "waiting" ? C.amber : e.status === "done" ? C.mint : C.onInk3 }}>
                  {e.status === "doing" && e.etaMin ? `делает · ${e.etaMin} мин` : ERRAND_WORDS[e.status]} · <span style={MONO}>{hhmm(e.at)}</span>
                </div>
              </div>
              {e.status === "done" && COMPANY.pointsEnabled ? (
                <Key small kind="light" onClick={() => onThanks(e.id)}>
                  Спасибо ♥
                </Key>
              ) : (
                <StatusDots status={e.status} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {away ? (
        <div className="mb-3 rounded-2xl px-3 py-2.5 text-[13.5px] leading-[19px]" style={{ background: C.ink2, color: C.onInk2 }}>
          Все отошли до {away}. Просьба дождётся — Жанна увидит её первой.
        </div>
      ) : null}

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.onInk3 }}>
          Просьбы
        </span>
        <span className="text-[11.5px]" style={{ color: C.onInk3 }}>
          удержать 2 с — сразу · тап — с примечанием
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {SECRETARY_ACTIONS.map((a) => (
          <ErrandKey
            key={a.code}
            icon={a.icon}
            label={a.label}
            active={open === a.code}
            onTap={() => {
              setOpen((o) => (o === a.code ? null : a.code));
              setNote("");
              setWhen(ERRAND_TIMES[0]!);
            }}
            onHold={() => {
              setOpen(null);
              onSend(a.code);
            }}
          />
        ))}
        <motion.button
          type="button"
          onClick={onVoice}
          whileTap={{ scale: 0.95 }}
          className="flex h-[76px] flex-col items-center justify-center gap-1 rounded-[18px]"
          style={{ background: "rgba(210,245,92,.1)", boxShadow: "inset 0 0 0 1px rgba(210,245,92,.28)" }}
        >
          <Icon name="voice" size={26} style={{ color: C.lime }} />
          <span className="px-1 text-center text-[11px] font-medium leading-[13px]" style={{ color: C.lime }}>
            Своими словами
          </span>
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key={open} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-2 rounded-[20px] p-3" style={{ background: C.ink2 }}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={open === "come" ? "Кого позвать? Например, Олег" : "Примечание, если нужно"}
                className="h-11 w-full rounded-xl px-3 text-[16px] outline-none"
                style={{ background: C.ink3, color: C.onInk, caretColor: C.lime, userSelect: "text" }}
              />
              <div className="no-bar mt-2 flex gap-1.5 overflow-x-auto">
                {ERRAND_TIMES.map((t) => (
                  <Key key={t} small kind={t === when ? "light" : "quiet"} onClick={() => setWhen(t)}>
                    {t}
                  </Key>
                ))}
              </div>
              <Key
                kind="primary"
                className="mt-2 w-full"
                onClick={() => {
                  onSend(open, note.trim() || undefined, when);
                  setOpen(null);
                }}
              >
                {offline ? "Отправить — уйдёт, когда появится сеть" : `Отправить Жанне · ${when.toLowerCase()}`}
              </Key>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StatusDots({ status }: { status: Errand["status"] }) {
  const n = { waiting: 0, asked: 1, seen: 2, doing: 3, done: 4 }[status];
  return (
    <span className="flex gap-1">
      {[1, 2, 3].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i <= n ? C.lime : C.ink4 }} />
      ))}
    </span>
  );
}

/** An errand key: hold 2 s — it fills and sends; a short tap opens the note and the time. */
function ErrandKey({ icon, label, active, onTap, onHold }: { icon: string; label: string; active: boolean; onTap: () => void; onHold: () => void }) {
  const [holding, setHolding] = useState(false);
  const t = useRef<{ timer: number | null; fired: boolean; t0: number }>({ timer: null, fired: false, t0: 0 });
  useEffect(() => {
    const ref = t.current;
    return () => {
      if (ref.timer) window.clearTimeout(ref.timer);
    };
  }, []);
  return (
    <motion.button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        t.current.fired = false;
        setHolding(true);
        t.current.timer = window.setTimeout(() => {
          t.current.fired = true;
          t.current.timer = null;
          setHolding(false);
          buzz([12, 40, 20]);
          onHold();
        }, 2000);
      }}
      onPointerUp={() => {
        if (t.current.timer) window.clearTimeout(t.current.timer);
        t.current.timer = null;
        setHolding(false);
        if (!t.current.fired) onTap();
      }}
      onPointerCancel={() => {
        if (t.current.timer) window.clearTimeout(t.current.timer);
        setHolding(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
      whileTap={{ scale: 0.95 }}
      className="relative flex h-[76px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[18px]"
      style={{ background: active ? C.ink4 : C.ink2, touchAction: "none", WebkitTouchCallout: "none", boxShadow: active ? `inset 0 0 0 1.5px ${C.lime}` : "none" }}
    >
      <motion.span aria-hidden className="absolute inset-x-0 bottom-0" style={{ background: "rgba(210,245,92,.22)" }} initial={false} animate={{ height: holding ? "100%" : "0%" }} transition={holding ? { duration: 2, ease: "linear" } : { duration: 0.2 }} />
      <span className="relative text-[22px] leading-6">{icon}</span>
      <span className="relative px-1 text-center text-[11px] font-medium leading-[13px]" style={{ color: C.onInk }}>
        {label}
      </span>
    </motion.button>
  );
}

// ---- the door: a visitor and the secretary's words ---------------------------------------------------------------

export function VisitorCard({
  visitor,
  onKey,
}: {
  visitor: { name: string; from: string; about: string; since: string; hospitality: string[] };
  onKey: (key: string, extras: string[]) => void;
}) {
  const [extras, setExtras] = useState<string[]>([]);
  const waited = minutesAgo(visitor.since);
  return (
    <div className="rounded-[22px] p-3.5" style={{ background: C.ink2, boxShadow: `inset 0 0 0 1.5px rgba(210,245,92,.5)` }}>
      <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: C.lime }}>
        <Icon name="door" size={14} /> К вам посетитель
        <span className="ml-auto normal-case tracking-normal" style={{ ...MONO, color: C.onInk2 }}>
          ждёт {waited} мин
        </span>
      </div>
      <p className="mt-1.5 text-[18px] font-semibold leading-6" style={{ color: C.onInk }}>
        {visitor.name}, {visitor.from}
      </p>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] leading-[19px]" style={{ color: C.onInk2 }}>
          {visitor.about}
        </p>
        <span className="text-[11.5px]" style={{ color: C.onInk3 }}>
          гостю
        </span>
        {visitor.hospitality.map((h) => {
          const on = extras.includes(h);
          return (
            <Press
              key={h}
              label={`${h} гостю`}
              onClick={() => setExtras((x) => (on ? x.filter((y) => y !== h) : [...x, h]))}
              className="relative grid h-10 w-10 place-items-center rounded-full text-[17px]"
              style={{ background: on ? C.onInk : C.ink3, boxShadow: on ? `0 0 0 2px ${C.lime}` : "none" }}
            >
              {h === "Чай" ? "🍵" : "☕"}
              {on ? (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full" style={{ background: C.lime, color: C.limeInk }}>
                  <Icon name="check" size={10} stroke={3} />
                </span>
              ) : null}
            </Press>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <Key kind="primary" className="flex-[1.4]" onClick={() => onKey("Пусть заходит", extras)}>
          Пусть заходит
        </Key>
        <Key kind="quiet" className="flex-1 px-2" onClick={() => onKey("Подождёт", [])}>
          Подождёт
        </Key>
        <Key kind="quiet" className="flex-1 px-2" onClick={() => onKey("Не приму", [])}>
          Не приму
        </Key>
      </div>
    </div>
  );
}

export function SecretaryWords({ text, at, onOk }: { text: string; at: string; onOk: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-[22px] p-3.5" style={{ background: C.ink2 }}>
      <Disc initials="ЖИ" look="secretary" size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px]" style={{ color: C.onInk3 }}>
          Жанна · <span style={MONO}>{hhmm(at)}</span>
        </div>
        <p className="text-[14.5px] leading-[20px]" style={{ color: C.onInk }}>
          {text}
        </p>
      </div>
      <Key small kind="light" onClick={onOk}>
        Понятно
      </Key>
    </div>
  );
}
