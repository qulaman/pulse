"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "framer-motion";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import { initialsOf } from "@/lib/people/queries";
import type { Section, Step } from "@/lib/tasks/overview";
import { isOverdue, SHORT_STATUS, TEXT, type TaskStatus } from "@/lib/tasks/status-text";
import { deadlineToneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";

import { Icon } from "../desk/icons";
import { StatusGlyph } from "./StatusGlyph";

/**
 * The column of cards under the status screen (D-83): section titles and cards in one
 * flat list, so a card that changes section slides there instead of being rebuilt; the
 * open card grows in place and the ones under it slide down (framer layout — transform
 * only, DESIGN §2). One card is open at a time, like Things.
 */

/** Crisp, a hint of settle; the card grows in ~300 ms. */
export const CARD_SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.9 };

const PAGE = 40;

/* -------------------------------------------------------------------------- */
/* Accordion: which card is open                                               */
/* -------------------------------------------------------------------------- */

/**
 * One open card. `scope` is the tab, the person and the query: a new scope opens its first
 * card when `autoOpen` (the piles that ask for a move), none otherwise. When the open card
 * leaves the list — the move was made — the next one takes its place, inbox-zero style.
 */
export function useAccordion(ids: readonly string[], { scope, autoOpen }: { scope: string; autoOpen: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [seen, setSeen] = useState<{ scope: string; ids: readonly string[] } | null>(null);
  const [userTouched, setUserTouched] = useState(false);
  // a card asked for from outside the list (the status screen's «ближайший срок»): it
  // wins over the new scope's first card
  const [wanted, setWanted] = useState<string | null>(null);

  if (seen?.scope !== scope || seen.ids.join() !== ids.join()) {
    setSeen({ scope, ids });
    if (seen?.scope !== scope) {
      const pick = wanted && ids.includes(wanted) ? wanted : null;
      setOpenId(pick ?? (autoOpen ? (ids[0] ?? null) : null));
      setUserTouched(Boolean(pick));
      setWanted(null);
    } else if (openId && !ids.includes(openId)) {
      const was = seen.ids.indexOf(openId);
      setOpenId(autoOpen && was >= 0 && ids.length > 0 ? ids[Math.min(was, ids.length - 1)] : null);
    }
  }

  return {
    openId,
    /** Set by a tap — the page may scroll the card into view; an automatic open never scrolls. */
    userTouched,
    /** Open this card now, or — when it lives in another tab — as soon as that tab is on screen. */
    focus: (id: string) => {
      setUserTouched(true);
      if (ids.includes(id)) setOpenId(id);
      else setWanted(id);
    },
    toggle: (id: string) => {
      setUserTouched(true);
      if (openId !== id) haptic(8);
      setOpenId((current) => (current === id ? null : id));
    },
  };
}

/** The clock of a task screen: overdue and «ближайший срок» move on their own, once a minute is enough. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Brings the opened card fully on screen once it has grown (scroll margins keep the tabs and the tab bar clear). */
export function useRevealOpen(openId: string | null, enabled: boolean) {
  useEffect(() => {
    if (!openId || !enabled) return;
    const timer = setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-task-id="${openId}"]`);
      node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 320);
    return () => clearTimeout(timer);
  }, [openId, enabled]);
}

/* -------------------------------------------------------------------------- */
/* The column                                                                  */
/* -------------------------------------------------------------------------- */

type Row<T> = { kind: "head"; key: string; section: Section<T> } | { kind: "card"; key: string; task: T };

/**
 * Sections flattened into one animated column. The first PAGE cards are drawn; «Показать
 * ещё» adds the next page — a year of closed work must not become a thousand layout nodes
 * on a Redmi.
 */
export function TaskColumn<T extends { id: string }>({
  sections,
  renderCard,
  empty,
}: {
  sections: readonly Section<T>[];
  renderCard: (task: T) => ReactNode;
  empty: ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE);
  const total = sections.reduce((sum, section) => sum + section.tasks.length, 0);

  const rows: Row<T>[] = [];
  let drawn = 0;
  for (const section of sections) {
    if (drawn >= limit) break;
    if (section.title) rows.push({ kind: "head", key: `head-${section.key}`, section });
    for (const task of section.tasks) {
      if (drawn >= limit) break;
      rows.push({ kind: "card", key: task.id, task });
      drawn += 1;
    }
  }

  if (total === 0) return <>{empty}</>;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="relative flex flex-col gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) =>
              row.kind === "head" ? (
                <motion.div
                  key={row.key}
                  layout="position"
                  transition={CARD_SPRING}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <SectionHead title={row.section.title} tone={row.section.tone} count={row.section.tasks.length} />
                </motion.div>
              ) : (
                <motion.div
                  key={row.key}
                  layout="position"
                  transition={CARD_SPRING}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
                >
                  {renderCard(row.task)}
                </motion.div>
              ),
            )}
          </AnimatePresence>
          {total > drawn ? (
            <motion.div layout="position" transition={CARD_SPRING} className="pt-2">
              <button
                type="button"
                onClick={() => setLimit((value) => value + PAGE)}
                className="flex min-h-[44px] w-full items-center justify-center rounded-[14px] border border-border/70 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-surface"
              >
                Показать ещё <span className="nums ml-1.5">{Math.min(PAGE, total - drawn)}</span>
              </button>
            </motion.div>
          ) : null}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

export function SectionHead({ title, tone, count }: { title: string; tone: Tone; count: number }) {
  const loud = tone === "danger" || tone === "warn";
  return (
    <h2 className="flex items-center gap-2 px-1 pb-0.5 pt-4 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]">
      {loud ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[tone] }} /> : null}
      <span style={{ color: loud || tone === "accent" ? TONE_VAR[tone] : "var(--text-muted)" }}>{title}</span>
      <span className="nums text-muted">{count}</span>
    </h2>
  );
}

/* -------------------------------------------------------------------------- */
/* One card                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The card: a head that is one button (tap — open, tap again — close) and, when open, the
 * body under a hairline. The article animates its own size, the head and the body only
 * their position — framer corrects them for the parent's scale, so text never stretches.
 */
export function CardShell({
  id,
  open,
  closed = false,
  onToggle,
  head,
  children,
  testId,
  status,
}: {
  id: string;
  open: boolean;
  closed?: boolean;
  onToggle: () => void;
  head: ReactNode;
  children: ReactNode;
  testId?: string;
  status?: TaskStatus;
}) {
  return (
    <motion.article
      layout
      transition={CARD_SPRING}
      data-task-id={id}
      data-open={open || undefined}
      data-closed={closed || undefined}
      className="task-card relative scroll-mb-[150px] scroll-mt-[120px] overflow-hidden"
      style={{ borderRadius: 18 }}
    >
      <motion.div layout="position" transition={CARD_SPRING}>
        <button
          type="button"
          aria-expanded={open}
          data-testid={testId}
          data-status={status}
          onClick={onToggle}
          className="flex w-full items-start gap-3 px-3.5 pb-3 pt-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
        >
          {head}
        </button>
      </motion.div>
      {open ? (
        <motion.div
          layout="position"
          transition={CARD_SPRING}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.06 } }}
          data-testid="task-body"
        >
          <div className="mx-3.5 border-t border-border/60" />
          <div className="px-3.5 pb-3.5 pt-3">{children}</div>
        </motion.div>
      ) : null}
    </motion.article>
  );
}

/** Mini avatar: initials in the brand circle. */
export function Face({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold text-bg"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
    >
      {initialsOf(name)}
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden className="opacity-40">
      ·
    </span>
  );
}

/**
 * The head of a card, the same for both roles: the state mark, the title and «when» on the
 * right, then who · state · the flags (question, unread) and the chevron. The title keeps
 * two lines while the card is closed and shows whole once it is open.
 */
export function CardHead({
  task,
  now,
  open,
  person,
  word,
  wordTone,
  question = false,
  unread = false,
  closed = false,
}: {
  task: {
    title: string;
    status: TaskStatus;
    deadline: string | null;
    priority?: string | null;
    closed_at: string | null;
    updated_at: string;
  };
  now: Date;
  open: boolean;
  /** Whose it is — the director's list; omitted where the name adds nothing. */
  person?: string | null;
  /** The state in a word; defaults to the short status. */
  word?: string;
  wordTone?: Tone;
  question?: boolean;
  unread?: boolean;
  /** History for this reader: the title dims and «when» is the closing time. */
  closed?: boolean;
}) {
  const overdue = isOverdue(task, now);
  const urgentNow = !task.deadline && task.priority === "high" && !closed;
  const status = word ?? (overdue ? "просрочена" : SHORT_STATUS[task.status]);
  const statusColor = wordTone ? TONE_VAR[wordTone] : overdue ? "var(--danger)" : undefined;

  let when: ReactNode = null;
  if (closed) {
    when = <span className="text-muted">{humanAqtobe(new Date(task.closed_at ?? task.updated_at), now)}</span>;
  } else if (task.deadline) {
    // handed-in work has met its deadline: the date stays, the alarm goes
    const tone = task.status === "pending_review" ? "muted" : deadlineToneOf(task, now);
    when = <span style={{ color: tone === "accent" ? "var(--text-muted)" : TONE_VAR[tone] }}>{humanAqtobe(new Date(task.deadline), now)}</span>;
  } else if (urgentNow) {
    when = (
      <span className="inline-flex items-center gap-1 text-warn">
        <Icon name="flame" size={13} />
        {TEXT.urgent}
      </span>
    );
  }

  return (
    <>
      <span className="mt-[1px]">
        <StatusGlyph status={task.status} overdue={overdue} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-3">
          <span
            className={`min-w-0 flex-1 font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] ${open ? "" : "line-clamp-2"} ${
              closed && !open ? "text-text/70" : "text-text"
            }`}
          >
            {task.title}
          </span>
          {when ? <span className="nums mt-[2px] shrink-0 text-[13px] font-medium leading-[18px]">{when}</span> : null}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          {person ? (
            <>
              <Face name={person} />
              <span className="min-w-0 truncate">{person.split(/\s+/)[0]}</span>
              <Sep />
            </>
          ) : null}
          <span className="shrink-0" style={statusColor ? { color: statusColor } : undefined}>
            {status}
          </span>
          {question ? (
            <>
              <Sep />
              <span className="inline-flex shrink-0 items-center gap-1 text-warn">
                <Icon name="question" size={13} />
                {TEXT.question}
              </span>
            </>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
            {unread ? <span aria-label="новое сообщение" className="h-2 w-2 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} /> : null}
            <span
              aria-hidden
              className="text-muted/70 transition-transform duration-[200ms] ease-out"
              style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)" }}
            >
              <Icon name="open" size={14} />
            </span>
          </span>
        </span>
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

const STEP_COLOR: Record<Step["state"], string> = {
  done: "var(--accent)",
  current: "var(--accent)",
  todo: "var(--border)",
  warn: "var(--warn)",
  bad: "var(--danger)",
};

/** A station's time, short: «9:41» today, «вчера», «пн», «21.09» — the order matters more than the minute. */
function stepTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = aqtobeDay(date) - aqtobeDay(now);
  const text = humanAqtobe(date, now);
  if (days === 0) return text.replace(/^сегодня /, "");
  return text.replace(/ \d{2}:\d{2}$/, "");
}

/**
 * The life of the task as four stations on a line (a parcel tracker): what happened, when,
 * and where it is stuck. The current station carries the deadline when there is one.
 */
export function Stepper({ steps, now, deadline }: { steps: readonly Step[]; now: Date; deadline: string | null }) {
  return (
    <ol className="grid grid-cols-4" data-testid="task-steps">
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const color = STEP_COLOR[step.state];
        // the line runs lit only between two stations the task has passed
        const joined = Boolean(next) && step.state === "done" && next.state !== "todo";
        const reached = step.state !== "todo";
        const pending = step.state === "current" || step.state === "warn" || step.state === "bad";
        // the station the task waits at carries the deadline — the employee's, so not the review
        const due = pending && !step.at && deadline && step.key !== "closed" ? deadline : null;
        const late = due ? new Date(due).getTime() < now.getTime() : false;
        const time = step.at ? stepTime(step.at, now) : due ? `${late ? "срок" : "до"} ${stepTime(due, now)}` : "";
        return (
          <li key={step.key} className="relative flex min-w-0 flex-col items-center text-center">
            {next ? (
              <span
                aria-hidden
                className="absolute left-1/2 top-[6px] h-[2px] w-full rounded-full"
                style={{ background: joined ? STEP_COLOR.done : "var(--border)", opacity: joined ? 0.55 : 0.7 }}
              />
            ) : null}
            <span
              aria-hidden
              className="relative flex h-[14px] w-[14px] items-center justify-center rounded-full"
              style={{
                background: reached && !pending ? color : "var(--surface)",
                border: `2px solid ${reached ? color : "var(--border)"}`,
                boxShadow: pending ? `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)` : undefined,
              }}
            >
              {pending ? <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} /> : null}
            </span>
            <span
              className={`mt-1.5 max-w-full truncate px-0.5 text-[12px] leading-4 ${pending ? "font-semibold" : ""}`}
              style={{ color: pending ? color : reached ? "var(--text)" : "var(--text-muted)" }}
            >
              {step.label}
            </span>
            <span
              className="nums mt-0.5 h-[14px] max-w-full truncate px-0.5 text-[11px] leading-[14px]"
              style={{ color: late ? "var(--danger)" : "var(--text-muted)" }}
            >
              {time}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Little pieces of the body                                                   */
/* -------------------------------------------------------------------------- */

/** A tinted note inside the body: a refusal, a return, a recall. */
export function Note({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-[12px] border px-3 py-2 text-[14px] leading-[19px]"
      style={{
        color: TONE_VAR[tone],
        borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 32%, transparent)`,
        background: `color-mix(in srgb, ${TONE_VAR[tone]} 8%, transparent)`,
      }}
    >
      <span className="mt-[2px]">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The newest word of the thread, as a small bubble with its author. */
