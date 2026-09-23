import type { Chase, Sample } from "@/lib/idle/flight";

/**
 * What the dream does to the room it flies through.
 *
 * The flight (lib/idle/flight.ts) and the team on the waiting screen (lib/idle/people.ts) are
 * measured from the same point — the middle of the face — so it can be worked out in advance
 * who the dream passes close to, and when. That is all this file does: it is given the flight
 * and a point, and it hands back the moments that point is brushed, each with the direction of
 * the shove, so the shove can be written into `@keyframes` for the whole dream at once.
 *
 * The rule of the scene holds (docs/DESIGN.md §3, D-45): worked out once when a dream starts,
 * handed to the browser as keyframes, and after that JS sleeps. Nothing here runs per frame,
 * nothing watches anything, and no reaction ever costs a render.
 */

/**
 * One figure of the dream, as far as the room is concerned: which of the two flights it rides,
 * how many milliseconds after that flight it sets off, and how big it is drawn. The trail is
 * what gives the dragon its body — its links ride the chaser's own line tens of milliseconds
 * apart, so a row of people is bent by the head first and by the tail last.
 */
export type Touch = { track: "lead" | "chase"; trail: number; size: number };

/**
 * One brush: when the figure came nearest, which way it pushed (a unit vector from the figure
 * to the thing it went past) and how hard — 1 when it went straight through, 0 at the very
 * edge of reach.
 */
export type Brush = { t: number; dx: number; dy: number; force: number };

/** How often the flight is looked at. A figure moves ~16px in this long — finer than the eye. */
const STEP_MS = 40;
/** Two brushes closer than this are one event: the weaker is dropped, or they would stutter. */
const APART_MS = 520;
/** At most this many reactions on one person per dream — a row that flickers is noise. */
const MAX_BRUSHES = 6;
/** Under this a pass is not a brush but a coincidence, and nobody should twitch at it. */
const MIN_FORCE = 0.08;

/**
 * How hard a brush of this force is drawn. Most passes are glancing — the figures are big, so
 * the edge of reach is far more likely than the middle of it — and drawn honestly, a glancing
 * pass moves somebody by half a pixel, which is the same as nothing. So the weak end is lifted
 * and the curve flattens towards the top: everything the dream really went past is seen, and a
 * direct hit is still the hardest one.
 */
function feel(force: number): number {
  return 0.3 + 0.7 * Math.sqrt(Math.min(1, Math.max(0, force)));
}

/**
 * The swell of the dream, mirrored from `dream-swell` in app/globals.css.
 *
 * It has to live in both places. The scene grows inside that one CSS animation, so what the
 * screen shows is the flight multiplied by it: without the same curve here, every hit in the
 * first two seconds would be worked out for a scene four times the size of the one on screen.
 * The knots are pinned by lib/idle/wake.test.ts, so a change to the CSS that is not made here
 * breaks a test instead of quietly moving every reaction.
 */
const SWELL = [
  { at: 0, scale: 0.08, ease: [0.3, 0.7, 0.4, 1] as const },
  { at: 0.14, scale: 0.62, ease: null },
  { at: 0.38, scale: 1, ease: null },
] as const;

/** cubic-bezier(x1, y1, x2, y2) as CSS means it: P0 = (0,0), P3 = (1,1), solved for x. */
function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  const curve = (a: number, b: number, t: number) => ((1 - t) ** 3 * 0 + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3);
  // Newton on x, then read y off the same t: eight rounds is far past the pixel
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const dx = curve(x1, x2, t) - x;
    const slope = 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dx) < 1e-5 || slope === 0) break;
    t = Math.min(1, Math.max(0, t - dx / slope));
  }
  return curve(y1, y2, t);
}

/** How big the scene is at this point of the dream, 0 at the start and 1 at the end. */
export function swellAt(p: number): number {
  const at = Math.min(1, Math.max(0, p));
  for (let i = 0; i < SWELL.length - 1; i += 1) {
    const from = SWELL[i]!;
    const to = SWELL[i + 1]!;
    if (at > to.at) continue;
    const k = (at - from.at) / (to.at - from.at);
    const eased = from.ease ? bezier(from.ease[0], from.ease[1], from.ease[2], from.ease[3], k) : k;
    return from.scale + (to.scale - from.scale) * eased;
  }
  return 1;
}

