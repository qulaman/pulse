"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import type { GlyphId } from "@/components/brand/mark/glyphs";
import { TextSheet } from "@/components/voice/TextSheet";
import { springs } from "@/lib/design/tokens";
import { haptic, tapHaptic } from "@/lib/haptics";
import { useMascotSeason } from "@/lib/mascot/useSeason";
import { sound } from "@/lib/sound";
import { useComposeStore } from "@/lib/store/compose";
import { subscribeIngestLevel, useIngestStore, type Pin } from "@/lib/store/ingest";
import { STAGE_FACE, STAGE_LINE, elapsedSince } from "@/lib/voice/stages";

/** Hold longer than this and it is speech, not a tap (docs/DESIGN.md «Жесты»). */
const HOLD_MS = 250;
/**
 * A finger that travels farther than this before the hold fires is making a gesture (the pull down),
 * not holding: the microphone does not open under a moving finger.
 */
const SLOP_PX = 10;
/**
 * A recording let go sooner than this after it began was a tap that lingered: it is dropped without a
 * word and the tap is done (2026-11-26). Between this and `MIN_RECORDING_MS` it was a hold too short
 * to say anything — the mark pinches and its caption says to hold.
 */
const TAP_LINGER_MS = 600;
/** Swipe up this far while holding — the messenger gesture for "forget it". */
const CANCEL_DISTANCE_PX = 60;
/** Pull the face down this far before the hold fires — the keyboard instead of the microphone. */
const TEXT_DISTANCE_PX = 44;
/**
 * The hint at the bottom teaches the mark's three ways, each until it has been done (2026-11-26): the
 * hold part until a held phrase has reached the parser this many times, the tap part until the mark
 * has been tapped as often, the pull part after `PULL_USES` real pulls.
 */
const HINT_USES = 5;
const PULL_USES = 2;
/** The hold count — the key the single count had, so a director who has spoken keeps his line short. */
const SPEAK_KEY = "pulse.lever.uses";
const PULL_KEY = "pulse.lever.pulls";
const TAP_KEY = "pulse.lever.taps";
/**
 * The face is always drawn at this size and only scaled to the size the screen asks for:
 * a mode change is then one compositor transform, not a new SVG every frame, so growing
 * and shrinking is smooth instead of a snap (D-60).
 */
const BASE = 128;
/** The face travels with the box around it — one spring for both, or they arrive apart. */
const SPRING = springs.object;
/**
 * The face gives a little under a pulling finger — down towards the typed input, up towards «отмена»
 * while it records — so the gesture is seen working before the finger lets go. A third of the pull
 * (a quarter for the cancel), never more than this; a tight spring follows the finger, and lets
 * the face back when the finger is gone.
 */
const GIVE_PX = 16;
const GIVE_SPRING = { stiffness: 700, damping: 40 };

function readCount(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : Number(raw) || 0;
  } catch {
    return 0;
  }
}

/** Each gesture's own count; the taps of a director from before the split are his holds — he has tapped as much. */
function countOf(key: string): number {
  return readCount(key) ?? (key === TAP_KEY ? (readCount(SPEAK_KEY) ?? 0) : 0);
}

// the counts as an external store: the server (and the first client paint) sees the hint
// hidden, the browser then shows each part while its count is below the threshold
const usesListeners = new Set<() => void>();
function bump(key: string): void {
  try {
    window.localStorage.setItem(key, String(countOf(key) + 1));
  } catch {
    // a hint that never goes away is still a hint
  }
  for (const listener of usesListeners) listener();
}

/** Which parts of the hint are still shown, as bits — a number, so the snapshot compares by value. */
const HOLD_BIT = 1;
const PULL_BIT = 2;
const TAP_BIT = 4;
function readHint(): number {
  return (
    (countOf(SPEAK_KEY) < HINT_USES ? HOLD_BIT : 0) |
    (countOf(PULL_KEY) < PULL_USES ? PULL_BIT : 0) |
    (countOf(TAP_KEY) < HINT_USES ? TAP_BIT : 0)
  );
}

/** Which parts of the gesture hint are still to be shown — the screen puts it at the bottom. */
export type LeverHint = { hold: boolean; pull: boolean; tap: boolean };

