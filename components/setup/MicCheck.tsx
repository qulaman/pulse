"use client";

import { useEffect, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";

/** Above this (RMS × 3, as the recorder measures) a voice came through, not the room's hush. */
const HEARD = 0.12;
/** Nothing heard for this long: say so, the person may be talking into a muted input. */
const QUIET_MS = 6_000;

export type MicOutcome = "heard" | "denied" | "missing" | "failed";

type Phase = "asking" | "listening" | "heard" | "quiet";

/**
 * «Проверить микрофон» (D-190): access and a visible level, nothing more — no recorder, nothing
 * saved, nothing sent. The face listens and swells with the voice (`--mascot-level`, written
 * straight into the DOM each frame, as the lever does); once a voice comes through it says so.
 * The stream stops on «Готово», on leaving the step, on leaving the screen.
 */
export function MicCheck({ onOutcome, onDone }: { onOutcome: (outcome: MicOutcome) => void; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("asking");
  const face = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const report = useRef(onOutcome);
  useEffect(() => {
    report.current = onOutcome;
  }, [onOutcome]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let alive = true;
    let heard = false;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        if (!alive) return;
        const name = error instanceof DOMException ? error.name : "";
        report.current(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "missing" : "failed");
        return;
      }
      if (!alive) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setPhase("listening");
      quietTimer = setTimeout(() => alive && !heard && setPhase("quiet"), QUIET_MS);
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const bytes = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(bytes);
        let sum = 0;
        for (const value of bytes) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const level = Math.min(1, Math.sqrt(sum / bytes.length) * 3);
        face.current?.style.setProperty("--mascot-level", level.toFixed(3));
        if (ring.current) ring.current.style.transform = `scale(${(1 + level * 0.45).toFixed(3)})`;
        if (!heard && level > HEARD) {
          heard = true;
          setPhase("heard");
          report.current("heard");
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    void start();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (quietTimer) clearTimeout(quietTimer);
      void ctx?.close().catch(() => undefined);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const words =
    phase === "asking"
      ? "Разрешите доступ к микрофону"
      : phase === "heard"
        ? "Слышу вас — микрофон работает"
        : phase === "quiet"
          ? "Пока не слышно. Скажите громче — или микрофон занят другим приложением"
          : "Скажите что-нибудь";

  return (
    <div className="flex flex-col items-center gap-3 py-2" data-testid="mic-check" data-phase={phase}>
      <div ref={face} className="relative flex h-[104px] w-[104px] items-center justify-center">
        <span
          ref={ring}
          aria-hidden
          className="absolute inset-2 rounded-full border-2"
          style={{ borderColor: phase === "heard" ? "var(--ok)" : "var(--accent)", opacity: 0.5 }}
        />
        <Mascot state={phase === "heard" ? "happy" : "listening"} size={72} />
      </div>
      <p
        className="text-center text-[15px] leading-5"
        style={{ color: phase === "heard" ? "var(--ok)" : phase === "quiet" ? "var(--warn)" : "var(--text-muted)" }}
        role="status"
      >
        {words}
      </p>
      <Button variant={phase === "heard" ? "primary" : "secondary"} onClick={onDone} disabled={phase === "asking"}>
        Готово
      </Button>
    </div>
  );
}
