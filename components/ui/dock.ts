"use client";

import { useLayoutEffect, type RefObject } from "react";

/** The room between a docked bar and the toasts above it. */
const GAP = 8;

/**
 * A bar docked over the tab bar (the presenter's capsule, «Раздать поручения») says how tall it
 * is: `--dock-space` on the root, while it is up. The bottom toasts — «Отменить», «Открыть»,
 * where the thumb is (D-142) — stand above it instead of over its keys (D-140, D-142).
 */
export function useDockSpace(ref: RefObject<HTMLElement | null>, on = true) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!on || !node) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--dock-space", `${Math.ceil(node.getBoundingClientRect().height) + GAP}px`);
    set();
    const resize = new ResizeObserver(set);
    resize.observe(node);
    return () => {
      resize.disconnect();
      root.style.removeProperty("--dock-space");
    };
  }, [ref, on]);
}
