"use client";

import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";

/** The band a search field rides in, if it sticks to the top while the page scrolls. */
function stickyBand(node: HTMLElement | null): HTMLElement | null {
  for (let box = node?.parentElement ?? null; box && box !== document.body; box = box.parentElement) {
    if (getComputedStyle(box).position === "sticky") return box;
  }
  return null;
}

/**
 * A search that narrows the list under it, read far down the page. Every letter made the page
 * shorter; the browser clamped the scroll, a sticky band let go and slid down with the field in
 * it, and the browser pulled the page back to the caret (2026-10-22).
 *
 * - `hold(next)` — from the field's `onChange`, before the list shrinks: from the first letter the
 *   page keeps at least the length it is scrolled to, so nothing gets clamped;
 * - under a band stuck to the top, the first results come up right under it, not off screen above;
 * - an empty query lets the page go back to its own length.
 */
export function useSearchHold(field: RefObject<HTMLElement | null>, query: string) {
  const active = query.trim() !== "";

  const hold = useCallback((next: string) => {
    if (!next.trim()) return;
    const root = document.documentElement;
    const need = Math.ceil(window.scrollY + window.innerHeight);
    if ((parseFloat(root.style.minHeight) || 0) < need) root.style.minHeight = `${need}px`;
  }, []);

  useLayoutEffect(() => {
    if (!active) {
      document.documentElement.style.removeProperty("min-height");
      return;
    }
    const band = stickyBand(field.current);
    const list = band?.nextElementSibling;
    if (!band || !list) return;
    const above = list.getBoundingClientRect().top - band.getBoundingClientRect().bottom;
    if (above < 0) window.scrollBy(0, above);
  }, [active, query, field]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("min-height");
    },
    [],
  );

  return hold;
}
