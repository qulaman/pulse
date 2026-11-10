"use client";

import { useEffect, useRef } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { cancelDeskVoice, deskLayerUp, finishDeskVoice, startDeskVoice, type VoicePin } from "@/components/desk/voice/control";
import { toast } from "@/components/ui/Toast";
import { isTypingTarget } from "@/lib/desk/keys";
import { CAN_START, isVoiceKey, VOICE_KEY } from "@/lib/desk/voice";
import { subscribeIngestLevel, useIngestStore, type IngestStage } from "@/lib/store/ingest";
import { elapsedSince } from "@/lib/voice/stages";

/** How many bars the level shows: the last moments of the voice, newest on the right. */
const BARS = 5;

/**
 * The voice as it comes (D-164): the last few loudness readings as bars, painted straight into the
 * nodes ~20 times a second — no render per frame (the phone's face does the same, D-126).
 */
export function LevelBars({ height = 16, bar = 3, gap = 2, className = "" }: { height?: number; bar?: number; gap?: number; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const history: number[] = Array.from({ length: BARS }, () => 0);
    let last = 0;
    return subscribeIngestLevel((value) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      history.shift();
      history.push(Math.min(1, Math.max(0, value)));
      const nodes = box.current?.children;
      if (!nodes) return;
      for (let i = 0; i < nodes.length; i += 1) {
        (nodes[i] as HTMLElement).style.transform = `scaleY(${(0.18 + 0.82 * (history[i] ?? 0)).toFixed(3)})`;
      }
    });
  }, []);
  return (
    <span ref={box} aria-hidden className={`inline-flex items-center ${className}`} style={{ height, gap }} data-testid="voice-level">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="block h-full rounded-[1px] bg-current" style={{ width: bar, transform: "scaleY(0.18)", transition: "transform 60ms linear" }} />
      ))}
    </span>
  );
}

/** m:ss since the recording began, painted into the node twice a second. */
export function Elapsed({ className = "" }: { className?: string }) {
  const startedAt = useIngestStore((state) => state.recordingStartedAt);
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      if (node.current) node.current.textContent = elapsedSince(startedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span ref={node} className={`nums ${className}`} data-testid="voice-elapsed">
      0:00
    </span>
  );
}

/** Why the microphone does not start right now. */
function busyLine(stage: IngestStage): string {
  return stage === "confirm" || stage === "sending" ? "Сначала отправьте или отмените поручение в панели" : "Разбираю прошлую фразу — секунду";
}

function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7.6" y="2.6" width="4.8" height="9" rx="2.4" />
      <path d="M4.8 9.6a5.2 5.2 0 0 0 10.4 0" />
      <line x1="10" y1="14.8" x2="10" y2="17.4" />
    </svg>
  );
}

/**
 * The keys of the microphone, for the whole desk while the order line is there (D-164): «V»
 * outside a field starts it for the pinned person; while it records, Enter (or «V» again) ends it
 * and sends the words to the parser, Esc drops them. Those two are taken in the capture phase —
 * before the field's own Enter and the desk's Esc (which would close the panel).
 */
function useVoiceKeys(pin: VoicePin | null) {
  const pinned = useRef(pin);
  useEffect(() => {
    pinned.current = pin;
  });
  useEffect(() => {
    const onCapture = (event: KeyboardEvent) => {
      if (useIngestStore.getState().stage !== "recording") return;
      const enter = (event.code === "Enter" || event.code === "NumpadEnter") && !event.isComposing;
      const again = isVoiceKey(event) && !isTypingTarget(event.target);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void cancelDeskVoice();
      } else if (enter || again) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void finishDeskVoice();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isVoiceKey(event) || isTypingTarget(event.target) || deskLayerUp()) return;
      event.preventDefault();
      const stage = useIngestStore.getState().stage;
      // one phrase at a time: the key says why it does not listen instead of doing nothing
      if (!CAN_START.has(stage)) toast(busyLine(stage));
      else startDeskVoice(pinned.current);
    };
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

/**
 * The microphone at the right end of the order line (D-164): a click — it listens, a click — the
 * words go to the parser, Esc — dropped. While it listens it shows the time and the voice; the
 * panel on the right says the same in full and takes the result. Busy while a phrase is on its way
 * or waits in the panel: one phrase at a time, as on the phone.
 */
export function MicButton({ pin }: { pin: VoicePin | null }) {
  const stage = useIngestStore((state) => state.stage);
  useVoiceKeys(pin);
  const recording = stage === "recording";
  const free = CAN_START.has(stage);

  if (recording) {
    return (
      <Tooltip label="Готово — отправить на разбор" keys={["Enter"]} side="bottom">
        <button
          type="button"
          onClick={() => void finishDeskVoice()}
          aria-label="Идёт запись. Нажмите, чтобы закончить и разобрать"
          data-testid="command-mic"
          data-recording="1"
          className="desk-focus flex h-8 shrink-0 items-center gap-2 rounded-[2px] border border-accent px-2.5 text-accent transition-colors duration-[120ms] hover:bg-accent/10"
        >
          <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
          <Elapsed className="text-[13px] font-medium leading-4" />
          <LevelBars height={14} />
          <span className="text-[13px] font-semibold leading-4">Готово</span>
        </button>
      </Tooltip>
    );
  }

  const label = free ? (pin ? `Сказать поручение: ${pin.name}` : "Сказать поручение голосом") : busyLine(stage);
  return (
    <Tooltip label={label} keys={free ? [VOICE_KEY] : undefined} side="bottom">
      <button
        type="button"
        onClick={() => startDeskVoice(pin)}
        disabled={!free}
        aria-label={label}
        data-testid="command-mic"
        data-recording="0"
        className="desk-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        <MicGlyph />
      </button>
    </Tooltip>
  );
}

/** What the line says beside the microphone while it records. */
export function RecordingHint() {
  return (
    <span className="hidden shrink-0 items-center gap-1 text-[12px] leading-4 text-muted lg:flex" data-testid="command-voice-hint">
      клик — готово
      <span aria-hidden>·</span>
      <Kbd>Esc</Kbd> — отмена
    </span>
  );
}
