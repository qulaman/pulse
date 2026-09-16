"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { TextSheet } from "@/components/voice/TextSheet";
import { haptic } from "@/lib/haptics";
import { useComposeStore } from "@/lib/store/compose";
import { useIngestStore } from "@/lib/store/ingest";

/** Hold longer than this and it is speech, not a tap (docs/DESIGN.md «Жесты»). */
const HOLD_MS = 250;
/** Swipe up this far while holding — the messenger gesture for "forget it". */
const CANCEL_DISTANCE_PX = 60;
/** Pull the face down this far before the hold fires — the keyboard instead of the microphone. */
const TEXT_DISTANCE_PX = 44;
/** The hint under the face goes away once the director has spoken this many times. */
const HINT_USES = 5;
const USES_KEY = "pulse.lever.uses";

function readUses(): number {
  try {
    return Number(window.localStorage.getItem(USES_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

// the use count as an external store: the server (and the first client paint) sees the
// hint hidden, the browser then shows it while the count is below the threshold
const usesListeners = new Set<() => void>();
function bumpUses(): void {
  try {
    window.localStorage.setItem(USES_KEY, String(readUses() + 1));
  } catch {
    // a hint that never goes away is still a hint
  }
  for (const listener of usesListeners) listener();
}
/** Whether the gesture hint should still be shown — the screen puts it at the bottom. */
export function useLeverHint(): boolean {
  return useUses() < HINT_USES;
}

function useUses(): number {
  return useSyncExternalStore(
    (onChange) => {
      usesListeners.add(onChange);
      return () => usesListeners.delete(onChange);
    },
    readUses,
    () => HINT_USES,
  );
}

/**
 * The mascot as the one lever of the screen (D-60): hold — it shivers and listens (the
 * same pipeline as the voice button had), release — the phrase goes to the parser; tap —
 * the summary again and the cards thrown anew; pull down — the typed input. Pointer
 * capture and a dead touch-action keep the page still under the finger.
 */
export function MascotLever({
  state,
  onTap,
  size = 128,
  wakeKey = 0,
  voice = true,
}: {
  state: MascotState;
  onTap: () => void;
  size?: number;
  /** bumped when the face wakes up: a one-shot stretch */
  wakeKey?: number;
  /** false — the employee's face: a tap only, no hold-to-speak and no pull-down */
  voice?: boolean;
}) {
  const stage = useIngestStore((s) => s.stage);
  const startVoice = useIngestStore((s) => s.startVoice);
  const stopVoice = useIngestStore((s) => s.stopVoice);
  const cancelVoice = useIngestStore((s) => s.cancelVoice);

  const [textOpen, setTextOpen] = useState(false);
  // «Дать задачу» on a person's card asks for the typed input
  useEffect(
    () =>
      useComposeStore.subscribe((current, previous) => {
        if (current.requestId !== previous.requestId) setTextOpen(true);
      }),
    [],
  );

  const [shaking, setShaking] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const pulledDown = useRef(false);
  const startPromise = useRef<Promise<void> | null>(null);
  const start = useRef({ x: 0, y: 0 });

  const recording = stage === "recording";
  const busy = stage !== "idle" && stage !== "error" && stage !== "recording" && stage !== "question";

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || !voice) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, y: event.clientY };
      holdFired.current = false;
      pulledDown.current = false;
      setCancelArmed(false);
      clearHold();
      holdTimer.current = setTimeout(() => {
        holdFired.current = true;
        // the shiver: a short one-shot before the listening pose takes over
        setShaking(true);
        setTimeout(() => setShaking(false), 220);
        haptic([15, 30, 15]);
        startPromise.current = startVoice();
        bumpUses();
      }, HOLD_MS);
    },
    [busy, clearHold, startVoice, voice],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dy = event.clientY - start.current.y;
      if (holdFired.current) {
        setCancelArmed(-dy >= CANCEL_DISTANCE_PX);
        return;
      }
      if (dy >= TEXT_DISTANCE_PX && !pulledDown.current) {
        // a pull, not a hold: the microphone never starts
        pulledDown.current = true;
        clearHold();
      }
    },
    [clearHold],
  );

  const onPointerUp = useCallback(async () => {
    clearHold();
    if (!voice) {
      onTap();
      return;
    }
    if (pulledDown.current) {
      pulledDown.current = false;
      setTextOpen(true);
      return;
    }
    if (!holdFired.current) {
      onTap();
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
  }, [cancelArmed, cancelVoice, clearHold, onTap, stopVoice, voice]);

  const onPointerCancel = useCallback(() => {
    clearHold();
    pulledDown.current = false;
    if (holdFired.current) {
      holdFired.current = false;
      cancelVoice();
    }
    setCancelArmed(false);
  }, [cancelVoice, clearHold]);

  const face: MascotState = recording ? "listening" : state;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        aria-label={recording ? "Идёт запись, отпусти для отправки" : voice ? "Маскот: удержи — говори, тап — задачи, потяни вниз — текст" : "Маскот: тап — дела"}
        disabled={busy}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        data-testid="mascot-lever"
        data-recording={recording ? "1" : "0"}
        className="relative flex items-center justify-center rounded-full disabled:opacity-60"
        style={{
          width: size + 24,
          height: size + 24,
          touchAction: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {/* the ring that says «you can hold me»: breathes when idle, fills while listening */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            border: "2px solid var(--accent)",
            // the ring says «hold me» — only where holding does something
            opacity: recording || !voice ? 0 : 0.5,
            animation: recording || busy || !voice ? "none" : "fab-pulse 2.6s ease-out infinite",
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: cancelArmed ? "var(--danger)" : "var(--accent)",
            opacity: recording ? 0.22 : 0,
            transition: "opacity var(--t-instant) var(--ease-out)",
          }}
        />
        <span
          key={wakeKey}
          className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]"
          style={{ animation: shaking ? "mascot-shake 220ms ease-in-out both" : wakeKey > 0 ? "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "none" }}
        >
          <Mascot state={face} size={size} />
        </span>
      </button>
      {recording ? (
        <span className="mt-1 text-[13px] leading-4" style={{ color: cancelArmed ? "var(--danger)" : "var(--text-muted)" }}>
          {cancelArmed ? "Отпусти, чтобы отменить" : "Слушаю… веди вверх, чтобы отменить"}
        </span>
      ) : null}

      {voice ? <TextSheet open={textOpen} onClose={() => setTextOpen(false)} /> : null}
    </div>
  );
}
