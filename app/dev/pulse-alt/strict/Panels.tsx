"use client";

/**
 * The second layer: a section opens in place under the row of key figures. Tasks are a stack
 * of index cards (swipe up — the lane's main key, down — later, sideways — browse, tap — the
 * thread, long press or «⋯» — every move); everything else is a strict register with its keys.
 */

import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  COMPANY,
  EVENTS,
  LANE_KEYS,
  MEETING_NOW,
  QUICK_ANSWERS,
  SECRETARY_ACTIONS,
  SERVICE,
  TIME_REQUEST_KEYS,
  UNDOABLE,
  dayLabel,
  hhmm,
  minutesAgo,
  personById,
  whenLabel,
  type Task,
} from "@/app/dev/pulse-alt/fixtures";

import { errandIcon, errandWord } from "./Board";
import {
  LANE_WORD,
  TOMORROW_EVENTS,
  dative,
  g,
  genitive,
  messageKind,
  nameOf,
  plural,
  receiptLine,
  receiptSteps,
  span,
  todayEvents,
  when,
} from "./model";
import { useStrict } from "./Strict";
import { EASE, Figure, Glyph, Icon, Key, Lbl, ReceiptTrack, Rule, SNAP, Scan, Segmented, VoiceClip, buzz, cx } from "./ui";

export function Panels() {
  const s = useStrict();
  switch (s.panel) {
    case "tasks":
      return <TasksPanel />;
    case "messages":
      return <MessagesPanel />;
    case "ether":
      return <EtherPanel />;
    case "calendar":
      return <CalendarPanel />;
    case "rating":
      return <RatingPanel />;
    case "person":
      return <PersonPanel />;
    case "secretary":
      return <SecretaryPanel />;
    default:
      return null;
  }
}

function PanelHead({ label, right }: { label: ReactNode; right?: ReactNode }) {
  const s = useStrict();
  return (
    <div className="flex h-11 items-center justify-between px-5">
      <span className="flex min-w-0 items-center gap-2">{typeof label === "string" ? <Lbl tone="ink">{label}</Lbl> : label}</span>
      <span className="flex items-center gap-3">
        {right}
        <button type="button" className="lbl -mr-1 flex h-11 items-center gap-1 px-1" style={{ color: "var(--cyan-hi)" }} onClick={() => s.openPanel(null)} data-testid="panel-close">
          Свернуть
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </span>
    </div>
  );
}

// ---- service lines: only here, after a tap (D-139) ----------------------------------------------

