"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, type ReactNode } from "react";

import { SLEEP_COLOR } from "@/components/brand/Mascot";
import { Loops, loop } from "@/components/pulse/loops";
import { keyframesOf, type Chase } from "@/lib/idle/flight";
import type { Touch } from "@/lib/idle/wake";

/** The dreams: one at a time, in this order, from wherever the rotation starts. */
export const DREAMS = ["rocket", "dragon", "monster", "plane", "bees", "ufo"] as const;
export type DreamId = (typeof DREAMS)[number];

/**
 * One figure in a dream: what it looks like, how big it is at full swell, which of the two
 * flights it rides, and how many milliseconds after that flight starts it sets off. The trail
 * is the whole trick behind the dragon: its head and every link of its body ride the chaser's
 * own line a few tens of milliseconds apart, so the body lies along the way the head went and
 * cracks around every turn it took.
 */
type Actor = { key: string; size: number; track: "lead" | "chase"; trail: number; figure: ReactNode };

/**
 * The figures of the dream and the flight they ride (D-67, D-89).
 *
 * The line comes in already simulated (lib/idle/flight.ts): a runner and something after him,
 * both steering — wandering off their own course, turning away from the edges of the screen,
 * one chasing and one fleeing. Here it is only written out as keyframes for the size the
 * screen actually is and handed to the browser, so nothing runs per frame.
 *
 * `dream-swell` scales the whole scene from a speck to full size; the flight lives inside it,
 * so one scale grows both the reach and the figures, and they come out of the head instead of
 * appearing beside it.
 *
 * Perf contract is the mascot's own (docs/DESIGN.md §3): one SVG per figure, CSS keyframes on
 * transform and opacity only, nothing on filter or box-shadow. The figures' own loops (the run, the
 * wings, the jet) are folded so that one iteration outlasts the flight (components/pulse/loops.tsx):
 * an iteration end wakes the main thread, and a bee's wings used to end one eleven times a second.
 */
