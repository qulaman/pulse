"use client";

import { useEffect, useState } from "react";

/**
 * How much of the window the on-screen keyboard covers, in CSS pixels. A fixed
 * composer sits above the tab bar, and on a phone the keyboard slides in under
 * both: `position: fixed` is measured against the layout viewport, which does not
 * shrink, so the field would end up behind the keyboard. The visual viewport does
 * shrink — the difference is the offset the composer needs. 0 on a desktop and
 * anywhere `visualViewport` is missing, so nothing moves where nothing covers.
 */
export function useVisualViewport(): number {
  const [offsetBottom, setOffsetBottom] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      // browser chrome collapsing on scroll moves this by a few pixels — not a keyboard
      setOffsetBottom(covered > 60 ? Math.round(covered) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return offsetBottom;
}
