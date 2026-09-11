/**
 * Accent replacement rule (docs/DESIGN.md §2): a client accent is honoured only when
 * its contrast with the app background is at least 4.5:1 — otherwise the default stays.
 * Pure functions: shared by the settings form (live readout) and the server (apply).
 */

export const APP_BG = "#0B0F14";
export const DEFAULT_ACCENT = "#2ED3B7";
export const MIN_ACCENT_CONTRAST = 4.5;

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colours; null when either is malformed. */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The accent the UI should actually use: the client's when it passes, the default otherwise. */
export function effectiveAccent(candidate: string | null | undefined): { accent: string; custom: boolean } {
  if (!candidate) return { accent: DEFAULT_ACCENT, custom: false };
  const ratio = contrastRatio(candidate, APP_BG);
  if (ratio === null || ratio < MIN_ACCENT_CONTRAST) return { accent: DEFAULT_ACCENT, custom: false };
  const normalised = `#${parseHex(candidate)!.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  return { accent: normalised, custom: true };
}
