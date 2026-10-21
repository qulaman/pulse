"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { SketchView } from "@/components/mindboard/SketchView";
import { wallText, type TvBoardData } from "@/lib/tv/board";

import { Badge, EASE } from "./TvBoardParts";

/**
 * A drawing over the whole wall (D-141 amendment): the presenter lit a point with a drawing —
 * or the director pressed «Во весь экран» on its card — and the drawing takes the whole screen,
 * over the ticker, the board and the footer; its number and words in the corner. The next step
 * of the presenter gives the board back. A visitor's notice still stands above it (TvOverlay).
 * The same layer sits in the wall's miniature on the phone (WallPreview). Opacity only (D-45).
 */
export function TvSketchFull({ board }: { board: TvBoardData | null }) {
  const still = useReducedMotion() ?? false;
  const at = board?.focus ? board.items.findIndex((item) => item.id === board.focus) : -1;
  const item = at >= 0 ? board?.items[at] : undefined;
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
          transition={{ duration: still ? 0 : 0.35, ease: EASE }}
          data-testid="tv-board-sketch"
          data-point={item.id}
        >
          <div className="flex shrink-0 items-center gap-[2vh]" style={{ height: "6.4vh" }}>
            <Badge n={at + 1} done={item.done} size={5.6} lit />
            <p className="min-w-0 flex-1 truncate text-[4.4vh] font-semibold leading-[5.6vh] tracking-[-0.015em]">{wallText(item)}</p>
            <span className="nums shrink-0 text-[3vh] font-semibold leading-[4vh] text-muted">
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
