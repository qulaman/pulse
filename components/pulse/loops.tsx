/**
 * The waiting screen's loops, folded: many cycles of a motion in one iteration of its animation.
 *
 * Why: React listens to `animationiteration` on the root of every page, and while anybody listens,
 * Chrome wakes the main thread at every iteration boundary of every infinite CSS animation — about
 * eight frames each, even when the animation itself runs on the compositor — and every one of those
 * frames recalculates the style of everything that moves. Twenty idlers shivering at 0.8 s kept the
 * main thread busy every frame (4.4 s of 10 at CPU ×4); a bee's wings at 0.09 s did the same for a
 * whole dream. Folded, the motion is the same — the same stops, the same easing on every segment —
 * but the boundary comes once a minute (the team) or once a dream (the dream's figures), and the main
 * thread sleeps (0.04 s of 10). It stays a CSS animation, so `prefers-reduced-motion`, `[data-still]`
 * and the deep rest's `[data-asleep]` stop it exactly as before.
 *
 * A loop is written as one cycle of stops; `loop(name, cycleMs, rest)` gives the `animation` value
 * with the iteration as long as its folded cycles. The keyframes go into the page once, as one
 * hoisted `<style>` (`<Loops />`, rendered by whoever uses them — React keeps a single copy).
 */

type Stop = readonly [at: number, frame: string];

/** A hair of a cycle: how long before a cycle ends a sawtooth steps back to its start. */
const STEP = 0.0005;

function pct(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}

/** `cycles` copies of one cycle in one `@keyframes`; equal frames share one selector list. */
function folded(name: string, stops: readonly Stop[], cycles: number): string {
  const byFrame = new Map<string, string[]>();
  const put = (at: number, frame: string) => byFrame.set(frame, [...(byFrame.get(frame) ?? []), pct(at)]);
  // a cycle that does not end where it starts (a sawtooth) steps back in a hair before the next
  // one begins, so every cycle starts exactly where the unfolded loop would start it
  const sawtooth = stops[0]![1] !== stops[stops.length - 1]![1];
  for (let c = 0; c < cycles; c += 1) {
    for (const [at, frame] of stops) {
      // a closed cycle's start is the previous cycle's end, already there
      if (c > 0 && at === 0 && !sawtooth) continue;
      put((c + (sawtooth && at === 1 && c < cycles - 1 ? 1 - STEP : at)) / cycles, frame);
    }
  }
  return `@keyframes ${name} { ${[...byFrame].map(([frame, at]) => `${at.join(", ")} { ${frame} }`).join(" ")} }`;
}

