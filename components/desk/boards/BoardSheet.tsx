"use client";

import { memo } from "react";

import { pointLabel } from "@/lib/mindboard/sketch";
import type { TvBoardData } from "@/lib/tv/board";

/** How many lines a sheet draws: the room reads the first ones; the rest is «ещё N». */
const LINES = { tile: 4, hero: 9 } as const;

const firstWords = (text: string) => text.split("\n").find((line) => line.trim())?.trim() ?? "";

/**
 * A board as the office will see it (D-177): the dark sheet of the wall, 16:9 in both themes — the
 * title and the first points with their sub-points, the lit one in turquoise. Text only, laid out
 * in container units, so a tile of the gallery and the hero draw the same sheet at any width
 * without a measure in script (the real kiosk drawing is `WallPreview`, on the board's own page).
 */
export const BoardSheet = memo(function BoardSheet({
  data,
  size = "tile",
  foot,
  clock,
}: {
  data: TvBoardData;
  size?: "tile" | "hero";
  /** The quiet words in the bottom left corner: «на стене · кабинет». */
  foot?: string | null;
  /** The wall's clock in the bottom right corner, as the room sees it. */
  clock?: string | null;
}) {
  const limit = LINES[size];
  const lines: { id: string; text: string; done: boolean; sub: boolean; n: number; lit: boolean }[] = [];
  let shown = 0;
  data.items.forEach((item, index) => {
    if (lines.length >= limit) return;
    shown += 1;
    lines.push({ id: item.id, text: firstWords(pointLabel(item.text, item.sketch)), done: item.done, sub: false, n: index + 1, lit: data.focus === item.id });
    // the sub-points of the lit point, or of the first ones while nothing is lit — the room sees them under it
    if (data.focus === item.id || (data.focus === null && size === "hero")) {
      for (const child of item.children) {
        if (lines.length >= limit) break;
        lines.push({ id: child.id, text: firstWords(pointLabel(child.text, child.sketch)), done: child.done, sub: true, n: 0, lit: false });
      }
    }
  });
  const more = data.items.length - shown;
  return (
    <div className="board-sheet" data-size={size} aria-hidden data-testid="board-sheet">
      <div className="board-sheet-in">
        <p className="board-sheet-title">{data.title}</p>
        {lines.length === 0 ? (
          <p className="board-sheet-empty">Пока пусто</p>
        ) : (
          <ol className="board-sheet-points">
            {lines.map((line) =>
              line.sub ? (
                <li key={line.id} className="board-sheet-sub" data-done={line.done ? "" : undefined}>
                  · {line.text}
                </li>
              ) : (
                <li key={line.id} className="board-sheet-point" data-done={line.done ? "" : undefined} data-lit={line.lit ? "" : undefined}>
                  <i>{line.done ? "" : line.n}</i>
                  <span>{line.text}</span>
                </li>
              ),
            )}
            {more > 0 ? <li className="board-sheet-more">ещё {more}</li> : null}
          </ol>
        )}
        {foot || clock ? (
          <p className="board-sheet-foot">
            <span>{foot}</span>
            {clock ? <b className="nums">{clock}</b> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
});
