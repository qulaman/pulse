"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";

import { SLEEP_COLOR } from "@/components/brand/Mascot";
import { DreamFlight, TOUCHES, type DreamId, DREAMS } from "@/components/pulse/DreamOrbit";
import { flyChase, MAX_OVERSHOOT, type Chase } from "@/lib/idle/flight";
import { PeopleField } from "@/components/pulse/PeopleField";
import type { Member, Pick } from "@/lib/idle/people";
import { looseSeed } from "@/lib/idle/random";
import { brushesOf, keyframesOfBrushes } from "@/lib/idle/wake";
import { useDeepRest } from "@/lib/useDeepRest";

/** One dream: out of the head, across the screen for this long, and gone. */
const FLIGHT_MS = 14_000;
/** The quiet between two dreams — sleep is mostly sleep, not a slideshow. */
const GAP_MS = 5_000;
/** The face falls asleep first and only then starts dreaming. */
const FIRST_MS = 2_600;
/**
 * How far inside the edge the flight is allowed to turn: the overshoot of a hard turn plus
 * half of the biggest figure, so nothing clips the edge of the screen even at the worst turn.
 */
const MARGIN = MAX_OVERSHOOT + 22;
/** The head is 128 px across (docs/DESIGN.md §3); the ripple has to start outside it to be seen. */
const HEAD = 64;
const RIPPLE = 148;

/**
 * The play area, measured from where the face is: the screen the scene is allowed to use. It
 * is the nearest box that would clip it anyway — the board's own `main`, or whatever marks
 * itself `data-dream-area` — kept symmetric around the face, so the dream is centred on him.
 * A ResizeObserver is the only thing that ever changes it, so a rotated phone re-measures.
 */
function useArea(anchor: RefObject<HTMLDivElement | null>): { hx: number; hy: number } | null {
  const [area, setArea] = useState<{ hx: number; hy: number } | null>(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const host = el.closest("[data-dream-area]") ?? el.closest("main") ?? document.body;
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
 * The idle screen of a home board (D-67, D-89). While the face sleeps the screen is a scene,
 * not an empty panel: pen dust over the whole board, and the assistant's dream flying through
 * it — the drop with something after him, out of the middle of his head, across the screen and
 * gone. Everything here is decoration and nothing takes a tap: the layers are transparent to
 * the finger, and the moment the face wakes the whole scene dissolves in 180 ms.
 *
 * The scene owns the geometry: it measures the play area once, seeds the dust from it, and
 * simulates a new flight for every dream (lib/idle/flight.ts). The dust takes the flight to
 * work out its own wake. Nothing runs per frame — after a dream starts, JS sleeps.
 *
 * Under `prefers-reduced-motion` there is no dream: it carries no state the director needs,
 * so the right amount of it is none. The team stays, still (D-118): who is at work and what
 * waits for the director is exactly the state he needs.
 */
export function IdleScene({
  active,
  quiet = true,
  only,
  team,
  picked = null,
  onPick,
  onLook,
}: {
  /**
   * The screen is at rest: no panel open, nothing in flight — except the recording the
   * director may have started from a circle of this very screen, which the team outlives.
   */
  active: boolean;
  /**
   * false — the assistant has something to say (a thought over its head) or a phrase is in
   * flight. The dream stops, because a dream is for a face that is doing nothing; the team
   * stays, because those are the moments it has news — a task landing is exactly when
   * somebody flies through the face and comes out lit.
   */
  quiet?: boolean;
  only?: DreamId;
  team?: { members: Member[]; allHref?: (id: string) => string };
  /** the idler picked on this screen (D-84) — the screen keeps it, the field draws it */
  picked?: string | null;
  onPick?: (pick: Pick | null) => void;
  /** the card of somebody at work opened or closed (D-118): the face looks at him meanwhile */
  onLook?: (pick: Pick | null) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  // a screen nobody has touched for minutes sleeps without dreams: the flight is the costliest thing
  // on it, and nobody is watching (D-119)
  const deep = useDeepRest();
  const playing = active && !reduced;
  const dreaming = playing && quiet && !deep;
  const anchor = useRef<HTMLDivElement>(null);
  const area = useArea(anchor);
  const [dream, setDream] = useState<{ id: DreamId; key: number; seed: number } | null>(null);

  useEffect(() => {
    if (!dreaming) {
      // waking up, or the assistant speaking up: the dream on screen is handed to the layer,
      // which dissolves it
      setDream(null);
      return;
    }
    let turn = Math.floor(Math.random() * DREAMS.length);
    let timer = setTimeout(function play() {
      setDream({ id: only ?? DREAMS[turn % DREAMS.length]!, key: turn, seed: looseSeed() });
      turn += 1;
      timer = setTimeout(play, FLIGHT_MS + GAP_MS);
    }, FIRST_MS);
    return () => clearTimeout(timer);
  }, [dreaming, only]);

  // a new line for every dream, and a new one again if the screen changes size under it
  const chase: Chase | null = useMemo(
    () => (area && dream ? flyChase({ hx: area.hx, hy: area.hy, ms: FLIGHT_MS, seed: dream.seed }) : null),
    [area, dream],
  );

  return (
    <>
      {/* the anchor is the face's own box: the whole scene is measured out from its centre */}
      <div ref={anchor} className="pointer-events-none absolute inset-0" aria-hidden />
      {/* the team leaves with the rest of the scene — it dissolves in 180 ms at the first touch
          instead of vanishing in one frame — and comes back softly when the face falls asleep */}
      <AnimatePresence>
        {active && area && team ? (
          <Fade key="team">
            <PeopleField
              members={team.members}
              hx={area.hx}
              hy={area.hy}
              // the rows stand still, so they may use the room the flight has to leave at the edge
              wide={area.hx + MARGIN - 6}
              reach={area.hy + MARGIN - 6}
              dream={dream}
              chase={chase}
              picked={picked}
              still={reduced}
              onPick={onPick}
              onLook={onLook}
              allHref={team.allHref}
            />
          </Fade>
        ) : null}
      </AnimatePresence>
      <RimWake dream={dream} chase={chase} ms={FLIGHT_MS} />
      <DreamFlight dream={dream} chase={chase} ms={FLIGHT_MS} />
    </>
  );
}

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

/**
 * The sleeper feels it (D-77). A figure of the dream goes right over the head and a ripple
 * runs round the rim of it — the one place an effect of the face itself can be seen, because
 * the face is drawn over this whole scene and anything inside the rim happens behind it.
 *
 * It is not on the face and does not touch what the face is wearing: the expression of the
 * assistant is a telegraph of the director's own day (D-45, D-70), and a dream has no business
 * writing to it. This is the scene knocking on the head from the outside.
 */
function RimWake({ dream, chase, ms }: { dream: { id: DreamId; key: number } | null; chase: Chase | null; ms: number }) {
  const base = `rim-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wake = useMemo(() => {
    if (!dream || !chase) return null;
    const brushes = brushesOf(chase, TOUCHES[dream.id], 0, 0, HEAD);
    if (!brushes.length) return null;
    const name = `${base}-${dream.key}`;
    return { css: keyframesOfBrushes(name, brushes, chase.ms, "rim"), animation: `${name} ${ms}ms linear both` };
  }, [dream, chase, ms, base]);
  if (!wake) return null;
  return (
    <div aria-hidden data-testid="rim-wake" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <style>{wake.css}</style>
      <span
        className="block rounded-full border"
        style={{ width: RIPPLE, height: RIPPLE, borderColor: SLEEP_COLOR, opacity: 0, animation: wake.animation }}
      />
    </div>
  );
}
