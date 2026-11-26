"use client";

import { useState } from "react";

import { Glyph, type GlyphId } from "./glyphs";

type Thing = { id: GlyphId | null; count: number; hot: boolean };

/**
 * The thing the dot has turned into, and the change of one thing for another (D-205). A new thing
 * grows out of the middle the way the dot does (`bk-glyph-in`), the one before it goes back into the
 * middle and is dropped on that animation's own end — so the dot is never two things at once and
 * nothing waits on a timer. The thing a page is first drawn with simply stands: nothing plays on load.
 * The thing that leaves is drawn as it last stood — a stack goes with the count it had.
 *
 * The only client part of the mark: the rest of `Mascot` is drawn by the server.
 */
export function GlyphSwap({ id, count, hot, anim }: Thing & { /** the act's own motion of the thing */ anim?: string }) {
  const [shown, setShown] = useState<Thing>({ id, count, hot });
  const [gone, setGone] = useState<(Thing & { id: GlyphId }) | null>(null);
  const [changed, setChanged] = useState(false);
  // adjusted during render, not in an effect: the way out starts in the same paint as the change
  if (shown.id !== id) {
    setGone(shown.id === null ? null : { ...shown, id: shown.id });
    setShown({ id, count, hot });
    setChanged(true);
  } else if (shown.count !== count || shown.hot !== hot) {
    setShown({ id, count, hot });
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
      {id !== null ? (
        <span key={id} className="bk-p bk-glyph" data-swap={changed ? "in" : undefined}>
          <span className="bk-p bk-glyph-act" style={anim ? { animation: anim } : undefined}>
            <Glyph id={id} count={count} hot={hot} />
          </span>
        </span>
      ) : null}
    </>
  );
}
