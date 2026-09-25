import { humanAqtobe } from "@/lib/ai/time";

/**
 * What a task holds for the morning (D-128): outbox rows to the assignee that wait for the
 * delivery window (D-38, D-51 §2). The director reads «отправлю в 08:00» and one tap sends
 * them now (`send_task_now`). Pure — the clock comes in, so the wording is unit-tested.
 */

export const heldKeys = {
  /** the task's receipt and its held words share one query (DeliveryStatus) */
  task: (taskId: string) => ["deliveries", taskId] as const,
  /** the director's Эфир: which announcements still wait for the window */
  announcements: ["held", "announcements"] as const,
};

export type HeldRow = { event_kind: string; deliver_after: string; created_at: string };

/** «в 08:00» today, «завтра 08:00» when a day word comes with it — the receipt's way of saying when. */
export function whenHeld(iso: string, now: Date = new Date()): string {
  const when = humanAqtobe(new Date(iso), now).replace(/^сегодня /, "");
  return /^\d/.test(when) ? `в ${when}` : when;
}

/** What waits, by what the director did — a new task and «Настоять» are simply «отправлю». */
const SUBJECT: Partial<Record<string, string>> = {
  rework: "доработка уйдёт",
  done: "«Принято» уйдёт",
  deadline_extended: "новый срок уйдёт",
  revoked: "отзыв уйдёт",
};

/**
 * The line of the task's foot while something waits for the morning; null when nothing does.
 * A message is left out: it has its own line under the director's words in the thread.
 */
export function heldLine(rows: readonly HeldRow[], now: Date = new Date()): string | null {
  const waiting = rows.filter((row) => row.event_kind !== "message" && new Date(row.deliver_after) > now);
  if (waiting.length === 0) return null;
  // the newest says what the director has just done; the earliest says when it goes
  const newest = waiting.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a));
  const first = waiting.reduce((a, b) => (new Date(b.deliver_after) < new Date(a.deliver_after) ? b : a));
  return `${SUBJECT[newest.event_kind] ?? "отправлю"} ${whenHeld(first.deliver_after, now)}`;
}