function ServiceBlock() {
  const s = useStrict();
  const rows: { text: string; key: string; on: () => void }[] = [];
  if (!s.pushOn) rows.push({ text: SERVICE.push.text, key: SERVICE.push.action, on: () => s.enablePush() });
  rows.push({ text: SERVICE.install.text, key: SERVICE.install.action, on: () => s.setSheet({ kind: "service", which: "install" }) });
  if (s.savedDraft) rows.push({ text: SERVICE.draft.text, key: SERVICE.draft.action, on: () => s.openDraftLine() });
  return (
    <section className="mx-5 mb-6 mt-7" data-testid="service">
      <Lbl>Служебное</Lbl>
      <div className="mt-2" style={{ borderTop: "1px solid var(--line-2)" }}>
        {rows.map((r) => (
          <div key={r.text} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="block h-2 w-2 shrink-0" style={{ border: "1.5px solid var(--text-3)" }} />
            <span className="min-w-0 flex-1 text-[13px] leading-[1.35]" style={{ color: "var(--text-2)" }}>
              {r.text}
            </span>
            <Key tone="ghost" className="shrink-0 text-[13px]" onClick={r.on}>
              {r.key}
            </Key>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- tasks: the stack of index cards ------------------------------------------------------------

type DeckItem = { kind: "task"; task: Task } | { kind: "close" };

function TasksPanel() {
  const s = useStrict();
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(0);
  const deck = s.board.deck;
  // «later» sends a card to the back of the stack — remember the director's order
  const sorted = [...deck].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? -1 : ia) - (ib === -1 ? -1 : ib);
  });
  const items: DeckItem[] = [...sorted.map((task) => ({ kind: "task" as const, task })), { kind: "close" }];
  const at = Math.min(index, items.length - 1);
  const item = items[at]!;
  const go = (d: number) => {
    const n = Math.max(0, Math.min(items.length - 1, at + d));
    if (n === at) {
      buzz(4);
      return;
    }
    setDir(d);
    setIndex(n);
    buzz(4);
  };
  return (
    <div data-testid="tasks-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Задачи</Lbl>
            <Lbl>{deck.length ? `${deck.length} ${plural(deck.length, ["ждёт", "ждут", "ждут"])} решения` : "решений не ждут"}</Lbl>
          </>
        }
      />
      <div className="px-5">
        <div className="relative">
          {/* the stack's edges under the card */}
          {items.length - at > 1 ? <span className="absolute inset-x-3 -bottom-[7px] h-6" style={{ border: "1px solid var(--line-2)", borderTop: "none", background: "rgba(14,18,26,.9)" }} /> : null}
          {items.length - at > 2 ? <span className="absolute inset-x-6 -bottom-[13px] h-6" style={{ border: "1px solid var(--line)", borderTop: "none", background: "rgba(10,13,19,.9)" }} /> : null}
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <SwipeCard
              key={item.kind === "task" ? item.task.id : "close"}
              dir={dir}
              onBrowse={go}
              onMain={item.kind === "task" ? () => s.act(item.task.id, LANE_KEYS[item.task.lane][0]!) : undefined}
              onLater={
                item.kind === "task"
                  ? () => {
                      setOrder([...sorted.map((t) => t.id).filter((id) => id !== item.task.id), item.task.id]);
                      s.toast("Позже — в конец стопки");
                    }
                  : undefined
              }
              onOpen={item.kind === "task" ? () => s.setSheet({ kind: "thread", taskId: item.task.id }) : undefined}
              onAll={item.kind === "task" ? () => s.setSheet({ kind: "actions", taskId: item.task.id }) : undefined}
            >
              {item.kind === "task" ? <TaskCard t={item.task} n={at + 1} of={items.length} /> : <CloseCard n={at + 1} of={items.length} />}
            </SwipeCard>
          </AnimatePresence>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={`Карточка ${at + 1} из ${items.length}`}>
            {items.map((it, i) => (
              <button
                key={it.kind === "task" ? it.task.id : "close"}
                type="button"
                className="flex h-6 items-center"
                onClick={() => go(i - at)}
                aria-label={`Карточка ${i + 1}`}
              >
                <motion.span className="block h-[3px]" style={{ boxShadow: i === at ? "0 0 8px rgba(70,228,255,.8)" : "none" }} animate={{ width: i === at ? 22 : 10, background: i === at ? "#46E4FF" : "rgba(150,205,255,.24)" }} transition={{ duration: 0.2 }} />
              </button>
            ))}
          </div>
          <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
            ↑ главное · ↓ позже · ← → листать
          </span>
        </div>
      </div>
      <ServiceBlock />
    </div>
  );
}

type Gesture = { id: number; x0: number; y0: number; t0: number; axis: "x" | "y" | null; long: boolean; timer: number | null; onKey: boolean };

/**
 * The card under the thumb, gestures by hand (pointer events + motion values): a tap opens the
 * thread, a long press — every move, up — the lane's main key, down — later, sideways — browse.
 * The card follows the finger on one axis only and snaps back without a bounce.
 */
function SwipeCard({
  children,
  dir,
  onBrowse,
  onMain,
  onLater,
  onOpen,
  onAll,
}: {
  children: ReactNode;
  dir: number;
  onBrowse: (d: number) => void;
  onMain?: () => void;
  onLater?: () => void;
  onOpen?: () => void;
  onAll?: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const gesture = useRef<Gesture | null>(null);
  const [fly, setFly] = useState<"up" | "down" | null>(null);
  const reset = () => {
    const g = gesture.current;
    if (g?.timer) window.clearTimeout(g.timer);
    gesture.current = null;
  };
  useEffect(() => () => {
    const g = gesture.current;
    if (g?.timer) window.clearTimeout(g.timer);
  }, []);
  const settle = () => {
    animate(x, 0, SNAP);
    animate(y, 0, SNAP);
  };
  return (
    <motion.div
      className="relative select-none"
      style={{ x, y, touchAction: "none", WebkitTouchCallout: "none" }}
      initial={{ x: dir >= 0 ? 60 : -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={fly === "up" ? { y: -280, opacity: 0, transition: { duration: 0.3, ease: EASE } } : fly === "down" ? { y: 140, opacity: 0, transition: { duration: 0.25, ease: EASE } } : { x: dir >= 0 ? -70 : 70, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.26, ease: EASE }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        reset();
        setFly(null);
        const g: Gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), axis: null, long: false, timer: null, onKey: Boolean((e.target as HTMLElement).closest("button")) };
        if (onAll)
          g.timer = window.setTimeout(() => {
            if (gesture.current !== g || g.axis) return;
            g.long = true;
            buzz(14);
            onAll();
          }, 520);
        gesture.current = g;
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId || g.long) return;
        const dx = e.clientX - g.x0;
        const dy = e.clientY - g.y0;
        if (!g.axis) {
          if (Math.hypot(dx, dy) < 9) return;
          g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (g.timer) window.clearTimeout(g.timer);
          // capture only once it is a drag, so keys inside the card still get their click
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (g.axis === "x") x.set(dx * 0.85);
        else y.set(dy < 0 ? dy * 0.85 : dy * 0.55);
      }}
      onPointerUp={(e) => {
        const g = gesture.current;
        reset();
        if (!g || g.long) return;
        if (!g.axis) {
          if (!g.onKey && performance.now() - g.t0 < 500) onOpen?.();
          return;
        }
        const dx = e.clientX - g.x0;
        const dy = e.clientY - g.y0;
        if (g.axis === "y" && dy < -70 && onMain) {
          setFly("up");
          buzz([8, 30, 8]);
          onMain();
        } else if (g.axis === "y" && dy > 70 && onLater) {
          setFly("down");
          onLater();
        } else if (g.axis === "x" && dx < -60) onBrowse(1);
        else if (g.axis === "x" && dx > 60) onBrowse(-1);
        settle();
      }}
      onPointerCancel={() => {
        reset();
        settle();
      }}
    >
      {children}
    </motion.div>
  );
}

function stopper(e: React.PointerEvent) {
  e.stopPropagation();
}

function laneHead(t: Task, now: Date): string {
  switch (t.lane) {
    case "overdue":
      return `Просрочка · ${span(minutesAgo(t.deadline!, now))}`;
    case "declined":
      return `Отказ · ${hhmm(t.decline!.at)}`;
    case "review":
      return `Приёмка · сдано ${hhmm(t.report!.at)}`;
    default:
      return LANE_WORD[t.lane];
  }
}

function TaskCard({ t, n, of }: { t: Task; n: number; of: number }) {
  const s = useStrict();
  const p = personById(t.assigneeId);
  const keys = LANE_KEYS[t.lane];
  return (
    <article className="cut cut-l frame glass tick flex flex-col" style={{ background: "linear-gradient(180deg, rgba(26,32,44,.96), rgba(12,15,22,.97))" }} data-testid={`card-${t.id}`}>
      <Scan />
      <header className="flex h-10 items-center justify-between pl-4 pr-1" style={{ borderBottom: "1px solid var(--line)" }}>
        <span className="flex items-center gap-2.5">
          <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
            {String(n).padStart(2, "0")}/{String(of).padStart(2, "0")}
          </span>
          <span className="block h-2 w-2 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} />
          <Lbl tone="seal">{laneHead(t, s.now)}</Lbl>
        </span>
        <button type="button" className="grid h-10 w-11 place-items-center" aria-label="Все действия" onPointerDown={stopper} onClick={(e) => {
          e.stopPropagation();
          s.setSheet({ kind: "actions", taskId: t.id });
        }} data-testid="card-more">
          <Icon name="more" size={18} />
        </button>
      </header>
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-2)" }}>
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {p?.short}
          </span>
          <span>·</span>
          <span>{p?.position}</span>
        </div>
        <h3 className="mt-1 text-[20px] font-semibold leading-[1.18] tracking-[-0.012em]">{t.title}</h3>
        {t.lane === "overdue" ? (
          <p className="mt-2.5 text-[14px] leading-[1.4]" style={{ color: "var(--text-2)" }}>
            Срок был {whenLabel(t.deadline!, s.now)} — прошло {span(minutesAgo(t.deadline!, s.now))}. Отчёта пока нет.
          </p>
        ) : null}
        {t.decline ? (
          <div className="mt-3 pl-3" style={{ borderLeft: "2px solid rgba(150,215,255,.4)" }}>
            <p className="text-[16px] leading-[1.35]">«{t.decline.reason}»</p>
            {t.decline.suggestion ? (
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--text-2)" }}>
                {t.decline.suggestion}
              </p>
            ) : null}
          </div>
        ) : null}
        {t.report ? (
          <div className="mt-3 pl-3" style={{ borderLeft: "2px solid rgba(150,215,255,.4)" }}>
            {t.report.partial ? (
              <Lbl tone="seal" className="mb-1 inline-block px-1.5 py-0.5" style={{ background: "var(--cyan-tint)", boxShadow: "inset 0 0 0 1px rgba(70,228,255,.4)" }}>
                Сделано не всё
              </Lbl>
            ) : null}
            <p className="text-[16px] leading-[1.35]">«{t.report.text}»</p>
            {t.report.photos ? (
              <div className="mt-2 flex gap-1.5">
                {Array.from({ length: t.report.photos }, (_, i) => (
                  <span key={i} className="grid h-11 w-11 place-items-end p-1" style={{ background: "repeating-linear-gradient(135deg, rgba(150,215,255,.06) 0 4px, rgba(150,215,255,.16) 4px 5px)", border: "1px solid var(--line-2)" }}>
                    <span className="mono text-[9px]" style={{ color: "var(--text-2)" }}>
                      {i + 1}
                    </span>
                  </span>
                ))}
                <span className="ml-1 self-center text-[12px]" style={{ color: "var(--text-3)" }}>
                  {t.report.photos} фото
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3.5 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
          {t.lane !== "overdue" ? (
            <>
              <Lbl>Срок</Lbl>
              <span className="text-[14px]">{t.deadline ? whenLabel(t.deadline, s.now) : "без срока"}</span>
            </>
          ) : null}
          {t.voiceSec ? (
            <>
              <Lbl>Голос</Lbl>
              <span onPointerDown={stopper}>
                <VoiceClip sec={t.voiceSec} />
              </span>
            </>
          ) : null}
        </div>
        <div className="mt-3.5">
          <ReceiptTrack steps={receiptSteps(t)} compact />
        </div>
      </div>
      <footer className="grid" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0,1fr))`, borderTop: "1px solid var(--line-2)" }} onPointerDown={stopper}>
        {keys.map((k, i) => (
          <Key key={k} tone={i === 0 ? "ink" : "ghost"} className={cx("h-[52px] px-1", i > 0 && "no-underline")} style={{ borderLeft: i ? "1px solid var(--line)" : undefined, textDecoration: "none" }} onClick={() => s.act(t.id, k)} testId={`key-${k}`}>
            {k}
            {UNDOABLE.has(k) ? <span className="mono text-[10px] opacity-60">5с</span> : null}
          </Key>
        ))}
      </footer>
    </article>
  );
}

function CloseCard({ n, of }: { n: number; of: number }) {
  const s = useStrict();
  const work = s.board.work;
  const held = s.board.held;
  return (
    <article className="cut cut-l frame glass flex flex-col" style={{ background: "linear-gradient(180deg, rgba(26,32,44,.96), rgba(12,15,22,.97))" }} data-testid="card-close">
      <Scan />
      <header className="flex h-10 items-center gap-2.5 px-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <span className="mono text-[11px]" style={{ color: "var(--text-3)" }}>
          {String(n).padStart(2, "0")}/{String(of).padStart(2, "0")}
        </span>
        <span className="block h-2 w-2 rotate-45" style={{ background: "var(--text-2)" }} />
        <Lbl tone="ink">Спокойные</Lbl>
      </header>
      <div className="px-4 pb-2 pt-3">
        <div className="flex items-end gap-3">
          <Figure value={work.length} className="font-semibold" style={{ fontSize: 44, letterSpacing: "-0.02em" }} />
          <span className="pb-1 text-[15px]" style={{ color: "var(--text-2)" }}>
            в работе — ваш ход не нужен
          </span>
        </div>
        <ul className="mt-2">
          {work.map((t) => (
            <li key={t.id}>
              <button type="button" className="flex w-full items-center gap-3 py-2 text-left" style={{ borderTop: "1px solid var(--line)" }} onPointerDown={stopper} onClick={() => s.setSheet({ kind: "thread", taskId: t.id })}>
                <Glyph kind={t.status === "sent" ? "open" : "solid"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{t.title}</span>
                  <span className="block truncate text-[12.5px]" style={{ color: t.status === "sent" && !t.receipt.seenAt ? "var(--text)" : "var(--text-3)" }}>
                    {nameOf(t.assigneeId)} · {receiptLine(t, s.now).toLowerCase()}
                  </span>
                </span>
                <span className="mono shrink-0 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                  {t.deadline ? when(t.deadline, s.now).replace("сегодня ", "") : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {held.length ? (
        <div className="px-4 pb-3 pt-1" style={{ borderTop: "1px solid var(--line-2)" }}>
          <div className="flex items-center gap-2 pt-2.5">
            <Glyph kind="dash" />
            <Lbl tone="ink">Утром в 08:00 · {held.length}</Lbl>
          </div>
          {held.map((t) => (
            <div key={t.id} className="mt-1.5 flex items-center gap-2" onPointerDown={stopper}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]" style={{ color: "var(--text-2)" }}>
                  {t.title}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--text-3)" }}>
                  {nameOf(t.assigneeId)} пока не видит
                </span>
              </span>
              <Key tone="line" className="h-10 shrink-0 px-2.5 text-[13px]" onClick={() => s.act(t.id, "Отправить сейчас")}>
                Сейчас
              </Key>
              <Key tone="ghost" className="h-10 shrink-0 text-[13px]" onClick={() => s.act(t.id, "Удалить")}>
                Удалить
              </Key>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

// ---- messages: questions, time requests, new words ----------------------------------------------

function MessagesPanel() {
  const s = useStrict();
  const list = s.board.messages;
  return (
    <div data-testid="messages-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Сообщения</Lbl>
            <Lbl>{list.length ? `${list.length} ждут ответа` : "все отвечены"}</Lbl>
          </>
        }
      />
      <div className="px-5" style={{ borderTop: "1px solid var(--line-2)", marginLeft: 20, marginRight: 20, paddingLeft: 0, paddingRight: 0 }}>
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.div key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0, x: 40, transition: { duration: 0.28, ease: EASE } }} className="overflow-hidden">
              <MessageItem t={t} />
            </motion.div>
          ))}
        </AnimatePresence>
        {list.length === 0 ? (
          <p className="py-8 text-center text-[15px]" style={{ color: "var(--text-2)" }}>
            Вопросов нет. Все ответы ушли.
          </p>
        ) : null}
      </div>
      <ServiceBlock />
    </div>
  );
}

function MessageItem({ t }: { t: Task }) {
  const s = useStrict();
  const kind = messageKind(t)!;
  const who = t.assigneeId;
  const at = t.question?.at ?? t.timeRequest?.at ?? t.unread?.at ?? t.createdAt;
  return (
    <article className="pb-4 pt-2" style={{ borderBottom: "1px solid var(--line)" }} data-testid={`msg-${t.id}`}>
      <div className="flex items-center gap-2">
        <span className="block h-2 w-2 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} />
        <Lbl tone="seal">{kind === "question" ? "Спрашивает" : kind === "time" ? "Просит другой срок" : g(who, "Написал", "Написала")}</Lbl>
        <span className="mono text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {hhmm(at)}
        </span>
        <button type="button" className="lbl ml-auto flex h-10 items-center" style={{ color: "var(--cyan-hi)" }} onClick={() => s.setSheet({ kind: "thread", taskId: t.id })} data-testid={`open-${t.id}`}>
          Переписка ›
        </button>
      </div>
      {kind === "question" ? <p className="text-[18px] font-medium leading-[1.3] tracking-[-0.01em]">«{t.question!.text}»</p> : null}
      {kind === "unread" ? <p className="text-[18px] font-medium leading-[1.3] tracking-[-0.01em]">«{t.unread!.text}»</p> : null}
      {kind === "time" ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[18px] font-medium tracking-[-0.01em]">
            <span className="line-through decoration-1" style={{ color: "var(--text-3)" }}>
              {when(t.deadline, s.now)}
            </span>
            <span>→</span>
            <span>{when(t.timeRequest!.proposed, s.now)}</span>
          </div>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-2)" }}>
            «{t.timeRequest!.why}»
          </p>
        </>
      ) : null}
      <p className="mt-1 truncate text-[13px]" style={{ color: "var(--text-2)" }}>
        <span className="font-medium" style={{ color: "var(--text)" }}>
          {nameOf(who)}
        </span>{" "}
        · {t.title}
      </p>
      <Segmented>
        {kind === "question"
          ? QUICK_ANSWERS[t.question!.kind].map((a, i) => (
              <Key
                key={a}
                tone={i === 0 ? "ink" : "seg"}
                className="h-11 px-1.5 text-[13px] leading-tight"
                onClick={() => {
                  if (a === "Ответить словами") s.setSheet({ kind: "thread", taskId: t.id, compose: true });
                  else if (a === "Позже отвечу") s.toast("Напомню через час");
                  else s.answer(t.id, a);
                }}
                testId={`qa-${a}`}
              >
                {a}
              </Key>
            ))
          : kind === "time"
            ? TIME_REQUEST_KEYS.map((k, i) => (
                <Key key={k} tone={i === 0 ? "ink" : "seg"} className="h-11 px-1.5 text-[13px] leading-tight" onClick={() => s.act(t.id, k)}>
                  {k}
                </Key>
              ))
            : [
                <Key key="read" tone="ink" className="h-11 px-1.5 text-[13px]" onClick={() => s.readUnread(t.id)}>
                  Прочитал
                </Key>,
                <Key key="reply" tone="seg" className="h-11 px-1.5 text-[13px]" onClick={() => s.setSheet({ kind: "thread", taskId: t.id, compose: true })}>
                  Ответить
                </Key>,
              ]}
      </Segmented>
    </article>
  );
}

// ---- ether --------------------------------------------------------------------------------------

function EtherPanel() {
  const s = useStrict();
  return (
    <div data-testid="ether-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Эфир</Lbl>
            <Lbl>{s.ether.length} {plural(s.ether.length, ["объявление", "объявления", "объявлений"])}</Lbl>
          </>
        }
      />
      <div className="mx-5" style={{ borderTop: "1px solid var(--line-2)" }}>
        <button type="button" className="flex w-full items-center gap-3 py-3 text-left" style={{ borderBottom: "1px solid var(--line)" }} onClick={() => s.startRec("tap", "ether")} data-testid="ether-say">
          <span className="cut cut-s frame frame-red grid h-10 w-10 shrink-0 place-items-center" style={{ background: "rgba(255,51,85,.16)", color: "var(--red-hi)" }}>
            <Icon name="mic" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Новое объявление</span>
            <span className="block text-[13px]" style={{ color: "var(--text-2)" }}>
              Скажите «Всем: …»
            </span>
          </span>
          <Lbl tone="ink">Сказать ›</Lbl>
        </button>
        {s.ether.map((p, i) => (
          <motion.article key={p.id} className="py-4" style={{ borderBottom: "1px solid var(--line)" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25, ease: EASE }}>
            <div className="flex items-center justify-between">
              <Lbl>
                {dayLabel(p.at, s.now)} · {hhmm(p.at)}
              </Lbl>
              {p.voiceSec ? <VoiceClip sec={p.voiceSec} /> : null}
            </div>
            <p className="mt-1 text-[16.5px] leading-[1.38]">{p.text}</p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[12.5px]" style={{ color: "var(--text-2)" }}>
                Прочитали{" "}
                <span className="num font-semibold" style={{ color: "var(--text)" }}>
                  {p.read}
                </span>{" "}
                из {p.of}
              </span>
              <span className="relative h-[3px] flex-1" style={{ background: "var(--line)" }}>
                <motion.span className="absolute inset-y-0 left-0" style={{ background: p.read === p.of ? "var(--cyan)" : "var(--text-2)", boxShadow: p.read === p.of ? "0 0 6px rgba(70,228,255,.7)" : "none" }} initial={{ width: 0 }} animate={{ width: `${(p.read / p.of) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.05 }} />
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(p.reactions ?? []).map((r) => (
                <button key={r.emoji} type="button" className="flex h-9 items-center gap-1.5 px-2.5 text-[13px]" style={{ boxShadow: "inset 0 0 0 1px var(--line-2)" }} onClick={() => s.reactEther(p.id, r.emoji)}>
                  <span>{r.emoji}</span>
                  <Figure value={r.count} className="text-[13px] font-medium" />
                </button>
              ))}
              {!(p.reactions ?? []).some((r) => r.emoji === "👍") ? (
                <button type="button" className="flex h-9 items-center px-2.5 text-[13px]" style={{ boxShadow: "inset 0 0 0 1px var(--line)", color: "var(--text-3)" }} onClick={() => s.reactEther(p.id, "👍")} aria-label="Поставить 👍">
                  + 👍
                </button>
              ) : null}
            </div>
          </motion.article>
        ))}
      </div>
      <ServiceBlock />
    </div>
  );
}

