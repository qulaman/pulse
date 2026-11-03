"use client";

import { useEffect, useRef, useState } from "react";

import type { WallReceipt } from "@/lib/tv/remote";

/** The wall's own size: `/tv` is laid out for a 1080p screen and scaled down whole. */
const WALL_W = 1920;
const WALL_H = 1080;

/** The diode's colour by the receipt: answering, silent, or nothing to say yet. */
const DIODE: Record<WallReceipt["tone"], string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  muted: "var(--text-muted)",
};

/**
 * The live preview of the wall (D-153, D-154): `/tv` itself in a frame of the wall's size, scaled
 * to the column — the same screen the office sees, by the same data, whether the kiosk is up or
 * not — set in a bezel like the set on the wall, with a diode and the receipt on its chin: green
 * while the kiosk answers, amber «не отвечает с 16:50» once it has gone silent (D-76 §9). Steady,
 * never blinking. Look only: the frame takes no clicks and no focus. The director opening `/tv`
 * signs nothing for the wall — only the kiosk's role writes its heartbeat (`useHeartbeat`).
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

  const diode = receipt ? DIODE[receipt.tone] : DIODE.muted;
  const lit = receipt !== null && receipt.tone !== "muted";

  return (
    <figure
      className="m-0 rounded-[20px] p-2.5 pb-0"
      style={{
        background: "linear-gradient(180deg, #10161d, #080b0f 70%)",
        boxShadow: "0 0 0 1px var(--border), inset 0 1px 0 rgba(255,255,255,.06), 0 28px 60px -28px rgba(0,0,0,.85)",
      }}
      data-testid="desk-wall-frame"
    >
      <div
        ref={box}
        className="relative w-full overflow-hidden rounded-[10px] bg-black"
        style={{ aspectRatio: `${WALL_W} / ${WALL_H}`, boxShadow: "0 0 0 1px rgba(255,255,255,.04)" }}
        data-testid="desk-wall-preview"
      >
        <iframe
          src="/tv"
          title="Стена"
          tabIndex={-1}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: WALL_W, height: WALL_H, transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
        />
        {/* the glass: a breath of light from the top left, so the preview reads as a screen and not a picture */}
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,.035), transparent 38%)" }} />
      </div>
      <figcaption className="flex h-11 items-center gap-2.5 px-1.5" data-testid="desk-wall-receipt" data-tone={receipt?.tone ?? "muted"}>
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: diode, boxShadow: lit ? `0 0 0 3px color-mix(in srgb, ${diode} 18%, transparent), 0 0 10px ${diode}` : "none", opacity: lit ? 1 : 0.6 }}
        />
        <span className="truncate text-[13px] font-semibold leading-[18px]" style={{ color: lit ? diode : "var(--text-muted)" }}>
          {receipt?.text ?? "Связываюсь со стеной…"}
        </span>
        {label ? <span className="ml-auto truncate pl-3 text-[12px] leading-4 text-muted/80">{label}</span> : null}
      </figcaption>
    </figure>
  );
}
