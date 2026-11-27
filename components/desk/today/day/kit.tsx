"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { Face, useAvatars } from "@/components/desk/ui/Face";
import { DeskIcon, type DeskIconName } from "@/components/desk/ui/icons";

/*
 * The parts every block of the right side of «Сегодня» is made of (D-196): the card with its ink,
 * the head whose name is the way to the section, a ghost move, the live dot of three levels, a
 * person's circle, a row that unfolds. Drawn by app/desk/today.css.
 */

/** The inks of the sheet (graphite.css), as CSS values. */
export const INK = {
  pen: "var(--pen)",
  pencil: "var(--pencil)",
  ok: "var(--ok-ink)",
  sky: "var(--sky)",
  violet: "var(--violet)",
  gold: "var(--gold-ink)",
  warn: "var(--warn-ink)",
  muted: "var(--ink-2)",
} as const;
export type Ink = keyof typeof INK;

export const toneOf = (ink: Ink): CSSProperties => ({ "--tone": INK[ink] }) as CSSProperties;

/**
 * A block of the side. `now` — it is about this moment (the door, a meeting on): one step up, lit
 * from its corner by its ink. `index` — its place in its stack, for the first showing's wave.
 */
export function Card({
  ink,
  now = false,
  ok = false,
  index = 0,
  children,
  testId,
  className = "",
}: {
  ink: Ink;
  now?: boolean;
  /** the block's good total (everyone handed in): its figure goes green */
  ok?: boolean;
  index?: number;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      className={`day-card ${className}`}
      data-now={now ? "" : undefined}
      data-ok={ok ? "" : undefined}
      style={{ ...toneOf(ink), "--card-i": index } as CSSProperties}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

/** «There is something» on the plate's corner: a still dot, or one that beats twice for news. */
export type Corner = "state" | "news" | null;

/**
 * A card's head: the plate of its ink, the name — the way to the section that holds all of it (a
 * chevron comes on hover) — a count, the moves on the right.
 */
export function Head({
  icon: Glyph,
  sign,
  title,
  href,
  count,
  corner = null,
  swing = false,
  children,
}: {
  icon: LucideIcon;
  /** the block is a section of the desk: its own sign instead of the library's icon (D-214) */
  sign?: DeskIconName;
  title: string;
  /** the section it leads to; none — the name is a plain title */
  href?: string;
  count?: number;
  corner?: Corner;
  /** the plate's icon swings once (the door when somebody comes) */
  swing?: boolean;
  children?: ReactNode;
}) {
  const label = (
    <>
      <span aria-hidden className={`day-tile ${swing ? "day-door-swing" : ""}`} data-live={corner ?? undefined}>
        {sign ? <DeskIcon name={sign} size={16} /> : <Glyph size={16} />}
      </span>
      <span className="truncate">{title}</span>
      {count && count > 0 ? <span className="day-count nums">{count}</span> : null}
    </>
  );
  return (
    <div className="day-head">
      {href ? (
        <Link href={href} prefetch className="day-head-link desk-focus">
          {label}
          <ChevronRight size={14} aria-hidden className="day-chev" />
        </Link>
      ) : (
        <h2 className="day-head-link">{label}</h2>
      )}
      {children ? <div className="day-head-acts">{children}</div> : null}
    </div>
  );
}

/** A small move in a head: a ghost; `pen` — the director's own move; `done` — it has just happened. */
export function Ghost({
  icon: Glyph,
  children,
  onPress,
  pen = false,
  done = false,
  disabled = false,
  title,
  arcs = 0,
  testId,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onPress: () => void;
  pen?: boolean;
  done?: boolean;
  disabled?: boolean;
  title?: string;
  /** a new value plays two arcs out of the icon once («Объявить») */
  arcs?: number;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="day-ghost desk-focus"
      onClick={onPress}
      disabled={disabled}
      title={title}
      data-pen={pen ? "" : undefined}
      data-done={done ? "" : undefined}
      data-testid={testId}
    >
      {arcs > 0 ? <span key={arcs} aria-hidden className="day-arcs" /> : null}
      {Glyph ? <Glyph size={14} strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </button>
  );
}

export type Liveness = "state" | "news" | "now";

/**
 * How alive a thing is: still for a state (somebody at the desk), three rings for news (a request
 * just sent), slow rings while it waits for the director (a visitor) — those sleep with the side.
 */
export function LiveDot({ ink, mode, title }: { ink: Ink; mode: Liveness; title?: string }) {
  return <span aria-hidden={title ? undefined : true} title={title} className="day-live" data-mode={mode} style={toneOf(ink)} />;
}

/** A word on a plate of its ink. */
export function Pill({ ink, icon: Glyph, children, testId }: { ink: Ink; icon?: LucideIcon; children: ReactNode; testId?: string }) {
  return (
    <span className="day-pill" style={toneOf(ink)} data-testid={testId}>
      {Glyph ? <Glyph size={12} strokeWidth={2.5} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A share as a bar that fills from nothing on arrival and glides to a new share. */
export function Bar({ value, of, ink, className = "", label }: { value: number; of: number; ink: Ink; className?: string; label?: string }) {
  const fill = of > 0 ? Math.max(0, Math.min(1, value / of)) : 0;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`day-bar ${className}`}
      style={{ ...toneOf(ink), "--fill": fill } as CSSProperties}
    >
      <i />
    </span>
  );
}

/** A small icon in its ink. */
export function Mark({ icon: Glyph, ink, size = 14, title }: { icon: LucideIcon; ink: Ink; size?: number; title?: string }) {
  return (
    <span aria-hidden={title ? undefined : true} title={title} className="inline-flex shrink-0" style={{ color: INK[ink] }}>
      <Glyph size={size} strokeWidth={2.25} />
    </span>
  );
}

/** A person as the circle of «Люди» and «Команда»: the photo, or the initials on their own hue (D-172). */
export function Person({ id, name, size }: { id: string | null | undefined; name: string; size: number }) {
  const avatars = useAvatars();
  // a row that knows only a name (the wall's feed, a visitor) still gets a hue of its own
  const key = id ?? `name:${name}`;
  return <Face person={{ id: key, full_name: name || "?", avatar_url: id ? (avatars.get(id) ?? null) : null }} size={size} />;
}

const UNFOLD = { height: { duration: 0.23, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.19, delay: 0.04 } } as const;
const FOLD = { height: { duration: 0.16, ease: [0.4, 0, 1, 1] }, opacity: { duration: 0.12 } } as const;

/** A list of the side: a row that comes grows the card, one that goes folds it back; the first paint stands still. */
export function DayList({ children, testId, className = "" }: { children: ReactNode; testId?: string; className?: string }) {
  return (
    <ul className={`day-list ${className}`} data-testid={testId}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  );
}

/** One row of a `DayList` (keyed by the caller): unfolds its height as it comes, folds as it goes. */
export function Unfold({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.li
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1, transition: UNFOLD }}
      exit={{ height: 0, opacity: 0, transition: FOLD }}
      style={{ overflow: "hidden" }}
      className={className}
    >
      {children}
    </motion.li>
  );
}

/** The ids that came after the list first showed: only those are news — the first paint is not. */
export function useArrivals(ids: readonly string[]): ReadonlySet<string> {
  const [first] = useState(() => new Set(ids));
  return useMemo(() => new Set(ids.filter((id) => !first.has(id))), [ids, first]);
}

/** Set once the side has shown in this tab: a return to «Сегодня» takes only the screen's move (D-184). */
let shown = false;

/** true on the side's first showing in the tab, for the length of its wave. */
export function useFirstArrival(): boolean {
  const [arrive, setArrive] = useState(() => !shown);
  useEffect(() => {
    shown = true;
    if (!arrive) return;
    const timer = window.setTimeout(() => setArrive(false), 900);
    return () => clearTimeout(timer);
  }, [arrive]);
  return arrive;
}
