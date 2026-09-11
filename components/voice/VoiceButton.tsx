"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { TextSheet } from "@/components/voice/TextSheet";
import { haptic } from "@/lib/haptics";
import { useComposeStore } from "@/lib/store/compose";
import { subscribeIngestLevel, useIngestStore } from "@/lib/store/ingest";

/** Hold longer than this and it is speech, not a tap (docs/FRONTEND.md "FAB"). */
const HOLD_MS = 250;
/** Swipe up this far while holding — the messenger gesture for "forget it". */
const CANCEL_DISTANCE_PX = 60;

/**
 * The director's single input: hold to speak, tap to type. Walkie-talkie in a browser
 * needs pointer capture and a dead touch-action, or the page scrolls mid-phrase.
 */
/**
 * `inline`: the button lives in the page flow as the hero of Пульс — bigger, with
 * «Дать задачу» under it — instead of floating above the tab bar.
 */
export function VoiceButton({ inline = false }: { inline?: boolean } = {}) {
  const stage = useIngestStore((state) => state.stage);
  const startVoice = useIngestStore((state) => state.startVoice);
  const stopVoice = useIngestStore((state) => state.stopVoice);
  const cancelVoice = useIngestStore((state) => state.cancelVoice);

  const [textOpen, setTextOpen] = useState(false);
  // «Дать задачу» on a person's card asks the FAB to open the typed input
  useEffect(
    () =>
      useComposeStore.subscribe((state, previous) => {
        if (state.requestId !== previous.requestId) setTextOpen(true);
      }),
    [],
  );
  const [cancelArmed, setCancelArmed] = useState(false);
  const ringRef = useRef<HTMLSpanElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const startPromise = useRef<Promise<void> | null>(null);
  const startY = useRef(0);

  const recording = stage === "recording";
  const busy = stage !== "idle" && stage !== "error" && stage !== "recording" && stage !== "question";

  // Loudness drives one transform; no state, no re-render per frame (DESIGN §2 perf).
  useEffect(
    () =>
      subscribeIngestLevel((level) => {
        const ring = ringRef.current;
        if (ring) ring.style.transform = `scale(${(1 + level * 0.55).toFixed(3)})`;
      }),
    [],
  );

  useEffect(() => {
    if (!recording && ringRef.current) ringRef.current.style.transform = "scale(1)";
  }, [recording]);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      startY.current = event.clientY;
      holdFired.current = false;
      setCancelArmed(false);
      clearHold();
      holdTimer.current = setTimeout(() => {
        holdFired.current = true;
        haptic(20);
        startPromise.current = startVoice();
      }, HOLD_MS);
    },
    [busy, clearHold, startVoice],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!holdFired.current) return;
    setCancelArmed(startY.current - event.clientY >= CANCEL_DISTANCE_PX);
  }, []);

  const onPointerUp = useCallback(async () => {
    clearHold();
    if (!holdFired.current) {
      setTextOpen(true);
      return;
    }
    holdFired.current = false;
    // The microphone permission promise may still be in flight — never stop before it lands.
    await startPromise.current;
    startPromise.current = null;
    if (cancelArmed) {
      setCancelArmed(false);
      cancelVoice();
      return;
    }
    await stopVoice();
  }, [cancelArmed, cancelVoice, clearHold, stopVoice]);

  const onPointerCancel = useCallback(() => {
    clearHold();
    if (holdFired.current) {
      holdFired.current = false;
      cancelVoice();
    }
    setCancelArmed(false);
  }, [cancelVoice, clearHold]);

  return (
    <>
      <div
        className={
          inline
            ? "pointer-events-none relative flex flex-col items-center gap-2"
            : "pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-2"
        }
        style={inline ? undefined : { bottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        {recording ? (
          <span
            className="rounded-[12px] border border-border bg-surface px-3 py-1.5 text-[13px] leading-4"
            style={{ color: cancelArmed ? "var(--danger)" : "var(--text-muted)" }}
          >
            {cancelArmed ? "Отпусти, чтобы отменить" : "Веди вверх, чтобы отменить"}
          </span>
        ) : null}

        <div className={`pointer-events-auto relative flex items-center justify-center ${inline ? "h-20 w-20" : "h-16 w-16"}`}>
          {!recording && !busy ? (
            // idle: a thin ring breathes outwards — a pulse, not a murky disc behind the button
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ border: "2px solid var(--accent)", animation: "fab-pulse 2.6s ease-out infinite" }}
            />
          ) : null}
          <span
            ref={ringRef}
            aria-hidden
            className="absolute inset-0 rounded-full will-change-transform"
            style={{
              background: cancelArmed ? "var(--danger)" : "var(--accent)",
              opacity: recording ? 0.28 : 0,
              transition: "opacity var(--t-instant) var(--ease-out)",
            }}
          />
          <button
            type="button"
            aria-label={recording ? "Идёт запись, отпусти для отправки" : "Записать голосовое или ввести текст"}
            disabled={busy}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            className={`relative flex items-center justify-center rounded-full disabled:opacity-40 ${inline ? "h-20 w-20" : "h-16 w-16"}`}
            style={{
              background: cancelArmed ? "var(--danger)" : "var(--accent)",
              color: "var(--bg)",
              boxShadow: "var(--shadow-raised)",
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
              transform: recording ? "scale(1.06)" : "scale(1)",
              transition: "transform var(--t-instant) var(--ease-out)",
            }}
          >
            <svg width={inline ? 34 : 28} height={inline ? 34 : 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
              <path d="M12 17.5V21M9 21h6" />
            </svg>
          </button>
        </div>
        {inline ? (
          <span className="text-[16px] font-semibold leading-[22px]">{recording ? "Слушаю…" : "Дать задачу"}</span>
        ) : null}
        {!recording ? (
          <span className={inline ? "text-[13px] leading-4 text-muted" : "rounded-full bg-bg/80 px-2 py-0.5 text-[11px] leading-4 text-muted"}>
            удержи — говори · тап — текст
          </span>
        ) : null}
      </div>

      <TextSheet open={textOpen} onClose={() => setTextOpen(false)} />
    </>
  );
}