/** Each loop: one cycle of stops, and how many cycles one iteration carries. */
const LOOPS = {
  // ---- the team (D-118): a minute and more per iteration ------------------------------------
  // an idler stands in his row and shivers: nothing to do, and it shows. One cycle is there and
  // back — the old `alternate` written out — so `cycleMs` is twice the one-way drift
  "orb-drift": {
    cycles: 40,
    stops: [
      [0, "transform: translate(0, 0) rotate(0deg);"],
      [0.125, "transform: translate(var(--orb-dx), var(--orb-dy)) rotate(1.2deg);"],
      [0.25, "transform: translate(0, calc(var(--orb-dy) * -1)) rotate(-0.8deg);"],
      [0.375, "transform: translate(calc(var(--orb-dx) * -1), var(--orb-dy)) rotate(0.6deg);"],
      [0.5, "transform: translate(0, 0) rotate(0deg);"],
      [0.625, "transform: translate(calc(var(--orb-dx) * -1), var(--orb-dy)) rotate(0.6deg);"],
      [0.75, "transform: translate(0, calc(var(--orb-dy) * -1)) rotate(-0.8deg);"],
      [0.875, "transform: translate(var(--orb-dx), var(--orb-dy)) rotate(1.2deg);"],
      [1, "transform: translate(0, 0) rotate(0deg);"],
    ],
  },
  // an idler: the slowest breath on the screen, and nothing else
  "orb-breathe": {
    cycles: 12,
    stops: [
      [0, "transform: scale(1); opacity: 0.82;"],
      [0.5, "transform: scale(1.05); opacity: 1;"],
      [1, "transform: scale(1); opacity: 0.82;"],
    ],
  },
  // handed out, not taken up yet: the ring is whole and breathes
  "crew-wait": {
    cycles: 24,
    stops: [
      [0, "opacity: 0.35;"],
      [0.5, "opacity: 0.95;"],
      [1, "opacity: 0.35;"],
    ],
  },
  // handed in: now and then a ring leaves the closed one — «готово, посмотри»
  "crew-ping": {
    cycles: 16,
    stops: [
      [0, "transform: scale(1); opacity: 0.7;"],
      [0.32, "transform: scale(1.5); opacity: 0;"],
      [1, "transform: scale(1.5); opacity: 0;"],
    ],
  },
  // ---- the dream (D-67, D-82): one iteration outlasts the 14 s flight -----------------------
  // the run: a short bob on every step
  "dream-step": {
    cycles: 37,
    stops: [
      [0, "transform: translateY(-0.8px) rotate(-3deg);"],
      [0.5, "transform: translateY(0.8px) rotate(3deg);"],
      [1, "transform: translateY(-0.8px) rotate(-3deg);"],
    ],
  },
  // the long body slithers: every link rides this with its own phase, so a wave runs down it
  "dream-wave": {
    cycles: 13,
    stops: [
      [0, "transform: translateY(-2.6px) rotate(-4deg);"],
      [0.5, "transform: translateY(2.6px) rotate(4deg);"],
      [1, "transform: translateY(-2.6px) rotate(-4deg);"],
    ],
  },
  // the claws open and close on the air behind the runner
  "dream-grab": {
    cycles: 28,
    stops: [
      [0, "transform: scaleY(0.88) translateX(-0.6px);"],
      [0.5, "transform: scaleY(1.12) translateX(0.8px);"],
      [1, "transform: scaleY(0.88) translateX(-0.6px);"],
    ],
  },
  // the jet: the flame is never the same length two frames running
  "dream-thrust": {
    cycles: 85,
    stops: [
      [0, "transform: scale(0.82, 0.88); opacity: 0.8;"],
      [0.5, "transform: scale(1.14, 1.06); opacity: 1;"],
      [1, "transform: scale(0.82, 0.88); opacity: 0.8;"],
    ],
  },
  // what the jet leaves behind: a puff that falls back and thins out
  "dream-puff": {
    cycles: 26,
    stops: [
      [0, "transform: translateX(2px) scale(0.5); opacity: 0.75;"],
      [1, "transform: translateX(-16px) scale(1.7); opacity: 0;"],
    ],
  },
  // the paper plane banks: from above, a bank is the wings getting narrower and wide again (D-82)
  "dream-bank": {
    cycles: 10,
    stops: [
      [0, "transform: scaleY(1);"],
      [0.3, "transform: scaleY(0.78);"],
      [0.6, "transform: scaleY(1.04);"],
      [1, "transform: scaleY(1);"],
    ],
  },
  // a bee's wings: a blur, never still
  "dream-buzz": {
    cycles: 178,
    stops: [
      [0, "transform: scaleY(1);"],
      [0.5, "transform: scaleY(0.35);"],
      [1, "transform: scaleY(1);"],
    ],
  },
  // each bee hovers off the line on its own beat, so the swarm is a swarm and not a train
  "dream-hover": {
    cycles: 18,
    stops: [
      [0, "transform: translate(0, 0);"],
      [0.25, "transform: translate(2px, -5px);"],
      [0.5, "transform: translate(-1px, 1px);"],
      [0.75, "transform: translate(1.5px, 5px);"],
      [1, "transform: translate(0, 0);"],
    ],
  },
  // the saucer's lights run round the rim
  "dream-lights": {
    cycles: 20,
    stops: [
      [0, "opacity: 0.25;"],
      [0.12, "opacity: 1;"],
      [0.4, "opacity: 0.25;"],
      [1, "opacity: 0.25;"],
    ],
  },
  // the saucer's beam: a ring that leaves the rim and fades
  "dream-beam": {
    cycles: 12,
    stops: [
      [0, "transform: scale(0.9); opacity: 0.7;"],
      [1, "transform: scale(1.5); opacity: 0;"],
    ],
  },
} as const satisfies Record<string, { cycles: number; stops: readonly Stop[] }>;

export type LoopName = keyof typeof LOOPS;

/**
 * The `animation` value of a folded loop: `cycleMs` is one cycle of the motion as it reads on
 * screen; the iteration is that many cycles long. `rest` — easing, delay, `infinite`.
 */
export function loop(name: LoopName, cycleMs: number, rest: string): string {
  return `${name} ${Math.round(cycleMs * LOOPS[name].cycles)}ms ${rest}`;
}

const LOOPS_CSS = (Object.keys(LOOPS) as LoopName[]).map((name) => folded(name, LOOPS[name].stops, LOOPS[name].cycles)).join("\n");

/** The folded keyframes, once per page: React hoists the `<style>` and keeps one copy by `href`. */
export function Loops() {
  return (
    <style href="pulse-loops" precedence="default">
      {LOOPS_CSS}
    </style>
  );
}

/** For the tests: the keyframes text as the page gets it. */
export const loopsCss = LOOPS_CSS;
