"use client";

import { useEffect, useRef, useState } from "react";

import type { WallReceipt } from "@/lib/tv/remote";

/** The wall's own size: `/tv` is laid out for a 1080p screen and scaled down whole. */
const WALL_W = 1920;
const WALL_H = 1080;

/** The receipt's ink on the dark chin: answering — print, silent — a failure, nothing to say yet — quiet. */
const INK: Record<WallReceipt["tone"], string> = {
  ok: "var(--text)",
  warn: "var(--danger)",
  muted: "var(--text-muted)",
};

/**
 * The live preview of the wall (D-153, D-154): `/tv` itself in a frame of the wall's size, scaled
 * to the column — the same screen the office sees, by the same data, whether the kiosk is up or
 * not — set in a flat dark bezel: the wall is a television, not paper (D-158). The receipt on its
 * chin is a line of words: plain while the kiosk answers, red «не отвечает с 16:50» once it has
 * gone silent (D-76 §9). Steady, never blinking. Look only: the frame takes no clicks and no focus.
 * The director opening `/tv` signs nothing for the wall — only the kiosk's role writes its
 * heartbeat (`useHeartbeat`).
 */
export function WallFrame({ receipt, label }: { receipt: WallReceipt | null; label?: string | null }) {
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
    <figure className="m-0 bg-bg p-2 pb-0" data-testid="desk-wall-frame">
      <div ref={box} className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: `${WALL_W} / ${WALL_H}` }} data-testid="desk-wall-preview">
        <iframe
          src="/tv"
          title="Стена"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: WALL_W, height: WALL_H, transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
        />
      </div>
      <figcaption className="flex h-9 items-center gap-2.5" data-testid="desk-wall-receipt" data-tone={receipt?.tone ?? "muted"}>
        <span className="truncate text-[13px] font-medium leading-[18px]" style={{ color: INK[receipt?.tone ?? "muted"] }}>
          {receipt?.text ?? "Связываюсь со стеной…"}
        </span>
        {receipt?.tone === "warn" ? (
          // what to do, not only what broke (D-160): the wall is a browser on a TV
          <span className="truncate text-[12px] leading-4 text-muted" data-testid="desk-wall-help">
            Проверьте, что телевизор включён, а на нём открыт Pulse — страница «Стена»
          </span>
        ) : null}
        {label ? <span className="ml-auto truncate pl-3 text-[12px] leading-4 text-muted">{label}</span> : null}
      </figcaption>
    </figure>
  );
}
