"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";

/**
 * Board parts on the wall shared by «Список», «Карта» and the full-screen branch (D-121, D-185): the
 * point's number, the «→ Марат» plate, the presenter's backing, the glow of a new point. Colour by the
 * wall's roles: numbers and links are white or muted, green is only what is being discussed now
 * (`.tv-now`) and the assignee's plate. Motion is opacity and transform only (D-45).
 */

export const EASE = [0.2, 0, 0, 1] as const;
/** Насколько гаснет всё, кроме пункта, который обсуждают. */
export const DIM = 0.38;
/** Отмеченный пункт: текст приглушён, место за ним остаётся. */
export const DONE_TEXT = 0.42;

export const vh = (value: number) => `${value}vh`;

/**
 * At most `lines` lines of height `lh`: further lines are simply not drawn — no ellipsis (D-185).
 * Text wraps at words, a long word breaks anywhere.
 */
export function clampStyle(lines: number, lh: number): CSSProperties {
  return { maxHeight: vh(lines * lh), overflow: "hidden", overflowWrap: "anywhere" };
}

/** The words of a sub-point: a step quieter than a point's, still white from across the room. */
export const LEAF_INK = "color-mix(in srgb, var(--text) 86%, var(--text-muted))";
/** The dot of a sub-point and the map's links: neutral, never the live colour (D-185). */
export const LINE_INK = "color-mix(in srgb, var(--text-muted) 78%, var(--bg))";

/**
 * The point's number circle — a white number on a quiet plane; a checked one is a tick, muted
 * (D-185: numbers are white, green is only «сейчас»). The numerals in the circle are the only thing on
 * the board smaller than `tv-small`.
 */
export function Badge({ n, done, size }: { n: number; done: boolean; size: number }) {
  return (
    <span
      aria-hidden
      className="nums relative flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{
        width: vh(size),
        height: vh(size),
        fontSize: vh(size * 0.52),
        color: done ? "var(--text-muted)" : "var(--tv-text)",
        background: "color-mix(in srgb, var(--text) 13%, var(--bg))",
      }}
    >
      {done ? (
        <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

/**
 * «→ Марат · в работе» — who does it, the main thing on the board (D-185): white `tv-small` words on a
 * plate of the live colour at 24 %, on a line of its own under the point's text. The list and map
 * layouts count its height (`TAG`, `MAP_TAG`): a `tv-small` line, padding at the sides.
 */
export function TagPlate({ tag, pad, done = false }: { tag: string; pad: number; done?: boolean }) {
  return (
    <span
      className="tv-small block max-w-full font-semibold [overflow-wrap:anywhere]"
      style={{
        padding: `0 ${vh(pad)}`,
        borderRadius: vh(0.8),
        background: "color-mix(in srgb, var(--tv-live) 24%, var(--bg))",
        color: "var(--tv-text)",
        opacity: done ? 0.7 : 1,
      }}
      data-testid="tv-board-tag"
    >
      {tag}
    </span>
  );
}

/** The backing of the point under discussion — the wall's one «идёт сейчас» mark (`.tv-now`): it fades in, moves nothing. */
export function LitPlate({ on, radius = "0" }: { on: boolean; radius?: string }) {
  return (
    <motion.span
      aria-hidden
      className="tv-now pointer-events-none absolute inset-0"
      style={{ borderRadius: radius }}
      initial={false}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{ duration: 0.45, ease: EASE }}
    />
  );
}

/**
 * A point just said — for a minute the same «сейчас» mark as the presenter's, breathing softly by
 * opacity alone: without a presenter this is the current point. The board's only constant motion (D-45).
 */
export function FreshGlow({ radius = "0", inset = "0" }: { radius?: string; inset?: string }) {
  return (
    <motion.span
      aria-hidden
      className="tv-now pointer-events-none absolute"
      style={{ inset, borderRadius: radius }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.45, 1, 0.45] }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
