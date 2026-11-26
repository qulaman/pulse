import type { CSSProperties } from "react";

/** One wave from the mark to the edge of the field; the team bobs as it goes past (PeopleField). */
export const FIELD_WAVE_MS = 6400;
/** The share of a wave's time it takes to cross the field: it starts at the ring and is gone at the edge. */
export const FIELD_WAVE_REACH = 0.82;

/** The orbits, as shares of the field's radius, and how long a mote takes to go round each — outer ones slower. */
const ORBITS = [
  { r: 0.4, turn: 64, motes: [0.08, 0.61] },
  { r: 0.64, turn: -96, motes: [0.3, 0.74, 0.93] },
  { r: 0.9, turn: 138, motes: [0.15, 0.52, 0.8] },
];

/** How far the field reaches from the middle of the mark, whatever the screen: never out of a phone's long side. */
export function fieldRadius(hx: number, hy: number): number {
  return Math.round(Math.min(430, Math.max(hx, hy) + 46));
}

/**
 * The waiting screen behind the mark (D-206): the mark's own light carried out over the whole
 * screen. Three faint orbits round it with small motes going along them, each at its own pace; a
 * wave leaves the ring every few seconds and crosses the field to its edge; once in a while a comet
 * runs a stretch of the middle orbit. It is the same language as the mark — rings, dots, waves — and
 * nothing in it means anything: decoration, transparent to the finger.
 *
 * Plain CSS on `transform` and `opacity` (components/pulse/idle-field.css); the orbits themselves
 * stand still, only what rides them moves. `rest` — nobody has touched the screen for minutes
 * (D-119): everything holds where it is. `still` — the face has something to say or a phrase is in
 * flight: no waves, the orbits go on.
 */
export function IdleField({ hx, hy, rest = false, still = false }: { hx: number; hy: number; rest?: boolean; still?: boolean }) {
  const radius = fieldRadius(hx, hy);
  const size = radius * 2;
  return (
    <div aria-hidden data-testid="idle-field" data-rest={rest ? "" : undefined} className="idle-field pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" style={{ "--field": `${size}px` } as CSSProperties}>
      <svg className="idle-orbits" width={size} height={size} viewBox={`${-radius} ${-radius} ${size} ${size}`}>
        {ORBITS.map((orbit, n) => (
          <circle key={orbit.r} r={Math.round(radius * orbit.r)} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray={n === 1 ? "1.5 10" : "1.5 7"} strokeLinecap="round" opacity={0.2 - n * 0.045} />
        ))}
      </svg>
      {still ? null : (
        <>
          <span className="idle-wave" />
          <span className="idle-wave idle-wave-2" />
        </>
      )}
      {ORBITS.map((orbit) =>
        orbit.motes.map((phase, n) => (
          <span
            key={`${orbit.r}-${phase}`}
            className="idle-arm"
            style={{ animationDuration: `${Math.abs(orbit.turn)}s`, animationDirection: orbit.turn < 0 ? "reverse" : "normal", animationDelay: `${(-Math.abs(orbit.turn) * phase).toFixed(1)}s` }}
          >
            <i className="idle-mote" style={{ "--r": `${Math.round(radius * orbit.r)}px`, "--d": `${n % 2 ? 4 : 5.5}px`, animationDelay: `${(-phase * 5).toFixed(1)}s` } as CSSProperties} />
          </span>
        )),
      )}
      <span className="idle-comet" style={{ "--w": `${Math.round(radius * ORBITS[1]!.r) * 2}px` } as CSSProperties} />
    </div>
  );
}

/** The wave's own easing (`idle-wave` in idle-field.css), as the two control points of its curve. */
const WAVE_CURVE = [0.2, 0.55, 0.4, 1] as const;

/**
 * When, after a wave leaves the ring, its front is `distance` px from the middle of the mark: the
 * curve of the wave turned inside out. null — the wave has faded before it gets there.
 */
export function fieldWaveDelay(distance: number, radius: number): number | null {
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
  return Math.round(at(x1, x2, low) * FIELD_WAVE_MS * FIELD_WAVE_REACH);
}