// ---- calendar -----------------------------------------------------------------------------------

function CalendarPanel() {
  const s = useStrict();
  const today = todayEvents(EVENTS, s.now);
  const tomorrow = TOMORROW_EVENTS(s.now);
  const nowMs = s.now.getTime();
  const firstFuture = today.findIndex((e) => new Date(e.startsAt).getTime() > nowMs);
  return (
    <div data-testid="calendar-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Календарь</Lbl>
            <Lbl>сегодня {today.length}</Lbl>
          </>
        }
      />
      <div className="mx-5" style={{ borderTop: "1px solid var(--line-2)" }}>
        {today.map((e, i) => (
          <div key={e.id}>
            {i === firstFuture ? <NowMark time={hhmm(s.now.toISOString())} /> : null}
            <EventRow id={e.id} />
          </div>
        ))}
        {firstFuture === -1 ? <NowMark time={hhmm(s.now.toISOString())} /> : null}
        <div className="pb-1 pt-5">
          <Lbl tone="ink">Завтра</Lbl>
        </div>
        <div style={{ borderTop: "1px solid var(--line-2)" }}>
          {tomorrow.map((e) => (
            <EventRow key={e.id} id={e.id} />
          ))}
        </div>
      </div>
      <ServiceBlock />
    </div>
  );
}

