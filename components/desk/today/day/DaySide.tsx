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
 * The right side of «Сегодня» (D-196): «Сейчас» on top, the quiet strip, the day's figures, then
 * two stacks fixed in code — «Вам» and the company's «Лента дня». Data never moves a block to the
 * other stack: a block that grows pushes only its own neighbours down. One column under a
 * 1560-px container, the same order (app/desk/today.css). The first showing in a tab plays one
 * wave; three minutes without a hand put what rings for ever to sleep.
 */
export function DaySide({
  band,
  quiet,
  figures,
  you,
  company,
}: {
  band: readonly { key: string; node: ReactNode }[];
  quiet: readonly QuietItem[];
  figures: readonly ReactNode[];
  you: readonly ReactNode[];
  company: ReactNode;
}) {
  const arrive = useFirstArrival();
  const asleep = useDeepRest();
  return (
    <div className="day-side" data-arrive={arrive ? "" : undefined} data-asleep={asleep ? "" : undefined} data-testid="today-day">
      <div className="day-now">
        <AnimatePresence initial={false}>
          {band.map((item) => (
            <motion.div key={item.key} {...BAND} className="day-now-item">
              {item.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <QuietStrip items={quiet} />
      {figures.length > 0 ? <div className="day-figures">{figures}</div> : null}
      <div className="day-stacks">
        <div className="day-stack" data-stack="you">
          {you}
        </div>
        <div className="day-stack" data-stack="company">
          {company}
        </div>
      </div>
    </div>
  );
}
