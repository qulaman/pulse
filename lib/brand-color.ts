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

/* ---- the brand never says a state (owner, 2026-11-25) ------------------------------------------ */

/**
 * The state colours a client's brand must keep away from (docs/DESIGN.md §1.3, the product's one
 * map of states, lib/tasks/tone.ts): green «done / in work», amber «needs attention», red «late».
 * A green brand beside a green «в работе» reads as a state — the pilot's own accent did. The hexes
 * are the phone's tokens (app/globals.css `--phone-ok/-warn/-danger`).
 */
export const STATE_COLORS = [
  { state: "ok", hex: "#34C759", word: "зелёному «готово, в работе»" },
  { state: "warn", hex: "#FFB020", word: "янтарному «требует внимания»" },
  { state: "danger", hex: "#FF5A52", word: "красному «просрочено»" },
] as const;

export type StateColor = (typeof STATE_COLORS)[number]["state"];

/** Hues nearer than this to a state colour are taken by it. */
export const STATE_HUE_GAP = 25;

/** Below this saturation a colour is a grey: it has no hue to be confused with a state. */
const GREY_SATURATION = 0.15;

/** The HSL hue of a colour in degrees, 0–360; null for a malformed hex or a grey. */
export function hueOf(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
  if (saturation < GREY_SATURATION) return null;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

/** The shorter way round the colour wheel between two hues. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export type AccentClash = { state: StateColor; word: string; distance: number };

/** The state colour this brand colour would be taken for, the nearest one; null — it says no state. */
export function accentClash(hex: string | null | undefined): AccentClash | null {
  if (!hex) return null;
  const hue = hueOf(hex);
  if (hue === null) return null;
  let nearest: AccentClash | null = null;
  for (const color of STATE_COLORS) {
    const distance = hueDistance(hue, hueOf(color.hex) as number);
    if (distance < STATE_HUE_GAP && (!nearest || distance < nearest.distance)) nearest = { state: color.state, word: color.word, distance };
  }
  return nearest;
}

/** Brand colours that say no state and stand out on the dark background — the picker offers them. */
export const SAFE_ACCENTS = [
  { hex: DEFAULT_ACCENT, name: "бирюзовый" },
  { hex: "#4DA3FF", name: "синий" },
  { hex: "#A78BFA", name: "фиолетовый" },
  { hex: "#F472B6", name: "розовый" },
] as const;

/** What the picker says of a colour too near a state, one sentence with the way out. */
export function clashWords(clash: AccentClash): string {
  return `Слишком близко к ${clash.word}: в Pulse этот цвет значит состояние задачи. Подойдут бирюзовый, синий, фиолетовый или розовый`;
}

/** The same of a colour saved before the rule: it stays until the next change. */
export function savedClashWords(clash: AccentClash): string {
  return `Цвет компании близок к ${clash.word} — его можно спутать с состоянием задачи. Он остаётся, пока его не сменят; новый цвет — из подходящих`;
}

/**
 * Whether a brand colour may be saved: a new colour may not be taken for a state; the one already
 * stored stays as it is (no colour is changed behind the client's back). Null — fine; else the words.
 */
export function accentRefusal(next: string | null | undefined, stored: string | null | undefined): string | null {
  if (!next) return null;
  if (stored && next.toUpperCase() === stored.toUpperCase()) return null;
  const clash = accentClash(next);
  return clash ? clashWords(clash) : null;
}
