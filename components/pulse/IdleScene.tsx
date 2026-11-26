"use client";

import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useIsPresent } from "motion/react";

import { IdleField } from "@/components/pulse/IdleField";
import { LocalPresence } from "@/components/pulse/LocalPresence";
import { PeopleField } from "@/components/pulse/PeopleField";
import type { Member, Pick } from "@/lib/idle/people";
import { useDeepRest } from "@/lib/useDeepRest";

/**
 * How far inside the edge the play area stops: the room the circles' own shiver and the bob of a
 * passing wave need, so nothing clips the edge of the screen.
 */
const MARGIN = 56;

/**
 * The play area, measured from where the face is: the screen the scene is allowed to use. It
 * is the nearest box that would clip it anyway — the board's own `main`, or whatever marks
 * itself `data-idle-area` — kept symmetric around the face, so the scene is centred on it.
 * A ResizeObserver is the only thing that ever changes it, so a rotated phone re-measures.
 */
function useArea(anchor: RefObject<HTMLDivElement | null>): { hx: number; hy: number } | null {
  const [area, setArea] = useState<{ hx: number; hy: number } | null>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const host = el.closest("[data-idle-area]") ?? el.closest("main") ?? document.body;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hx = Math.round(Math.max(48, Math.min(cx - bounds.left, bounds.right - cx) - MARGIN));
      const hy = Math.round(Math.max(48, Math.min(cy - bounds.top, bounds.bottom - cy) - MARGIN));
      setArea((current) => (current && current.hx === hx && current.hy === hy ? current : { hx, hy }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [anchor]);
  return area;
}

/**
 * The idle screen of a home board (D-89, D-206). While the screen is at rest it is a scene, not an
 * empty panel: the mark's own light carried out over the whole board — orbits with motes on them,
 * waves that leave the ring and cross the screen, a comet now and then (IdleField) — and, on the
 * director's board, the team standing in it. Everything of the field is decoration and nothing of it
 * takes a tap; the moment the screen stops resting the whole scene dissolves in 180 ms.
 *
 * The scene owns the geometry: it measures the play area once and hands it to the field and to the
 * team, which are both laid out from the middle of the face. Nothing runs per frame: the field is
 * plain CSS.
 *
 * Memoised (D-178): a tap on the face or a ball renders the board again, and the scene — the
 * whole team on the director's screen — only when what it is given changes.
 */
export const IdleScene = memo(function IdleScene({
  active,
  quiet = true,
  team,
  picked = null,
  onPick,
  onLook,
  skirt,
}: {
  /**
   * The screen is at rest: no panel open, nothing in flight — except the recording the
   * director may have started from a circle of this very screen, which the team outlives.
   */
  active: boolean;
  /**
   * false — the assistant has something to say (a thought over its head) or a phrase is in
   * flight. The waves stop, because they are the breath of a face that is doing nothing; the
   * orbits and the team stay.
   */
  quiet?: boolean;
  team?: { members: Member[]; allHref?: (id: string) => string; onTaskMore?: (taskId: string) => void };
  /** the idler picked on this screen (D-84) — the screen keeps it, the field draws it */
  picked?: string | null;
  onPick?: (pick: Pick | null) => void;
  /** the card of somebody at work opened or closed (D-118): the face looks at him meanwhile */
  onLook?: (pick: Pick | null) => void;
  /** where the floor of idlers starts under the face — further down while the screen keeps buttons there */
  skirt?: number;
}) {
  // a screen nobody has touched for minutes holds still: nobody is watching (D-119)
  const deep = useDeepRest();
  const anchor = useRef<HTMLDivElement>(null);
  const area = useArea(anchor);

  return (
    <>
      {/* the anchor is the face's own box: the whole scene is measured out from its centre */}
      <div ref={anchor} className="pointer-events-none absolute inset-0" aria-hidden />
      {/* the scene leaves as one — it dissolves in 180 ms at the first touch instead of vanishing in
          one frame — and comes back softly when the screen is at rest again */}
      <LocalPresence>
        {active && area ? (
          <Fade key="field">
            <IdleField hx={area.hx} hy={area.hy} rest={deep} still={!quiet} />
          </Fade>
        ) : null}
        {active && area && team ? (
          <Fade key="team">
            <PeopleField
              members={team.members}
              hx={area.hx}
              hy={area.hy}
              // the rows stand still, so they may use the room the play area leaves at the edge
              wide={area.hx + MARGIN - 6}
              reach={area.hy + MARGIN - 6}
              skirt={skirt}
              waves={quiet && !deep}
              picked={picked}
              onPick={onPick}
              onLook={onLook}
              allHref={team.allHref}
              onTaskMore={team.onTaskMore}
            />
          </Fade>
        ) : null}
      </LocalPresence>
    </>
  );
});

/**
 * A layer of the scene coming and going: in over 240 ms, out over 180 ms. While it goes, nothing in
 * it takes a finger — a circle half faded is not a button any more.
 */
function Fade({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.24, ease: "easeOut" } }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeOut" } }}
      inert={!present}
    >
      {children}
    </motion.div>
  );
}
