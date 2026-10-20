"use client";

import { dismissToast, toast } from "@/components/ui/Toast";
import { dequeue, hold } from "@/lib/outbox";

/**
 * «Отменить» for the director's decisive taps (D-139): «Принять», «Настоять», «Отозвать»,
 * «Удалить». The lists change at the tap (the mutation's optimistic patch); the server hears
 * of it only once the window is over, so taking it back is just not sending it — no rollback
 * transition, no trace (D-58 and D-80 §4 hold after the window).
 *
 * The window belongs to the app, not to a screen: the toast is global, the timer lives here,
 * so leaving the screen, closing a panel or starting a recording neither cancels the tap nor
 * cuts the window short. Leaving the app does end it: a phone going to the background or a
 * page going away sends whatever waits at once, and the outbox keeps a copy for the case the
 * page dies before the call is out — the next start sends it (принцип 7 makes a repeat
 * harmless). The copy stays unseen until the call itself closes it, or a dead network makes it
 * a real wait (postJson releases it then): no «Отправляю» line on every tap.
 *
 * Known limit: the hold is this tab's. A second tab of the same director that replays the
 * outbox inside those five seconds (its start, a reconnect) sends the tap before the window
 * is over; «Отменить» in the first tab then only puts the card back until the next fetch.
 */

export const UNDO_MS = 5_000;

/** The person took the tap back: the mutation rolls its patch back and says nothing else. */
export class Undone extends Error {
  constructor() {
    super("undone");
    this.name = "Undone";
  }
}

type Hold = { finish: () => void; cancel: () => void };

const holds = new Map<string, Hold>();
/**
 * Calls whose window is over. A call that then hits a dead network is retried by TanStack from
 * the top of its mutation — the window was had once, the retry goes straight out.
 */
const passed = new Set<string>();
/** Tasks whose tap was taken back just now: the board coming back is not news (useSpeech). */
const undoneAt = new Map<string, number>();
const UNDONE_QUIET_MS = 3_000;

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushHolds();
  });
  window.addEventListener("pagehide", flushHolds);
}

export type HoldInput = {
  /** the call's idempotency key — also its key in the outbox */
  id: string;
  /** what the call will be, kept on the phone for a closed app */
  path: string;
  payload: unknown;
  /** the task the tap is about */
  taskId: string;
  /** the receipt in words: «Принято · Ерлан» */
  text: string;
};

/**
 * Waits out the window: resolves when it is over (or the app leaves), rejects with `Undone`
 * when the person taps «Отменить».
 */
export function holdForUndo({ id, path, payload, taskId, text }: HoldInput): Promise<void> {
  if (passed.has(id)) return Promise.resolve();
  listen();
  hold({ id, path, payload });
  return new Promise<void>((resolve, reject) => {
    let toastId = 0;
    const settle = () => {
      clearTimeout(timer);
      holds.delete(id);
      dismissToast(toastId);
    };
    const timer = setTimeout(() => {
      settle();
      passed.add(id);
      resolve();
    }, UNDO_MS);
    holds.set(id, {
      finish: () => {
        settle();
        passed.add(id);
        resolve();
      },
      cancel: () => {
        settle();
        dequeue(id);
        undoneAt.set(taskId, Date.now());
        reject(new Undone());
      },
    });
    toastId = toast(text, {
      // the toast outlives the window by a breath, so the button never vanishes under the finger
      lifetimeMs: UNDO_MS + 400,
      action: { label: "Отменить", onClick: () => holds.get(id)?.cancel() },
    });
  });
}

/** The call is over (sent, refused or taken back): its mark is not needed any more. */
export function forgetHold(id: string): void {
  passed.delete(id);
}

/** Every tap still in its window goes now — the app is leaving the screen of the phone. */
export function flushHolds(): void {
  for (const pending of [...holds.values()]) pending.finish();
}

/** A tap on this task was taken back a moment ago. */
export function wasUndone(taskId: string, now: number = Date.now()): boolean {
  const at = undoneAt.get(taskId);
  if (at === undefined) return false;
  if (now - at > UNDONE_QUIET_MS) {
    undoneAt.delete(taskId);
    return false;
  }
  return true;
}
