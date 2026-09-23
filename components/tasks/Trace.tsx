"use client";

import type { ReactNode } from "react";

import { formatAqtobe } from "@/lib/ai/time";
import { TONE_VAR, type Tone } from "@/lib/tasks/tone";

/**
 * The trace: a task list drawn as one line of the day, the way the wordmark draws a
 * heartbeat. Time runs down it — просрочено above, сроки впереди ниже — each task is a
 * bead on the thread in the colour of its state, and one accent tick says «сейчас»:
 * everything above it is already late. Four borders per card were doing this job; the
 * thread does it with one line, and the screen stops being a stack of boxes.
 *
 * Geometry lives here so both lists sit on the same line: the thread runs at 8px inside
 * the trace box, content starts at 24px, and everything inside a leaf or a heading is
 * positioned relative to that content edge.
 */

const LINE_X = 8;
const CONTENT_X = 24;
/** From the content edge back to the thread. */
const BACK = LINE_X - CONTENT_X;

export function Trace({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ paddingLeft: CONTENT_X }}>
      <span
        aria-hidden
        className="trace-line absolute bottom-2 top-1 w-px"
        style={{
          left: LINE_X,
          background: "linear-gradient(180deg, var(--border), color-mix(in srgb, var(--border) 20%, transparent))",
        }}
      />
      {children}
    </div>
  );
}

/**
 * One task on the thread: the bead plus whatever draws the task. Filled while the work
 * is live, hollow while it waits for somebody else, with a static halo when it burns.
 * The bead is punched out of the background, so the line seems to pass behind it.
 */
export function TraceLeaf({
  tone,
  hollow = false,
  halo = false,
  children,
  className = "",
}: {
  tone: Tone;
  hollow?: boolean;
  halo?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const color = TONE_VAR[tone];
  return (
    <div className={`relative ${className}`}>
      <span
        aria-hidden
        className="trace-bead absolute block rounded-full"
        style={{
          left: BACK - 5,
          top: 7,
          width: 10,
          height: 10,
          background: hollow ? "var(--bg)" : color,
          border: `2px solid ${color}`,
          boxShadow: halo ? `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)` : "0 0 0 3px var(--bg)",
        }}
      />
      {children}
    </div>
  );
}

/** A heading is a knot on the thread: the word, the count, and a rule that fades out. */
export function TraceHeading({
  title,
  count,
  tone = "muted",
  extra,
  className = "",
}: {
  title: string;
  count: number;
  tone?: Tone;
  extra?: ReactNode;
  className?: string;
}) {
  const color = TONE_VAR[tone];
  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="absolute block rounded-full"
        style={{ left: BACK - 2.5, top: 5, width: 5, height: 5, background: color, boxShadow: "0 0 0 3px var(--bg)" }}
      />
      <span className="eyebrow shrink-0" style={{ color }}>
        {title}
      </span>
      <span className="nums shrink-0 text-[12px] leading-4 text-muted">{count}</span>
      {extra}
      <span
        aria-hidden
        className="h-px min-w-4 flex-1"
        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 30%, transparent), transparent)` }}
      />
    </div>
  );
}

/**
 * «Сейчас 11:13» — the only accent line on the screen. Above it everything is behind
 * schedule, below it everything is still ahead: the day reads in one look.
 */
export function TraceNow({ now = new Date(), className = "" }: { now?: Date; className?: string }) {
  const time = formatAqtobe(now).slice(-5);
  return (
    <div className={`relative flex items-center gap-2 ${className}`} aria-label={`Сейчас ${time}`}>
      <span
        aria-hidden
        className="absolute block rounded-full"
        style={{
          left: BACK - 3.5,
          top: 4,
          width: 7,
          height: 7,
          background: "var(--accent)",
          boxShadow: "0 0 0 3px var(--bg), 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)",
        }}
      />
      <span className="eyebrow shrink-0" style={{ color: "var(--accent)" }}>
        Сейчас
      </span>
      <span className="nums shrink-0 text-[12px] leading-4" style={{ color: "var(--accent)" }}>
        {time}
      </span>
      <span
        aria-hidden
        className="h-px min-w-4 flex-1"
        style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, transparent), transparent)" }}
      />
    </div>
  );
}
