"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { PulseMark } from "@/components/brand/PulseMark";

export type ArrivalBrand = { name: string; logoUrl: string | null; accent: string };

/** The whole pass: the product's mark gives way, the company arrives in its own colour. */
const DURATION_MS = 700;

/**
 * «Из продукта — в свою компанию» (D-135): the code told the server whose company this is, and
 * the screen shows it on the way in — the product's mark shrinks away, the company's logo and
 * name come up in the company's accent. The session is already set when this plays, nothing
 * waits on it (principle 1a); under «уменьшить движение» the app simply opens.
 */
export function Arrival({ from, to, onDone }: { from: { name: string }; to: ArrivalBrand; onDone: () => void }) {
  const reduce = useReducedMotion();
  // the parent re-renders while this plays: the timer must not restart with a new callback
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => latest.current(), reduce ? 0 : DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  if (reduce) return null;
  const sameBrand = from.name === to.name && to.name === "Pulse";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-bg"
      style={{ "--arrival": to.accent } as CSSProperties}
      data-testid="login-arrival"
      aria-live="polite"
    >
      <motion.div
        className="pointer-events-none absolute h-[140vmax] w-[140vmax] rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--arrival) 34%, transparent) 0%, transparent 60%)" }}
        initial={{ scale: 0.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
      {sameBrand ? null : (
        <motion.div
          className="absolute"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 1, 1] }}
        >
          <PulseMark size="lg" />
        </motion.div>
      )}
      <motion.div
        className="relative flex flex-col items-center gap-3"
        initial={{ scale: 0.82, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: sameBrand ? 0 : 0.18, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {to.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
          <img src={to.logoUrl} alt="" className="h-16 max-w-[220px] object-contain" />
        ) : null}
        <span className="font-display text-[26px] font-bold leading-8 tracking-[-0.02em]" style={{ color: to.logoUrl ? undefined : "var(--arrival)" }}>
          {to.name}
        </span>
      </motion.div>
    </div>
  );
}
