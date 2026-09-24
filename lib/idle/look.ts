import type { TaskStatus } from "@/lib/tasks/status-text";
import { TONE_VAR, toneOf } from "@/lib/tasks/tone";

/**
 * What one person's circle says on the waiting screen (D-118). Above the face the people with
 * work stand as the same circles as the idlers below it, of the same size, and three channels on
 * each never argue:
 *
 *   colour   the stage of the work — the colour the task has on «Задачи» and on its own screen
 *            (lib/tasks/tone.ts), so a tap from the circle to the task changes nothing;
 *   ring     whether the work is moving: an arc going round while it is being done, a whole
 *            ring that breathes while it waits to be taken up, closed and still when handed in,
 *            snapped on a refusal, closed in gold the moment the director accepts it;
 *   badge    whether there is something to read or to settle: a refusal, a question, an unread
 *            word in the thread — one at a time, the most pressing.
 */

export type CrewTask = {
  id: string;
  title: string;
  status: TaskStatus;
  overdue: boolean;
  /** the employee's open question («Уточнить»), when there is one */
  question: string | null;
  /** an unread word in the thread */
  unread: boolean;
  /** why «Не могу» */
  reason: string | null;
  href: string;
};

export type Ring = "idle" | "waiting" | "spinning" | "closed" | "broken" | "done";
export type Badge = "declined" | "question" | "message" | null;

export type Look = {
  /** above the face (has work, or its last task has just been accepted) or below it */
  busy: boolean;
  ring: Ring;
  /** a CSS colour */
  tone: string;
  /** how many arcs run round the ring: the tasks in work, one to three */
  arcs: 1 | 2 | 3;
  badge: Badge;
  /** the task the circle is about — the loudest one */
  lead: CrewTask | null;
  /** a task of his has just been accepted: a flash of gold over whatever the ring is doing */
  accepted: boolean;
};

/** On the board and still the director's business: a refusal is his to settle. */
export const OPEN_CREW: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework", "pending_review", "declined"];
const MOVING: readonly TaskStatus[] = ["accepted", "in_progress", "rework"];

/** A deadline is his problem only while the work is his: handed in, it waits for the director. */
export function isLate(task: CrewTask): boolean {
  return task.overdue && task.status !== "pending_review" && task.status !== "declined";
}

/**
 * Which task the ring shows when there are several: what needs the director first — a refusal,
 * a deadline gone, work handed in — then an order not taken up, then work being done.
 */
export function urgencyOf(task: CrewTask): number {
  if (task.status === "declined") return 0;
  if (isLate(task)) return 1;
  if (task.status === "pending_review") return 2;
  if (task.status === "sent") return 3;
  if (task.status === "rework") return 4;
  return 5;
}

/** The colour of a task wherever a task is drawn (lib/tasks/tone.ts). */
export function toneFor(task: CrewTask): string {
  return TONE_VAR[toneOf(task.status, isLate(task))];
}

/**
 * The circle of one person, from his tasks. A task that has just been accepted (`done`) is
 * passed in only for that moment — the screen decides how long the gold lasts.
 */
export function lookOf(tasks: CrewTask[]): Look {
  const open = tasks.filter((t) => OPEN_CREW.includes(t.status));
  const done = tasks.find((t) => t.status === "done") ?? null;
  if (!open.length) {
    // the last one accepted: the ring closes in gold before the circle goes back down
    return done
      ? { busy: true, ring: "done", tone: "var(--gold)", arcs: 1, badge: null, lead: done, accepted: true }
      : { busy: false, ring: "idle", tone: "var(--text-muted)", arcs: 1, badge: null, lead: null, accepted: false };
  }
  const lead = [...open].sort((a, b) => urgencyOf(a) - urgencyOf(b))[0]!;
  const ring: Ring =
    lead.status === "declined" ? "broken" : lead.status === "pending_review" ? "closed" : lead.status === "sent" ? "waiting" : "spinning";
  const moving = open.filter((t) => MOVING.includes(t.status)).length;
  const badge: Badge = open.some((t) => t.status === "declined")
    ? "declined"
    : open.some((t) => t.question)
      ? "question"
      : open.some((t) => t.unread)
        ? "message"
        : null;
  return { busy: true, ring, tone: toneFor(lead), arcs: Math.max(1, Math.min(3, moving)) as 1 | 2 | 3, badge, lead, accepted: done !== null };
}

/** The stage of a task in the card, in the director's words. */
export function wordOf(task: CrewTask): string {
  const late = isLate(task) ? "просрочена · " : "";
  switch (task.status) {
    case "sent":
      return `${late}выдана, ещё не принял`;
    case "accepted":
    case "in_progress":
      return `${late}в работе`;
    case "rework":
      return `${late}на доработке`;
    case "pending_review":
      return "сдана, ждёт приёмки";
    case "declined":
      return task.reason ? `не может: ${task.reason}` : "не может";
    case "done":
      return "принята";
    default:
      return "";
  }
}

