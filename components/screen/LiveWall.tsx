"use client";

import { useEffect, useRef, useState } from "react";

/** The wall's own size: `/tv` is laid out for a 1080p screen and scaled down whole. */
const WALL_W = 1920;
const WALL_H = 1080;

/**
 * The wall as the office sees it, live (D-153, D-182): `/tv` itself in a frame of the wall's size,
 * scaled to the box — the same screen by the same data, whether the kiosk is up or not. Look only:
 * the frame takes no clicks and no focus (principle 10). The desk's «Экран» sets it in a bezel; the
 * phone's remote opens it in a sheet from its display. The director opening `/tv` signs nothing for
 * the wall — only the kiosk's role writes its heartbeat.
 */
export function LiveWall({ src = "/tv", className = "", testId }: { src?: string; className?: string; testId?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  // the observer reports the first size by itself, and every resize of the box after it
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WALL_W));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className={`relative w-full overflow-hidden bg-black ${className}`} style={{ aspectRatio: `${WALL_W} / ${WALL_H}` }} data-testid={testId}>
      <iframe
        src={src}
        title="Стена"
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: WALL_W, height: WALL_H, transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
      />
    </div>
  );
}
