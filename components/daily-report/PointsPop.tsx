"use client";

import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useEffect, useState } from "react";

import { haptic } from "@/lib/haptics";
import { pluralRu } from "@/lib/tasks/status-text";

export type Pop = { key: number; amount: number };

const SHOW_MS = 1600;

/**
 * Game feel of the report (принцип 1a): «+1 очко» in gold rises from the button that sent it
 * and melts away — after the data is written, over everything, taking no taps. One per new
 * `pop.key`; transform and opacity only, still under «уменьшить движение».
 */
export function PointsPop({ pop }: { pop: Pop | null }) {
  const [shown, setShown] = useState<Pop | null>(null);
  const [seen, setSeen] = useState<number | null>(null);
  if (pop && pop.key !== seen) {
    setSeen(pop.key);
    setShown(pop);
  }

  const shownKey = shown?.key ?? null;
  useEffect(() => {
    if (shownKey === null) return;
    haptic([12, 60, 18]);
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [shownKey]);

  return (
    <MotionConfig reducedMotion="user">
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-full z-[6] flex justify-center">
        <AnimatePresence>
          {shown ? (
            <motion.span
              key={shown.key}
              data-testid="points-pop"
              initial={{ opacity: 0, y: 14, scale: 0.8 }}
              animate={{ opacity: 1, y: -10, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24 } }}
              exit={{ opacity: 0, y: -34, transition: { duration: 0.4, ease: [0.4, 0, 1, 1] } }}
              className="nums mb-2 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[15px] font-semibold leading-5"
              style={{ background: "color-mix(in srgb, var(--gold) 18%, var(--surface))", color: "var(--gold)" }}
            >
              {/* the coin turns once on its way up */}
              <motion.span
                aria-hidden
                initial={{ rotateY: 0 }}
                animate={{ rotateY: 360, transition: { duration: 0.6, delay: 0.1 } }}
                className="inline-block h-3.5 w-3.5 rounded-full"
                style={{ background: "var(--gold)", boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--bg) 25%, transparent)" }}
              />
              +{shown.amount} {pluralRu(shown.amount, ["очко", "очка", "очков"])}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
