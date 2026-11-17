"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";

/** Longer than any glide of the bands: a glide cut short without its end still lets the band clip again. */
const SAFETY_MS = 1_200;

/**
 * The words over the face glide to where their band already is (a ball's card takes its room at once,
 * D-166): their band scrolls, and on the way from a lower place they were cut off by its new bottom
 * edge (D-178). For the glide the band lets its content show past its edge, and clips again at the
 * end. A long answer that really scrolls keeps its clip — it would spill over the face.
 * `band` is the scrolling band; the handlers go on its `layout` content.
 */
export function useBandGlide(band: RefObject<HTMLElement | null>) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(() => {
    const settle = () => {
      clearTimeout(timer.current);
      band.current?.style.removeProperty("overflow-y");
    };
    return {
      onLayoutAnimationStart: () => {
        const node = band.current;
        if (!node || node.scrollHeight > node.clientHeight + 1) return;
        node.style.setProperty("overflow-y", "visible");
        clearTimeout(timer.current);
        timer.current = setTimeout(settle, SAFETY_MS);
      },
      onLayoutAnimationComplete: settle,
    };
  }, [band]);
}
