"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { TextSheet } from "@/components/voice/TextSheet";
import { haptic } from "@/lib/haptics";
import { useComposeStore } from "@/lib/store/compose";
import { subscribeIngestLevel, useIngestStore } from "@/lib/store/ingest";
import { STAGE_FACE, STAGE_LINE, elapsedSince } from "@/lib/voice/stages";

/** Hold longer than this and it is speech, not a tap (docs/DESIGN.md «Жесты»). */
const HOLD_MS = 250;
/** Swipe up this far while holding — the messenger gesture for "forget it". */
const CANCEL_DISTANCE_PX = 60;
/** Pull the face down this far before the hold fires — the keyboard instead of the microphone. */
const TEXT_DISTANCE_PX = 44;
/** The hint under the face goes away once the director has spoken this many times. */
const HINT_USES = 5;
const USES_KEY = "pulse.lever.uses";
/**
 * The face is always drawn at this size and only scaled to the size the screen asks for:
 * a mode change is then one compositor transform, not a new SVG every frame, so growing
 * and shrinking is smooth instead of a snap (D-60).
 */
const BASE = 128;
/** The face travels with the box around it — one spring for both, or they arrive apart. */
const SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

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
  label,
  caption = true,
}: {
  state: MascotState;
  onTap: () => void;
  size?: number;
  /** bumped when the face wakes up: a one-shot stretch */
  wakeKey?: number;
  /** false — the employee's face: a tap only, no hold-to-speak and no pull-down */
  voice?: boolean;
  /** what a tap does right now, for the screen reader (the confirmation says «отправлю») */
  label?: string;
  /** false when the screen says the stage itself — two «Отправляю…» would collide */
  caption?: boolean;
}) {
  const stage = useIngestStore((s) => s.stage);
  // a recording started from somebody's orb on the waiting screen has its own card, with its
  // own timer and its own «Готово»: the face only plays the pose, or the screen says it twice
  // — and the card's recording answers no gesture, so «веди вверх» would be a lie as well
  const fromOrb = useIngestStore((s) => s.address !== null);
  const recordingStartedAt = useIngestStore((s) => s.recordingStartedAt);
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
  // the voice swells the blob; throttled to ~20 fps, and only while the microphone is open
  const [level, setLevel] = useState(0);
  const timerRef = useRef<HTMLSpanElement>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const pulledDown = useRef(false);
  const startPromise = useRef<Promise<void> | null>(null);
  const start = useRef({ x: 0, y: 0 });

  const recording = stage === "recording";
  // busy = the phrase is in flight and the face is telling that story; a parsed phrase
  // waiting for the throw is NOT busy — there the face is the send button (D-60, sixth)
  const busy = stage === "uploading" || stage === "transcribing" || stage === "parsing" || stage === "sending";

  useEffect(() => {
    if (stage !== "recording") return;
    let last = 0;
    return subscribeIngestLevel((value) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      setLevel(value);
    });
  }, [stage]);

  // the counter is painted into the node: a board re-render twice a second is not worth it
  useEffect(() => {
    if (stage !== "recording") return;
    const paint = () => {
      if (timerRef.current) timerRef.current.textContent = elapsedSince(recordingStartedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [stage, recordingStartedAt]);

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

  // The pipeline plays on this face, where the director is already looking: no second
  // mascot over the screen, the same one listens, saves, reads, sorts and throws (D-60).
  // the pipeline owns the face whatever the gestures are: while the batch flies the face
  // throws it, even though holding is off at that moment (the phrase is already in hand)
  const pipeline = STAGE_FACE[stage];
  const face: MascotState = pipeline ?? state;
  const stageLine = caption && !(fromOrb && recording) ? STAGE_LINE[stage] : undefined;

  return (
    <div className="flex flex-col items-center">
      {/* the box never changes size: it only carries the face, and `layout` keeps the parent's
          own resize (idle ↔ ring ↔ panel) from squashing what is inside it */}
      <motion.div layout className="relative flex items-center justify-center" style={{ width: BASE + 24, height: BASE + 24 }} transition={SPRING}>
        {/* the size the screen asked for is a scale, not a new face: growing and shrinking
            rides the same spring as the box and never re-draws the SVG mid-flight */}
        <motion.div initial={false} animate={{ scale: size / BASE }} transition={SPRING} className="flex items-center justify-center">
          <button
            type="button"
            aria-label={recording ? "Идёт запись, отпусти для отправки" : (label ?? (voice ? "Маскот: удержи — говори, тап — задачи, потяни вниз — текст" : "Маскот: тап — дела"))}
            disabled={busy}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            data-testid="mascot-lever"
            data-recording={recording ? "1" : "0"}
            // press answers in the same frame as the finger (DESIGN §2: press = scale only)
            className="relative flex items-center justify-center rounded-full transition-transform duration-[120ms] ease-out active:scale-[0.97] disabled:active:scale-100"
            style={{
              width: BASE + 24,
              height: BASE + 24,
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
            }}
          >
            {/* the only circle left around the face: the accent fill while the microphone is
                open. The «hold me» ring is gone — it hung on through the stages after the
                release and read as «still listening» (owner, D-60 fifth refinement) */}
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
              <Mascot state={face} size={BASE} level={recording ? level : 0} />
            </span>
          </button>
        </motion.div>
        {/* what the assistant is doing, right under its own face and out of the flow — the
            face keeps the middle of the screen while the pipeline runs */}
        {stageLine ? (
          <span className="absolute left-1/2 top-full z-20 flex -translate-x-1/2 flex-col items-center whitespace-nowrap pt-1 text-center">
            <span
              className="rounded-full px-3 py-1 text-[14px] font-medium leading-5"
              style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", color: cancelArmed ? "var(--danger)" : "var(--text)" }}
            >
              {cancelArmed ? "Отпусти, чтобы отменить" : stageLine}
              {recording && !cancelArmed ? (
                <span ref={timerRef} className="nums ml-1.5 text-muted">
                  0:00
                </span>
              ) : null}
            </span>
            {recording && !cancelArmed ? <span className="mt-0.5 text-[12px] leading-4 text-muted">веди вверх, чтобы отменить</span> : null}
          </span>
        ) : null}
      </motion.div>

      {voice ? <TextSheet open={textOpen} onClose={() => setTextOpen(false)} /> : null}
    </div>
  );
}
