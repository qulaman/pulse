"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { alignField, BEATS, finishWave, restingClock, waveLife, type Beat, type FieldClock } from "@/components/pulse/beat";

/** The share of a wave's time it takes to cross the field: it starts at the ring and is gone at the edge. */
export const FIELD_WAVE_REACH = 0.82;

/**
 * What rides an orbit. `mark` — a small copy of the mark itself, a dot in a ring; `dot` — a mote.
 * `at` — where on the orbit it starts, as a share of the turn; `d` — its size, px; `to` — the colour
 * it drifts to and back from the field's own, over `hue` seconds; `moon` — a speck goes round it.
 */
type Rider = { at: number; kind: "mark" | "dot"; d: number; to: string; hue: number; moon?: boolean };

/** The orbits, as shares of the field's radius, and how long a rider takes to go round each — outer ones slower. */
const ORBITS: { r: number; turn: number; riders: Rider[] }[] = [
  {
    r: 0.4,
    turn: 64,
    riders: [
      { at: 0.08, kind: "mark", d: 13, to: "var(--gold)", hue: 17 },
      { at: 0.61, kind: "dot", d: 5, to: "var(--accent-2)", hue: 11 },
    ],
  },
  {
    r: 0.64,
    turn: -96,
    riders: [
      { at: 0.3, kind: "dot", d: 6, to: "var(--gold)", hue: 13 },
      { at: 0.74, kind: "mark", d: 15, to: "var(--accent-2)", hue: 23, moon: true },
      { at: 0.93, kind: "dot", d: 4, to: "var(--warn)", hue: 19 },
    ],
  },
  {
    r: 0.86,
    turn: 138,
    riders: [
      { at: 0.15, kind: "mark", d: 11, to: "var(--warn)", hue: 29 },
      { at: 0.52, kind: "dot", d: 5, to: "var(--gold)", hue: 15 },
      { at: 0.8, kind: "dot", d: 4.5, to: "var(--accent-2)", hue: 21 },
    ],
  },
];

/** How far the field reaches from the middle of the mark, whatever the screen: never out of a phone's long side. */
export function fieldRadius(hx: number, hy: number): number {
  return Math.round(Math.min(430, Math.max(hx, hy) + 46));
}

/** The waves of one clock: they keep their beat until the last of them has crossed. */
type WaveSet = { id: number; beat: Beat; key: string; ending: boolean };

let lastSet = 0;
const DEFAULT_CLOCK = restingClock("sleep");

/**
 * The waiting screen behind the mark (D-206): the mark's own light carried out over the whole
 * screen. Three faint orbits round it, and on them small copies of the mark — a dot in a ring — and
 * motes, each at its own pace; a wave leaves the ring with each of the mark's own and crosses the
 * field to its edge, and whatever it passes repeats the pulse: flares, and a small mark lets go of a
 * wave of its own. Each rider drifts slowly from the field's colour to one of its own and back; a
 * speck goes round one of them; once in a while a comet runs a stretch of the middle orbit. It is the
 * same language as the mark — rings, dots, waves — and nothing in it means anything: decoration,
 * transparent to the finger.
 *
 * One heartbeat (components/pulse/beat.ts): the waves leave when the mark's own does — every 5.8 s
 * asleep, every 3.4 s awake — and the flares answer the same clock. A new clock (the mark woke up,
 * fell asleep, a deep rest ended) never makes the field jump: the waves in flight finish their
 * crossing on the old one, and the next one leaves the ring on the new.
 *
 * Plain CSS on `transform` and `opacity` (components/pulse/idle-field.css); the orbits themselves
 * stand still, only what rides them moves. `rest` — nobody has touched the screen for minutes
 * (D-119): everything holds where it is. `still` — the face has something to say or a phrase is in
 * flight: no waves, the orbits go on and the riders only twinkle.
 */
