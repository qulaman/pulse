"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { useDeepRest } from "@/lib/useDeepRest";

import { useFirstArrival } from "./kit";
import { QuietStrip, type QuietItem } from "./QuietStrip";

/** A card of «Сейчас» comes by unfolding its height; it leaves the same way, faster. */
const BAND = {
  initial: { height: 0, opacity: 0, y: -8 },
  animate: {
    height: "auto",
    opacity: 1,
    y: 0,
    transition: { height: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.2, delay: 0.05 }, y: { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] } },
  },
  exit: { height: 0, opacity: 0, transition: { height: { duration: 0.18, ease: [0.4, 0, 1, 1] }, opacity: { duration: 0.12 } } },
} as const;

/**
 * «Сегодня» as one column (D-196): every card of the screen one under another across the
 * page's full width — the moment, the quiet strip, «Сейчас», then the cards in the screen's order (TodayScreen).
 * Data never reorders the cards: a card that grows pushes the ones under it down. The first showing
 * in a tab plays one wave down the column; three minutes without a hand put what rings for ever to
 * sleep (app/desk/today.css).
 */
export function DayColumn({
  head,
  quiet,
  band,
  work,
  pult,
  people,
  yours,
  figures,
  feed,
}: {
  /** the moment (or the launch, or the queue's failure): the column's first card */
  head: ReactNode;
  quiet: readonly QuietItem[];
  band: readonly { key: string; node: ReactNode }[];
  /** the director's own lists: just sent, decisions, attention, overdue */
  work: ReactNode;
  pult: ReactNode;
  people: ReactNode;
  /** the day's own words and hours: messages, meetings and deadlines */
  yours: ReactNode;
  figures: ReactNode;
  feed: ReactNode;
}) {
  const arrive = useFirstArrival();
  const asleep = useDeepRest();
  return (
    <div className="day-side" data-arrive={arrive ? "" : undefined} data-asleep={asleep ? "" : undefined} data-testid="today-day">
      {head}
      <QuietStrip items={quiet} />
      <div className="day-now">
        <AnimatePresence initial={false}>
          {band.map((item) => (
            <motion.div key={item.key} {...BAND} className="day-now-item">
              {item.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* one column in the screen's order; on a wide monitor the day's words, figures and feed stand
          beside the work as a second column, so a row never runs the width of the monitor (D-214) */}
      <div className="day-cols">
        <div className="day-main">
          <div className="day-slot" data-slot="work">
            {work}
          </div>
          <div className="day-slot" data-slot="pult">
            {pult}
          </div>
          <div className="day-slot" data-slot="people">
            {people}
          </div>
        </div>
        <div className="day-aside">
          <div className="day-slot" data-slot="yours">
            {yours}
          </div>
          <div className="day-slot" data-slot="figures">
            {figures}
          </div>
          <div className="day-slot" data-slot="feed">
            {feed}
          </div>
        </div>
      </div>
    </div>
  );
}
