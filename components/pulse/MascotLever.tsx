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

/** The four ways the mark is pulled (D-212): down — the voice, up — the typed input, right — the secretary, left — kept in reserve. */
export type Pull = "down" | "up" | "right" | "left";

/** A finger that has travelled this far is pulling, not tapping (docs/DESIGN.md «Жесты»). */
const SLOP_PX = 10;
/** Pulled this far, a way is armed: letting go does it, coming back under it lets it go. */
const PULL_PX = 44;
/** While it records, pulled up this far — the messenger gesture for "forget it". */
const CANCEL_DISTANCE_PX = 60;
/**
 * The hint at the bottom teaches the mark's ways, each until it has been done (2026-11-26): the voice
 * until a pulled phrase has reached the parser this many times, the tap until the mark has been tapped
 * as often, the pulls up and right after `PULL_USES` real ones.
 */
const HINT_USES = 5;
const PULL_USES = 2;
/** The counts of the pulls are new keys: the gestures changed, so everybody is taught them once more. */
const VOICE_KEY = "pulse.lever.down";
const TEXT_KEY = "pulse.lever.up";
const SECRETARY_KEY = "pulse.lever.right";
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
 * The mark goes with the pulling finger — a part of the way, never farther than this — so the pull is
 * seen working before the finger lets go; a tight spring follows the finger and lets the mark back
 * when the finger is gone. A way that leads nowhere (left, or right without a secretary) barely gives.
 */
const GIVE_PX = 24;
const GIVE_SHARE = 0.4;
const DEAD_GIVE_PX = 7;
const DEAD_GIVE_SHARE = 0.12;
const GIVE_SPRING = { stiffness: 700, damping: 40 };

/** Where the pupil looks while the mark is pulled: the way it is going. */
const PULL_GAZE: Record<Pull, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -0.6 },
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
};

