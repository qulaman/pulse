import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * One heartbeat for the waiting screen (D-206): the waves of the field leave the ring together with
 * the mark's own, and everything that answers a wave — a rider's flare, a small mark's echo, a
 * circle of the team bobbing — keeps the same clock.
 *
 * The clock is the mark's: its first wave (`.bk-wave-1`, `bk-wave-out` in
 * components/brand/mark/mark.css) is read off the page through the Web Animations API, and every
 * looping animation of the field is put on the same moments by its `startTime` — never by a delay
 * computed from «now», which would drift with each render. Nothing runs per frame: the clock is read
 * once a beat, and an animation is touched only when it is new or off the beat.
 */
export type Beat = "sleep" | "awake";

type Pace = {
  /** a wave of the mark leaves the ring this often, ms */
  ms: number;
  /** when within that period it leaves — used only while there is no mark on the page to read */
  lead: number;
  /** waves of the field in the air at once: each lives `ms × waves` and they leave `ms` apart */
  waves: number;
};

/**
 * The mark's two heartbeats (mark.css): asleep it breathes every 5.8 s and lets one slow wave go
 * (`bk-sleep`, `.bk[data-glow="sleep"] .bk-wave-1`, 1.4 s into the breath); awake it beats twice
 * every 3.4 s with a wave after the first beat (`bk-beat`, `.bk[data-glow="pulse"] .bk-wave-1`,
 * 0.2 s in). The field sends one wave a beat: asleep one is in the air, awake two take turns — each
 * lives two beats, so it crosses the screen as slowly as asleep and the screen gets no busier than
 * the field's old 3.2 s rhythm.
 */
export const BEATS: Record<Beat, Pace> = {
  sleep: { ms: 5800, lead: 1400, waves: 1 },
  awake: { ms: 3400, lead: 200, waves: 2 },
};

/** How long one wave of the field lives at this beat, from the ring to past the edge. */
export function waveLife(beat: Beat): number {
  return BEATS[beat].ms * BEATS[beat].waves;
}

export type FieldClock = {
  beat: Beat;
  /** a moment on the document's timeline (ms) when a wave leaves the ring — any one, the beat repeats it */
  epoch: number;
  /** counts the deep rests that have ended (see `useFieldClock`) */
  gen: number;
  /** changes whenever the field must take a new clock: the waves in flight finish, the next leave on it */
  key: string;
};

/** The clock before the mark has been read: the document's own, with the mark's lead. */
export function restingClock(beat: Beat): FieldClock {
  return { beat, epoch: BEATS[beat].lead, gen: 0, key: `${beat}:${BEATS[beat].lead}:0` };
}

const mod = (value: number, period: number) => ((value % period) + period) % period;

/** The document's timeline now — what every `startTime` is measured on. */
function timelineNow(): number {
  const now = document.timeline.currentTime;
  return now === null ? performance.now() : Number(now);
}

/** How far up from the field the mark is looked for: the face's box holds both. */
const CLIMB = 6;

/**
 * The first wave of the big mark beside the field: the nearest one up the tree — the director's or
 * the employee's before the secretary's small sign; on the secretary's screen her own face.
 */
function markWave(from: Element): Element | null {
  let node = from.parentElement;
  for (let step = 0; node && step < CLIMB; step++, node = node.parentElement) {
    const wave = node.querySelector(".mascot:not(.secretary-mascot) .bk-wave-1") ?? node.querySelector(".mascot .bk-wave-1");
    if (wave) return wave;
  }
  return null;
}

/**
 * The loop of the mark's own wave — null when there is no mark near, or it is not beating at this
 * pace (a face that talks, calls or thinks has waves of its own).
 */
function markBeat(from: Element, beat: Beat): CSSAnimation | null {
  const wave = markWave(from);
  const anim = wave?.getAnimations().find((one): one is CSSAnimation => one instanceof CSSAnimation && one.animationName === "bk-wave-out");
  const duration = anim?.effect?.getComputedTiming().duration;
  return anim && Math.abs(Number(duration) - BEATS[beat].ms) <= 40 ? anim : null;
}

/**
 * When the mark's own wave leaves the ring, on the document's timeline: its start and its delay,
 * exactly. null — it is not running (a mark scrolled out of view is paused: its waves are not seen).
 */
function epochOf(anim: CSSAnimation): number | null {
  if (anim.playState !== "running" || anim.startTime === null) return null;
  return Number(anim.startTime) + Number(anim.effect?.getComputedTiming().delay ?? 0);
}

/**
 * The field's clock, held by the scene (IdleScene) for the field and the team alike. It is read off
 * the mark at once, again at every change of `beat`, and once a beat while the field is up — a face
 * that went through a state without waves comes back with a wave of a new phase. It changes only
 * when the beat or the phase really moved, and when a deep rest ends: the field held still for
 * minutes, and the mark went on.
 */