export function LastWord({ name, text, at, now, unread }: { name: string; text: string; at: string; now: Date; unread: boolean }) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      <Face name={name} size={24} />
      <div className="min-w-0 flex-1 rounded-[14px] rounded-tl-[6px] bg-surface-2/80 px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] leading-4 text-muted">
          <span className="font-semibold text-text/90">{name.split(/\s+/)[0]}</span>
          <span className="nums">{stepTime(at, now)}</span>
          {unread ? <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">новое</span> : null}
        </p>
        <p className="mt-0.5 line-clamp-3 text-[14px] leading-[19px] text-text/90">{text}</p>
      </div>
    </div>
  );
}

/** The row under the buttons: the task's own screen, and whatever else the card has to offer. */
export function CardFoot({ href, extra }: { href: string; extra?: ReactNode }) {
  return (
    <div className="-mx-1.5 mt-2 flex items-center justify-between">
      <Link
        href={href}
        data-testid="task-thread"
        className="flex min-h-[40px] items-center gap-1.5 rounded-[10px] px-1.5 text-[14px] font-semibold text-accent transition-colors duration-[120ms] active:bg-accent/10"
      >
        <Icon name="reply" size={16} />
        Открыть задачу
        <Icon name="open" size={13} />
      </Link>
      {extra}
    </div>
  );
}
