"use client";

import { motion } from "motion/react";
import { memo, useRef, type CSSProperties, type ReactNode } from "react";

import { springs } from "@/lib/design/tokens";

import { Assistant, type AssistantLine } from "./Assistant";
import { LocalPresence } from "./LocalPresence";
import { recede } from "./PanelCard";
import { useBandGlide } from "./useBandGlide";

/** The face's spring on a mode change: the words ride it with the face and the cards (D-60, D-166). */
const BAND_SPRING = springs.object;
/** The words step aside while a thought floats up over them (D-178). */
const ASIDE = { opacity: 0, pointerEvents: "none" } as const;
/** The face dozing off takes its words with it in a short fade, not in one frame. */
const FADE_AWAY = { opacity: 0, transition: { duration: 0.15, ease: "easeOut" } } as const;

type Props = {
  /** there is something to say: the words come, and go in a short fade */
  show: boolean;
  /** the director's own words over the answer (Пульс) */
  said?: string | null;
  lines: AssistantLine[];
  /** the ways out of an answer, under the words (Пульс) */
  buttons?: ReactNode;
  /** a thought floats up over the words: they step aside while it is up (D-178) */
  aside: boolean;
  /** Пульс: the director is speaking, the words step back (D-166). Left out on Лента, which has no microphone */
  receded?: boolean;
  /** Лента at rest: the words keep clear of what the face holds up over its head (D-173) */
  roomy?: boolean;
  /** the secretary's lamp and the day's count laid over the top of the screen */
  topInset?: number;
};

/**
 * Above the head: what the assistant says, on Пульс and on Лента (D-60, D-62). A mode change moves
 * the band's edge by up to 110 px: the words glide there on the face's spring instead of jumping in
 * one frame — and are not cut off by the band's new edge on the way (`useBandGlide`).
 *
 * Its own memoised part (D-178): a tap re-renders the screen, and the words only when they change.
 * The lines are compared by what they say — the screen builds a new list for the same words.
 */
function SaidBandView({ show, said = null, lines, buttons = null, aside, receded, roomy = false, topInset = 0 }: Props) {
  const band = useRef<HTMLDivElement>(null);
  const glide = useBandGlide(band);
  const style: CSSProperties =
    receded === undefined
      ? { ...(topInset ? { paddingTop: 8 + topInset } : null), transition: "opacity 360ms var(--ease-out)", ...(aside ? ASIDE : null) }
      : { ...recede(receded, { scale: false }), ...(aside ? ASIDE : null) };
  return (
    <motion.div ref={band} layoutScroll className="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto" data-band="said">
      <motion.div layout="position" transition={BAND_SPRING} {...glide} className={`mt-auto pt-2 ${roomy ? "pb-8" : "pb-3"}`} style={style}>
        <LocalPresence initial={false}>
          {show ? (
            <motion.div key="said" exit={FADE_AWAY}>
              <Assistant said={said} lines={lines}>
                {buttons}
              </Assistant>
            </motion.div>
          ) : null}
        </LocalPresence>
      </motion.div>
    </motion.div>
  );
}

function sameLines(a: AssistantLine[], b: AssistantLine[]): boolean {
  return a === b || (a.length === b.length && a.every((line, i) => line.id === b[i]!.id && line.text === b[i]!.text && line.tone === b[i]!.tone));
}

export const SaidBand = memo(SaidBandView, (prev, next) => {
  for (const key of Object.keys({ ...prev, ...next }) as (keyof Props)[]) {
    if (key === "lines" ? !sameLines(prev.lines, next.lines) : !Object.is(prev[key], next[key])) return false;
  }
  return true;
});
