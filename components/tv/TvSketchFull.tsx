"use client";

import { AnimatePresence, motion } from "motion/react";

import { SketchView } from "@/components/mindboard/SketchView";
import { litPoint, wallText, type TvBoardData } from "@/lib/tv/board";
import { TV_TYPE } from "@/lib/tv/boardList";

import { Badge, clampStyle, EASE } from "./TvBoardParts";

/**
 * A drawing over the whole wall (D-141 amendment): the presenter lit a point with a drawing —
 * or the director pressed «Во весь экран» on its card — and the drawing takes the whole screen,
 * over the ticker, the board and the footer; its number and words above it, at `tv-body` in two lines
 * at most, no ellipsis (D-185). The next step of the presenter gives the board back. A visitor's notice
 * still stands above it (TvOverlay). The same layer sits in the wall's miniature on the phone
 * (WallPreview). Opacity only (D-45).
 */
export function TvSketchFull({ board }: { board: TvBoardData | null }) {
  const lit = litPoint(board);
  const item = lit?.item;
  const at = lit?.at ?? -1;
  const sketch = item?.sketch ?? null;

  return (
    <AnimatePresence>
      {item && sketch ? (
        <motion.div
          key={item.id}
          className="absolute inset-0 z-[15] flex flex-col bg-bg px-[4vh] pb-[3vh] pt-[2.6vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          data-testid="tv-board-sketch"
          data-point={item.id}
        >
          <div className="flex shrink-0 items-start gap-[2vh]">
            <Badge n={at + 1} done={item.done} size={6.2} />
            <p
              className="tv-body min-w-0 flex-1 pt-[0.3vh] font-semibold tracking-[-0.01em]"
              style={{ ...clampStyle(2, TV_TYPE.body.lh), color: "var(--tv-text)" }}
            >
              {wallText(item)}
            </p>
            <span className="tv-small tv-num shrink-0 pt-[0.9vh] font-semibold text-muted">
              {at + 1} / {board?.items.length ?? 0}
            </span>
          </div>
          <div className="mt-[2vh] min-h-0 flex-1">
            <SketchView sketch={sketch} label={wallText(item)} />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
