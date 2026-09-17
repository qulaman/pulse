"use client";

import { motion } from "framer-motion";

import type { SpeechTone } from "@/lib/pulse/board";

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
}: {
  text: string;
  tone?: SpeechTone;
  faceSize: number;
  onDismiss: () => void;
  /** The thought is about a thread: a tap opens it instead of dismissing (D-64 §5). */
  onOpen?: () => void;
}) {
  const color = tone ? TONE_COLOR[tone] : "var(--text-muted)";
  return (
    <motion.button
      type="button"
      onClick={onOpen ?? onDismiss}
      aria-label={onOpen ? "Мысль ассистента, тап — открыть переписку" : "Мысль ассистента, тап — убрать"}
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 4, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="absolute left-1/2 z-10 w-[min(88vw,320px)] -translate-x-1/2 text-left"
      style={{ bottom: `calc(50% + ${faceSize / 2 + 26}px)`, transformOrigin: "60% 100%" }}
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