export function useFieldClock(anchor: RefObject<Element | null>, beat: Beat, on: boolean, deep: boolean): FieldClock {
  const [clock, setClock] = useState(() => restingClock(beat));
  // a deep rest has ended: whatever was frozen in flight is off the mark's beat now
  const [rest, setRest] = useState({ deep, gen: 0 });
  if (rest.deep !== deep) setRest({ deep, gen: deep ? rest.gen : rest.gen + 1 });
  const gen = rest.gen;

  const held = useRef(clock);
  useLayoutEffect(() => {
    held.current = clock;
  });

  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let tries = 0;
    const pace = BEATS[beat].ms;
    const read = () => {
      if (!alive) return;
      const anim = markBeat(el, beat);
      // the mark's wave has just been (re)started and has no start yet: read it once it has one
      if (anim?.pending) {
        anim.ready.then(read, () => undefined);
        return;
      }
      const found = anim ? epochOf(anim) : null;
      // a new beat whose wave is not on the face yet (it may take the new state a frame later): look
      // again in a moment before falling back on the document's clock
      if (found === null && held.current.beat !== beat && tries++ < 3) {
        timer = setTimeout(read, 120);
        return;
      }
      setClock((was) => {
        const same = was.beat === beat;
        const epoch = mod(found ?? (same ? was.epoch : BEATS[beat].lead), pace);
        const drift = Math.abs(mod(was.epoch, pace) - epoch);
        // a few ms either way is the same beat: no hand-over for the rounding of a timeline
        if (same && was.gen === gen && Math.min(drift, pace - drift) < 5) return was;
        return { beat, epoch, gen, key: `${beat}:${Math.round(epoch)}:${gen}` };
      });
      if (on && !deep) timer = setTimeout(read, pace);
    };
    read();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [anchor, beat, on, deep, gen]);

  return clock;
}

/** The loops that answer a wave: put on its phase, whatever their own delay. */
const ANSWERS = new Set(["idle-flare", "idle-echo", "crew-ripple"]);
/** Waves already put on a clock: a wave in flight is never moved — it finishes, a new one starts. */
const placed = new WeakSet<Animation>();

/**
 * Puts the field's loops under `root` on the clock. A new wave starts at the mark's next wave — never
 * half-way across the screen; what answers a wave takes the phase at once, already running, so its
 * next flare or bob is the one the wave in flight brings. A loop already on the beat is left alone,
 * as is everything paused (a deep rest: the play state stays the stylesheet's) and a wave that is
 * finishing (`data-ending`). Called after every commit of the field and of the team.
 */
export function alignField(root: Element, clock: FieldClock): void {
  const period = BEATS[clock.beat].ms;
  const now = timelineNow();
  for (const anim of root.getAnimations({ subtree: true })) {
    if (!(anim instanceof CSSAnimation) || anim.playState === "paused") continue;
    if (anim.animationName === "idle-wave") {
      if (placed.has(anim)) continue;
      const target = anim.effect instanceof KeyframeEffect ? anim.effect.target : null;
      if (target instanceof HTMLElement && target.dataset.ending !== undefined) continue;
      placed.add(anim);
      anim.startTime = clock.epoch + Math.ceil((now - clock.epoch) / period) * period;
    } else if (ANSWERS.has(anim.animationName)) {
      const start = anim.startTime === null ? null : Number(anim.startTime);
      if (start !== null) {
        const off = mod(start - clock.epoch, period);
        if (Math.min(off, period - off) < 2) continue;
      }
      const delay = Number(anim.effect?.getTiming().delay ?? 0);
      // the latest beat from which it is already running: a delay longer than a beat is a wave that
      // left earlier and is still on its way
      anim.startTime = clock.epoch + Math.floor((now - delay - clock.epoch) / period) * period;
    }
  }
}

/**
 * A wave of an old clock finishes the crossing it is on and stops: its loop is told to end with
 * this round (one not yet started never starts — nor one never put on a clock: it was born during a
 * deep rest and has not been seen). Returns how long until it is done, ms.
 */
export function finishWave(anim: Animation): number {
  const effect = anim.effect;
  if (!effect) return 0;
  const timing = effect.getComputedTiming();
  // still in its delay — `currentIteration` reads 0 there under `fill: both`, it has not left yet
  const waiting = timing.localTime === null || Number(timing.localTime) < Number(timing.delay ?? 0);
  const iteration = placed.has(anim) && !waiting ? timing.currentIteration : null;
  effect.updateTiming({ iterations: iteration === null || iteration === undefined ? 0 : iteration + 1 });
  const after = effect.getComputedTiming();
  const left = Number(after.endTime) - Number(after.localTime ?? 0);
  return Number.isFinite(left) ? Math.max(0, left) : 0;
}
