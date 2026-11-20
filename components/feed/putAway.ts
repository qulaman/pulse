import type { BoardTask } from "@/lib/pulse/board";

/**
 * The orders the person put away with the «Дела» card (D-173). An order waiting for the person's
 * move raises the card by itself; once the person closes it, the same orders do not raise it again —
 * a new one does, and so does one that changed since: sent back to redo a second time, sent again
 * after «Не могу» («Настоять»), a new deadline. An order is kept with its status and the moment of
 * its last change (`updated_at`, moved by the row's trigger on every change).
 * Kept for the tab's session: a reload is the same visit, not a new reason to jump up.
 */
const PUT_AWAY_KEY = "pulse.feed.put-away";
const PUT_AWAY_KEPT = 100;
let putAwayOrders: Set<string> | null = null;

type Order = Pick<BoardTask, "id" | "status" | "updated_at">;

const orderKey = (task: Order) => `${task.id}:${task.status}:${task.updated_at}`;

function putAway(): Set<string> {
  if (putAwayOrders) return putAwayOrders;
  putAwayOrders = new Set();
  try {
    const kept: unknown = JSON.parse(window.sessionStorage.getItem(PUT_AWAY_KEY) ?? "[]");
    if (Array.isArray(kept)) for (const key of kept) if (typeof key === "string") putAwayOrders.add(key);
  } catch {
    // no storage (a private window): the module keeps them while the app is open
  }
  return putAwayOrders;
}

/** The person closed the card over this order as it is now. */
export function wasPutAway(task: Order): boolean {
  return putAway().has(orderKey(task));
}

/** The «Дела» card went down over these orders: they do not raise it again as they are. */
export function putAwayNow(tasks: readonly Order[]): void {
  if (tasks.length === 0) return;
  const set = putAway();
  for (const task of tasks) set.add(orderKey(task));
  try {
    window.sessionStorage.setItem(PUT_AWAY_KEY, JSON.stringify([...set].slice(-PUT_AWAY_KEPT)));
  } catch {
    // the module still has them
  }
}
