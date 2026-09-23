import { rng } from "@/lib/idle/random";

/**
 * How a dream moves across the idle screen.
 *
 * Not a line and not a bounce off a wall: a thing that flies has inertia, so it can only turn
 * so fast, and it is always drifting a little off its own course. That is the whole model —
 * three steering forces on a heading that is rate-limited:
 *
 *   wander       a slow random walk on the heading, low-passed, so the line is a curve that
 *                keeps changing its mind instead of a straight run;
 *   containment  when the point it will be at in a third of a second is outside the screen,
 *                the offending component of the heading is flipped and it turns onto that —
 *                a banked U-turn at the edge instead of a billiard click;
 *   pursue/flee  the chaser steers at where the runner is going, the runner steers away from
 *                the chaser. That is what makes a chase look like a chase: it closes, it
 *                overshoots, it loses ground on the turn.
 *
 * It is simulated once when a dream starts — a couple of milliseconds — and then handed to the
 * browser as keyframes. Nothing here runs per frame, so the perf contract of the mascot holds
 * (docs/DESIGN.md §3): after the dream begins, JS sleeps.
 */

/** One moment of the flight: when, where, and which way the nose points. */
export type Sample = { t: number; x: number; y: number; a: number };

/** Both sides of a chase, over the same stretch of time. */
export type Chase = { lead: Sample[]; chase: Sample[]; ms: number };

export type ChaseOptions = {
  /** Half the play area, in px, measured out from the face. */
  hx: number;
  hy: number;
  /** How long the dream lasts. */
  ms: number;
  seed: number;
  /** px per second */
  speed?: number;
  /** the hardest turn either of them can pull, degrees per second */
  turn?: number;
};

const STEP_MS = 1000 / 60;
/** How far ahead it looks for the wall it is about to hit. */
const LOOK_S = 0.5;
/**
 * The heading is sampled again whenever it has drifted this far, or after this long — but
 * never more often than MIN_SAMPLE_MS, or a flight that curves the whole way would be written
 * out frame by frame. Between samples the browser tweens both the position and the heading,
 * and at a dozen degrees apart that tween is the curve.
 */
const SAMPLE_DEG = 12;
const SAMPLE_MS = 300;
const MIN_SAMPLE_MS = 70;
/**
 * A figure leans into its turn a little more than its heading does. The lean follows a
 * smoothed turn rate, not the raw one: steering is clamped, so the raw rate can flip from one
 * limit to the other in a frame, and the lean would snap with it.
 */
const LEAN_PER_DEG_S = 0.06;
const LEAN_MAX = 14;
const LEAN_EASE = 0.1;

/**
 * How far past its own wall a steered turn can lean before it comes back. Whoever hands in the
 * play area has to keep at least this much between that wall and the real edge of the screen —
 * lib/idle/flight.test.ts pins the number so it cannot drift under the caller.
 */
export const MAX_OVERSHOOT = 34;

const RAD = Math.PI / 180;
/** How hard a wall pushes once the figure is right against it, against a heading of length 1. */
const WALL_PUSH = 3.2;

/**
 * How far back the chaser rides (D-67). The figures are drawn up to ~84px across
 * (components/pulse/DreamOrbit.tsx), so a chaser that is allowed onto the runner's back makes
 * one blob of the two of them and the runner — the whole point of the dream — is simply not
 * there any more. So it is held off instead: it steers for a point this far behind him and
 * eases off inside it, the way something that has caught up lopes instead of sprinting, while
 * the runner keeps full speed throughout. It still closes on every turn, and still loses the
 * ground again, but it never arrives.
 */
const STAND_OFF = 195;
/** How much that distance varies from dream to dream, so no two chases are held the same. */
const STAND_OFF_SPREAD = 0.22;
/** The slowest the chaser gets, as a share of full speed, when it is right on top of him. */
const CHASE_BRAKE = 0.4;
/** How far off the runner feels something behind him and starts bending away. */
const FLEE_RANGE = 320;

/** What the chaser's speed is worth at this gap: full at a legible distance, braking inside it. */
function pace(gap: number, standoff: number): number {
  const k = Math.min(1, gap / standoff);
  return CHASE_BRAKE + (1 - CHASE_BRAKE) * k;
}

