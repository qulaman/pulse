"use client";

import { motion } from "framer-motion";

import { SecretaryMascot, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import type { Daypart, DeskPhase, DeskScene, Urgency } from "@/lib/errands/scene";

/** Drawn at this size and scaled to what the screen asks for — the same trick as MascotLever. */
const BASE = 128;
const SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

/**
 * The middle of the secretary's Лента (D-87, D-97): the secretary's own face instead of
 * «Капля». A tap wakes the balls as in anybody's Лента — except while a request is calling:
 * then the face itself is the biggest «Принял» on the screen (the screen decides, `onTap`).
 */
export function SecretaryFace({
  scene,
  phase,
  size,
  wakeKey,
  talking,
  bare,
  label,
  act,
  urgency,
  queue,
  daypart,
  cheer,
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
  act: SecretaryAct | null;
  urgency: Urgency;
  queue: number;
  daypart: Daypart;
  cheer: boolean;
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
          data-act={act ?? undefined}
          // press answers in the same frame as the finger (DESIGN §2: press = scale only)
          className="relative flex items-center justify-center rounded-full transition-transform duration-[120ms] ease-out active:scale-[0.97]"
          style={{ width: BASE + 24, height: BASE + 24, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        >
          <span
            key={wakeKey}
            className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]"
            style={{ animation: wakeKey > 0 ? "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "none" }}
          >
            <SecretaryMascot
              scene={scene}
              phase={phase}
              talking={talking}
              bare={bare}
              size={BASE}
              act={act}
              urgency={urgency}
              queue={queue}
              daypart={daypart}
              cheer={cheer}
            />
          </span>
        </button>
      </motion.div>
    </motion.div>
  );
}
