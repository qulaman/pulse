"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { TvBoard } from "@/components/tv/TvBoard";
import { TvBranchFull } from "@/components/tv/TvBranchFull";
import { TvSketchFull } from "@/components/tv/TvSketchFull";
import type { TvBoardData } from "@/lib/tv/board";

/** The wall is 16:9: 100 vh tall, this many vh wide. */
const WALL_VW = (100 * 16) / 9;

const DATE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/**
 * The office wall in miniature (D-140): the board exactly as the wall will draw it — the very
 * `TvBoard` of the kiosk, laid out in vh like the wall (the ticker's row above, the date
 * below, the board in between), in a 16:9 frame and scaled down to the width it is given.
 * Every size on the wall is in vh, so the phone's own vh keeps the wall's proportions: the
 * same columns, the same pages, the same map — what the director sees here is what the
 * office sees. Nothing on it is pressed.
 */
export function WallPreview({ data, now, rounded = 14 }: { data: TvBoardData; now: Date; rounded?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => setScale(node.clientWidth / ((WALL_VW * window.innerHeight) / 100));
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div
      ref={box}
      aria-hidden
      className="relative aspect-video w-full overflow-hidden bg-bg"
      style={{ borderRadius: rounded, boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)" }}
      data-testid="wall-preview"
    >
      <div
        className="pointer-events-none absolute left-0 top-0 flex origin-top-left flex-col"
        style={{ width: `${WALL_VW}vh`, height: "100vh", transform: `scale(${scale})`, visibility: scale > 0 ? "visible" : "hidden" }}
      >
        {/* the ticker's row of the wall: its height, without its words */}
        <div className="h-[8.6vh] shrink-0" />
        <div className="flex min-h-0 flex-1 items-center justify-center px-[4vh]">
          <TvBoard data={{ board: data, hidden: false }} now={now} aspect={16 / 9} />
        </div>
        <div className="flex shrink-0 items-center justify-end px-[4vh] pb-[3.4vh]">
          <span className="text-[2.6vh] leading-[3.4vh] text-muted first-letter:uppercase">{DATE.format(now)}</span>
        </div>
        {/* a lit drawing — or a branch lit on the map — over the whole wall, as the kiosk shows it */}
        <TvSketchFull board={data} />
        <TvBranchFull board={data} />
      </div>
    </div>
  );
}
