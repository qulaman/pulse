"use client";

import { LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";

import { FlightTargetProvider, type FlightTarget } from "@/components/feed/FlightTarget";
import { LocalPresence } from "@/components/pulse/LocalPresence";
import { BALL_H } from "@/components/pulse/OrbitBalls";
import { PANEL_GROW, PanelCard } from "@/components/pulse/PanelCard";
import { ThoughtBubble } from "@/components/pulse/ThoughtBubble";
import type { SpeechTone } from "@/lib/pulse/board";

import { BAND_SPRING, OVER_RING, ROW_GAP, type Mode } from "./stage";

export type StageThought = {
  id: string;
  text: string;
  tone?: SpeechTone;
  onDismiss: () => void;
  /** a tap on the thought opens what it is about; none — it only goes away */
  onOpen?: () => void;
  openLabel?: string;
};

export type StageCard = {
  open: boolean;
  /** the open ball: another ball changes what is in the card, not the card */
  panel: string;
  label: string;
  receded: boolean;
  onClose: () => void;
  body: ReactNode;
  /** false — a card remembered open stands where it was left, no rise (D-167, D-178) */
  initial?: boolean;
};

type Props = {
  mode: Mode;
  /** the face's box (`faceBox`): its middle never moves */
  box: number;
  faceSize: number;
  /** above the head: what the face says (SaidBand) */
  words: ReactNode;
  /** inside the face's box: the waiting screen, the face, and what stands round it */
  face: ReactNode;
  /** over the head, one at a time */
  thought: StageThought | null;
  /** under the face, above the band's own lines (Лента: the face's button, «+N», the secretary's line) */
  underFace?: ReactNode;
  /** the band's own lines while no card is open */
  band: ReactNode;
  card: StageCard;
  /** the cards band's share of the screen while no card is open (a crowded phrase on Пульс) */
  grow?: number;
  /** a phrase in hand: the band glides by CSS (D-146) */
  gliding?: boolean;
  crowded?: boolean;
  /** laid over the screen, out of the flow (the secretary's lamp and tally) */
  top?: ReactNode;
  /** cards taken in hand fly into the face (Лента, D-167) */
  flight?: FlightTarget;
  /** after the stage: the hint at the bottom, the sheets */
  children?: ReactNode;
};

/**
 * The home screen's three bands, and the middle one never moves: the face sits in the centre of the
 * screen in every mode, what it says grows upwards above it and the cards downwards under it. The
 * bands scroll inside themselves, so the page itself is always one screen — no scrollbar appearing
 * and disappearing on a tap (D-60). `data-board` stops the shell growing with its content
 * (globals.css), as in the skeleton, so the face stands where the skeleton had it. Clipped sideways
 * only: an open ball's card reaches down under the floating tab bar to the screen's edge (D-166,
 * D-167) — the shell is one screen high, so nothing below it can scroll. `relative`: a leaving card
 * is popped out in place against the board, not against a band that moves.
 */
export function HomeStage({ mode, box, faceSize, words, face, thought, underFace, band, card, grow = 1, gliding = false, crowded, top, flight, children }: Props) {
  const stage = (
    <LayoutGroup>
      {words}

      <div className="relative flex shrink-0 flex-col items-center">
        {/* The box changes size with the mode, but its middle never moves (the bands around it are
            equal; under a crowded phrase they glide by CSS, not by framer), so it is not animated:
            a layout animation of it was a pure scale, and it squashed everything inside without a
            `layout` of its own — the team came in twice too big when the face fell asleep, a
            thought's text zoomed. The face animates its own size. */}
        <div className="relative flex items-center justify-center" style={{ width: box, height: box }}>
          {face}
          {/* one thought at a time: a new one comes once the old has left; over the ring it
              floats above the orbit, clear of the balls and their taps (D-178) */}
          <LocalPresence mode="wait">
            {thought ? (
              <ThoughtBubble
                key={thought.id}
                text={thought.text}
                tone={thought.tone}
                faceSize={faceSize}
                rise={mode === "ring" ? OVER_RING : undefined}
                onDismiss={thought.onDismiss}
                onOpen={thought.onOpen}
                openLabel={thought.openLabel}
              />
            ) : null}
          </LocalPresence>
        </div>
      </div>

      {/* under the head: the cards — or, with a ball open, the ball's card up from the bottom edge
          (D-166, D-167) under the row of balls. The row is drawn round the face and travels with it
          (D-178); here it has only its room, outside the card and the scroller.
          A ball's card takes its room at once: the face, the words, the balls and a thought glide
          from where they stood by transform (their framer `layout`), while the card comes up on
          the compositor. Glided by CSS, the band resized the frosted card every frame of that.
          A phrase in hand glides it by CSS (D-146) — in, and out while the face throws it; a
          phrase dropped gives the room back at once, the face gliding by its `layout`. */}
      <div
        className={`flex min-h-0 flex-1 flex-col${gliding ? " transition-[flex-grow] duration-300 ease-out" : ""}`}
        style={{ flexGrow: card.open ? PANEL_GROW : grow }}
        data-band="cards"
        data-crowded={crowded ? "" : undefined}
      >
        {underFace}
        {card.open ? (
          // the row of balls is drawn round the face (it travels with it): here only its room
          <div aria-hidden className="w-full shrink-0" style={{ height: ROW_GAP + BALL_H + 8 }} />
        ) : (
          // the band's top moves with the mode, as the words' bottom does: the cards glide with it
          <motion.div layout="position" layoutScroll transition={BAND_SPRING} className="no-bar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pt-2">
            {band}
          </motion.div>
        )}
        {/* popLayout: the leaving card is popped out where it stood against the board and slides
            down from there, while the face, the balls and the band below already take their places */}
        <LocalPresence mode="popLayout" initial={card.initial}>
          {card.open ? (
            <PanelCard key="card" panelKey={card.panel} receded={card.receded} label={card.label} onClose={card.onClose}>
              {card.body}
            </PanelCard>
          ) : null}
        </LocalPresence>
      </div>
    </LayoutGroup>
  );

  return (
    <main
      className="relative mx-auto flex w-full min-h-0 max-w-lg flex-1 flex-col overflow-x-clip overflow-y-visible px-4"
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
      data-board=""
    >
      {top}
      {flight ? <FlightTargetProvider {...flight}>{stage}</FlightTargetProvider> : stage}
      {children}
    </main>
  );
}
