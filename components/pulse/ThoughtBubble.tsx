"use client";

import { motion } from "framer-motion";

import type { SpeechTone } from "@/lib/pulse/board";

/** The full face; a smaller one (a panel open) lets the thought down by the difference. */
const FACE = 128;
/** The face's own spring when it grows or shrinks: the thought follows it on the same one. */
const FACE_SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

const TONE_COLOR: Record<SpeechTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

/**
 * A thought above the face (D-60): a change on the board — «Марат: задача «…» сдана» —
 * as a cloud with a trail of small circles down to the head. It pops in, hangs for a
 * while and fades; a tap sends it away sooner. Rendered inside the face's box, so it
 * follows the face wherever the layout puts it.
 */
export function ThoughtBubble({
  text,
  tone,
  faceSize,
  onDismiss,
  onOpen,
  openLabel = "открыть переписку",
}: {
  text: string;
  tone?: SpeechTone;
  faceSize: number;
  onDismiss: () => void;
  /** The thought is about a thread: a tap opens it instead of dismissing (D-64 §5). */
  onOpen?: () => void;
  /** what `onOpen` opens, for the screen reader — on Лента the ball the thought is about (D-110) */
  openLabel?: string;
}) {
  const color = tone ? TONE_COLOR[tone] : "var(--text-muted)";
  // the face grows and shrinks with the mode: the thought follows it — as a transform, the old
  // transition of `bottom` laid the screen out again on every frame of it
  const drop = (FACE - faceSize) / 2;
  return (
    <motion.button
      type="button"
      onClick={onOpen ?? onDismiss}
      aria-label={onOpen ? `Мысль ассистента, тап — ${openLabel}` : "Мысль ассистента, тап — убрать"}
      initial={{ opacity: 0, scale: 0.85, y: drop + 8 }}
      animate={{ opacity: 1, scale: 1, y: drop }}
      exit={{ opacity: 0, scale: 0.9, y: drop + 4, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 22, y: FACE_SPRING }}
      className="absolute left-1/2 z-10 w-[min(88vw,320px)] -translate-x-1/2 text-left"
      style={{ bottom: `calc(50% + ${FACE / 2 + 26}px)`, transformOrigin: "60% 100%" }}
      data-testid="thought"
    >
      <span
        className="relative block rounded-[22px] border border-border bg-surface px-4 py-3 text-[15px] leading-5 text-text"
        style={{ boxShadow: "var(--shadow-raised)" }}
      >
        <span aria-hidden className="absolute left-3 top-[13px] h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="block pl-4">{text}</span>
      </span>
      {/* the trail: two circles down to the head, the thought's tail */}
      <span aria-hidden className="absolute left-[58%] top-full mt-1 h-3 w-3 rounded-full border border-border bg-surface" />
      <span aria-hidden className="absolute left-[54%] top-full mt-[18px] h-2 w-2 rounded-full border border-border bg-surface" />
    </motion.button>
  );
}