/**
 * How much the walls of one axis push a figure back. Nothing in the middle band, growing by
 * the square of how far into the margin it is, and going on growing if it is somehow outside —
 * so a figure that is out always comes back, and one that is not is only ever nudged.
 */
function push(pos: number, half: number, margin: number): number {
  const over = pos - (half - margin);
  if (over > 0) return -Math.min(WALL_PUSH * 3, (over / margin) ** 2 * WALL_PUSH);
  const under = -half + margin - pos;
  if (under > 0) return Math.min(WALL_PUSH * 3, (under / margin) ** 2 * WALL_PUSH);
  return 0;
}

type Agent = {
  x: number;
  y: number;
  /** heading in degrees, never wrapped: keyframes interpolate it, so it must stay continuous */
  a: number;
  /** the low-passed random walk that keeps the line curving */
  drift: number;
  /** the smoothed turn rate the lean is drawn from */
  lean: number;
  out: Sample[];
  lastKept: Sample;
};

/** The shortest way round from one heading to another, in degrees. */
function delta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function agentAt(x: number, y: number, a: number): Agent {
  const first = { t: 0, x, y, a };
  return { x, y, a, drift: 0, lean: 0, out: [first], lastKept: first };
}

/**
 * Keep a moment only when it says something new: the heading has drifted far enough to matter,
 * or enough time has passed. A straight run costs two samples, a hard turn costs a dozen.
 */
function keep(agent: Agent, t: number, turnRate: number, force = false): void {
  agent.lean += (Math.max(-LEAN_MAX, Math.min(LEAN_MAX, turnRate * LEAN_PER_DEG_S)) - agent.lean) * LEAN_EASE;
  const last = agent.lastKept;
  const since = t - last.t;
  const moved = Math.abs(agent.a - last.a) >= SAMPLE_DEG || since >= SAMPLE_MS;
  if (!force && (!moved || since < MIN_SAMPLE_MS)) return;
  const lean = agent.lean;
  const sample = { t, x: Math.round(agent.x * 10) / 10, y: Math.round(agent.y * 10) / 10, a: Math.round((agent.a + lean) * 10) / 10 };
  // the closing sample usually lands a hair after the last one: move that one to the end
  // instead of stacking two on the same instant, or the tween between them is a spin
  if (force && agent.out.length > 1 && since < MIN_SAMPLE_MS) agent.out[agent.out.length - 1] = sample;
  else agent.out.push(sample);
  agent.lastKept = { t, x: agent.x, y: agent.y, a: agent.a };
}

/**
 * Simulate the two of them together. They share the clock, so the follower's line is the line
 * its own steering drew, not a copy of the leader's with a delay.
 */
