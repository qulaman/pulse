import { ACCEPT_GRACE_MS, DEADLINE_SOON_MS, isDeadlineSoon, taskAttention } from "@/lib/tasks/attention";
import { isOverdue } from "@/lib/tasks/status-text";

import { hasMessage, type BoardTask } from "./board";

/**
 * What the board is uneasy about (the owner, 2026-09-17), in this order of weight:
 *   deadline    a deadline is upon it — within the hour, or already past
 *   unaccepted  an order has been lying unaccepted for half an hour — or its holder's pushes do not
 *               reach them, so nobody can tell them about it
 *   unread      somebody has written and the reader has not opened it
 *
 * The rules are the product's one verdict (lib/tasks/attention.ts): Пульс, «Задачи» and the desk
 * answer «всё ли в порядке» alike. The fact, not the face: the director's assistant turns it into a
 * watchful `alert` and never into anger, the employee's face wears the real thing (D-70). Pure, like
 * the rest of the board's reasoning: the same rows, the same clock.
 */

export { ACCEPT_GRACE_MS, DEADLINE_SOON_MS };

export type BoardAlarm = "deadline" | "unaccepted" | "unread";

/** The orders lying with somebody who cannot be told about them — what the mark says once it is woken (D-216). */
export function unreachableOrders(tasks: readonly BoardTask[], noPush: ReadonlySet<string>): string[] {
  return tasks.filter((task) => task.status === "sent" && noPush.has(task.assignee_id)).map((task) => task.id);
}

/**
 * `noPush` — whose pushes do not reach them (`noPushIds`); absent — nobody is known to be cut off.
 * `heard` — the orders the director has already been told about (lib/pulse/heard.ts, D-216): one
 * lying with somebody who cannot be reached is no longer news once it was said — neither «не
 * доходят» nor the «не принята» that follows by itself. A deadline is never heard away, and the
 * moment the person can be reached again the order is an ordinary one.
 */
export function alarmOf(tasks: readonly BoardTask[], now: Date, meId: string, noPush?: ReadonlySet<string>, heard?: ReadonlySet<string>): BoardAlarm | null {
  let unaccepted = false;
  let unread = false;
  for (const task of tasks) {
    // the deadline outranks everything: it is the only thing that cannot be moved by talking
    if (isOverdue(task, now) || isDeadlineSoon(task, now)) return "deadline";
    if (task.status === "sent" && !(heard?.has(task.id) && noPush?.has(task.assignee_id))) {
      const reason = taskAttention(task, { now, noPush, reasons: new Map() });
      if (reason === "unaccepted" || reason === "no_push") unaccepted = true;
    }
    if (hasMessage(task, meId)) unread = true;
  }
  return unaccepted ? "unaccepted" : unread ? "unread" : null;
}
