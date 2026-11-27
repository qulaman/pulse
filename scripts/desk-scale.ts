/**
 * The desk's ruler (D-214): every radius, size of a word and length of the hand's answer on `/desk`
 * is one of a short scale, and nothing glows for looks. This script reads the desk's styles and
 * components and names every value that is off the scale.
 *   node node_modules/tsx/dist/cli.mjs scripts/desk-scale.ts     (pnpm check:desk-scale)
 * `tests/desk-scale.test.ts` runs the same check with the unit tests.
 *
 * Not held here: `journal.css` (the base under «Графит», drawn over), `surface.css` (shared with
 * the console /ops) and `transitions.css` (the screen's own moves, D-184: their lengths are tuned
 * to each other). Keyframe animations keep their own lengths — they are choreography; the scale
 * holds `transition`, the answer to the hand.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const RADII = [0, 2, 4, 6, 8, 12, 16, 9999];
/** Words: 11–28; figures (a total, a clock): 32, 36, 44. */
export const FONT_SIZES = [11, 12, 13, 14, 16, 20, 24, 28, 32, 36, 44];
/** A press, a colour, a layer, a sheet, the whole screen. Under 40 — a step of a stagger; from 600 — a breath, not an answer. */
export const DURATIONS = [0, 80, 140, 200, 320, 480];

const SKIP_CSS = new Set(["journal.css", "surface.css", "transitions.css"]);

/** Colour with a blur and no body that stays: the alarm, the ringing lamp, the phone drawn inside the wall's preview. */
const GLOW_ALLOWED = [/--lamp\b/, /--phone-/, /errands\.css.*--pencil/, /--sos\b/, /--alarm/];
/** A radial gradient that draws a thing, not a light from a card's corner. */
const RADIAL_ALLOWED = [/errands-alarm\.css/, /circle at 8px 50%/, /--sos\b/];

export type Violation = { file: string; line: number; kind: string; text: string };

function durationOk(ms: number): boolean {
  return ms < 40 || ms >= 600 || DURATIONS.includes(ms);
}

export function checkCss(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  const lines = source.split(/\r?\n/);
  let inTransition = false;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const at = (kind: string) => found.push({ file, line: index + 1, kind, text: line.slice(0, 120) });

    const radius = line.match(/^border(?:-[a-z]+)*-radius:\s*([^;]+)/);
    if (radius) {
      for (const match of radius[1].matchAll(/(\d+(?:\.\d+)?)px/g)) if (!RADII.includes(Number(match[1]))) at(`radius ${match[1]}px`);
    }
    const size = line.match(/^font-size:\s*(\d+(?:\.\d+)?)px/) ?? line.match(/^font:\s*\d+\s+(\d+(?:\.\d+)?)px/);
    if (size && !FONT_SIZES.includes(Number(size[1]))) at(`font-size ${size[1]}px`);

    // a transition may run over several lines: from its name to the semicolon
    if (/^transition(?:-duration)?:/.test(line)) inTransition = true;
    if (inTransition) {
      for (const match of line.matchAll(/(\d+)ms/g)) if (!durationOk(Number(match[1]))) at(`transition ${match[1]}ms`);
      if (line.endsWith(";")) inTransition = false;
    }
    // the curves have names (graphite.css defines them): a raw one is a new curve
    if (/cubic-bezier\(/.test(line) && !/^--ease-/.test(line)) at("raw cubic-bezier");

    const glow = line.match(/^(?:box-shadow:\s*)?(-?\d+(?:px)?)\s+(-?\d+(?:px)?)\s+(\d+)px(?:\s+-?\d+px)?\s+(color-mix\(in srgb, var\(--[a-z-]+\)|rgb\(255 255 255)/);
    if (glow && Number(glow[3]) >= 6 && !/--(rule|line|ink|sheet|page|raise|chrome|overlay|thread)/.test(glow[4])) {
      const where = `${file}: ${line}`;
      if (!GLOW_ALLOWED.some((allowed) => allowed.test(where))) at("coloured glow");
    }
    if (/radial-gradient\(/.test(line) && !RADIAL_ALLOWED.some((allowed) => allowed.test(`${file}: ${line}`))) at("radial light");
  });
  return found;
}

export function checkComponent(file: string, source: string): Violation[] {
  const found: Violation[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const at = (kind: string) => found.push({ file, line: index + 1, kind, text: line.trim().slice(0, 120) });
    for (const match of line.matchAll(/\brounded(?:-[a-z]{1,2})?-\[(\d+(?:\.\d+)?)px\]/g)) if (!RADII.includes(Number(match[1]))) at(`radius ${match[1]}px`);
    for (const match of line.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)) if (!FONT_SIZES.includes(Number(match[1]))) at(`font-size ${match[1]}px`);
    for (const match of line.matchAll(/\bduration-\[(\d+)ms\]/g)) if (!durationOk(Number(match[1]))) at(`transition ${match[1]}ms`);
  });
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every value off the scale in the desk's styles and components, from the repository's root. */
export function checkDesk(root: string = process.cwd()): Violation[] {
  const found: Violation[] = [];
  const name = (full: string) => relative(root, full).replace(/\\/g, "/");
  for (const full of walk(join(root, "app", "desk"))) {
    const file = name(full);
    if (file.endsWith(".css")) {
      if (!SKIP_CSS.has(file.split("/").pop() ?? "")) found.push(...checkCss(file, readFileSync(full, "utf8")));
    } else if (/\.tsx$/.test(file)) found.push(...checkComponent(file, readFileSync(full, "utf8")));
  }
  for (const full of walk(join(root, "components", "desk"))) {
    const file = name(full);
    if (/\.tsx$/.test(file) && !/\.test\./.test(file)) found.push(...checkComponent(file, readFileSync(full, "utf8")));
  }
  return found;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/desk-scale.ts")) {
  const found = checkDesk();
  for (const item of found) console.log(`${item.file}:${item.line}  ${item.kind}  ${item.text}`);
  console.log(found.length === 0 ? "Линейка компьютера: всё на шкале." : `Вне шкалы: ${found.length}.`);
  process.exit(found.length === 0 ? 0 : 1);
}
