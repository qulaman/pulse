"use client";

import { useEffect, useState } from "react";

/**
 * The section of a long desk page being read now (a person's card, the account page): the last
 * one whose top has passed `offset` px under the top of `#desk-main`; at the very bottom — the last
 * section, however short. Read once a frame while the page scrolls.
 */
export function useSectionSpy(ids: readonly string[], offset: number): string | null {
  const key = ids.join("|");
  const [current, setCurrent] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const list = key.split("|").filter(Boolean);
    const scroller = document.getElementById("desk-main");
    if (!scroller || list.length === 0) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const line = scroller.getBoundingClientRect().top + offset;
      let found = list[0];
      for (const id of list) {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= line) found = id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) found = list[list.length - 1];
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, offset]);
  return current;
}
