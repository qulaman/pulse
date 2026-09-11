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

export const durations = {
  instant: "120ms",
  screen: "150ms",
  effect: "400ms",
  tv: "500ms",
} as const;

export const easing = {
  out: "cubic-bezier(0.2, 0, 0, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/** Framer Motion spring for cards, mascot and counters. */
export const spring = { stiffness: 260, damping: 24 } as const;

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
  spring,
} as const;

export type ColorToken = keyof typeof colors;
