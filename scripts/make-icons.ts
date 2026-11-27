/**
 * The app's icons, drawn from the mascot's mark — a dot in a ring with its light — in the product's
 * own colours (never a client's). One drawing, rendered by Chrome into every size the browser, the
 * notification shade, the phone's home screen and the desktop window ask for:
 *   public/icons/icon.svg              the source of the app icon
 *   public/icons/icon-192.png, -512    «any»: a rounded dark tile
 *   public/icons/maskable-512.png      full bleed, the mark inside the safe circle
 *   public/icons/apple-touch-icon.png  180, full bleed (iOS rounds it itself)
 *   public/icons/favicon-32.png, -64   the tab: a heavier line, no light — a thin ring dies at 16 px
 *   public/icons/badge-96.png          the status bar: the bare mark, white on nothing (alpha only)
 *   app/favicon.ico                    16, 32, 48 of the tab drawing
 * After a change of the drawing, bump ICON_V where the icons are named (app/manifest.ts,
 * app/layout.tsx, public/sw.js, DeskShell): the worker keeps /icons/ cache-first.
 *   pnpm icons:make
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BG = "#0B0F14";
const INK = "#2ED3B7";
const ICONS = join(process.cwd(), "public", "icons");

/**
 * The mark on a square of `size`: `ring` — the ring's radius, `line` — its width and `dot` — the
 * dot's radius, as shares of the square. `tile` — the dark square behind it: a corner radius as a
 * share, 0 for full bleed, null for none. `light` — the glow, the sheen and the glint.
 */
function mark({ size, ring, line, dot, tile, light, ink = INK }: { size: number; ring: number; line: number; dot: number; tile: number | null; light: boolean; ink?: string }): string {
  const c = size / 2;
  const r = ring * size;
  const w = line * size;
  const d = dot * size;
  const back = tile === null ? "" : `<rect width="${size}" height="${size}" rx="${tile * size}" fill="${BG}"/>`;
  const defs = light
    ? `<defs>
    <radialGradient id="glow"><stop offset="0" stop-color="${ink}" stop-opacity="0.08"/><stop offset="0.5" stop-color="${ink}" stop-opacity="0.16"/><stop offset="0.62" stop-color="${ink}" stop-opacity="0.38"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></radialGradient>
    <radialGradient id="bead" cx="0.36" cy="0.32" r="0.8"><stop offset="0" stop-color="#9BF3E3"/><stop offset="0.55" stop-color="${ink}"/><stop offset="1" stop-color="#1FA88F"/></radialGradient>
    <linearGradient id="tube" x1="0.15" y1="0.1" x2="0.85" y2="0.9"><stop offset="0" stop-color="#8FF0DF"/><stop offset="0.4" stop-color="${ink}"/><stop offset="1" stop-color="#22B59C"/></linearGradient>
  </defs>`
    : "";
  // the light hugs the ring (its radius is 0.62 of the glow's) and thins towards the middle, as on Пульс
  const glow = light ? `<circle cx="${c}" cy="${c}" r="${r * 1.62}" fill="url(#glow)"/>` : "";
  const glint = light ? `<circle cx="${c - d * 0.34}" cy="${c - d * 0.36}" r="${d * 0.2}" fill="#fff" fill-opacity="0.9"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${defs}
  ${back}
  ${glow}
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${light ? "url(#tube)" : ink}" stroke-width="${w}"/>
  <circle cx="${c}" cy="${c}" r="${d}" fill="${light ? "url(#bead)" : ink}"/>
  ${glint}
</svg>`;
}

/** The home-screen drawing: the ring a little heavier than on Пульс — an icon is looked at from afar. */
const APP = { ring: 0.27, line: 0.036, dot: 0.086, light: true };
/** The tab drawing: no light, a line that survives 16 px. */
const TAB = { ring: 0.33, line: 0.11, dot: 0.13, light: false };

const DRAWINGS: { file: string; size: number; svg: string }[] = [
  { file: "icon-192.png", size: 192, svg: mark({ size: 192, ...APP, tile: 0.22 }) },
  { file: "icon-512.png", size: 512, svg: mark({ size: 512, ...APP, tile: 0.22 }) },
  // the safe zone of a maskable icon is the middle circle of 80 %: the mark and most of its light stay inside
  { file: "maskable-512.png", size: 512, svg: mark({ size: 512, ring: 0.24, line: 0.033, dot: 0.077, light: true, tile: 0 }) },
  { file: "apple-touch-icon.png", size: 180, svg: mark({ size: 180, ...APP, tile: 0 }) },
  { file: "favicon-32.png", size: 32, svg: mark({ size: 32, ...TAB, tile: 0.22 }) },
  { file: "favicon-64.png", size: 64, svg: mark({ size: 64, ...TAB, tile: 0.22 }) },
  { file: "badge-96.png", size: 96, svg: mark({ size: 96, ring: 0.36, line: 0.1, dot: 0.13, light: false, tile: null, ink: "#fff" }) },
];

/** An .ico of PNG pictures: the header, a 16-byte entry a picture, the pictures themselves. */
function ico(pictures: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pictures.length, 4);
  let offset = 6 + 16 * pictures.length;
  const entries = pictures.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([head, ...entries, ...pictures.map((picture) => picture.png)]);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const shoot = async (svg: string, size: number): Promise<Buffer> => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  for (const drawing of DRAWINGS) {
    writeFileSync(join(ICONS, drawing.file), await shoot(drawing.svg, drawing.size));
    console.log(`${drawing.file}  ${drawing.size}`);
  }
  writeFileSync(join(ICONS, "icon.svg"), `${mark({ size: 512, ...APP, tile: 0.22 })}\n`);
  const tab = [];
  for (const size of [16, 32, 48]) tab.push({ size, png: await shoot(mark({ size, ...TAB, tile: 0.22 }), size) });
  writeFileSync(join(process.cwd(), "app", "favicon.ico"), ico(tab));
  console.log("icon.svg, app/favicon.ico  16 32 48");
  await browser.close();
}

void main();
