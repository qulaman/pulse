"use client";

import { AnimatePresence, LayoutGroup, LayoutGroupContext, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { springs } from "@/lib/design/tokens";
import { useNow } from "@/lib/useNow";
import { haptic } from "@/lib/haptics";
import { shortName, initialsOf } from "@/lib/people/names";

import type { Section } from "@/lib/tasks/overview";
import { isOverdue, SHORT_STATUS, TEXT, type TaskStatus } from "@/lib/tasks/status-text";
import { deadlineToneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";

import { Icon } from "../icons";
import { StatusGlyph } from "./StatusGlyph";

/**
 * The column of cards under the status screen (D-83): section titles and cards in one
 * flat list, so a card that changes section slides there instead of being rebuilt; the
 * open card grows in place and the ones under it slide down (framer layout — transform
 * only, DESIGN §2). One card is open at a time, like Things.
 */

/** A card is a thing: the object spring (D-166) — crisp, settled without a bounce in ~300 ms. */
export const CARD_SPRING = springs.object;

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
      // the next card opens by itself — often because a Realtime change took the open one away:
      // the tap that opened that one must not scroll the page to this one
      setUserTouched(false);
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
/** @deprecated use `useNow()` from "@/lib/useNow" — the same minute clock. */
export function useMinute(): Date {
  return useNow();
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
    <LayoutGroup>
      <div className="relative flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) =>
            row.kind === "head" ? (
              <motion.div
                key={row.key}
                data-group={row.section.key}
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
/**
 * The frame that makes an open card's «when» a button (D-187): laid over the head's words where
 * they stand (layout offsets, so the card's own spring does not skew it), in their colour — the
 * frame that appears as the card opens is the sign it can be pressed. A sibling of the head's
 * toggle, never inside it.
 */
type DoorBox = { left: number; top: number; width: number; height: number; color: string };

const sameBox = (x: DoorBox | null, y: DoorBox) =>
  x !== null && x.left === y.left && x.top === y.top && x.width === y.width && x.height === y.height && x.color === y.color;

function WhenDoor({ taskId, label, onPress }: { taskId: string; label: string; onPress: () => void }) {
  const self = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<DoorBox | null>(null);
  // the head is the door's own parent: its ref is set before this effect, a parent's ref is not yet
  const measure = useCallback(() => {
    const root = self.current?.parentElement;
    const when = root?.querySelector<HTMLElement>("[data-card-when]");
    if (!root || !when) return;
    let left = 0;
    let top = 0;
    for (let node: HTMLElement | null = when; node && node !== root; node = node.offsetParent as HTMLElement | null) {
      left += node.offsetLeft;
      top += node.offsetTop;
    }
    const words = (when.firstElementChild as HTMLElement | null) ?? when;
    const next = { left: left - 8, top: top - 4, width: when.offsetWidth + 16, height: when.offsetHeight + 8, color: getComputedStyle(words).color };
    setBox((was) => (sameBox(was, next) ? was : next));
  }, []);
  // after every render of the open card: a new date or a deadline gone red moves the words, not the
  // head (one card is open at a time; the state is set only when the frame really moved)
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const root = self.current?.parentElement;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [measure]);
  return (
    <button
      ref={self}
      type="button"
      onClick={onPress}
      aria-label={label}
      data-deadline-target={taskId}
      data-testid="card-deadline"
      className="absolute rounded-full border transition-[transform,background-color] duration-150 ease-out after:absolute after:-inset-[9px] after:content-[''] active:scale-[0.95] active:bg-[color-mix(in_srgb,currentColor_10%,transparent)]"
      style={box ? { ...box, borderColor: "color-mix(in srgb, currentColor 35%, transparent)" } : { visibility: "hidden" }}
    />
  );
}

export function CardShell({
  id,
  open,
  closed = false,
  onToggle,
  head,
  children,
  testId,
  status,
  headData,
  reacted = false,
  whenDoor = null,
}: {
  id: string;
  open: boolean;
  closed?: boolean;
  onToggle: () => void;
  head: ReactNode;
  children: ReactNode;
  testId?: string;
  status?: TaskStatus;
  /** Extra `data-*` of the head button — what a test or a screen needs to find it by. */
  headData?: Record<`data-${string}`, string>;
  /** The director reacted to this task (D-133): the card wears a gold outline. */
  reacted?: boolean;
  /**
   * The «when» of an open card is the deadline's door, as on the task's screen (D-187): a frame
   * over the head's own words — they neither move nor wrap anew — that opens the deadline sheet.
   */
  whenDoor?: { label: string; onPress: () => void } | null;
}) {
  // The body stays out of the column's layout group: leaving it, a node that has faded out
  // would dirty every card (the group's remove, then its forceRender) — a second measuring
  // pass over the whole column for something already out of the flow. It moves with its card.
  const { id: groupId } = useContext(LayoutGroupContext);
  const quiet = useMemo(() => ({ id: groupId }), [groupId]);

  return (
    <motion.article
      layout
      transition={CARD_SPRING}
      data-task-id={id}
      data-open={open || undefined}
      data-closed={closed || undefined}
      data-reacted={reacted || undefined}
      className="task-card relative scroll-mb-[150px] scroll-mt-[120px] overflow-hidden"
      style={{ borderRadius: 18 }}
    >
      <motion.div layout="position" transition={CARD_SPRING} className="relative">
        <button
          type="button"
          aria-expanded={open}
          data-testid={testId}
          data-status={status}
          {...headData}
          onClick={onToggle}
          className="flex w-full items-start gap-3 px-3.5 pb-3 pt-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
        >
          {head}
        </button>
        {open && whenDoor ? <WhenDoor taskId={id} label={whenDoor.label} onPress={whenDoor.onPress} /> : null}
      </motion.div>
      {/* Closing, the body leaves the flow at once (popLayout) and fades inside the shrinking
          card, which clips it — never an empty, still-tall box around the head */}
      <LayoutGroupContext.Provider value={quiet}>
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.div
              key="body"
              layout="position"
              transition={CARD_SPRING}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.06 } }}
              exit={{ opacity: 0, transition: { duration: 0.14 } }}
              data-testid="task-body"
            >
              <div className="mx-3.5 border-t border-border/60" />
              <div className="px-3.5 pb-3.5 pt-3">{children}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </LayoutGroupContext.Provider>
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
  attention = false,
}: {
  task: {
    title: string;
    status: TaskStatus;
    deadline: string | null;
    priority?: string | null;
    closed_at: string | null;
    updated_at: string;
    /** Made by a repeating order (D-148): the row says «повтор». */
    recurrence_rule_id?: string | null;
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
  /** A new task that needs its reader now — the glyph turns amber (`toneOf`). */
  attention?: boolean;
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
        <StatusGlyph status={task.status} overdue={overdue} attention={attention} />
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
          {when ? (
            <span data-card-when className="nums mt-[2px] shrink-0 text-[13px] font-medium leading-[18px]">
              {when}
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          {person ? (
            <>
              <Face name={person} />
              <span className="min-w-0 truncate">{shortName(person)}</span>
              <Sep />
            </>
          ) : null}
          <span className="shrink-0" style={statusColor ? { color: statusColor } : undefined}>
            {status}
          </span>
          {/* urgent with a time: the time takes the corner, the flag stays here — urgency never
              drops out of the list while the Лента card and the task's screen show it (D-194) */}
          {task.priority === "high" && task.deadline && !closed ? (
            <>
              <Sep />
              <span className="inline-flex shrink-0 items-center gap-1 text-warn" data-testid="task-urgent-mark">
                <Icon name="flame" size={13} />
                {TEXT.urgent}
              </span>
            </>
          ) : null}
          {question ? (
            <>
              <Sep />
              <span className="inline-flex shrink-0 items-center gap-1 text-warn">
                <Icon name="question" size={13} />
                {TEXT.question}
              </span>
            </>
          ) : null}
          {task.recurrence_rule_id && !question ? (
            <>
              <Sep />
              <span className="inline-flex shrink-0 items-center gap-1" data-testid="task-repeat-mark">
                <Icon name="repeat" size={13} />
                повтор
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

/** A station's time, short: «9:41» today, «вчера», «пн», «21.09» — the order matters more than the minute. */
export function stepTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = aqtobeDay(date) - aqtobeDay(now);
  const text = humanAqtobe(date, now);
  if (days === 0) return text.replace(/^сегодня /, "");
  return text.replace(/ \d{2}:\d{2}$/, "");
}

/**
 * The card's last row: the task's own screen, and whatever else the card has to offer.
 * Only an open card has this row, so its prefetch is one per card the person opened, not one
 * per card in the list (D-126 п.10): «Открыть задачу» then opens without asking the server (D-136).
 * A finger-sized link (44 px) that reads as a way in, not a reply: the words and «›» (D-173).
 */
export function CardFoot({ href, extra }: { href: string; extra?: ReactNode }) {
  return (
    <div className="-mx-1.5 mt-2 flex items-center justify-between">
      <Link
        href={href}
        prefetch
        data-testid="task-thread"
        className="flex min-h-[44px] items-center gap-1 rounded-[10px] px-1.5 text-[14px] font-semibold text-accent transition-colors duration-[120ms] active:bg-accent/10"
      >
        Открыть задачу
        <Icon name="open" size={13} />
      </Link>
      {extra}
    </div>
  );
}
