"use client";

import { useLayoutEffect, type RefObject } from "react";

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
 * the docked bar and the tab bar in the same frame — and nothing here scrolls the page. Placed
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

/**
 * A bar docked over the tab bar that has to stay above the keyboard (D-60: nothing hides the
 * field). `--kb` on the bar is the keyboard's gap and its `bottom` adds it —
 * `calc(var(--kb, 0px) + var(--tabbar-space))` — while the tab bar stepping away takes
 * `--tabbar-space` back off (`.above-tabbar`). On the bar, not on <html>: a custom property there
 * would restyle the whole page on every scroll.
 *
 * `page` — the content the bar docks over — gets `--kb-room`, the keyboard's height, for its
 * bottom padding: the window does not shrink for the keyboard and a page scroll moves only the
 * window (Chrome), so without the room the page's tail stays under the keyboard. Written only when
 * the keyboard's height changes, never on a scroll — a page that grew on every scroll would hand
 * the browser a new reason to scroll.
 */
export function useKeyboardDock(ref: RefObject<HTMLElement | null>, on = true, page?: RefObject<HTMLElement | null>) {
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
    const stop = onKeyboard(place);
    return () => {
      stop();
      node.style.removeProperty("--kb");
      content?.style.removeProperty("--kb-room");
    };
  }, [ref, on, page]);
}