export function useLeverHint(): LeverHint {
  const bits = useSyncExternalStore(
    (onChange) => {
      usesListeners.add(onChange);
      return () => usesListeners.delete(onChange);
    },
    readHint,
    () => 0,
  );
  return useMemo(() => ({ hold: (bits & HOLD_BIT) !== 0, pull: (bits & PULL_BIT) !== 0, tap: (bits & TAP_BIT) !== 0 }), [bits]);
}

/**
 * The face and the typed input re-render only when what they are given changes (D-178): the lever
 * re-renders whenever the screen hands it new balls round the face, and the face's whole drawing
 * went with it every time, as did the closed text sheet.
 */
const Face = memo(Mascot);
const QuietTextSheet = memo(TextSheet);

/**
 * The mascot as the one lever of the screen (D-60): hold — it shivers and listens (the
 * same pipeline as the voice button had), release — the phrase goes to the parser; tap —
 * the summary again and the cards thrown anew; pull down — the typed input. Pointer
 * capture and a dead touch-action keep the page still under the finger.
 *
 * Memoised (D-178): a tap on Пульс or Лента renders the page again, and the lever only when its own
 * props changed — the screen keeps `onTap`, `onHold`, `pin`, `gaze`, `carry` and `around` stable.
 */
export const MascotLever = memo(function MascotLever({
  state,
  onTap,
  size = 128,
  wakeKey = 0,
  voice = true,
  label,
  caption = true,
  act = null,
  pin = null,
  gaze = null,
  carry = null,
  onHold,
  around = null,
  play,
  thing = null,
  note = null,
}: {
  state: MascotState;
  /** the employee's orders in work, held as a stack of cards (D-110) */
  carry?: { count: number; hot?: boolean } | null;
  /** a one-shot over the resting face (D-82); the pipeline, once it runs, drops it */
  act?: MascotAct | null;
  /**
   * The screen's own `play` of its acts (useMascotActs): the lever calls the answers to its own
   * gestures through it — the dust of a recording swiped away. Stable, or the memo breaks.
   */
  play?: (act: MascotAct) => void;
  /** what the dot is for as long as it is set — the thing a failed phrase is about (a muted microphone, no signal) */
  thing?: GlyphId | null;
  /** a short word of the mark's own under it, when no stage is said there — «Держите, пока говорите» */
  note?: string | null;
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
  /**
   * Somebody picked on the waiting screen (D-84): holding the face records a task for them —
   * their name in front of the phrase, their id to the parser.
   */
  pin?: (Pin & { address: string }) | null;
  /** where the resting face looks (the picked circle); the pipeline takes the eyes back */
  gaze?: { x: number; y: number } | null;
  /** the finger is on the face and the microphone is open — the pick card says so (D-84) */
  onHold?: (held: boolean) => void;
  /**
   * What lives round the face and travels with it: the balls (D-178). Drawn in the face's own box,
   * under the face, so the face's glide carries them and nothing ever covers the face.
   */
  around?: ReactNode;
}) {
  const stage = useIngestStore((s) => s.stage);
  // the holiday the face dresses for (D-119)
  const season = useMascotSeason();
  // a recording started from somebody's orb on the waiting screen has its own card, with its
  // own timer and its own «Готово»: the face only plays the pose, or the screen says it twice
  // — and the card's recording answers no gesture, so «ведите вверх» would be a lie as well
  const fromOrb = useIngestStore((s) => s.address !== null);
  // a request said into the small secretary (D-99): the secretary listens, this mark stays itself
  const toSecretary = useIngestStore((s) => s.toSecretary);
  const recordingStartedAt = useIngestStore((s) => s.recordingStartedAt);
  const startVoice = useIngestStore((s) => s.startVoice);
  const stopVoice = useIngestStore((s) => s.stopVoice);
  const cancelVoice = useIngestStore((s) => s.cancelVoice);

  const [textOpen, setTextOpen] = useState(false);
  const closeText = useCallback(() => setTextOpen(false), []);
  // «Дать задачу» on a person's card asks for the typed input
  useEffect(
    () =>
      useComposeStore.subscribe((current, previous) => {
        if (current.requestId !== previous.requestId) setTextOpen(true);
      }),
    [],
  );

  const [shaking, setShaking] = useState(false);
  // The stretch of waking up plays once per wake, on the same face. It used to remount the face
  // (`key={wakeKey}`), which restarted every animation of it from the first frame — and after a
  // hold's shiver the stretch played again, in the middle of listening.
  const [waking, setWaking] = useState(false);
  const [wakeSeen, setWakeSeen] = useState(wakeKey);
  if (wakeSeen !== wakeKey) {
    setWakeSeen(wakeKey);
    setWaking(true);
  }
  // this face is being held with the microphone open — the screen may want to know
  const setHeld = useCallback((value: boolean) => onHold?.(value), [onHold]);
  const [cancelArmed, setCancelArmed] = useState(false);
  // the finger is on this face with the microphone open: only then does «ведите вверх» mean anything
  const [holding, setHolding] = useState(false);
  // the voice swells the blob; painted into a CSS variable of the face's wrapper (below)
  const faceRef = useRef<HTMLSpanElement>(null);
  // the face's button: the voice level lives on it, so the face and the rings round it both read it
  const leverRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);

  // the give under the finger: a motion value, not state — a pointer move must not re-render the face
  const pull = useMotionValue(0);
  const give = useSpring(pull, GIVE_SPRING);
  // a finger (or a button) is down on the face — a hovering mouse moves nothing
  const pressed = useRef(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  // when the hold fired and the microphone was asked for: a release soon after is a tap that lingered
  const heldAt = useRef(0);
  const pulledDown = useRef(false);
  // the finger travelled before the hold fired: a gesture, not a hold — and not a tap either
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  // this mark records: the secretary's dictation is the secretary's to show
  const recording = stage === "recording" && !toSecretary;
  // busy = the phrase is in flight and the face is telling that story; a parsed phrase
  // waiting for the throw is NOT busy — there the face is the send button (D-60, sixth)
  const busy = stage === "uploading" || stage === "transcribing" || stage === "parsing" || stage === "sending";

  // a held phrase that has reached the parser is the hold learned — a slip of the finger is not
  useEffect(() => {
    if (!voice) return;
    return useIngestStore.subscribe((current, previous) => {
      if (current.stage === "parsing" && previous.stage !== "parsing" && current.source === "voice") bump(SPEAK_KEY);
    });
  }, [voice]);

  // The voice level goes straight into `--mascot-level` on the face's wrapper, ~20 times a
  // second while the microphone is open. As React state it re-rendered the whole board at that
  // rate, and every render re-measured the layout group around the face (D-126).
  useEffect(() => {
    if (!recording) return;
    const node = leverRef.current;
    let last = 0;
    const off = subscribeIngestLevel((value) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      leverRef.current?.style.setProperty("--mascot-level", Math.min(1, Math.max(0, value)).toFixed(3));
    });
    return () => {
      off();
      node?.style.removeProperty("--mascot-level");
    };
  }, [recording]);

  // the counter is painted into the node: a board re-render twice a second is not worth it
  useEffect(() => {
    if (!recording) return;
    const paint = () => {
      if (timerRef.current) timerRef.current.textContent = elapsedSince(recordingStartedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [recording, recordingStartedAt]);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || !voice) return;
      pressed.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, y: event.clientY };
      holdFired.current = false;
      pulledDown.current = false;
      moved.current = false;
      setCancelArmed(false);
      clearHold();
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        holdFired.current = true;
        heldAt.current = performance.now();
        // the shiver: a short one-shot before the listening pose takes over — and it ends the stretch
        // of a wake tapped a moment ago, or the stretch would start over once the shiver is done
        setWaking(false);
        setShaking(true);
        setTimeout(() => setShaking(false), 220);
        haptic([15, 30, 15]);
        setHolding(true);
        setHeld(true);
        // not awaited: stop and cancel settle with an opening microphone in the store itself
        void (pin ? startVoice(pin.address, { id: pin.id, name: pin.name }) : startVoice());
      }, HOLD_MS);
    },
    [busy, clearHold, startVoice, voice, pin, setHeld],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (holdFired.current) {
        setCancelArmed(-dy >= CANCEL_DISTANCE_PX);
        if (pressed.current) pull.set(dy < 0 ? -Math.min(GIVE_PX, -dy / 4) : 0);
        return;
      }
      if (!pressed.current) return;
      pull.set(dy > 0 ? Math.min(GIVE_PX, dy / 3) : 0);
      if (!moved.current && Math.hypot(dx, dy) > SLOP_PX) {
        // a finger on its way somewhere: a gesture, not a hold — the microphone never opens under it
        moved.current = true;
        clearHold();
      }
      if (dy >= TEXT_DISTANCE_PX && !pulledDown.current) {
        // a pull, not a hold: the microphone never starts
        pulledDown.current = true;
        clearHold();
      }
    },
    [clearHold, pull],
  );

  const onPointerUp = useCallback((event?: ReactPointerEvent<HTMLButtonElement>) => {
    clearHold();
    pressed.current = false;
    pull.set(0);
    // a finger's tap ticks here: its touchend is cancelled (below), so the app's click listener that
    // ticks every other tap never hears one (D-147, D-173); a mouse still clicks and ticks there.
    // After the tap's own work, as that listener does: a pattern of the tap's own wins
    const tick = () => {
      if (event?.pointerType !== "touch") return;
      const at = Date.now();
      setTimeout(() => tapHaptic(at), 0);
    };
    if (!voice) {
      tick();
      onTap();
      return;
    }
    if (pulledDown.current) {
      pulledDown.current = false;
      moved.current = false;
      setTextOpen(true);
      bump(PULL_KEY);
      return;
    }
    if (!holdFired.current) {
      // a finger that went somewhere and came off short of the pull: the gesture was let go
      if (moved.current) {
        moved.current = false;
        return;
      }
      tick();
      bump(TAP_KEY);
      onTap();
      return;
    }
    holdFired.current = false;
    setHolding(false);
    setHeld(false);
    if (cancelArmed) {
      // swiped away: the recording goes up in dust, with the sound of a step back
      setCancelArmed(false);
      cancelVoice();
      play?.("poof");
      sound("back");
      return;
    }
    if (performance.now() - heldAt.current < TAP_LINGER_MS) {
      // a tap that lingered past the hold: the microphone had barely opened — nothing said, the
      // recording is dropped and the tap is done. With somebody picked the tap is their microphone,
      // and its own «слушаю» follows at once — no step back before it
      cancelVoice();
      if (!pin) sound("back");
      tick();
      bump(TAP_KEY);
      onTap();
      return;
    }
    // shorter than a phrase can be, the store answers «record_too_short» and the screen pinches
    void stopVoice();
  }, [cancelArmed, cancelVoice, clearHold, onTap, stopVoice, voice, setHeld, pull, play, pin]);

  // Every gesture of the face — tap, hold, pull — is done by the pointer events above, so the click a
  // browser makes from a finger's touch afterwards is never needed. It was harmful: by the time it
  // comes the tap has already changed the screen, and the browser aims it anew at the same point —
  // at the ball that slid under the finger (the «Дела» ball shut the card the tap had just opened)
  // or a link. A cancelled touchend makes no click, in Chrome and in Safari (D-173).
  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLButtonElement>) => {
    if (event.cancelable) event.preventDefault();
  }, []);

  const onPointerCancel = useCallback(() => {
    clearHold();
    pressed.current = false;
    pull.set(0);
    pulledDown.current = false;
    moved.current = false;
    if (holdFired.current) {
      holdFired.current = false;
      // the store drops a microphone still opening too: its stream is closed the moment it comes
      cancelVoice();
    }
    setHolding(false);
    setHeld(false);
    setCancelArmed(false);
  }, [cancelVoice, clearHold, setHeld, pull]);

  // The pipeline plays on this face, where the director is already looking: no second
  // mascot over the screen, the same one listens, saves, reads, sorts and throws (D-60).
  // the pipeline owns the face whatever the gestures are: while the batch flies the face
  // throws it, even though holding is off at that moment (the phrase is already in hand)
  // — all but the secretary's dictation: the small secretary listens to that, this mark stays itself
  const pipeline = stage === "recording" && toSecretary ? undefined : STAGE_FACE[stage];
  const face: MascotState = pipeline ?? state;
  // a recording for a picked person has the pick card as its caption (timer, «Готово»); the
  // face keeps only the red «Отпустите, чтобы отменить» of its own gesture
  const stageLine =
    caption && (cancelArmed || !(fromOrb && recording)) && !(stage === "recording" && toSecretary) ? STAGE_LINE[stage] : undefined;
  // the mark's own short word when no stage is said — «Держите, пока говорите» after a hold too short
  const line = stageLine ?? (caption ? (note ?? undefined) : undefined);

  return (
    <div className="flex flex-col items-center">
      {/* the box never changes size: it only carries the face, and `layout` keeps the parent's
          own resize (idle ↔ ring ↔ panel) from squashing what is inside it */}
      <motion.div layout className="relative flex items-center justify-center" style={{ width: BASE + 24, height: BASE + 24 }} transition={SPRING}>
        {around}
        {/* the size the screen asked for is a scale, not a new face: growing and shrinking
            rides the same spring as the box and never re-draws the SVG mid-flight; it stands
            above whatever is round it */}
        <motion.div initial={false} animate={{ scale: size / BASE }} transition={SPRING} style={{ y: give }} className="relative z-[1] flex items-center justify-center">
          <button
            ref={leverRef}
            type="button"
            aria-label={recording ? "Идёт запись, отпустите, чтобы отправить" : (label ?? (voice ? "Маскот: удержите — говорите, нажмите — задачи, сообщения, эфир, календарь, потяните вниз — текст" : "Маскот: нажмите — дела"))}
            disabled={busy}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onTouchEnd={onTouchEnd}
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
            {/* the voice is seen on the mark itself (D-205): its dot is the three bars, a wave trembles
                round it — both read `--mascot-level` from this button. The only thing the lever adds is
                the red under the face once the finger has gone far enough up to cancel */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: "var(--danger)",
                opacity: recording && cancelArmed ? 0.22 : 0,
                transition: "opacity var(--t-instant) var(--ease-out)",
              }}
            />
            <span
              ref={faceRef}
              className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]"
              style={{ animation: shaking ? "mascot-shake 220ms ease-in-out both" : waking ? "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "none" }}
              onAnimationEnd={(event) => {
                // the face's own animations end in here too: only the stretch of this wrapper counts
                if (event.target === event.currentTarget && event.animationName === "mascot-wake") setWaking(false);
              }}
            >
              {/* an act plays over a gaze as well: the screen gives one while the face looks at somebody
                  only when it was called on purpose — a failure, a pinch (idle acts are off then) */}
              <Face state={face} size={BASE} act={pipeline ? null : act} gaze={pipeline ? null : gaze} carry={pipeline ? null : carry} season={season} thing={pipeline ? null : thing} />
            </span>
          </button>
        </motion.div>
        {/* what the assistant is doing, right under its own face and out of the flow — the
            face keeps the middle of the screen while the pipeline runs */}
        {line ? (
          <span className="absolute left-1/2 top-full z-20 flex -translate-x-1/2 flex-col items-center whitespace-nowrap pt-1 text-center">
            <span
              className="rounded-full px-3 py-1 text-[14px] font-medium leading-5"
              style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", color: cancelArmed ? "var(--danger)" : "var(--text)" }}
              data-testid={stageLine ? undefined : "lever-note"}
            >
              {cancelArmed ? "Отпустите, чтобы отменить" : line}
              {recording && !cancelArmed ? (
                <span ref={timerRef} className="nums ml-1.5 text-muted">
                  0:00
                </span>
              ) : null}
            </span>
            {recording && holding && !cancelArmed ? <span className="mt-0.5 text-[12px] leading-4 text-muted">ведите вверх, чтобы отменить</span> : null}
          </span>
        ) : null}
      </motion.div>

      {voice ? <QuietTextSheet open={textOpen} onClose={closeText} /> : null}
    </div>
  );
});