/** Where a flight is at this moment. Before it sets off it is still in the head, at its first frame. */
function positionAt(samples: Sample[], t: number): { x: number; y: number } {
  const first = samples[0]!;
  if (t <= first.t) return { x: first.x, y: first.y };
  const last = samples[samples.length - 1]!;
  if (t >= last.t) return { x: last.x, y: last.y };
  let i = 1;
  while (i < samples.length - 1 && samples[i]!.t < t) i += 1;
  const a = samples[i - 1]!;
  const b = samples[i]!;
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Every moment the dream brushes this point. One pass of one figure is one brush, taken at the
 * moment it was nearest; a figure that comes round twice brushes twice. The reach grows with
 * the scene, because a figure the size of a speck cannot shove anybody.
 */
export function brushesOf(chase: Chase, touches: Touch[], x: number, y: number, radius: number): Brush[] {
  const found: Brush[] = [];
  for (const touch of touches) {
    const line = touch.track === "lead" ? chase.lead : chase.chase;
    let near: Brush | null = null;
    for (let t = 0; t <= chase.ms; t += STEP_MS) {
      const scale = swellAt(t / chase.ms);
      const at = positionAt(line, t - touch.trail);
      const px = at.x * scale;
      const py = at.y * scale;
      const reach = radius + (touch.size / 2) * scale;
      const gap = Math.hypot(px - x, py - y);
      if (gap <= reach) {
        const force = 1 - gap / reach;
        if (force < MIN_FORCE) continue;
        // keep the nearest moment of this one pass, not the moment it came into reach
        if (!near || force > near.force) near = { t, dx: (x - px) / (gap || 1), dy: (y - py) / (gap || 1), force };
        continue;
      }
      if (near) {
        found.push(near);
        near = null;
      }
    }
    if (near) found.push(near);
  }

  // The figures of one dream ride the same line moments apart, so a row gets brushed by the
  // head, then by every link. Drawn as they come they would be one long shiver: keep the
  // hardest of each cluster, and the shove is the head going by.
  found.sort((a, b) => a.t - b.t);
  const kept: Brush[] = [];
  for (const brush of found) {
    const last = kept[kept.length - 1];
    if (last && brush.t - last.t < APART_MS) {
      if (brush.force > last.force) kept[kept.length - 1] = { ...brush, t: last.t };
      continue;
    }
    kept.push(brush);
  }
  if (kept.length <= MAX_BRUSHES) return kept;
  // too many passes: keep the hardest, back in order of time
  return [...kept].sort((a, b) => b.force - a.force).slice(0, MAX_BRUSHES).sort((a, b) => a.t - b.t);
}

/** One drawn moment of a reaction: how long after the brush, and what the thing looks like then. */
type Frame = { dt: number; transform: string; opacity?: number; ease?: string };

/** What a person does when the dream goes past him. */
export type Reaction = "star" | "orb" | "rim";

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The three reactions, each as the frames of one brush.
 *
 * A star **flares**: it is a point of light, and light that is disturbed gets brighter before
 * it settles. An idler **ducks**: he is a body, so he is shoved along the way the figure went
 * past, squashes, and comes back with a wobble. The head gets a **ripple** on its rim — the
 * only thing in this scene the face itself can show, because the face is drawn over it and
 * anything inside the rim is never seen (the same trick the flight through the head uses).
 *
 * Nothing here touches colour. A colour on this screen is the stage of a task (D-73): if a
 * dream could paint somebody, the screen would be lying about the director's own work.
 */
const SHAPES: Record<Reaction, (brush: Brush) => Frame[]> = {
  star: (b) => {
    const force = feel(b.force);
    const push = round(6 * force);
    return [
      { dt: 0, transform: "none", ease: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { dt: 70, transform: `translate(${round(b.dx * push)}px, ${round(b.dy * push)}px) scale(${round(1 + 0.7 * force)})`, ease: "ease-in-out" },
      { dt: 260, transform: `translate(${round(b.dx * push * 0.4)}px, ${round(b.dy * push * 0.4)}px) scale(${round(1 - 0.1 * force)})`, ease: "ease-out" },
      { dt: 460, transform: "none" },
    ];
  },
  orb: (b) => {
    const force = feel(b.force);
    const push = round(20 * force);
    return [
      { dt: 0, transform: "none", ease: "ease-in" },
      { dt: 90, transform: `translate(${round(b.dx * push * 0.45)}px, ${round(b.dy * push * 0.45)}px) scale(${round(1 - 0.12 * force)})`, ease: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
      { dt: 230, transform: `translate(${round(b.dx * push)}px, ${round(b.dy * push)}px) scale(${round(1 - 0.07 * force)})`, ease: "ease-in-out" },
      { dt: 390, transform: `translate(${round(-b.dx * push * 0.26)}px, ${round(-b.dy * push * 0.26)}px) scale(${round(1 + 0.05 * b.force)})`, ease: "ease-out" },
      { dt: 560, transform: "none" },
    ];
  },
  rim: (b) => [
    { dt: 0, transform: "scale(0.88)", opacity: 0, ease: "ease-out" },
    { dt: 60, transform: "scale(1)", opacity: round(0.55 * feel(b.force)), ease: "ease-out" },
    { dt: 520, transform: `scale(${round(1.25 + 0.3 * feel(b.force))})`, opacity: 0 },
    { dt: 560, transform: "scale(0.88)", opacity: 0 },
  ],
};

/**
 * The whole dream of one person as a single animation: flat between the brushes, a bump at
 * each of them. One animation per reacting node, started with the dream and running the length
 * of it — the same way the flight itself is drawn, and for the same reason.
 */
export function keyframesOfBrushes(name: string, brushes: Brush[], ms: number, reaction: Reaction): string {
  const rest = SHAPES[reaction]({ t: 0, dx: 0, dy: 0, force: 0 })[0]!;
  const frames: string[] = [];
  let last = -1;
  const put = (at: number, frame: Frame) => {
    const pct = Math.min(100, Math.max(0, at));
    // keyframes must climb: a bump that lands on the one before it is dropped, not stacked
    if (pct <= last) return;
    last = pct;
    const opacity = frame.opacity === undefined ? "" : ` opacity: ${frame.opacity};`;
    const ease = frame.ease ? ` animation-timing-function: ${frame.ease};` : "";
    frames.push(`${pct.toFixed(3)}% { transform: ${frame.transform};${opacity}${ease} }`);
  };
  put(0, rest);
  for (const brush of brushes) {
    for (const frame of SHAPES[reaction](brush)) put(((brush.t + frame.dt) / ms) * 100, frame);
  }
  put(100, { ...rest, ease: undefined });
  return `@keyframes ${name} { ${frames.join(" ")} }`;
}
