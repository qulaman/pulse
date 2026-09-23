import { isOverdue, type TaskStatus } from "./status-text";

/**
 * One colour per state, shared by everything that draws a task: the rail on the left of
 * a card, its faint tint and the pill around the deadline (docs/DESIGN.md §1.3 — green,
 * yellow and red belong to task status and nothing else).
 *
 * components/tasks/TaskCard.tsx still carries its own copy of this map; it is being
 * edited in another session, so unifying it is a separate, one-import change.
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

export function toneOf(status: TaskStatus, overdue: boolean): Tone {
  if (overdue) return "danger";
  switch (status) {
    case "sent":
      return "accent";
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

/** The pill around a deadline: red past it, amber inside a day, accent further out. */
export function deadlineToneOf(task: { deadline: string | null; status: TaskStatus }, now: Date = new Date()): Tone {
  if (!task.deadline) return "muted";
  if (isOverdue(task, now)) return "danger";
  return new Date(task.deadline).getTime() - now.getTime() < DAY ? "warn" : "accent";
}

/** Border and background of a tinted pill in this tone. */
export function pillStyle(tone: Tone): { color: string; borderColor: string; background: string } {
  return {
    color: TONE_VAR[tone],
    borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 40%, transparent)`,
    background: `color-mix(in srgb, ${TONE_VAR[tone]} 10%, transparent)`,
  };
}
