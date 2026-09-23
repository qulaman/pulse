"use client";

import { motion } from "framer-motion";

import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import type { DeskPhase, DeskScene } from "@/lib/errands/scene";

/** Drawn at this size and scaled to what the screen asks for — the same trick as MascotLever. */
const BASE = 128;
const SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

/**
 * The middle of the secretary's Лента (D-87): the secretary's own face instead of «Капля».
 * Tap only, like every employee's face — a tap wakes the balls, the same as in anybody's
 * Лента; the requests themselves are answered on the cards under it.
 */
export function SecretaryFace({
  scene,
  phase,
  size,
  wakeKey,
  talking,
  bare,
  label,
  onTap,
}: {
  scene: DeskScene | null;
  phase: DeskPhase;
  size: number;
  /** bumped when the face is tapped awake: a one-shot stretch */
  wakeKey: number;
  talking: boolean;
  /** the balls are out: no room and no job, the face only talks */
  bare: boolean;
  label: string;
  onTap: () => void;
}) {
  return (
    <motion.div layout className="relative flex items-center justify-center" style={{ width: BASE + 24, height: BASE + 24 }} transition={SPRING}>
      <motion.div initial={false} animate={{ scale: size / BASE }} transition={SPRING} className="flex items-center justify-center">
        <button
          type="button"
          onClick={onTap}
          aria-label={label}
          data-testid="secretary-face"
          data-phase={phase}
          data-scene={scene ?? "none"}
          // press answers in the same frame as the finger (DESIGN §2: press = scale only)
          className="relative flex items-center justify-center rounded-full transition-transform duration-[120ms] ease-out active:scale-[0.97]"
          style={{ width: BASE + 24, height: BASE + 24, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        >
          <span
            key={wakeKey}
            className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]"
            style={{ animation: wakeKey > 0 ? "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "none" }}
          >
            <SecretaryMascot scene={scene} phase={phase} talking={talking} bare={bare} size={BASE} />
          </span>
        </button>
      </motion.div>
    </motion.div>
  );
}
