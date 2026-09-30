"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject, type SetStateAction } from "react";

/**
 * An animation started inside a long task (the render that opened a sheet, folded a month)
 * takes its start time from a frame clock that task has left behind — and so does the first
 * frame after it, stamped when the screen asked for it, not when the task let it run. By
 * the first frame anyone sees, a quarter of a second may be gone: a 280 ms glide lands in one
 * jump, a sheet appears three quarters up. This holds it on its first frame and lets it run
 * from the second frame drawn, the first with a fresh clock. On an idle phone: two frames.
 */
export function fromNextFrame(animation: Animation): void {
  animation.pause();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (animation.playState === "paused") animation.play();
    }),
  );
}

/** How long the things below take to reach their new place: `--t-sheet`, `--ease-out`. */
const GLIDE_MS = 280;
const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * Something in the flow is about to open or close, and everything after it — its following
 * siblings and those of each ancestor — would jump by the difference in one frame. This
 * measures them now and returns `play`, to call once the DOM has changed (a layout effect,
 * before paint): each one that moved starts from its old place and glides to its new one.
 * Transform only, on the compositor (WAAPI, added on top of any transform of its own);
 * what stays put — a sheet's bottom, a fixed bar — is left alone, and so is everything far
 * below the screen. Under reduced motion it does nothing.
 */
export function measureBelow(anchor: Element): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  // closing moves things up by up to a panel's height: those a screen below may arrive in view
  const reach = window.innerHeight * 2;
  const items: [HTMLElement, number][] = [];
  for (let node: Element | null = anchor; node && node !== document.body; node = node.parentElement) {
    for (let next = node.nextElementSibling; next; next = next.nextElementSibling) {
      if (!(next instanceof HTMLElement)) continue;
      const top = next.getBoundingClientRect().top;
      if (top > reach) break;
      items.push([next, top]);
    }
  }
  return () => {
    const view = window.innerHeight;
    for (const [el, was] of items) {
      if (!el.isConnected) continue;
      const now = el.getBoundingClientRect().top;
      if (was > view && now > view) continue;
      // one that comes up from below the screen enters at its edge at once: from where it
      // really was, it would leave the room it closes empty until it swam into view
      const dy = Math.min(was, view + 8) - now;
      if (Math.abs(dy) < 1) continue;
      fromNextFrame(
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
          duration: GLIDE_MS,
          easing: EASE_OUT,
          composite: "add",
        }),
      );
    }
  };
}

/**
 * For a change whose state lives elsewhere (a hook's, a parent's): call `mark()` right before
 * causing it; once `key` has changed and the DOM with it, what stands below `anchor` glides
 * from where it was to where it lands (`measureBelow`).
 */
export function useGlideOn(anchor: RefObject<HTMLElement | null>, key: unknown): () => void {
  const pending = useRef<(() => void) | null>(null);

  const mark = useCallback(() => {
    if (pending.current || !anchor.current) return;
    pending.current = measureBelow(anchor.current);
    // a change that renders nothing new must not leave a stale measurement behind
    requestAnimationFrame(() => {
      pending.current = null;
    });
  }, [anchor]);

  useLayoutEffect(() => {
    pending.current?.();
    pending.current = null;
  }, [key]);

  return mark;
}

/**
 * `useState` for whether something in the flow is open: every change glides what stands
 * below `anchor` to its new place instead of letting it jump by the opened part's height.
 */
export function useGlidingState<T>(initial: T, anchor: RefObject<HTMLElement | null>): [T, (next: SetStateAction<T>) => void] {
  const [value, setValue] = useState(initial);
  const mark = useGlideOn(anchor, value);
  const set = useCallback(
    (next: SetStateAction<T>) => {
      mark();
      setValue(next);
    },
    [mark],
  );
  return [value, set];
}