function readCount(key: string): number {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

// the counts as an external store: the server (and the first client paint) sees the hint
// hidden, the browser then shows each part while its count is below the threshold
const usesListeners = new Set<() => void>();
function bump(key: string): void {
  try {
    window.localStorage.setItem(key, String(readCount(key) + 1));
  } catch {
    // a hint that never goes away is still a hint
  }
  for (const listener of usesListeners) listener();
}

/** Which parts of the hint are still shown, as bits — a number, so the snapshot compares by value. */
const VOICE_BIT = 1;
const TEXT_BIT = 2;
const TAP_BIT = 4;
const SECRETARY_BIT = 8;
function readHint(): number {
  return (
    (readCount(VOICE_KEY) < HINT_USES ? VOICE_BIT : 0) |
    (readCount(TEXT_KEY) < PULL_USES ? TEXT_BIT : 0) |
    (readCount(SECRETARY_KEY) < PULL_USES ? SECRETARY_BIT : 0) |
    (readCount(TAP_KEY) < HINT_USES ? TAP_BIT : 0)
  );
}

/** Which of the mark's ways are still to be taught — the screen puts the line at the bottom. */
export type LeverHint = { voice: boolean; text: boolean; secretary: boolean; tap: boolean };

export function useLeverHint(): LeverHint {
  const bits = useSyncExternalStore(
    (onChange) => {
      usesListeners.add(onChange);
      return () => usesListeners.delete(onChange);
    },
    readHint,
    () => 0,
  );
  return useMemo(
    () => ({ voice: (bits & VOICE_BIT) !== 0, text: (bits & TEXT_BIT) !== 0, secretary: (bits & SECRETARY_BIT) !== 0, tap: (bits & TAP_BIT) !== 0 }),
    [bits],
  );
}

/** What the pulling finger is doing: which way it goes (null — a way that leads nowhere), far enough or not. */
type Drag = { dir: Pull | null; armed: boolean };

/** The way of a finger `dx`, `dy` away from where it came down: the longer side wins. */
function pullOf(dx: number, dy: number): Pull {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

/**
 * The face and the typed input re-render only when what they are given changes (D-178): the lever
 * re-renders whenever the screen hands it new balls round the face, and the face's whole drawing
 * went with it every time, as did the closed text sheet.
 */
const Face = memo(Mascot);
const QuietTextSheet = memo(TextSheet);

/**
 * The mascot as the one lever of the screen (D-60, D-212). It is pulled, never held: down — it
 * listens (the recording goes on with the finger off the mark; a tap sends it, a pull up drops it),
 * up — the typed input, right — the secretary comes out, left — nothing yet. A tap — the summary and
 * the balls. Nothing is written round the mark: it answers the pull itself — it goes a little with
 * the finger, its pupil looks where it is pulled, and a way pulled far enough shows on it what letting
 * go will do. Pointer capture and a dead touch-action keep the page still under the finger.
 *
 * Memoised (D-178): a tap on Пульс or Лента renders the page again, and the lever only when its own
 * props changed — the screen keeps `onTap`, `onPullRight`, `onPeek`, `pin`, `gaze`, `carry` and `around` stable.
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
  onPullRight,
  onPeek,
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
  /** a short word of the mark's own under it, when no stage is said there — «Скажите фразу, потом нажмите» */
  note?: string | null;
  onTap: () => void;
  size?: number;
  /** bumped when the face wakes up: a one-shot stretch */
  wakeKey?: number;
  /** false — the employee's face: a tap only, no pulls */
  voice?: boolean;
  /** what a tap does right now, for the screen reader (the confirmation says «отправлю») */
  label?: string;
  /** false when the screen says the stage itself — two «Отправляю…» would collide */
  caption?: boolean;
  /**
   * Somebody picked on the waiting screen (D-84): the pull down records a task for them —
   * their name in front of the phrase, their id to the parser — and the pull up types one.
   */
  pin?: (Pin & { address: string }) | null;
  /** where the resting face looks (the picked circle); the pipeline and a pull take the eyes back */
  gaze?: { x: number; y: number } | null;
  /** the pull to the right: the secretary. Not given — the company has nobody to ask, the way is dead */
  onPullRight?: () => void;
  /** the mark is being pulled to the right, not let go yet: the secretary may look out already */
  onPeek?: (peeking: boolean) => void;
  /**
   * What lives round the face and travels with it: the balls (D-178). Drawn in the face's own box,
   * under the face, so the face's glide carries them and nothing ever covers the face.
   */
  around?: ReactNode;
}) {
  const stage = useIngestStore((s) => s.stage);
  // the holiday the face dresses for (D-119)
  const season = useMascotSeason();
  // a recording started for somebody picked has the pick card as its caption, with its own timer,
  // «Готово» and «Отмена»: the face only plays the pose, or the screen says it twice
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

  // The stretch of waking up plays once per wake, on the same face. It used to remount the face
  // (`key={wakeKey}`), which restarted every animation of it from the first frame.
  const [waking, setWaking] = useState(false);
  const [wakeSeen, setWakeSeen] = useState(wakeKey);
  if (wakeSeen !== wakeKey) {
    setWakeSeen(wakeKey);
    setWaking(true);
  }
  // the face's button: the voice level lives on it, so the face and the waves round it both read it
  const leverRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);

  // the give under the finger: motion values, not state — a pointer move must not re-render the face
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const giveX = useSpring(pullX, GIVE_SPRING);
  const giveY = useSpring(pullY, GIVE_SPRING);
  // what the finger is doing, for the drawing: changes only when the way or its arming does
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const moveDrag = useCallback((next: Drag | null) => {
    const now = dragRef.current;
    if (now === next || (now && next && now.dir === next.dir && now.armed === next.armed)) return;
    dragRef.current = next;
    setDrag(next);
  }, []);
  // a finger (or a button) is down on the face — a hovering mouse moves nothing
  const pressed = useRef(false);
  // the finger has travelled: a pull, not a tap
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  // this mark records: the secretary's dictation is the secretary's to show
  const recording = stage === "recording" && !toSecretary;
  // busy = the phrase is in flight and the face is telling that story; a parsed phrase
  // waiting for the throw is NOT busy — there the face is the send button (D-60, sixth)
  const busy = stage === "uploading" || stage === "transcribing" || stage === "parsing" || stage === "sending";

  // a pulled phrase that has reached the parser is the pull learned — a slip of the finger is not
  useEffect(() => {
    if (!voice) return;
    return useIngestStore.subscribe((current, previous) => {
      if (current.stage === "parsing" && previous.stage !== "parsing" && current.source === "voice") bump(VOICE_KEY);
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

  /**
   * Which ways lead somewhere right now. While this mark records the only pull is up — «отмена»;
   * the voice starts only from a stage the pipeline can start from; the secretary only when the
   * screen has one to call.
   */
  const open = useCallback(
    (dir: Pull): boolean => {
      const now = useIngestStore.getState();
      if (now.stage === "recording") return dir === "up" && !now.toSecretary;
      if (dir === "down") return now.stage === "idle" || now.stage === "error" || now.stage === "question" || now.stage === "kept";
      if (dir === "up") return true;
      if (dir === "right") return onPullRight !== undefined;
      return false;
    },
    [onPullRight],
  );

  const letGo = useCallback(() => {
    pressed.current = false;
    moved.current = false;
    pullX.set(0);
    pullY.set(0);
    if (dragRef.current?.dir === "right") onPeek?.(false);
    moveDrag(null);
  }, [pullX, pullY, moveDrag, onPeek]);

  // The phrase went on its way while a finger was still on the mark («Готово» on the pick card, a
  // parse that came back): the button is disabled from that moment and no release will reach it —
  // the pull is forgotten here, or the mark would stay where the finger left it
  useEffect(
    () =>
      useIngestStore.subscribe((current, previous) => {
        if (current.stage === previous.stage || !pressed.current) return;
        if (current.stage !== "idle" && current.stage !== "recording" && current.stage !== "error" && current.stage !== "question" && current.stage !== "kept") letGo();
      }),
    [letGo],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || !voice) return;
      pressed.current = true;
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, y: event.clientY };
    },
    [busy, voice],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!pressed.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      const far = Math.hypot(dx, dy);
      if (!moved.current) {
        if (far <= SLOP_PX) return;
        moved.current = true;
      }
      const dir = pullOf(dx, dy);
      const live = open(dir);
      // the mark goes with the finger along the way pulled; a dead way barely gives
      const along = dir === "down" || dir === "up" ? dy : dx;
      const give = Math.sign(along) * Math.min(live ? GIVE_PX : DEAD_GIVE_PX, Math.abs(along) * (live ? GIVE_SHARE : DEAD_GIVE_SHARE));
      pullX.set(dir === "left" || dir === "right" ? give : 0);
      pullY.set(dir === "down" || dir === "up" ? give : 0);
      const recordingNow = useIngestStore.getState().stage === "recording";
      const armed = live && Math.abs(along) >= (recordingNow ? CANCEL_DISTANCE_PX : PULL_PX);
      const before = dragRef.current;
      // the way has just armed: a tick in the hand — letting go now does it
      if (armed && !(before?.armed && before.dir === dir)) haptic(12);
      if ((before?.dir === "right") !== (dir === "right" && live)) onPeek?.(dir === "right" && live);
      moveDrag({ dir: live ? dir : null, armed });
    },
    [open, pullX, pullY, moveDrag, onPeek],
  );

  const onPointerUp = useCallback(
    (event?: ReactPointerEvent<HTMLButtonElement>) => {
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
      // a release with no press of this lever's own (the press came while the phrase was in flight)
      if (!pressed.current) return;
      const done = dragRef.current;
      const wasMoved = moved.current;
      letGo();
      const now = useIngestStore.getState();
      const mine = now.stage === "recording" && !now.toSecretary;

      if (done?.armed && done.dir) {
        if (mine) {
          // pulled away: the recording goes up in dust, with the sound of a step back
          cancelVoice();
          play?.("poof");
          sound("back");
          return;
        }
        if (done.dir === "down") {
          haptic([15, 30, 15]);
          // not awaited: stop and cancel settle with an opening microphone in the store itself
          void (pin ? startVoice(pin.address, { id: pin.id, name: pin.name }) : startVoice());
          return;
        }
        if (done.dir === "up") {
          tick();
          bump(TEXT_KEY);
          // for somebody picked the typed order is theirs too (the sheet opens on the request)
          if (pin) useComposeStore.getState().request("", pin);
          else setTextOpen(true);
          return;
        }
        if (done.dir === "right") {
          tick();
          bump(SECRETARY_KEY);
          onPullRight?.();
        }
        return;
      }
      // a finger that went somewhere and came off short of the way: the pull was let go
      if (wasMoved) return;
      if (mine) {
        // the tap that ends the phrase; shorter than a phrase can be, the store answers
        // «record_too_short» and the screen pinches
        tick();
        void stopVoice();
        return;
      }
      // a tap, however long the finger stayed: nothing is held on the mark any more
      tick();
      bump(TAP_KEY);
      onTap();
    },
    [cancelVoice, letGo, onTap, onPullRight, stopVoice, startVoice, voice, play, pin],
  );

  // Every gesture of the face — tap and pull — is done by the pointer events above, so the click a
  // browser makes from a finger's touch afterwards is never needed. It was harmful: by the time it
  // comes the tap has already changed the screen, and the browser aims it anew at the same point —
  // at the ball that slid under the finger (the «Дела» ball shut the card the tap had just opened)
  // or a link. A cancelled touchend makes no click, in Chrome and in Safari (D-173).
  const onTouchEnd = useCallback((event: ReactTouchEvent<HTMLButtonElement>) => {
    if (event.cancelable) event.preventDefault();
  }, []);

  // the browser took the touch away: the pull is forgotten; a recording goes on — no finger holds it
  const onPointerCancel = letGo;

  // The pipeline plays on this face, where the director is already looking: no second
  // mascot over the screen, the same one listens, saves, reads, sorts and throws (D-60).
  // the pipeline owns the face whatever the gestures are: while the batch flies the face
  // throws it, even though the pulls are off at that moment (the phrase is already in hand)
  // — all but the secretary's dictation: the small secretary listens to that, this mark stays itself
  const pipeline = stage === "recording" && toSecretary ? undefined : STAGE_FACE[stage];
  // a way armed shows what letting go will do, on the mark itself — where the finger does not cover
  // it: pulled down far enough the ring is already open to listen, pulled up the dot is lines of text
  const armed = drag?.armed && !recording ? drag.dir : null;
  const cancelArmed = recording && drag?.armed === true;
  const face: MascotState = pipeline ?? (armed === "down" ? "listening" : state);
  const faceThing = armed === "up" ? "lines" : thing;
  const faceGaze = drag?.dir && !recording ? PULL_GAZE[drag.dir] : gaze;
  // a recording for a picked person has the pick card as its caption (timer, «Готово»); the
  // face keeps only the red «Отпустите — отменю» of its own gesture
  const stageLine =
    caption && (cancelArmed || !(fromOrb && recording)) && !(stage === "recording" && toSecretary) ? STAGE_LINE[stage] : undefined;
  // the mark's own short word when no stage is said
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
        <motion.div initial={false} animate={{ scale: size / BASE }} transition={SPRING} style={{ x: giveX, y: giveY }} className="relative z-[1] flex items-center justify-center">
          <button
            ref={leverRef}
            type="button"
            aria-label={
              recording
                ? "Идёт запись: нажмите — отправить, потяните вверх — отменить"
                : (label ??
                  (voice
                    ? `Маскот: потяните вниз — говорите, вверх — текст${onPullRight ? ", вправо — секретарь" : ""}, нажмите — задачи, сообщения, эфир, календарь`
                    : "Маскот: нажмите — дела"))
            }
            disabled={busy}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onTouchEnd={onTouchEnd}
            onContextMenu={(event) => event.preventDefault()}
            data-testid="mascot-lever"
            data-recording={recording ? "1" : "0"}
            data-pull={drag?.dir ?? undefined}
            data-armed={drag?.armed ? "1" : undefined}
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
                opacity: cancelArmed ? 0.22 : 0,
                transition: "opacity var(--t-instant) var(--ease-out)",
              }}
            />
            <span
              className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]"
              style={{ animation: waking ? "mascot-wake 520ms cubic-bezier(0.34, 1.4, 0.64, 1) both" : "none" }}
              onAnimationEnd={(event) => {
                // the face's own animations end in here too: only the stretch of this wrapper counts
                if (event.target === event.currentTarget && event.animationName === "mascot-wake") setWaking(false);
              }}
            >
              {/* an act plays over a gaze as well: the screen gives one while the face looks at somebody
                  only when it was called on purpose — a failure, a pinch (idle acts are off then) */}
              <Face
                state={face}
                size={BASE}
                act={pipeline || armed ? null : act}
                gaze={pipeline ? null : faceGaze}
                carry={pipeline ? null : carry}
                season={season}
                thing={pipeline ? null : faceThing}
              />
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
              {cancelArmed ? "Отпустите — отменю" : line}
              {recording && !cancelArmed ? (
                <span ref={timerRef} className="nums ml-1.5 text-muted">
                  0:00
                </span>
              ) : null}
            </span>
            {/* the recording goes on by itself: how it ends is said for as long as it runs */}
            {recording && !fromOrb && !cancelArmed ? (
              <span className="mt-0.5 text-[12px] leading-4 text-muted" data-testid="lever-recording-ways">
                нажмите — отправлю · вверх — отмена
              </span>
            ) : null}
          </span>
        ) : null}
      </motion.div>

      {voice ? <QuietTextSheet open={textOpen} onClose={closeText} /> : null}
    </div>
  );
});
