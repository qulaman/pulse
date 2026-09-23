"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { SecretaryPanel } from "@/components/secretary/SecretaryPanel";
import type { Errand } from "@/lib/errands/queries";
import type { SecretaryAction } from "@/lib/settings";

/**
 * The errand buttons over the face (D-85) — what the ball «Секретарь» used to open, now asked
 * of the secretary at the desk. It comes out a beat after the tap, once the two faces have
 * turned to each other: the director asks through the assistant, and the card is that ask.
 * The tail points down at the desk, to the right of the big face.
 */
export function SecretaryCard({
  names,
  actions,
  errands,
  now,
  onRefresh,
  onClose,
}: {
  names: string;
  actions: readonly SecretaryAction[];
  errands: readonly Errand[];
  now: Date;
  onRefresh: () => void;
  onClose: () => void;
}) {
  // The card hangs over the face and must never slide under the app header: its height is
  // capped by the room between the two, and what does not fit scrolls inside the card. The
  // room is read off the wrapper, which does not move — the card itself is mid-spring.
  const self = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const anchor = self.current?.parentElement;
    if (!anchor) return;
    const measure = () => {
      const header = document.querySelector("header");
      const top = header ? header.getBoundingClientRect().bottom : 0;
      setRoom(Math.max(180, Math.floor(anchor.getBoundingClientRect().bottom - top - 12)));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <motion.div
      ref={self}
      initial={{ opacity: 0, y: 22, scale: 0.9 }}
      // the look first, the buttons after it: the delay is the two faces turning
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 30, delay: 0.34 } }}
      exit={{ opacity: 0, y: 14, scale: 0.94, transition: { duration: 0.16 } }}
      style={{ transformOrigin: "80% 100%" }}
      className="pointer-events-auto relative w-[min(90vw,340px)]"
      data-testid="secretary-card"
    >
      <div
        className="status-screen flex flex-col rounded-[20px] p-3.5"
        style={{ "--tone": "var(--accent-2)", maxHeight: room ?? undefined } as CSSProperties}
      >
        <div className="mb-3 flex shrink-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2/80"
            style={{ "--accent": "color-mix(in srgb, var(--accent-2) 82%, var(--surface-2))" } as CSSProperties}
          >
            <Mascot state="calm" size={30} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Секретарь</span>
            <span className="block truncate text-[13px] leading-[18px] text-muted">{names}</span>
          </span>
          <button
            type="button"
            aria-label="Закрыть"
            data-testid="secretary-close"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full text-[20px] leading-none text-muted transition-colors duration-[120ms] active:bg-white/[0.06]"
          >
            ×
          </button>
        </div>
        <div className="no-bar min-h-0 flex-1 overflow-y-auto">
          <SecretaryPanel actions={actions} errands={errands} now={now} onRefresh={onRefresh} compact />
        </div>
      </div>
      {/* the tail, towards the desk on the right of the face */}
      <span
        aria-hidden
        className="absolute top-full block h-3 w-3 -translate-y-1.5 rotate-45 border-b border-r"
        style={{ left: "78%", background: "var(--surface)", borderColor: "color-mix(in srgb, var(--border) 80%, white 6%)" }}
      />
    </motion.div>
  );
}
