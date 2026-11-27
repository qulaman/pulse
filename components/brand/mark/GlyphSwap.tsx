"use client";

import { useState } from "react";

import { Glyph, type GlyphId } from "./glyphs";

type Thing = { id: GlyphId | null; count: number; hot: boolean };
type Shown = Thing & { leaves: boolean };

/**
 * The thing the dot has turned into, and the change of one thing for another (D-205). A new thing
 * grows out of the middle the way the dot does (`bk-glyph-in`), the one before it goes back into the
 * middle and is dropped on that animation's own end — so the dot is never two things at once and
 * nothing waits on a timer. The thing a page is first drawn with simply stands: nothing plays on load.
 * The thing that leaves is drawn as it last stood — a stack goes with the count it had. A thing an
 * act has thrown or crushed (`leaves`) is gone already: nothing of it is drawn again to go out. And
 * between one thing and the next the dot itself shows for a moment (`bk-bead`) — a thing is what the
 * dot turns into, so the dot is what lies between two things. With every new thing a thin ring leaves
 * the middle and is gone inside the big one (`bk-swap`): the turn is seen, not only its result.
 *
 * The only client part of the mark: the rest of `Mascot` is drawn by the server.
 */
export function GlyphSwap({
  id,
  count,
  hot,
  anim,
  leaves = false,
}: Thing & {
  /** the motion of the thing: an act's own, or the state's loop */
  anim?: string;
  /** the act that shows this thing ends with the thing gone */
  leaves?: boolean;
}) {
  const [shown, setShown] = useState<Shown>({ id, count, hot, leaves });
  const [gone, setGone] = useState<(Thing & { id: GlyphId }) | null>(null);
  const [changed, setChanged] = useState(false);
  // one thing straight after another: the bead shows between them, the new thing waits for it
  const [after, setAfter] = useState(0);
  // adjusted during render, not in an effect: the way out starts in the same paint as the change
  if (shown.id !== id) {
    const left = shown.id === null || shown.leaves ? null : { id: shown.id, count: shown.count, hot: shown.hot };
    setGone(left);
    setAfter(left && id !== null ? after + 1 : 0);
    setShown({ id, count, hot, leaves });
    setChanged(true);
  } else if (shown.count !== count || shown.hot !== hot || shown.leaves !== leaves) {
    setShown({ id, count, hot, leaves });
  }
  return (
    <>
      {gone ? (
        <span
          key={`out-${gone.id}`}
          className="bk-p bk-glyph"
          data-swap="out"
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setGone(null);
          }}
        >
          <Glyph id={gone.id} count={gone.count} hot={gone.hot} />
        </span>
      ) : null}
      {after > 0 && id !== null ? <span key={`bead-${after}`} className="bk-p bk-bead" /> : null}
      {changed && id !== null ? <span key={`pop-${id}`} className="bk-p bk-swap" data-after={after > 0 ? "" : undefined} /> : null}
      {id !== null ? (
        <span key={id} className="bk-p bk-glyph" data-swap={changed ? "in" : undefined} data-after={after > 0 ? "" : undefined}>
          <span className="bk-p bk-glyph-act" style={anim ? { animation: anim } : undefined}>
            <Glyph id={id} count={count} hot={hot} />
          </span>
        </span>
      ) : null}
    </>
  );
}
