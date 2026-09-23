"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { initialsOf } from "@/lib/people/queries";
import { useComposeStore } from "@/lib/store/compose";
import { useIngestStore } from "@/lib/store/ingest";
import { elapsedSince } from "@/lib/voice/stages";

/** Somebody picked on the waiting screen: who, how to address them, and where their circle is. */
export type Picked = {
  id: string;
  /** full name from the roster */
  name: string;
  /** «Динаре, » — goes in front of what the director says */
  address: string;
  /** where the circle is, px from the middle of the face — the face looks there */
  x: number;
  y: number;
};

const MIC = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

const KEYS = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="6" width="18" height="12" rx="2.5" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </svg>
);

/**
 * The card over the face when a circle of the waiting screen is picked (D-84): the face has
 * turned to that person, and the ways to give them a task come out right over its head —
 * «Записать» (a tap starts, «Готово» stops), «Текстом», or simply hold the face as always.
 * Whichever way, the person rides along by id: the parser never has to guess who it is for.
 *
 * The card follows the pipeline: it shows its own timer while it records, steps aside for the
 * face's caption while the face is held, and leaves when the phrase goes to the parser.
 */
export function PickCard({ picked, held = false, onClose }: { picked: Picked; held?: boolean; onClose: () => void }) {
  const stage = useIngestStore((s) => s.stage);
  const startedAt = useIngestStore((s) => s.recordingStartedAt);
  const pinnedHere = useIngestStore((s) => s.pinned?.id === picked.id);
  const startVoice = useIngestStore((s) => s.startVoice);
  const stopVoice = useIngestStore((s) => s.stopVoice);
  const cancelVoice = useIngestStore((s) => s.cancelVoice);
  const compose = useComposeStore((s) => s.request);
  const recording = stage === "recording" && pinnedHere;
  const timer = useRef<HTMLSpanElement>(null);
  const first = picked.name.trim().split(/\s+/)[0] ?? picked.name;

  // the counter is painted into the node: a board re-render twice a second is not worth it
  useEffect(() => {
    if (!recording) return;
    const paint = () => {
      if (timer.current) timer.current.textContent = elapsedSince(startedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [recording, startedAt]);

  const pin = { id: picked.id, name: picked.name };

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.94, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ transformOrigin: "50% 100%" }}
      className="pointer-events-auto relative w-[min(88vw,320px)]"
      data-testid="pick-card"
      data-person={picked.id}
      data-recording={recording ? "1" : "0"}
    >
      <div className="status-screen rounded-[20px] p-3.5" style={{ "--tone": "var(--accent)" } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          <span className="relative shrink-0">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full font-display text-[14px] font-bold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            >
              {initialsOf(picked.name)}
            </span>
            {recording ? (
              <span aria-hidden className="absolute -inset-1 rounded-full border-2 border-accent" style={{ animation: "pick-pulse 1.4s ease-out infinite" }} />
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">{picked.name}</span>
            <span className="block text-[13px] leading-[18px] text-muted">
              {recording ? (
                <>
                  Говорите задачу
                  <span ref={timer} className="nums ml-1.5 text-accent">
                    0:00
                  </span>
                </>
              ) : stage === "recording" ? (
                "Слушаю · задача для " + first
              ) : (
                "Новая задача"
              )}
            </span>
          </span>
          {!recording ? (
            <button
              type="button"
              aria-label="Закрыть"
              data-testid="pick-close"
              onClick={onClose}
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full text-[20px] leading-none text-muted transition-colors duration-[120ms] active:bg-white/[0.06]"
            >
              ×
            </button>
          ) : null}
        </div>

        {recording && held ? (
          // the finger is on the face: the gesture itself ends it
          <p className="mt-3 text-center text-[13px] leading-[18px] text-muted">
            Отпустите — отправлю · <span className="text-text/80">вверх — отмена</span>
          </p>
        ) : stage === "recording" && !recording ? null : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {recording ? (
              <>
                <Button data-testid="pick-done" onClick={() => void stopVoice()}>
                  Готово
                </Button>
                <Button variant="secondary" onClick={() => cancelVoice()}>
                  Отмена
                </Button>
              </>
            ) : (
              <>
                <Button
                  data-testid="pick-record"
                  icon={MIC}
                  onClick={() => {
                    haptic([15, 30, 15]);
                    void startVoice(picked.address, pin);
                  }}
                >
                  Записать
                </Button>
                <Button
                  variant="secondary"
                  data-testid="pick-text"
                  icon={KEYS}
                  onClick={() => compose("", { ...pin, address: picked.address })}
                >
                  Текстом
                </Button>
              </>
            )}
          </div>
        )}
        {!recording && stage !== "recording" ? (
          <p className="mt-2.5 text-center text-[12px] leading-4 text-muted">или зажмите маскота и говорите</p>
        ) : null}
      </div>
      {/* the tail: the card is the face's own speech, and it points at the face */}
      <span
        aria-hidden
        className="absolute left-1/2 top-full block h-3 w-3 -translate-x-1/2 -translate-y-1.5 rotate-45 border-b border-r"
        style={{ background: "var(--surface)", borderColor: "color-mix(in srgb, var(--border) 80%, white 6%)" }}
      />
    </motion.div>
  );
}
