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
  children,
}: {
  /** the moment (or the launch, or the queue's failure): the column's first card */
  head: ReactNode;
  quiet: readonly QuietItem[];
  band: readonly { key: string; node: ReactNode }[];
  children: ReactNode;
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
      {children}
    </div>
  );
}
