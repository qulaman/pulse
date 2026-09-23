import { WORK_STATUSES, hasMessage, type BoardTask } from "./board";

/**
 * What the board is uneasy about (владелец, 2026-09-17), in this order of weight:
 *   deadline    a deadline is upon it — within the hour, or already past
 *   unaccepted  an order has been lying unaccepted for half an hour
 *   unread      somebody has written and the reader has not opened it
 *
 * The fact, not the face: the director's assistant turns it into a watchful `alert` and
 * never into anger, the employee's face wears the real thing (D-70). Pure, like the rest
 * of the board's reasoning: the same rows, the same clock.
 */

/** Half an hour without «Принял» is no longer «he just has not seen it» (владелец). */
export const ACCEPT_GRACE_MS = 30 * 60 * 1000;
/** «Срок подходит» — час до дедлайна; всё, что после него, тем более. */
export const DEADLINE_SOON_MS = 60 * 60 * 1000;

export type BoardAlarm = "deadline" | "unaccepted" | "unread";

/** When the order actually went out: a scheduled one starts its clock at the send. */
function sentAt(task: Pick<BoardTask, "created_at" | "scheduled_send_at">): number {
  return new Date(task.scheduled_send_at ?? task.created_at).getTime();
}

export function alarmOf(tasks: readonly BoardTask[], now: Date, meId: string): BoardAlarm | null {
  const at = now.getTime();
  let unaccepted = false;
  let unread = false;
  for (const task of tasks) {
    const working = WORK_STATUSES.includes(task.status);
    // the deadline outranks everything: it is the only thing that cannot be moved by talking
    if (working && task.deadline && new Date(task.deadline).getTime() - at <= DEADLINE_SOON_MS) return "deadline";
    if (task.status === "sent" && at - sentAt(task) >= ACCEPT_GRACE_MS) unaccepted = true;
    if (hasMessage(task, meId)) unread = true;
  }
  return unaccepted ? "unaccepted" : unread ? "unread" : null;
}