function NowMark({ time }: { time: string }) {
  return (
    <div className="relative flex h-6 items-center gap-2">
      <span className="mono text-[11px] font-medium" style={{ color: "var(--cyan)" }}>
        {time}
      </span>
      <Rule style={{ background: "var(--cyan)" }} className="flex-1" />
    </div>
  );
}

function EventRow({ id }: { id: string }) {
  const s = useStrict();
  const e = EVENTS.find((x) => x.id === id)!;
  const mins = -minutesAgo(e.startsAt, s.now);
  const soon = mins > 0 && mins <= 15;
  const yes = e.people.filter((p) => p.answer === "yes").length;
  const no = e.people.filter((p) => p.answer === "no").length;
  const none = e.people.filter((p) => p.answer === "none").length;
  const past = mins <= 0;
  return (
    <button type="button" className="grid w-full grid-cols-[62px_1fr] gap-3 py-3 text-left" style={{ borderBottom: "1px solid var(--line)", opacity: past ? 0.5 : 1 }} onClick={() => s.setSheet({ kind: "event", eventId: e.id })} data-testid={`event-${e.id}`}>
      <span className="flex flex-col">
        <span className="num text-[24px] font-semibold leading-none tracking-[-0.01em]">{hhmm(e.startsAt)}</span>
        <span className="mono mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
          до {hhmm(e.endsAt)}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[15.5px] font-medium leading-tight">{e.title}</span>
        <span className="mt-0.5 block text-[13px]" style={{ color: "var(--text-2)" }}>
          {e.place}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span>✓ {yes}</span>
          {no ? <span>✕ {no}</span> : null}
          {none ? <span style={{ color: "var(--text-3)" }}>? {none}</span> : null}
          {mins > 0 && dayLabel(e.startsAt, s.now) === "сегодня" ? (
            <span className="lbl" style={{ color: soon ? "var(--cyan)" : "var(--text-3)" }}>
              через {span(mins)}
            </span>
          ) : null}
          {e.remindMin ? <span style={{ color: "var(--text-3)" }}>напомню за {e.remindMin} мин</span> : null}
        </span>
      </span>
    </button>
  );
}

