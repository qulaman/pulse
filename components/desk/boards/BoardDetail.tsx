"use client";

import { DeskBoard } from "./DeskBoard";

/**
 * A board of «Доски» (D-177): the desk's own board, in its three forms (`DeskBoard`). The phone's
 * board screen inside the desk (`?view=phone`, D-156) is gone — the dictaphone and «Раздать
 * поручения» are the desk's own now; an old address with `?view=phone` opens the same board.
 */
export function BoardDetail() {
  return <DeskBoard />;
}
