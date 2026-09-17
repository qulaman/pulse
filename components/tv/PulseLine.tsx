"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Живая линия кардиомонитора из марки продукта: едет через пустую середину шапки, пока
 * экран стоит на стене. Ничего не измеряет — это дыхание экрана, чтобы кабинет не
 * выглядел приборной панелью в тишине.
 *
 * Перф-контракт тот же, что у маскота: один SVG, анимация только на transform, ничего
 * на filter и box-shadow — экран живёт сутками (docs/FRONTEND.md «Appliance-чеклист»).
 */

/** Один период: ровный участок, зубец, ровный участок. */
const BEAT = "0,20 12,20 15,20 17,9 20,31 23,15 26,20 30,20 40,20";

export function PulseLine({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div aria-hidden className={`overflow-hidden ${className}`}>
      <motion.svg
        viewBox="0 0 80 40"
        preserveAspectRatio="none"
        className="h-full w-[200%]"
        initial={{ x: "0%" }}
        animate={reduced ? undefined : { x: "-50%" }}
        transition={{ duration: 22, ease: "linear", repeat: Infinity }}
      >
        {/* два периода подряд: на стыке шва не видно, потому что линия там ровная */}
        {[0, 40].map((shift) => (
          <polyline
            key={shift}
            points={BEAT}
            transform={`translate(${shift} 0)`}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.5"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </motion.svg>
    </div>
  );
}
