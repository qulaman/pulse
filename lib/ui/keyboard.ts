"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

import { scrollerOf } from "./fitHeight";

/**
 * The on-screen keyboard, read from the visual viewport. A phone does not shrink the window for
 * the keyboard (iOS always, Chrome on Android since 108): the keyboard lies over the page and the
 * browser scrolls the visible part to show the focused field. Two numbers, read apart:
 *
 * - `up` — the keyboard is out: the window minus the visible height. Scrolling never changes it,
 *   so nothing that hangs on it flips while the browser or the reader scrolls.
 * - `gap` — how far the visible bottom stands above the window's bottom, where a fixed bar sits.
 *   It changes with every scroll: a bar placed by it follows the visible bottom exactly, so the
 *   field is always in sight and the browser has no reason to scroll for it again.
 * - `height` — how much of the window the keyboard covers; like `up`, scrolling never changes it.
 *
 * Whatever answers the keyboard is written straight into the DOM inside the viewport's own event —
 * the docked bar and the tab bar in the same frame — and nothing scrolls the page in answer to a
 * scroll: the only scroll here is the field guard's, once, after the keyboard settled. Placed
 * through React state the field came a frame late, the browser scrolled again to show it, the new
 * scroll moved it again, and the task screen shook up and down under the keyboard (2026-10-22).
 */
export type Keyboard = { up: boolean; gap: number; height: number };

/** Below any phone keyboard, above the shortcut strip a hardware keyboard leaves on screen. */
const KEYBOARD_MIN_PX = 100;

const DOWN: Keyboard = { up: false, gap: 0, height: 0 };

export function readKeyboard(): Keyboard {
  const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
  if (!viewport) return DOWN;
  // a pinch-zoom shrinks the visible height as well; the scale takes it back out
  const covered = window.innerHeight - viewport.height * viewport.scale;
  if (covered < KEYBOARD_MIN_PX) return DOWN;
  return {
    up: true,
    gap: Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height)),
    height: Math.round(covered),
  };
}

const listeners = new Set<(keyboard: Keyboard) => void>();
let last = DOWN;

function emit() {
  const next = readKeyboard();
  if (next.up === last.up && next.gap === last.gap && next.height === last.height) return;
  last = next;
  for (const listener of listeners) listener(next);
}

/**
 * Calls `listener` on every change, inside the viewport's own event; the caller applies
 * `readKeyboard()` itself first. One pair of listeners on the viewport, however many subscribe.
 */
export function onKeyboard(listener: (keyboard: Keyboard) => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  if (listeners.size === 0) {
    last = readKeyboard();
    viewport.addEventListener("resize", emit);
    viewport.addEventListener("scroll", emit);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    viewport.removeEventListener("resize", emit);
    viewport.removeEventListener("scroll", emit);
  };
}

/** Something docked that a focused field must not end up under: a bar on the keyboard, a sheet's sticky button. */
const COVER = "data-keyboard-cover";
/** The keyboard has stopped sliding and the browser has stopped scrolling for the field. */
const SETTLE_MS = 150;

/**
 * A bar docked over the tab bar that has to stay above the keyboard (D-60: nothing hides the
 * field). `--kb` on the bar is the keyboard's gap: while the tab bar steps away for the keyboard,
 * `.above-tabbar` moves the bar down by the tab bar's room less the gap
 * (`translate: 0 calc(var(--tabbar-space) - var(--kb))`), so it lands on the keyboard wherever the
 * browser scrolled the visible part. On the bar, not on <html>: a custom property there would
 * restyle the whole page on every scroll.
 *
 * `page` — the content the bar docks over — gets `--kb-room`, the keyboard's height, for its
 * bottom padding: the window does not shrink for the keyboard and a page scroll moves only the
 * window (Chrome), so without the room the page's tail stays under the keyboard. Written only when
 * the keyboard's height changes, never on a scroll — a page that grew on every scroll would hand
 * the browser a new reason to scroll.
 *
 * `cover` (default) — a field of the page that the browser showed right above the keyboard would
 * be under the bar now: the field guard moves it up once the keyboard settled. Toasts pass false.
 */
export function useKeyboardDock(
  ref: RefObject<HTMLElement | null>,
  on = true,
  { page, cover = true }: { page?: RefObject<HTMLElement | null>; cover?: boolean } = {},
) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!on || !node) return;
    const content = page?.current;
    let room = -1;
    const place = ({ up, gap, height }: Keyboard) => {
      node.style.setProperty("--kb", `${up ? gap : 0}px`);
      if (!content || height === room) return;
      room = height;
      content.style.setProperty("--kb-room", `${height}px`);
    };
    place(readKeyboard());
    if (cover) node.setAttribute(COVER, "");
    const stop = onKeyboard(place);
    return () => {
      stop();
      node.style.removeProperty("--kb");
      node.removeAttribute(COVER);
      content?.style.removeProperty("--kb-room");
    };
  }, [ref, on, page, cover]);
  useFieldGuard(on && cover);
}

const TEXT_FIELD = "textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), [contenteditable=true]";

/**
 * The browser shows a focused field just above the keyboard but knows nothing of what we dock
 * there. A field that ended up under a cover of its own layer (the page, or the same sheet) moves
 * up by the overlap — one scroll, after the keyboard settled, never in answer to a scroll.
 */
function clearFocusedField() {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement) || !field.matches(TEXT_FIELD)) return;
  const layer = field.closest("[role=dialog]");
  const box = field.getBoundingClientRect();
  let overlap = 0;
  for (const cover of document.querySelectorAll<HTMLElement>(`[${COVER}]`)) {
    if (cover.contains(field) || cover.closest("[role=dialog]") !== layer) continue;
    const bar = cover.getBoundingClientRect();
    if (bar.height === 0 || bar.right <= box.left || bar.left >= box.right) continue;
    // clear above it — or partly, or wholly, under or past it (a sheet that shrank for the keyboard)
    if (box.bottom + 8 <= bar.top) continue;
    overlap = Math.max(overlap, box.bottom + 8 - bar.top);
  }
  if (overlap <= 1) return;
  const scroller = scrollerOf(field);
  if (scroller) scroller.scrollBy(0, overlap);
  else window.scrollBy(0, overlap);
}

let guards = 0;
let stopGuard: (() => void) | null = null;

/** One watcher for the whole page: on the keyboard's arrival and on every field focused under it. */
function startGuard(): () => void {
  let up = readKeyboard().up;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = false;
      clearFocusedField();
    }, SETTLE_MS);
  };
  const stop = onKeyboard((keyboard) => {
    if (keyboard.up && !up) pending = true;
    up = keyboard.up;
    if (!up) {
      pending = false;
      clearTimeout(timer);
    } else if (pending) settle();
  });
  const focused = () => {
    if (!up) return;
    pending = true;
    settle();
  };
  document.addEventListener("focusin", focused);
  return () => {
    stop();
    document.removeEventListener("focusin", focused);
    clearTimeout(timer);
  };
}

/** Keeps the focused field clear of the covers while anything that covers is on screen. */
export function useFieldGuard(on = true) {
  useEffect(() => {
    if (!on) return;
    if (guards++ === 0) stopGuard = startGuard();
    return () => {
      if (--guards > 0) return;
      stopGuard?.();
      stopGuard = null;
    };
  }, [on]);
}
