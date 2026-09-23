"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { useIngestStore } from "@/lib/store/ingest";
import { elapsedSince } from "@/lib/voice/stages";

/**
 * The card that comes up when the director catches an idler on the waiting screen (D-72):
 * «Записать задачу для Динары?» — and «Записать» starts the recording there and then, with
 * that person already in front of the phrase.
 *
 * It is one recording, not a hold: the finger has already let go of the orb by the time the
 * card is up, so the same button becomes «Готово» and stops it. Everything after that is the
 * pipeline the director already knows — the face plays the stages, the phrase lands on
 * /confirm — because the name is glued to the front of the transcript and nothing else about
 * the phrase is special.
 */
export function CatchCard({ name, address, onClose }: { name: string; address: string; onClose: () => void }) {
  const stage = useIngestStore((s) => s.stage);
  const startedAt = useIngestStore((s) => s.recordingStartedAt);
  const startVoice = useIngestStore((s) => s.startVoice);
  const stopVoice = useIngestStore((s) => s.stopVoice);
  const cancelVoice = useIngestStore((s) => s.cancelVoice);
  const recording = stage === "recording";
  const timer = useRef<HTMLSpanElement>(null);

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

  // the phrase has left for the parser: the card has nothing left to say
  useEffect(() => {
    if (stage !== "idle" && stage !== "recording") onClose();
  }, [stage, onClose]);

  return (
    <div
      className="card-in pointer-events-auto w-[min(88vw,300px)] rounded-[16px] border border-border bg-surface p-4 text-center"
      style={{ boxShadow: "var(--shadow-raised)" }}
      data-testid="catch-card"
      data-recording={recording ? "1" : "0"}
    >
      <p className="text-[17px] font-semibold leading-[22px]">{name}</p>
      <p className="mt-0.5 text-[14px] leading-5 text-muted">
        {recording ? (
          <>
            Говори…
            <span ref={timer} className="nums ml-1.5 text-text">
              0:00
            </span>
          </>
        ) : (
          "Записать задачу?"
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          block
          onClick={() => {
            if (recording) {
              void stopVoice();
              return;
            }
            haptic([15, 30, 15]);
            void startVoice(address);
          }}
        >
          {recording ? "Готово" : "Записать"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (recording) cancelVoice();
            onClose();
          }}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}
