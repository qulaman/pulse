"use client";

import { useEffect, useRef, useState } from "react";

/** The wall's own size: `/tv` is laid out for a 1080p screen and scaled down whole. */
const WALL_W = 1920;
const WALL_H = 1080;

/**
 * The live preview of the wall (D-153): `/tv` itself in a frame of the wall's size, scaled to
 * the column — the same screen the office sees, by the same data, whether the kiosk is up or not.
 * Look only: the frame takes no clicks and no focus. The director opening `/tv` signs nothing for
 * the wall — only the kiosk's role writes its heartbeat (`useHeartbeat`).
 */
export function WallFrame() {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  // the observer reports the first size by itself, and every resize of the column after it
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WALL_W));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className="relative w-full overflow-hidden rounded-[12px] border border-border bg-black"
      style={{ aspectRatio: `${WALL_W} / ${WALL_H}` }}
      data-testid="desk-wall-preview"
    >
      <iframe
        src="/tv"
        title="Стена"
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: WALL_W, height: WALL_H, transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
      />
    </div>
  );
}
