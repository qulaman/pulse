"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The room between a docked bar and the toasts above it. */
const GAP = 8;

/** Every bar docked right now, with its height: two at once (a draft pill under a board's bar) must not erase each other. */
const docked = new Map<HTMLElement, number>();

function publish() {
  const root = document.documentElement;
  if (docked.size === 0) root.style.removeProperty("--dock-space");
  else root.style.setProperty("--dock-space", `${Math.max(...docked.values()) + GAP}px`);
}

/**
 * A bar docked over the tab bar (the presenter's capsule, «Раздать поручения», the composer, the
 * director's pills) says how tall it is: `--dock-space` on the root — the tallest of those up. The
 * bottom toasts — «Отменить», «Открыть», where the thumb is (D-142) — stand above it instead of
 * over its keys (D-140, D-142).
 */
export function useDockSpace(ref: RefObject<HTMLElement | null>, on = true) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!on || !node) return;
    const set = () => {
      docked.set(node, Math.ceil(node.getBoundingClientRect().height));
      publish();
    };
    set();
    const resize = new ResizeObserver(set);
    resize.observe(node);
    return () => {
      resize.disconnect();
      docked.delete(node);
      publish();
    };
  }, [ref, on]);
}
