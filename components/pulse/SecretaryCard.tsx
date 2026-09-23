"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { SecretaryPanel } from "@/components/secretary/SecretaryPanel";
import type { Errand, SecretaryPerson } from "@/lib/errands/queries";
import { isAway, untilLine } from "@/lib/errands/scene";
import { firstNameOf } from "@/lib/text/normalize";
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
  thanks = false,
  secretaries,
  meetingEndsAt = null,
  onClose,
}: {
  names: string;
  actions: readonly SecretaryAction[];
  errands: readonly Errand[];
  now: Date;
  onRefresh: () => void;
  /** «Спасибо ♥» for what was just closed — after the adaptation gate (D-40, D-97) */
  thanks?: boolean;
  /** who is at the desk (D-99): the header says it, the panel warns when nobody is */
  secretaries?: readonly SecretaryPerson[];
  meetingEndsAt?: string | null;
  onClose: () => void;
}) {
  // The card hangs over the face and must never slide under the app header. When the room
  // above the face is too short for every button (a 667-px iPhone SE with six buttons), the
  // card comes down over the face instead of hiding a row behind a scroll nobody sees
  // (D-87); only a card taller than the whole screen between the header and the tab bar
  // scrolls. Measured off the wrapper, which does not move — the card itself is mid-spring.
  const self = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ max: number; shift: number } | null>(null);
  useEffect(() => {
    const anchor = self.current?.parentElement;
    const inner = box.current;
    const list = scroller.current;
    if (!anchor || !inner || !list) return;
    const measure = () => {
      const header = document.querySelector("header");
      const top = (header ? header.getBoundingClientRect().bottom : 0) + 12;
      const bar = [...document.querySelectorAll("nav")].find((nav) => nav.getBoundingClientRect().top > window.innerHeight / 2);
      const bottom = (bar ? bar.getBoundingClientRect().top : window.innerHeight) - 12;
      const above = anchor.getBoundingClientRect().bottom - top;
      // the card's own height with nothing capped: what is shown plus what would scroll
      const natural = inner.offsetHeight - list.clientHeight + list.scrollHeight;
      const max = Math.max(180, Math.floor(bottom - top));
      const shift = Math.max(0, Math.ceil(Math.min(natural, max) - above));
      setFit((prev) => (prev && prev.max === max && prev.shift === shift ? prev : { max, shift }));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    // a pending «отправляю…» row or a live errand makes the card taller
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  const shift = fit?.shift ?? 0;

  return (
    <div ref={self} style={{ transform: shift ? `translateY(${shift}px)` : undefined, transition: "transform 200ms var(--ease-out)" }}>
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.9 }}
      // the look first, the buttons after it: the delay is the two faces turning
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 30, delay: 0.34 } }}
      exit={{ opacity: 0, y: 14, scale: 0.94, transition: { duration: 0.16 } }}
      style={{ transformOrigin: "80% 100%" }}
      className="pointer-events-auto relative w-[min(92vw,360px)]"
      data-testid="secretary-card"
    >
      <div
        ref={box}
        className="status-screen flex flex-col rounded-[20px] p-3"
        style={{ "--tone": "var(--accent-2)", maxHeight: fit?.max } as CSSProperties}
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
            <span className="block truncate text-[13px] leading-[18px] text-muted" data-testid="secretary-presence">
              {secretaries && secretaries.length > 0
                ? secretaries.map((person, index) => (
                    <span key={person.id}>
                      {index > 0 ? ", " : ""}
                      {firstNameOf(person.full_name)}
                      {isAway(person, now) ? (
                        <span style={{ color: "var(--warn)" }}> · не на месте {untilLine(person.away_until as string)}</span>
                      ) : null}
                    </span>
                  ))
                : names}
            </span>
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
        <div ref={scroller} className="no-bar min-h-0 flex-1 overflow-y-auto">
          <SecretaryPanel
            actions={actions}
            errands={errands}
            now={now}
            onRefresh={onRefresh}
            compact
            thanks={thanks}
            secretaries={secretaries}
            meetingEndsAt={meetingEndsAt}
            // the request is given: the card goes, the desk plays the rest
            onSent={onClose}
          />
        </div>
      </div>
      {/* the tail, towards the desk on the right of the face — gone while the card has come
          down over the face: it would point into it */}
      {shift === 0 ? (
        <span
          aria-hidden
          className="absolute top-full block h-3 w-3 -translate-y-1.5 rotate-45 border-b border-r"
          style={{ left: "78%", background: "var(--surface)", borderColor: "color-mix(in srgb, var(--border) 80%, white 6%)" }}
        />
      ) : null}
    </motion.div>
    </div>
  );
}