export function flyChase({ hx, hy, ms, seed, speed = 390, turn = 240 }: ChaseOptions): Chase {
  const random = rng(seed);
  const dt = STEP_MS / 1000;
  // this dream's own idea of how far back the chaser rides, never more than the play area can
  // hold: on a small board a stand-off wider than the screen is not a chase, it is two figures
  // in opposite corners
  const standoff = Math.min(STAND_OFF * (1 + (random() - 0.5) * 2 * STAND_OFF_SPREAD), Math.hypot(hx, hy) * 0.7);
  const lead = agentAt(0, 0, random() * 360);
  // the chaser leaves the head already the stand-off behind him and pointed after him — inside
  // the play area, wherever that puts it. At this moment the whole scene is still a speck
  // inside the face, so what the screen shows is the two of them coming out of it one after
  // the other, and not a dream that begins with a capture
  const back = (v: number, half: number) => Math.max(-half * 0.8, Math.min(half * 0.8, v));
  const chase = agentAt(
    back(-Math.cos(lead.a * RAD) * standoff, hx),
    back(-Math.sin(lead.a * RAD) * standoff, hy),
    lead.a + (random() - 0.5) * 30,
  );

  const steer = (agent: Agent, want: number, turnLimit: number): number => {
    const d = delta(agent.a, want);
    const max = turnLimit * dt;
    const step = Math.max(-max, Math.min(max, d));
    agent.a += step;
    return step / dt;
  };

  const advance = (agent: Agent, factor: number) => {
    agent.x += Math.cos(agent.a * RAD) * speed * factor * dt;
    agent.y += Math.sin(agent.a * RAD) * speed * factor * dt;
  };

  /** The heading it would rather be on: its own wander, bent by the wall and by the other one. */
  const desired = (agent: Agent, other: Agent, kind: "lead" | "chase"): { want: number; urgent: number } => {
    // the wander: a random walk on the turn rate, damped, so the curve is smooth
    agent.drift = agent.drift * 0.94 + (random() - 0.5) * (kind === "lead" ? 26 : 16);
    let want = agent.a + agent.drift * dt * 12;

    // the chase: steer at where the runner will be, or away from where the chaser is
    const dx = other.x - agent.x;
    const dy = other.y - agent.y;
    const gap = Math.hypot(dx, dy);
    if (kind === "chase") {
      // It is after his tail, not his back. From far off that point is ahead of the runner —
      // the cut-off, which is what makes it close — but it slides back down his line as the gap
      // shrinks, and once the chaser is nearer than the stand-off the point is behind the runner
      // altogether, so the chaser peels off instead of climbing onto him. That, and not the
      // brake alone, is what keeps the runner visible under his pursuer.
      const leadTime = Math.min(0.9, gap / speed);
      const reach = speed * leadTime - standoff;
      const aimX = other.x + Math.cos(other.a * RAD) * reach;
      const aimY = other.y + Math.sin(other.a * RAD) * reach;
      // right on the point the heading to it is noise, so it holds its own course instead
      if (Math.hypot(aimX - agent.x, aimY - agent.y) > 40) {
        want = agent.a + delta(agent.a, Math.atan2(aimY - agent.y, aimX - agent.x) / RAD) * 0.75;
      }
    } else if (gap < FLEE_RANGE) {
      // close enough to feel it: the runner bends away, harder the closer it gets
      const away = Math.atan2(-dy, -dx) / RAD;
      want = agent.a + delta(agent.a, away) * (0.2 + 0.5 * (1 - gap / FLEE_RANGE));
    }

    // The walls push instead of switching. Anything that flips a component of the heading —
    // "turn away from the wall you are about to cross" — chatters: two walls take turns being
    // the one in front, the orders cancel out frame by frame, and the thing sails straight off
    // the screen while its nose twitches. A push that grows smoothly with how close it already
    // is cannot do that, and it also gives the shape we want: it starts leaning away early and
    // comes off the edge on a curve.
    const marginX = Math.min(speed * LOOK_S, hx * 0.8);
    const marginY = Math.min(speed * LOOK_S, hy * 0.8);
    let vx = Math.cos(want * RAD);
    let vy = Math.sin(want * RAD);
    const px = push(agent.x, hx, marginX);
    const py = push(agent.y, hy, marginY);
    vx += px;
    vy += py;
    const urgent = Math.min(1, Math.max(Math.abs(px), Math.abs(py)) / WALL_PUSH);

    return { want: agent.a + delta(agent.a, Math.atan2(vy, vx) / RAD), urgent };
  };

  for (let t = 0; t + STEP_MS < ms; t += STEP_MS) {
    for (const [agent, other, kind] of [
      [lead, chase, "lead"],
      [chase, lead, "chase"],
    ] as const) {
      const { want, urgent } = desired(agent, other, kind);
      const rate = steer(agent, want, turn * (1 + urgent * 2.4));
      advance(agent, kind === "chase" ? pace(Math.hypot(other.x - agent.x, other.y - agent.y), standoff) : 1);
      keep(agent, t + STEP_MS, rate);
    }
  }
  keep(lead, ms, 0, true);
  keep(chase, ms, 0, true);
  return { lead: lead.out, chase: chase.out, ms };
}

/**
 * The flight as CSS. Between two samples both the position and the heading move evenly, and
 * the samples are close enough together that a straight tween between them is the curve. One
 * transform per frame, so it stays on the compositor.
 */
export function keyframesOf(name: string, samples: Sample[], ms: number): string {
  const frames = samples.map((s) => {
    const at = Math.min(100, Math.max(0, (s.t / ms) * 100)).toFixed(3);
    return `${at}% { transform: translate(${s.x}px, ${s.y}px) rotate(${s.a}deg); }`;
  });
  return `@keyframes ${name} { ${frames.join(" ")} }`;
}