export function DreamFlight({
  dream,
  chase,
  ms,
}: {
  dream: { id: DreamId; key: number } | null;
  chase: Chase | null;
  ms: number;
}) {
  const base = `dream-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <AnimatePresence>
      {dream && chase ? (
        <motion.div
          key="dream"
          aria-hidden
          data-testid="dream"
          data-dream={dream.id}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeOut" } }}
          className="pointer-events-none absolute inset-0"
          // the blue the face itself wears while asleep, so the dream is plainly his
          style={{ color: SLEEP_COLOR }}
        >
          <Loops />
          <style>{`${keyframesOf(`${base}-lead`, chase.lead, ms)} ${keyframesOf(`${base}-chase`, chase.chase, ms)}`}</style>
          {/* the swell: the whole scene comes out of the head as a speck and grows until the
              figures are turning at the real edges of the screen */}
          <div key={dream.key} className="absolute inset-0" style={{ animation: `dream-swell ${ms}ms linear both` }}>
            {ACTORS[dream.id].map((actor) => (
              <div
                key={actor.key}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  // `both` holds a figure inside the head until its turn to set off comes
                  animation: `${base}-${actor.track} ${ms}ms linear ${actor.trail}ms both`,
                }}
              >
                <svg width={actor.size} height={actor.size} viewBox="-32 -32 64 64" aria-hidden style={{ display: "block", overflow: "visible" }}>
                  {actor.figure}
                </svg>
              </div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** The run of the drop — every dream's runner has it. */
const STEP = loop("dream-step", 440, "ease-in-out infinite");
/** A bee's wings. */
const BUZZ = loop("dream-buzz", 90, "linear infinite");

/**
 * The drop from above: the same body, the eyes thrown back over the shoulder at whatever is
 * behind him. The eyes are the whole dial of the mood here, exactly as on the big face.
 */
function DropTop(): ReactNode {
  return (
    <g fill="currentColor">
      {/* the wake of the run: three tapered swooshes, longest in the middle */}
      <g opacity="0.55">
        <path d="M-19 -9.5 C-24 -11 -28 -12 -32 -12.5 C-28 -10.5 -24 -9.5 -19 -8.5 Z" />
        <path d="M-20 0 C-26 -0.9 -31 -1.2 -36 -1.2 C-31 0.7 -26 1 -20 1.4 Z" />
        <path d="M-19 9.5 C-24 11 -28 12 -32 12.5 C-28 10.5 -24 9.5 -19 8.5 Z" />
      </g>
      <g style={{ transformOrigin: "0px 0px", animation: STEP }}>
        {/* the body, leaning into the run: the drop's own silhouette seen from over him */}
        <path d="M21 0 C21 8.4 13.6 14.6 1 15 C-11.6 15.4 -20 8.6 -20 0 C-20 -8.6 -11.6 -15.4 1 -15 C13.6 -14.6 21 -8.4 21 0 Z" />
        {/* the highlight the big face has too, so the top of the head reads as the top */}
        <ellipse cx="7" cy="-6.6" rx="6.4" ry="3.4" fill="#ffffff" opacity="0.16" />
        {/* both eyes thrown back over the shoulder, wide */}
        <g fill="var(--bg)">
          <ellipse cx="-7.5" cy="-6.6" rx="4.5" ry="5.2" />
          <ellipse cx="-7.5" cy="6.6" rx="4.5" ry="5.2" />
        </g>
      </g>
    </g>
  );
}

/**
 * The head of a Chinese dragon from above: a long snout, a brow of horns swept back, the mane
 * streaming behind and two whiskers trailing along the body.
 */
function DragonHead(): ReactNode {
  return (
    <g fill="currentColor">
      {/* whiskers, streaming back along the flight */}
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M24 -3.4 C14 -9 0 -12.4 -14 -12" />
        <path d="M24 3.4 C14 9 0 12.4 -14 12" />
      </g>
      {/* the mane: three tufts of flame off the back of the skull */}
      <g opacity="0.95">
        <path d="M-2 -7.6 C-8 -10.6 -14 -11.4 -20 -10 C-15 -7.6 -10 -6 -4 -5 Z" />
        <path d="M-4 0 C-11 -1 -17 -0.6 -22 1 C-16 2.2 -10 2.4 -4 2 Z" />
        <path d="M-2 7.6 C-8 10.6 -14 11.4 -20 10 C-15 7.6 -10 6 -4 5 Z" />
      </g>
      {/* the horns, branching back over the skull */}
      <path d="M2 -8 C-3 -12 -9 -15 -15 -16 C-11 -12 -8 -9.6 -4 -7 Z" />
      <path d="M2 8 C-3 12 -9 15 -15 16 C-11 12 -8 9.6 -4 7 Z" />
      {/* the skull and the snout: one long wedge, heavier at the brow */}
      <path d="M1 -11.4 C10 -12 17.4 -9.4 21.4 -5.8 C25 -4.2 29 -2.2 32 0 C29 2.2 25 4.2 21.4 5.8 C17.4 9.4 10 12 1 11.4 C-6 11 -9.4 5.6 -9.4 0 C-9.4 -5.6 -6 -11 1 -11.4 Z" />
      {/* the jaw line, and the nostrils at the tip */}
      <g fill="var(--bg)">
        <path d="M21 -1 C25 -0.7 28.6 -0.4 31.4 0 C28.6 0.4 25 0.7 21 1 Z" />
        <circle cx="26" cy="-2.6" r="1.1" />
        <circle cx="26" cy="2.6" r="1.1" />
        {/* the eyes, high on the brow */}
        <ellipse cx="8" cy="-6.2" rx="3.1" ry="2.6" />
        <ellipse cx="8" cy="6.2" rx="3.1" ry="2.6" />
      </g>
    </g>
  );
}

/**
 * One link of the dragon's body. The links ride the orbit a few degrees apart, so the body
 * lies along the path by itself; `dream-wave` with a phase per link is what makes it slither,
 * and the odd pair of claws says which way is down.
 */
function DragonLink({ phase, claws = false, fins = false }: { phase: number; claws?: boolean; fins?: boolean }) {
  return (
    <g fill="currentColor" style={{ transformOrigin: "0px 0px", animation: loop("dream-wave", 1_300, `ease-in-out ${phase.toFixed(2)}s infinite`) }}>
      {claws ? (
        <g>
          <path d="M-1 -8 C-3 -13 -7 -16 -12 -17 C-11 -14 -9.4 -12 -8 -10 L-12 -12 L-9 -8.6 L-13 -9 L-8 -6 Z" />
          <path d="M-1 8 C-3 13 -7 16 -12 17 C-11 14 -9.4 12 -8 10 L-12 12 L-9 8.6 L-13 9 L-8 6 Z" />
        </g>
      ) : null}
      {/* fins every other link: a spine on every one turns the body into a caterpillar */}
      {fins ? (
        <>
          <path d="M3 -8 C-1 -14.4 -6 -18 -12 -19 C-8 -14.6 -5 -10.6 -4 -7 Z" />
          <path d="M3 8 C-1 14.4 -6 18 -12 19 C-8 14.6 -5 10.6 -4 7 Z" />
        </>
      ) : null}
      <ellipse cx="0" cy="0" rx="11.5" ry="8.6" />
      {/* the belly plate: a lighter band across the link, so the body is not one flat blob */}
      <ellipse cx="1" cy="0" rx="7" ry="5" fill="#ffffff" opacity="0.12" />
    </g>
  );
}

/** The tail: the body thins into a fin of flame. */
function DragonTail({ phase }: { phase: number }) {
  return (
    <g fill="currentColor" style={{ transformOrigin: "0px 0px", animation: loop("dream-wave", 1_300, `ease-in-out ${phase.toFixed(2)}s infinite`) }}>
      <path d="M8 0 C4 -5 -2 -8 -10 -9.6 C-5.4 -5.6 -3.4 -2.6 -3.4 0 C-3.4 2.6 -5.4 5.6 -10 9.6 C-2 8 4 5 8 0 Z" />
      <ellipse cx="9" cy="0" rx="6" ry="5" />
    </g>
  );
}

/** The monster from above: one soft lump under a crown of horns, both arms out after the runner. */
function MonsterTop(): ReactNode {
  return (
    <g fill="currentColor">
      {/* the arms reach forward and grab at the air */}
      <g style={{ transformOrigin: "0px 0px", animation: loop("dream-grab", 580, "ease-in-out infinite") }}>
        <path d="M8 -11 C15 -17 23 -18 28 -15 C29 -13.4 29 -12 28 -10.6 L31 -9 L26 -8.6 L28 -5.6 L24 -7.4 L23.6 -4 L21.6 -7.6 C18 -8.6 14 -7.4 10 -4.6 Z" />
        <path d="M8 11 C15 17 23 18 28 15 C29 13.4 29 12 28 10.6 L31 9 L26 8.6 L28 5.6 L24 7.4 L23.6 4 L21.6 7.6 C18 8.6 14 7.4 10 4.6 Z" />
      </g>
      {/* the horns, uneven on purpose — a lump that grew them, not a star */}
      <path d="M-2 -17 C-1 -23 1 -27 4 -29 C5 -24 5 -20 4 -16 Z" />
      <path d="M-13 -13 C-18 -17 -22 -19 -26 -19 C-23 -15 -20 -12 -16 -9 Z" />
      <path d="M12 -12 C16 -16 20 -18 24 -18 C21 -14 18 -11 15 -9 Z" />
      <path d="M-16 8 C-21 9 -25 12 -27 15 C-22 15 -18 14 -15 12 Z" />
      <path d="M0 18 C1 23 1 27 -1 30 C-4 26 -5 22 -5 18 Z" />
      {/* the lump itself */}
      <path d="M17 -3 C19 -11 13 -18 5 -19 C1 -23 -7 -23 -10 -18 C-18 -18 -22 -11 -20 -4 C-25 1 -22 9 -16 11 C-15 17 -7 21 -1 17 C5 21 13 18 15 11 C20 8 21 1 17 -3 Z" />
      {/* the face: three eyes with pupils, and a mouth full of teeth at the front */}
      <g fill="var(--bg)">
        <circle cx="7" cy="-6" r="4" />
        <circle cx="7" cy="6" r="4" />
        <circle cx="-4" cy="0" r="2.8" />
        <path d="M14.6 -6 C17 -3 17 3 14.6 6 C12.6 4.6 12 2.6 12 0 C12 -2.6 12.6 -4.6 14.6 -6 Z" />
      </g>
      <g fill="currentColor">
        <circle cx="8.4" cy="-6" r="1.7" />
        <circle cx="8.4" cy="6" r="1.7" />
        <circle cx="-3" cy="0" r="1.2" />
        {/* the teeth in that mouth */}
        <path d="M13 -4.4 L15.4 -3.4 L13 -2 Z" />
        <path d="M13 -0.8 L15.6 0 L13 1 Z" />
        <path d="M13 2.4 L15.4 3.6 L13 4.6 Z" />
      </g>
    </g>
  );
}

/** The rocket from above, the drop riding in the cockpit, the jet burning behind it. */
function RocketTop(): ReactNode {
  return (
    <g fill="currentColor">
      {/* the thrust: a jet that pulses out of the nozzle, a bright core inside it, and two
          puffs of exhaust that break off and fall behind */}
      <g style={{ transformOrigin: "-17px 0px", animation: loop("dream-thrust", 190, "ease-in-out infinite") }}>
        <path d="M-17 -7.2 C-24 -6.2 -30 -3.6 -39 0 C-30 3.6 -24 6.2 -17 7.2 Z" opacity="0.4" />
        <path d="M-17 -4.8 C-22 -4.2 -26.4 -2.4 -32 0 C-26.4 2.4 -22 4.2 -17 4.8 Z" />
        <path d="M-17 -2.2 C-19.6 -2 -22.4 -1.1 -26 0 C-22.4 1.1 -19.6 2 -17 2.2 Z" fill="#ffffff" opacity="0.3" />
      </g>
      {/* the exhaust breaks off the nozzle in puffs and falls behind */}
      <g opacity="0.5">
        <ellipse cx="-20" cy="0" rx="3.6" ry="3" style={{ transformOrigin: "-20px 0px", animation: loop("dream-puff", 620, "linear infinite") }} />
        <ellipse cx="-20" cy="0" rx="3" ry="2.6" style={{ transformOrigin: "-20px 0px", animation: loop("dream-puff", 620, "linear 0.31s infinite") }} />
      </g>
      {/* the fins, swept back off the tail */}
      <path d="M-4 -7 C-6 -12 -10 -16 -16 -18 C-17.4 -14 -17.4 -10 -16.4 -7 Z" />
      <path d="M-4 7 C-6 12 -10 16 -16 18 C-17.4 14 -17.4 10 -16.4 7 Z" />
      {/* the hull: a smooth nose cone over a straight body */}
      <path d="M31 0 C25 -4.6 18 -7.2 10 -7.6 L-13 -7.6 C-15.4 -7.6 -16.6 -6.2 -16.6 -4.6 L-16.6 4.6 C-16.6 6.2 -15.4 7.6 -13 7.6 L10 7.6 C18 7.2 25 4.6 31 0 Z" />
      {/* a band where the cone meets the body, cut out of the hull */}
      <path d="M13 -7.4 C14.6 -4.6 14.6 4.6 13 7.4 L10.4 7.5 C12 4.6 12 -4.6 10.4 -7.5 Z" fill="var(--bg)" opacity="0.5" />
      {/* the cockpit, open to the sky, with the dreamer in it */}
      <circle cx="-1" cy="0" r="8" fill="var(--bg)" />
      <circle cx="-1" cy="0" r="6" />
      <ellipse cx="0.6" cy="-2" rx="3" ry="1.6" fill="#ffffff" opacity="0.16" />
      <g fill="var(--bg)">
        <circle cx="1.4" cy="-2.4" r="1.7" />
        <circle cx="1.4" cy="2.4" r="1.7" />
      </g>
    </g>
  );
}

/**
 * A paper plane from above, the drop riding on the fold (D-82). It banks as it goes — seen from
 * above a bank is only the wings getting narrower — and leaves a dotted line behind it, the way
 * a flight is drawn on a map.
 */
function PlaneTop(): ReactNode {
  return (
    <g fill="currentColor">
      <g style={{ transformOrigin: "0px 0px", animation: loop("dream-bank", 1_600, "ease-in-out infinite") }}>
        {/* the wings: one dart, folded down the middle */}
        <path d="M30 0 L-18 -19 L-10 0 L-18 19 Z" />
        {/* the near half catches the light, the fold is a darker line */}
        <path d="M30 0 L-18 -19 L-12.5 -3.2 Z" fill="#ffffff" opacity="0.16" />
        <path d="M30 0 L-10 0" stroke="var(--bg)" strokeWidth="1.3" opacity="0.5" />
      </g>
      {/* the rider, sitting on the fold and looking where it goes */}
      <circle cx="-1" cy="0" r="7" stroke="var(--bg)" strokeWidth="1.6" />
      <ellipse cx="0.4" cy="-2.6" rx="3" ry="1.5" fill="#ffffff" opacity="0.18" />
      <g fill="var(--bg)">
        <circle cx="2.4" cy="-2.4" r="1.6" />
        <circle cx="2.4" cy="2.4" r="1.6" />
      </g>
    </g>
  );
}

/** One dot of the plane's line on the map: it rides the same flight, a moment behind. */
function TrailDot(): ReactNode {
  return <circle cx="0" cy="0" r="7" fill="currentColor" />;
}

/**
 * A bee from above: a striped body, a head with eyes, a sting, and two wings that are never
 * still. Each bee of the swarm hovers off the line on its own beat, so they read as a swarm
 * rather than a train.
 */
function BeeTop({ hover }: { hover: number }): ReactNode {
  return (
    <g style={{ transformOrigin: "0px 0px", animation: loop("dream-hover", Math.round((0.9 + hover * 0.23) * 1000), `ease-in-out ${(-hover * 0.31).toFixed(2)}s infinite`) }}>
      <g fill="currentColor">
        {/* the sting */}
        <path d="M-15 0 L-10 -2.4 L-10 2.4 Z" />
        {/* the body and its stripes */}
        <ellipse cx="-1" cy="0" rx="11" ry="8" />
        <g fill="var(--bg)" opacity="0.55">
          <rect x="-7" y="-7.4" width="2.6" height="14.8" rx="1.3" />
          <rect x="-1.2" y="-7.9" width="2.6" height="15.8" rx="1.3" />
        </g>
        {/* the head, with its eyes to the front */}
        <circle cx="11" cy="0" r="5.4" />
        <g fill="var(--bg)">
          <circle cx="13.2" cy="-2.2" r="1.3" />
          <circle cx="13.2" cy="2.2" r="1.3" />
        </g>
      </g>
      {/* the wings: a blur, beating far too fast to see */}
      <g fill="#ffffff" opacity="0.4">
        <ellipse cx="-2" cy="-9" rx="6.6" ry="4.2" style={{ transformOrigin: "-2px -5px", animation: BUZZ }} />
        <ellipse cx="-2" cy="9" rx="6.6" ry="4.2" style={{ transformOrigin: "-2px 5px", animation: BUZZ }} />
      </g>
    </g>
  );
}

/**
 * A flying saucer from above: the rim with its lights running round, the glass dome over the
 * pilot, and a ring pulsing out beneath it — the beam it is trying to catch the drop with.
 */
function UfoTop(): ReactNode {
  return (
    <g fill="currentColor">
      <circle cx="0" cy="0" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transformOrigin: "0px 0px", animation: loop("dream-beam", 1_400, "ease-out infinite") }} />
      {/* the rim, and the ring of lights running round it */}
      <circle cx="0" cy="0" r="20" />
      <circle cx="0" cy="0" r="20" fill="#ffffff" opacity="0.08" />
      <g fill="#ffffff">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={(Math.cos(a) * 15).toFixed(2)}
              cy={(Math.sin(a) * 15).toFixed(2)}
              r="1.8"
              style={{ animation: loop("dream-lights", 800, `linear ${(-(i / 8) * 0.8).toFixed(2)}s infinite`) }}
            />
          );
        })}
      </g>
      {/* the dome and the one who flies it */}
      <circle cx="0" cy="0" r="9" fill="var(--bg)" />
      <circle cx="0" cy="0" r="7.4" fill="#ffffff" opacity="0.12" />
      <ellipse cx="-2.6" cy="-3" rx="2.8" ry="1.5" fill="#ffffff" opacity="0.3" transform="rotate(-30 -2.6 -3)" />
      <g fill="currentColor">
        <circle cx="2" cy="-2.2" r="1.6" />
        <circle cx="2" cy="2.2" r="1.6" />
      </g>
    </g>
  );
}

/**
 * The Chinese dragon: a head and a body of links, each a few degrees further back on the same
 * orbit. Built tail first, so every link is painted under the one ahead of it and the head
 * ends up on top, the way scales overlap.
 */
function chineseDragon(): Actor[] {
  const links = 9;
  // one link every 34 ms: at flight speed that is about fourteen pixels, so the links overlap
  const step = 34;
  const body: Actor[] = [];
  for (let i = links - 1; i >= 0; i -= 1) {
    const size = 58 - i * 2.6;
    body.push({
      key: `link-${i}`,
      size,
      track: "chase",
      trail: 40 + i * step,
      figure: <DragonLink phase={-i * 0.16} claws={i === 1 || i === 5} fins={i % 2 === 0} />,
    });
  }
  return [
    { key: "tail", size: 34, track: "chase", trail: 40 + links * step, figure: <DragonTail phase={-links * 0.16} /> },
    ...body,
    { key: "head", size: 78, track: "chase", trail: 0, figure: <DragonHead /> },
  ];
}

/**
 * Every figure is drawn from above, nose to the right: the flight turns it into the direction
 * of travel, so what is drawn forward stays forward the whole way.
 */
const ACTORS: Record<DreamId, Actor[]> = {
  rocket: [{ key: "rocket", size: 82, track: "lead", trail: 0, figure: <RocketTop /> }],
  dragon: [{ key: "drop", size: 56, track: "lead", trail: 0, figure: <DropTop /> }, ...chineseDragon()],
  monster: [
    { key: "drop", size: 56, track: "lead", trail: 0, figure: <DropTop /> },
    { key: "monster", size: 84, track: "chase", trail: 0, figure: <MonsterTop /> },
  ],
  // the line on the map is drawn first, so the plane flies over its own dots
  plane: [
    // 150 ms apart at the flight's 390 px/s: a dot every ~60 px, smaller the older it is
    ...[4, 3, 2, 1].map((dot) => ({ key: `dot-${dot}`, size: 26 - dot * 2.5, track: "lead" as const, trail: dot * 150, figure: <TrailDot /> })),
    { key: "plane", size: 80, track: "lead", trail: 0, figure: <PlaneTop /> },
  ],
  // the swarm keeps close behind whoever leads it, each bee a beat after the one before
  bees: [
    { key: "drop", size: 56, track: "lead", trail: 0, figure: <DropTop /> },
    ...[3, 2, 1, 0].map((bee) => ({ key: `bee-${bee}`, size: 54 - bee * 4, track: "chase" as const, trail: bee * 130, figure: <BeeTop hover={bee} /> })),
  ],
  ufo: [
    { key: "drop", size: 56, track: "lead", trail: 0, figure: <DropTop /> },
    { key: "ufo", size: 80, track: "chase", trail: 0, figure: <UfoTop /> },
  ],
};

/**
 * The same figures with the drawing taken off: where each one is at any moment, and how much
 * room it takes. The waiting screen reads this to work out who the dream goes past (D-77) —
 * it needs the timing of the dragon's body, not its scales.
 */
export const TOUCHES: Record<DreamId, Touch[]> = Object.fromEntries(
  DREAMS.map((id) => [id, ACTORS[id].map(({ track, trail, size }) => ({ track, trail, size }))]),
) as Record<DreamId, Touch[]>;
