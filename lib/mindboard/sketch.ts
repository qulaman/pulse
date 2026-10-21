/**
 * A drawing of a board point (D-141): lines on a 1600×900 grid — 16:9, the shape of the wall —
 * kept as numbers, not as a picture. Small enough for the row of the point, sharp on 4K, open
 * to «Дорисовать». The phone's pad writes it, the phone and the wall draw it with the same
 * paths (`strokePath`). What comes from the database is checked here (`sketchFrom`): a wall
 * must not go dark over a drawing it cannot read. Pure — tests in `sketch.test.ts`.
 */

export const SKETCH_W = 1600;
export const SKETCH_H = 900;

/** The inks of the pad: the text colour, the accent, a marker yellow — decor, not states. */
export type Ink = "text" | "accent" | "warn";
export const INKS: readonly Ink[] = ["text", "accent", "warn"];
export const INK_VAR: Record<Ink, string> = { text: "var(--text)", accent: "var(--accent)", warn: "var(--warn)" };
export const INK_LABEL: Record<Ink, string> = { text: "Белый", accent: "Бирюзовый", warn: "Жёлтый" };

/** A thin line and a marker, in grid units. */
export type Weight = 1 | 2;
export const WEIGHT_WIDTH: Record<Weight, number> = { 1: 7, 2: 18 };

/** One line: its ink, its weight, its points as x, y, x, y… on the grid. */
export type Stroke = { c: Ink; w: Weight; p: number[] };
export type Sketch = { v: 1; strokes: Stroke[] };

/**
 * Past this the pad stops taking lines: the row stays under the base's 256 KB cap — jsonb keeps
 * a number in ~12 bytes (its entry and the numeric), ~24 a point. A finger's scheme, thinned,
 * is a few hundred to a few thousand points.
 */
export const MAX_STROKES = 300;
export const MAX_POINTS = 8_000;

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));

/** A drawing as the wall and the phone may trust it; null — nothing drawable in it. */
export function sketchFrom(value: unknown): Sketch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as { strokes?: unknown }).strokes;
  if (!Array.isArray(raw)) return null;
  const strokes: Stroke[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { c, w, p } = item as { c?: unknown; w?: unknown; p?: unknown };
    if (!Array.isArray(p) || p.length < 2) continue;
    const points: number[] = [];
    for (let at = 0; at + 1 < p.length; at += 2) {
      const x = Number(p[at]);
      const y = Number(p[at + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push(clamp(x, SKETCH_W), clamp(y, SKETCH_H));
    }
    if (points.length < 2) continue;
    strokes.push({ c: INKS.includes(c as Ink) ? (c as Ink) : "text", w: w === 2 ? 2 : 1, p: points });
    if (strokes.length >= MAX_STROKES) break;
  }
  return strokes.length > 0 ? { v: 1, strokes } : null;
}

/** How many points the drawing holds. */
export function pointCount(sketch: Sketch | null): number {
  return sketch ? sketch.strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0) : 0;
}

/** A line more: null — the drawing is full (the pad says so and takes no more). */
export function withStroke(sketch: Sketch | null, stroke: Stroke): Sketch | null {
  const strokes = sketch?.strokes ?? [];
  if (strokes.length >= MAX_STROKES || pointCount(sketch) + stroke.p.length / 2 > MAX_POINTS) return null;
  return { v: 1, strokes: [...strokes, stroke] };
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Fewer points, the same line (Ramer–Douglas–Peucker): a finger gives a point every few
 * pixels, the drawing keeps those that change its shape by more than `epsilon` grid units.
 */
export function simplify(points: readonly number[], epsilon = 2.5): number[] {
  const n = Math.floor(points.length / 2);
  if (n <= 2) return points.slice(0, n * 2).map(Math.round);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    let far = -1;
    let farthest = epsilon;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i * 2], points[i * 2 + 1], points[first * 2], points[first * 2 + 1], points[last * 2], points[last * 2 + 1]);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([first, far], [far, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(points[i * 2]), Math.round(points[i * 2 + 1]));
  return out;
}

/**
 * A point between two segments this short is a wobble of the finger, smoothed; a point between
 * longer ones is a corner the hand meant — a wall of a scheme, the tip of an arrow — and stays.
 */
export const SMOOTH_SPAN = 90;

/**
 * The line as an SVG path, smoothed where the finger only wobbled: through the midpoints of
 * short segments with the points as controls; a corner between long segments stays a corner.
 * A dot (one point) is a tiny segment, so the round cap draws it.
 */
export function strokePath(stroke: Pick<Stroke, "p">): string {
  const p = stroke.p;
  const n = Math.floor(p.length / 2);
  if (n === 0) return "";
  if (n === 1) return `M${p[0]} ${p[1]}l0.01 0`;
  if (n === 2) return `M${p[0]} ${p[1]}L${p[2]} ${p[3]}`;
  const span = (a: number, b: number) => Math.hypot(p[b * 2] - p[a * 2], p[b * 2 + 1] - p[a * 2 + 1]);
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 1; i < n - 1; i++) {
    if (span(i - 1, i) < SMOOTH_SPAN && span(i, i + 1) < SMOOTH_SPAN) {
      const mx = (p[i * 2] + p[i * 2 + 2]) / 2;
      const my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      d += `Q${p[i * 2]} ${p[i * 2 + 1]} ${round1(mx)} ${round1(my)}`;
    } else {
      d += `L${p[i * 2]} ${p[i * 2 + 1]}`;
    }
  }
  d += `L${p[n * 2 - 2]} ${p[n * 2 - 1]}`;
  return d;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** What a point is called where its words would stand: its words, or «Рисунок» for a drawing without them. */
export function pointLabel(text: string, sketch: unknown): string {
  const words = text.trim();
  if (words) return words;
  return isDrawn(sketch) ? "Рисунок" : "";
}

/** There is something to draw: the shape the base insists on (`notes_sketch_check`), checked cheaply. */
export function isDrawn(sketch: unknown): boolean {
  const strokes = sketch && typeof sketch === "object" ? (sketch as { strokes?: unknown }).strokes : null;
  return Array.isArray(strokes) && strokes.length > 0;
}

/** A line of a board that the wall shows: it has words or a drawing. */
export function hasContent(row: { text: string; sketch?: unknown }): boolean {
  return row.text.trim() !== "" || isDrawn(row.sketch);
}
