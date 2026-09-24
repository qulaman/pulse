"use client";

import { useEffect, useState } from "react";

/**
 * The height of what stays on top of the screen: the navigation bar of the screen head
 * (D-113, `[data-nav-bar]`), or the app header where a screen has no bar. Sticky bands and
 * pinned bars sit right under it.
 */
export function useHeaderHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const header = document.querySelector("[data-nav-bar]") ?? document.querySelector("header");
    if (!header) return;
    const measure = () => setHeight(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

/**
 * A band that sticks right under the navigation bar says so on the root: the bar then leaves
 * the one hairline of the pair to the band (`:root[data-band-stuck]`, D-113).
 */
export function useBandStuck(stuck: boolean) {
  useEffect(() => {
    if (!stuck) return;
    const root = document.documentElement;
    root.setAttribute("data-band-stuck", "");
    return () => root.removeAttribute("data-band-stuck");
  }, [stuck]);
}