export function IdleField({
  hx,
  hy,
  rest = false,
  still = false,
  clock = DEFAULT_CLOCK,
}: {
  hx: number;
  hy: number;
  rest?: boolean;
  still?: boolean;
  /** the heartbeat to keep (IdleScene reads it off the mark) */
  clock?: FieldClock;
}) {
  const radius = fieldRadius(hx, hy);
  const size = radius * 2;
  const life = waveLife(clock.beat);

  // the waves of each clock the field has had; all but the last are finishing their crossing
  const [sets, setSets] = useState<WaveSet[]>(() => [{ id: ++lastSet, beat: clock.beat, key: clock.key, ending: false }]);
  const current = sets[sets.length - 1]!;
  if (current.key !== clock.key) {
    setSets([...sets.map((set) => (set.ending ? set : { ...set, ending: true })), { id: ++lastSet, beat: clock.beat, key: clock.key, ending: false }]);
  }

  const root = useRef<HTMLDivElement>(null);
  const ended = useRef(new Set<number>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // an old clock's waves are told to stop after the crossing they are on, and leave when it is done
    for (const set of sets) {
      if (!set.ending || ended.current.has(set.id)) continue;
      ended.current.add(set.id);
      let left = 0;
      for (const node of el.querySelectorAll(`[data-wave="${set.id}"]`)) {
        for (const anim of node.getAnimations()) left = Math.max(left, finishWave(anim));
      }
      timers.current.push(setTimeout(() => setSets((list) => list.filter((one) => one.id !== set.id)), left + 80));
    }
    alignField(el, clock);
  });
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <div
      ref={root}
      aria-hidden
      data-testid="idle-field"
      data-rest={rest ? "" : undefined}
      data-still={still ? "" : undefined}
      data-beat={clock.beat}
      className="idle-field pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
      style={{ "--field": `${size}px`, "--beat": `${BEATS[clock.beat].ms}ms` } as CSSProperties}
    >
      <svg className="idle-orbits" width={size} height={size} viewBox={`${-radius} ${-radius} ${size} ${size}`}>
        {ORBITS.map((orbit, n) => (
          <circle key={orbit.r} r={Math.round(radius * orbit.r)} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={n === 1 ? "1.5 10" : "1.5 7"} strokeLinecap="round" opacity={0.2 - n * 0.045} />
        ))}
      </svg>
      {/* one flat list: a set dropped from the front must not remount the waves of the next */}
      {still
        ? null
        : sets.flatMap((set) =>
            Array.from({ length: BEATS[set.beat].waves }, (_, n) => (
              <span
                key={`${set.id}-${n}`}
                className="idle-wave"
                data-wave={set.id}
                data-ending={set.ending ? "" : undefined}
                // the waves of a clock leave a beat apart, each living as many beats as there are of them
                style={{ animationDuration: `${waveLife(set.beat)}ms`, animationDelay: `${n * BEATS[set.beat].ms}ms` }}
              />
            )),
          )}
      {ORBITS.map((orbit) => {
        const r = Math.round(radius * orbit.r);
        // when the front of a wave gets to this orbit: its riders answer it then
        const reached = fieldWaveDelay(r, radius, life) ?? Math.round(life * FIELD_WAVE_REACH);
        return orbit.riders.map((rider) => (
          <span
            key={`${orbit.r}-${rider.at}`}
            className="idle-arm"
            style={{ animationDuration: `${Math.abs(orbit.turn)}s`, animationDirection: orbit.turn < 0 ? "reverse" : "normal", animationDelay: `${(-Math.abs(orbit.turn) * rider.at).toFixed(1)}s` }}
          >
            <i className="idle-rider" data-kind={rider.kind} style={{ "--r": `${r}px`, "--d": `${rider.d}px`, "--to": rider.to, "--at": `${reached}ms`, "--twinkle": `${(-rider.at * 5).toFixed(1)}s` } as CSSProperties}>
              {rider.kind === "mark" ? <i className="idle-echo" /> : null}
              <i className="idle-flare">
                <i className="idle-ink" />
                <i className="idle-ink idle-ink-to" style={{ animationDuration: `${rider.hue}s`, animationDelay: `${(-rider.at * rider.hue).toFixed(1)}s` }} />
              </i>
              {rider.moon ? (
                <i className="idle-moon">
                  <i />
                </i>
              ) : null}
            </i>
          </span>
        ));
      })}
      <span className="idle-comet" style={{ "--w": `${Math.round(radius * ORBITS[1]!.r) * 2}px` } as CSSProperties} />
    </div>
  );
}

/** The wave's own easing (`idle-wave` in idle-field.css), as the two control points of its curve. */
const WAVE_CURVE = [0.2, 0.55, 0.4, 1] as const;

/**
 * When, after a wave leaves the ring, its front is `distance` px from the middle of the mark: the
 * curve of the wave turned inside out, for a wave that lives `life` ms (`waveLife` of the beat).
 * null — the wave has faded before it gets there.
 */
export function fieldWaveDelay(distance: number, radius: number, life: number): number | null {
  const share = (distance / radius - 0.13) / 0.87;
  if (share <= 0) return 0;
  if (share >= 0.86) return null;
  const [x1, y1, x2, y2] = WAVE_CURVE;
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 22; step++) {
    const middle = (low + high) / 2;
    if (at(y1, y2, middle) < share) low = middle;
    else high = middle;
  }
  return Math.round(at(x1, x2, low) * life * FIELD_WAVE_REACH);
}