// ---- rating -------------------------------------------------------------------------------------

function RatingPanel() {
  const s = useStrict();
  const max = Math.max(...s.rating.map((r) => r.points), 1);
  return (
    <div data-testid="rating-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Рейтинг</Lbl>
            <Lbl>неделя · топ-5</Lbl>
          </>
        }
      />
      <div className="mx-5" style={{ borderTop: "1px solid var(--line-2)" }}>
        {s.rating.slice(0, 5).map((r, i) => (
          <motion.div key={r.personId} layout className="grid grid-cols-[28px_1fr_auto_34px] items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }} transition={{ type: "spring", stiffness: 400, damping: 40 }}>
            <span className="num text-[20px] font-semibold">{r.place}</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium">{nameOf(r.personId)}</span>
              <span className="mt-1 block h-[3px]" style={{ background: "var(--line)" }}>
                <motion.span className="block h-full" style={{ background: i === 0 ? "var(--cyan)" : "var(--text-2)", boxShadow: i === 0 ? "0 0 6px rgba(70,228,255,.7)" : "none" }} initial={{ width: 0 }} animate={{ width: `${(r.points / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: 0.05 * i }} />
              </span>
            </span>
            <Figure value={r.points} roll className="text-[20px] font-semibold" />
            <span className="mono text-right text-[12px]" style={{ color: r.delta > 0 ? "var(--cyan)" : "var(--text-3)" }}>
              {r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : "—"}
            </span>
          </motion.div>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {s.disputes.map((d) => (
          <motion.section key={d.id} className="cut frame frame-cyan glass mx-5 mt-5" exit={{ opacity: 0, height: 0, marginTop: 0 }} data-testid="dispute">
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="flex items-center gap-2">
                <span className="block h-2 w-2 rotate-45" style={{ background: "var(--cyan)", boxShadow: "0 0 8px rgba(70,228,255,.9)" }} />
                <Lbl tone="seal">Спор · {nameOf(d.personId)}</Lbl>
              </span>
              <span className="num text-[22px] font-semibold">{String(d.amount).replace("-", "−")}</span>
            </div>
            <div className="px-4 pb-3 pt-1">
              <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
                {d.reason}
              </p>
              <p className="mt-1.5 text-[16px] leading-[1.35]">«{d.plea}»</p>
            </div>
            <div className="grid grid-cols-2" style={{ borderTop: "1px solid var(--line-2)" }}>
              <Key tone="ink" className="h-12" onClick={() => s.resolveDispute(d.id, true)}>
                Снять штраф
              </Key>
              <Key tone="seg" className="h-12" onClick={() => s.resolveDispute(d.id, false)}>
                Оставить
              </Key>
            </div>
          </motion.section>
        ))}
      </AnimatePresence>
      {!COMPANY.pointsEnabled ? null : <ServiceBlock />}
    </div>
  );
}

// ---- a person: their tasks, and the key pinned to them ------------------------------------------

function PersonPanel() {
  const s = useStrict();
  const id = s.personId!;
  const p = personById(id)!;
  const mine = s.tasks.filter((t) => t.assigneeId === id);
  const moves = mine.filter((t) => ["overdue", "declined", "question", "review"].includes(t.lane)).length;
  return (
    <div data-testid="person-panel">
      <PanelHead label={<Lbl tone="ink">{p.position}</Lbl>} />
      <div className="mx-5" style={{ borderTop: "1px solid var(--line-2)" }}>
        <div className="flex items-end justify-between gap-3 pb-3 pt-3">
          <div className="min-w-0">
            <div className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{p.fullName}</div>
            <div className="mt-0.5 text-[13.5px]" style={{ color: "var(--text-2)" }}>
              {mine.length ? `${mine.length} ${plural(mine.length, ["задача", "задачи", "задач"])}${moves ? ` · ${moves} ${plural(moves, ["ждёт", "ждут", "ждут"])} вас` : ""}` : "Задач нет"}
            </div>
          </div>
          <span className="cut cut-s frame frame-cyan disp glow-c grid h-12 w-12 shrink-0 place-items-center text-[16px] font-bold" style={{ background: "var(--cyan-tint)", color: "var(--cyan-hi)", fontStretch: "80%" }}>
            {p.initials}
          </span>
        </div>
        <motion.div className="cut frame frame-red flex items-center gap-3 px-3 py-3" style={{ background: "linear-gradient(90deg, rgba(255,51,85,.24), rgba(255,51,85,.06))", color: "var(--text)" }} initial={{ clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} transition={{ duration: 0.45, ease: EASE, delay: 0.1 }} data-testid="pin-banner">
          <span className="lbl" style={{ color: "var(--red-hi)" }}>
            Дать задачу
          </span>
          <span className="min-w-0 flex-1 text-[14px] leading-tight">Клавиша внизу пишет {dative(id)} — удерживайте и говорите</span>
          <motion.span animate={{ y: [0, 4, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }} className="text-[18px]">
            ↓
          </motion.span>
        </motion.div>
      </div>
      <div className="mx-5 mt-4">
        {mine.length === 0 ? (
          <p className="py-4 text-[14.5px]" style={{ color: "var(--text-2)" }}>
            У {genitive(id)} сейчас ничего нет. Скажите задачу — она уйдёт сразу.
          </p>
        ) : (
          mine.map((t) => <PersonTask key={t.id} t={t} />)
        )}
      </div>
    </div>
  );
}

function PersonTask({ t }: { t: Task }) {
  const s = useStrict();
  const kind = messageKind(t);
  const move = ["overdue", "declined", "question", "review"].includes(t.lane);
  const keys = kind === "question" ? QUICK_ANSWERS[t.question!.kind].slice(0, 3) : kind === "time" ? TIME_REQUEST_KEYS : kind === "unread" ? ["Прочитал", "Ответить"] : LANE_KEYS[t.lane];
  return (
    <article className="py-3.5" style={{ borderTop: "1px solid var(--line-2)" }}>
      <div className="flex items-center gap-2">
        <span className="block h-2 w-2 rotate-45" style={{ background: move ? "var(--cyan)" : t.lane === "held" ? "transparent" : "var(--text-2)", border: t.lane === "held" ? "1.5px dashed var(--text-3)" : "none", boxShadow: move ? "0 0 8px rgba(70,228,255,.9)" : "none" }} />
        <Lbl tone={move ? "seal" : "dim"}>{kind === "time" ? "Просит срок" : kind === "unread" ? "Написал" : LANE_WORD[t.lane]}</Lbl>
        <span className="mono ml-auto text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {t.deadline ? when(t.deadline, s.now) : ""}
        </span>
      </div>
      <button type="button" className="mt-1 block text-left text-[17px] font-medium leading-[1.25] tracking-[-0.01em]" onClick={() => s.setSheet({ kind: "thread", taskId: t.id })}>
        {t.title}
      </button>
      {t.question ? <p className="mt-1 text-[14px]">«{t.question.text}»</p> : null}
      {t.unread ? <p className="mt-1 text-[14px]">«{t.unread.text}»</p> : null}
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-3)" }}>
        {receiptLine(t, s.now)}
      </p>
      <Segmented className="mt-2.5">
        {keys.map((k, i) => (
          <Key
            key={k}
            tone={i === 0 ? "ink" : "seg"}
            className="h-11 px-1.5 text-[13px] leading-tight"
            onClick={() => {
              if (kind === "question") s.answer(t.id, k);
              else if (k === "Прочитал") s.readUnread(t.id);
              else if (kind === "unread" && k === "Ответить") s.setSheet({ kind: "thread", taskId: t.id, compose: true });
              else s.act(t.id, k);
            }}
          >
            {k}
          </Key>
        ))}
      </Segmented>
    </article>
  );
}

// ---- the secretary ------------------------------------------------------------------------------

const ERRAND_STEPS = ["asked", "seen", "doing", "done"] as const;

function SecretaryPanel() {
  const s = useStrict();
  const meetingOn = !s.offhours;
  return (
    <div data-testid="secretary-panel">
      <PanelHead
        label={
          <>
            <Lbl tone="ink">Секретарь</Lbl>
            <Lbl>{s.secretaryAway ? `все отошли до ${hhmm(s.secretaryAway)}` : `${nameOf("s-zhanna")} · на месте`}</Lbl>
          </>
        }
      />
      <div className="mx-5" style={{ borderTop: "1px solid var(--line-2)" }}>
        <AnimatePresence initial={false}>
          {s.dndOffer && meetingOn && !s.secretaryAway ? (
            <motion.div key="dnd" className="cut frame frame-cyan mt-3 flex flex-col gap-2 p-3" style={{ background: "linear-gradient(180deg, rgba(70,228,255,.12), rgba(70,228,255,.03))" }} exit={{ opacity: 0, height: 0, marginTop: 0, padding: 0 }} data-testid="dnd-offer">
              <span className="text-[13px]" style={{ color: "var(--text-2)" }}>
                Вы на встрече «{MEETING_NOW.title}» до {hhmm(MEETING_NOW.endsAt)}
              </span>
              <span className="text-[16px] font-medium">🔕 Не беспокоить до {hhmm(MEETING_NOW.endsAt)}?</span>
              <div className="flex gap-1.5">
                <Key tone="seal" className="h-10 px-3 text-[13.5px]" onClick={() => s.answerDnd(true)}>
                  Да, до {hhmm(MEETING_NOW.endsAt)}
                </Key>
                <Key tone="ghost" className="h-10 text-[13.5px]" onClick={() => s.answerDnd(false)}>
                  Не надо
                </Key>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {s.secretaryAway ? (
          <div className="mt-3 flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="block h-10 w-10 shrink-0 rotate-45 scale-75" style={{ border: "1.5px dashed var(--text-3)" }} />
            <span className="text-[14.5px] leading-[1.35]" style={{ color: "var(--text-2)" }}>
              Стул пуст: все отошли до {hhmm(s.secretaryAway)}. Просьба дождётся — Жанна увидит, как вернётся.
            </span>
          </div>
        ) : null}
        <div className="pt-4">
          <Lbl tone="ink">Просьбы</Lbl>
        </div>
        <div className="mt-1.5" style={{ borderTop: "1px solid var(--line-2)" }}>
          {s.errands.length === 0 ? (
            <p className="py-3 text-[13.5px]" style={{ color: "var(--text-3)" }}>
              Сейчас ничего не просили.
            </p>
          ) : null}
          <AnimatePresence initial={false}>
            {s.errands.map((e) => {
              const step = ERRAND_STEPS.indexOf(e.status as (typeof ERRAND_STEPS)[number]);
              return (
                <motion.div key={e.id} layout className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}>
                  <span className="w-6 shrink-0 text-center text-[18px]">{errandIcon(e.code)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {e.label}
                      {e.note ? <span style={{ color: "var(--text-2)", fontWeight: 400 }}> → {e.note}</span> : null}
                    </span>
                    <span className="mt-1 flex items-center gap-1">
                      {ERRAND_STEPS.map((st, i) => (
                        <motion.span key={st} className="block h-[3px] w-6" animate={{ background: e.status === "waiting" ? "rgba(150,205,255,.24)" : i <= step ? (st === "done" ? "#46E4FF" : "#E8EDF4") : "rgba(150,205,255,.24)" }} transition={{ duration: 0.25 }} />
                      ))}
                      <span className="lbl ml-2" style={{ color: e.status === "done" ? "var(--cyan)" : "var(--text-3)" }}>
                        {errandWord(e.status, e.code, e.etaMin)}
                      </span>
                    </span>
                  </span>
                  {e.status === "done" && COMPANY.pointsEnabled ? (
                    <Key tone="ink" className="h-10 shrink-0 px-3 text-[13px]" onClick={() => s.thankErrand(e.id)} testId="thanks">
                      Спасибо
                    </Key>
                  ) : (
                    <span className="mono shrink-0 text-[11.5px]" style={{ color: "var(--text-3)" }}>
                      {hhmm(e.at)}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="flex items-baseline justify-between pt-5">
          <Lbl tone="ink">Клавиши</Lbl>
          <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
            держите 2 с — отправить · тап — с примечанием
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {SECRETARY_ACTIONS.map((a) => (
            <HoldKey key={a.code} code={a.code} icon={a.icon} label={a.label} />
          ))}
          <OwnWordsKey />
        </div>
        <p className="mt-2.5 text-[12px]" style={{ color: "var(--text-3)" }}>
          На Пульсе: тап по строке секретаря — эти клавиши, удержание — сказать своими словами.{" "}
          {s.online ? "Без сети просьба подождёт на телефоне и уйдёт сама." : "Сети нет — просьбы ждут на телефоне и уйдут сами."}
        </p>
      </div>
      <div className="h-6" />
    </div>
  );
}

/** Hold 2 s — the key fills like a gauge and sends; a short tap asks for a note and a time. */
function HoldKey({ code, icon, label }: { code: string; icon: string; label: string }) {
  const s = useStrict();
  const [holding, setHolding] = useState(false);
  const [sent, setSent] = useState(false);
  const t = useRef<number | null>(null);
  const down = useRef(0);
  const fired = useRef(false);
  useEffect(() => () => {
    if (t.current) window.clearTimeout(t.current);
  }, []);
  return (
    <button
      type="button"
      data-testid={`hold-${code}`}
      className="cut cut-s frame glass relative flex h-[52px] select-none items-center gap-2.5 overflow-hidden px-3 text-left"
      style={{ touchAction: "none", WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fired.current = false;
        down.current = performance.now();
        setHolding(true);
        buzz(4);
        t.current = window.setTimeout(() => {
          fired.current = true;
          setHolding(false);
          setSent(true);
          s.sendErrand(code);
          window.setTimeout(() => setSent(false), 1400);
        }, 2000);
      }}
      onPointerUp={() => {
        if (t.current) window.clearTimeout(t.current);
        setHolding(false);
        if (!fired.current && performance.now() - down.current < 350) s.setSheet({ kind: "errand", code });
      }}
      onPointerCancel={() => {
        if (t.current) window.clearTimeout(t.current);
        setHolding(false);
      }}
    >
      <motion.span className="absolute inset-y-0 left-0" style={{ background: "linear-gradient(90deg, rgba(255,51,85,.85), #FF3355)", boxShadow: "0 0 18px rgba(255,51,85,.6)" }} initial={false} animate={{ width: holding ? "100%" : sent ? "100%" : "0%" }} transition={holding ? { duration: 2, ease: "linear" } : { duration: sent ? 0 : 0.2 }} />
      <span className="relative text-[18px]">{icon}</span>
      <span className="relative min-w-0 flex-1 truncate text-[14px] font-medium" style={{ color: holding || sent ? "#fff" : "var(--text)" }}>
        {sent ? "Отправлено" : holding ? "Держите…" : label}
      </span>
    </button>
  );
}

function OwnWordsKey() {
  const s = useStrict();
  const startY = useRef(0);
  return (
    <button
      type="button"
      className="cut cut-s frame frame-red flex h-[52px] select-none items-center gap-2.5 px-3 text-left"
      style={{ background: "linear-gradient(180deg, rgba(255,51,85,.26), rgba(255,51,85,.08))", color: "var(--text)", touchAction: "none" }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startY.current = e.clientY;
        s.startRec("hold", "secretary");
      }}
      onPointerMove={(e) => s.armCancel(e.clientY - startY.current < -90)}
      onPointerUp={() => {
        if (s.rec?.cancelArmed) s.cancelRec();
        else s.stopRec();
      }}
      onPointerCancel={() => s.cancelRec()}
    >
      <Icon name="mic" size={18} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">Своими словами</span>
    </button>
  );
}
