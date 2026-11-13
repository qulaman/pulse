"use client";

import { useSyncExternalStore } from "react";

import { dismissToast, toast } from "@/components/ui/Toast";
import { GRACE_MS, graceLine } from "@/lib/desk/home";
import { rememberSend } from "@/lib/errands/habits";
import { askSecretary } from "@/lib/errands/pending";
import type { SecretaryAction } from "@/lib/settings";

/**
 * A request to the secretary from the desk (D-164): the phone guards a stray tap by a two-second
 * hold (D-101), a mouse has no such gesture — here a click is held five seconds with «Отменить»
 * in the toast (D-158: a request is taken back within 5 s), and only then goes the phone's own
 * way (`askSecretary`: kept without network, the same key on a repeat, D-106). Taken back in the
 * window, nothing has left the browser.
 *
 * The window is the app's, not the block's: the timer lives here, so leaving «Сегодня» keeps it;
 * leaving the page (or hiding the tab) sends what waits at once — `askSecretary` keeps it on this
 * computer the moment it is asked, so a closing tab does not lose it.
 */

export type DeskAsk = {
  action: Pick<SecretaryAction, "code" | "label" | "icon">;
  note: string | null;
  /** «не беспокоить» for so many minutes (D-99) */
  untilMin?: number | null;
  /** who of the secretaries is away — said in the toast (D-106) */
  absence: string | null;
  /** the request has gone: refresh the lists it belongs to */
  onSent: () => void;
};

/** Requests inside their window: what sends each one now. */
const waiting = new Map<string, () => void>();

/** The buttons whose request is inside its window, by request: a key of the keypad shows it is about to go (D-175). */
const held = new Map<string, string>();
const watchers = new Set<() => void>();
const NOTHING: readonly string[] = [];
let heldCodes: readonly string[] = NOTHING;
function heldChanged() {
  heldCodes = held.size ? [...held.values()] : NOTHING;
  for (const watcher of watchers) watcher();
}
function watchHeld(watcher: () => void) {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}

/** The catalogue codes waiting out their five seconds now; «Отменить» in the toast takes one out. */
export function useHeldCodes(): readonly string[] {
  return useSyncExternalStore(
    watchHeld,
    () => heldCodes,
    () => NOTHING,
  );
}

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const flush = () => {
    for (const send of [...waiting.values()]) send();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/** Holds the request for its window; returns its key — the same uuid the errand row will carry. */
export function askAfterWindow({ action, note, untilMin = null, absence, onSent }: DeskAsk): string {
  listen();
  const id = crypto.randomUUID();
  let toastId = 0;
  const settle = () => {
    clearTimeout(timer);
    waiting.delete(id);
    held.delete(id);
    heldChanged();
    dismissToast(toastId);
  };
  const send = () => {
    settle();
    // a free request has no button to learn a habit for
    if (action.code !== "free") rememberSend(action.code, note);
    // quiet: the toast of the window has said it; a failure or a missing network still speaks
    askSecretary(action, note, onSent, { id }, { untilMin, quiet: true });
  };
  const timer = setTimeout(send, GRACE_MS);
  waiting.set(id, send);
  held.set(id, action.code);
  heldChanged();
  toastId = toast(graceLine(action.label, note, absence), {
    // the toast outlives the window by a breath, so the button never vanishes under the mouse
    lifetimeMs: GRACE_MS + 400,
    // …but its bar runs out with the window itself
    windowMs: GRACE_MS,
    action: {
      label: "Отменить",
      onClick: () => {
        settle();
        toast(`${action.label} · отменено`);
      },
    },
  });
  return id;
}
