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
 * thread sleeps (0.04 s of 10). It stays a CSS animation, so `[data-still]` and the deep rest's
 * `[data-asleep]` stop it.
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
