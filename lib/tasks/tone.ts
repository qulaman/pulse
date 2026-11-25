import type { CSSProperties } from "react";

import { isOverdue, type TaskStatus } from "./status-text";

/**
 * One colour per state, shared by everything that draws a task: the rail on the left of
 * a card, its faint tint and the pill around the deadline (docs/DESIGN.md §1.3 — green,
 * yellow and red belong to task status and nothing else).
 *
 * The map of states (one for the whole product): green — taken and in work, handed in, done
 * well; amber — needs someone now (the director's move, an order nobody has taken for half an
 * hour, pushes that do not reach, the holder's own new order); red — late, refused; gold — closed,
 * points; grey — not answered yet, held, recalled. The accent is the client's brand colour and may
 * be green itself: it never says a state — a pilot with a green brand would read «не принята» as
 * «в работе».
 */

export type Tone = "accent" | "ok" | "warn" | "danger" | "muted" | "gold";

export const TONE_VAR: Record<Tone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
  gold: "var(--gold)",
};

/**
 * `attention` — the not yet taken task needs its reader now: the director's, nobody has taken it
 * for ACCEPT_GRACE_MS or the holder's pushes do not reach (lib/tasks/attention.ts); the holder's,
 * it is their move. Without it a new task is grey — nobody has answered yet, nothing is done.
 */
export function toneOf(status: TaskStatus, overdue: boolean, { attention = false }: { attention?: boolean } = {}): Tone {
  if (overdue) return "danger";
  switch (status) {
    case "sent":
      return attention ? "warn" : "muted";
    case "accepted":
    case "in_progress":
      return "ok";
    case "pending_review":
    case "rework":
      return "warn";
    case "done":
      return "gold";
    case "declined":
      return "danger";
    default:
      return "muted";
  }
}

const DAY = 24 * 3_600_000;

/**
 * The pill around a deadline: red past it, amber inside a day, grey further out — a calm time is
 * not a state, and the brand colour (a client's, sometimes green) would read as «всё сделано».
 */
export function deadlineToneOf(task: { deadline: string | null; status: TaskStatus }, now: Date = new Date()): Tone {
  if (!task.deadline) return "muted";
  if (isOverdue(task, now)) return "danger";
  return new Date(task.deadline).getTime() - now.getTime() < DAY ? "warn" : "muted";
}

/** Border and background of a tinted pill in this tone. */
export function pillStyle(tone: Tone): { color: string; borderColor: string; background: string } {
  return {
    color: TONE_VAR[tone],
    borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 40%, transparent)`,
    background: `color-mix(in srgb, ${TONE_VAR[tone]} 10%, transparent)`,
  };
}

/**
 * A stacked bar's tones: the six, plus `wait` — not answered yet (not accepted, the report not in
 * yet): grey and HOLLOW, so a bar of nothing but waiting reads as empty, never as full.
 */
export type BarTone = Tone | "wait";

const BAR_VAR: Record<BarTone, string> = { ...TONE_VAR, wait: "var(--state-wait)" };

/** One segment of a stacked bar: filled in its tone, `wait` drawn as an outline, `muted` dimmed. */
export function segmentStyle(tone: BarTone, { first = false, last = false }: { first?: boolean; last?: boolean } = {}): CSSProperties {
  const radius = { borderRadius: first || last ? 999 : 2 };
  if (tone === "wait") {
    return { ...radius, background: "transparent", boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${BAR_VAR.wait} 70%, transparent)` };
  }
  return { ...radius, background: BAR_VAR[tone], opacity: tone === "muted" ? 0.55 : 1 };
}

/** The legend's dot of a segment: a ring for `wait`, a filled dot otherwise. */
export function dotStyle(tone: BarTone): CSSProperties {
  if (tone === "wait") return { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${BAR_VAR.wait}` };
  return { background: BAR_VAR[tone], opacity: tone === "muted" ? 0.55 : 1 };
}
