/**
 * Design tokens — single source of truth (docs/DESIGN.md section 2).
 * CSS variables in app/globals.css mirror these values; lib/design/tokens.test.ts
 * fails the build if the two ever drift apart.
 */

export const colors = {
  bg: "#0B0F14",
  surface: "#121A23",
  "surface-2": "#1B2533",
  border: "#283548",
  text: "#EEF3F8",
  "text-muted": "#93A2B4",
  accent: "#2ED3B7",
  gold: "#F0B24A",
  ok: "#34C759",
  warn: "#FFB020",
  danger: "#FF5A52",
} as const;

/** Not a hex color: kept apart so the CSS parity test stays exact. */
export const overlay = "rgba(4,8,12,.6)";

/** Body: Golos Text (self-hosted by next/font); headings and numbers: Manrope (D-50). */
export const fontStack =
  'var(--font-body), -apple-system, "SF Pro", Roboto, "Segoe UI", system-ui, sans-serif';
export const displayStack = 'var(--font-display), var(--font-body), system-ui, sans-serif';

export const typography = {
  display: { size: 40, lineHeight: 44, weight: 700 },
  h1: { size: 24, lineHeight: 30, weight: 700 },
  h2: { size: 19, lineHeight: 24, weight: 600 },
  body: { size: 16, lineHeight: 22, weight: 400 },
  label: { size: 14, lineHeight: 18, weight: 500 },
  caption: { size: 13, lineHeight: 16, weight: 400 },
} as const;

export const radii = {
  card: 16,
  button: 12,
  sheet: 20,
  round: 9999,
} as const;

/** 4/8/12/16/24/32; screen side padding is 16. */
export const space = [4, 8, 12, 16, 24, 32] as const;

export const minTapTarget = 44;

export const shadows = {
  none: "none",
  raised: "0 8px 24px rgba(0,0,0,.4)",
} as const;

/**
 * Two springs (D-166), as Framer `transition` objects.
 *
 * - `object` — things: sheets, panels, cards, toasts, chips, a segment's thumb. Quick, and it
 *   settles without a bounce (damping ratio ≈ 1): a thing arrives and stays.
 * - `alive` — what lives: the mascot, points, a celebration. It overshoots on purpose.
 *
 * Leaving is faster than arriving: what comes in rides the spring (or `--ease-out` over the
 * full time); what goes out leaves on `--ease-in` in about three quarters of it, or less — a
 * sheet 280 → 210 ms, a toast in on the object spring, out in 150 ms. Nothing waits for the way out.
 */
export const springs = {
  object: { type: "spring", stiffness: 400, damping: 38, mass: 0.9 },
  alive: { type: "spring", stiffness: 260, damping: 24 },
} as const;

/** The bouncy spring of the mascot and counters under its first name — `springs.alive`. */
export const spring = springs.alive;

type SpringParams = { stiffness: number; damping: number; mass?: number };

/** The step response of a spring released at rest from 0 towards 1: [ms, position, speed per second], every `stepMs`. */
export function springSteps({ stiffness, damping, mass = 1 }: SpringParams, stepMs = 0.25, untilMs = 2000): [number, number, number][] {
  const steps: [number, number, number][] = [[0, 0, 0]];
  let x = 0;
  let v = 0;
  const dt = stepMs / 1000;
  for (let i = 1; i * stepMs <= untilMs; i++) {
    v += ((-stiffness * (x - 1) - damping * v) / mass) * dt;
    x += v * dt;
    steps.push([i * stepMs, x, v]);
  }
  return steps;
}

/**
 * A spring written out for CSS and WAAPI: a `linear()` easing and the time it takes to come
 * within `rest` of its end (rounded up to 10 ms). Runs on the compositor, unlike a JS spring.
 */
export function springCurve(spring: SpringParams, { points = 20, rest = 0.002 } = {}): { easing: string; ms: number } {
  const steps = springSteps(spring);
  let last = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (Math.abs(1 - steps[i][1]) > rest) {
      last = steps[i][0];
      break;
    }
  }
  const ms = Math.ceil(last / 10) * 10;
  const stepMs = steps[1][0];
  const values = Array.from({ length: points + 1 }, (_, i) => {
    if (i === points) return "1";
    const at = steps[Math.min(steps.length - 1, Math.round((ms * i) / points / stepMs))][1];
    return String(Number(at.toFixed(3)));
  });
  return { easing: `linear(${values.join(", ")})`, ms };
}

/** `springs.object` for CSS (`--ease-object` over `--t-object`) and WAAPI. */
const objectCurve = springCurve(springs.object);

export const durations = {
  instant: "120ms",
  screen: "150ms",
  effect: "400ms",
  tv: "500ms",
  sheet: "280ms",
  object: `${objectCurve.ms}ms`,
} as const;

export const easing = {
  out: "cubic-bezier(0.2, 0, 0, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  /** `springs.object` sampled into a curve: arriving things in CSS and WAAPI (`durations.object`). */
  object: objectCurve.easing,
} as const;

export const tokens = {
  colors,
  overlay,
  fontStack,
  typography,
  radii,
  space,
  minTapTarget,
  shadows,
  durations,
  easing,
  springs,
  spring,
} as const;

export type ColorToken = keyof typeof colors;
