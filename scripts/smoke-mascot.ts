/**
 * Visual regression of the mascots: every row of /dev/frames (one motion as a strip of frames,
 * held still by the page) is screenshotted and compared with the baseline taken on this machine —
 * pixel by pixel in the browser, ignoring the ±1 of rasterisation. A change to a keyframe, a prop or
 * a hand shows up as the list of rows it touched, with the old and the new picture on disk.
 *   pnpm smoke:mascot              compare with the baseline (APP_URL, default http://localhost:3000)
 *   UPDATE=1 pnpm smoke:mascot     take the baseline (after a change you meant)
 *   REDUCED=1 pnpm smoke:mascot    the same under prefers-reduced-motion: the still frames
 *   SETS=sec,desk                  only these sets (drop-states, drop-acts, sec, desk, transitions)
 * Pictures live in .smoke-ui/mascot/<motion|reduced>/{baseline,current}/<set>/<row>.png.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const UPDATE = process.env.UPDATE === "1";
const REDUCED = process.env.REDUCED === "1";
const SETS = (process.env.SETS ?? "drop-states,drop-acts,sec,desk,transitions").split(",");
const ROOT = join(process.cwd(), ".smoke-ui", "mascot", REDUCED ? "reduced" : "motion");
/** A pixel counts as changed past this much on any channel; a row, past this many pixels. */
const CHANNEL = 24;
const PIXELS = 12;

/**
 * How many pixels of two PNGs differ (−1: not the same size), decoded by the browser itself. The
 * code goes as a string: tsx would wrap a function literal in helpers the page does not have.
 */
const DIFF_IN_PAGE = `async ({ a, b, channel }) => {
  const images = await Promise.all([a, b].map(async (base64) => {
    const image = new Image();
    image.src = "data:image/png;base64," + base64;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  }));
  const x = images[0];
  const y = images[1];
  if (x.width !== y.width || x.height !== y.height) return -1;
  let count = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const off = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
    if (off > channel) count += 1;
  }
  return count;
}`;

async function diffPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const args = JSON.stringify({ a: a.toString("base64"), b: b.toString("base64"), channel: CHANNEL });
  return page.evaluate(`(${DIFF_IN_PAGE})(${args})`) as Promise<number>;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1200 }, deviceScaleFactor: 1, colorScheme: "dark" });
  if (REDUCED) await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // a blank page of its own decodes the pictures, away from the sheet being measured
  const judge = await browser.newPage();

  let same = 0;
  let fresh = 0;
  const changed: string[] = [];
  for (const set of SETS) {
    await page.goto(`${APP_URL}/dev/frames?set=${set}&n=8&size=96`, { waitUntil: "networkidle" });
    await page.waitForSelector("main[data-ready]", { timeout: 30_000 });
    for (const row of await page.locator("[data-row]").all()) {
      const key = (await row.getAttribute("data-row"))!;
      const shot = await row.screenshot();
      const base = join(ROOT, "baseline", set, `${key}.png`);
      if (UPDATE) {
        mkdirSync(join(ROOT, "baseline", set), { recursive: true });
        writeFileSync(base, shot);
        fresh += 1;
        continue;
      }
      if (!existsSync(base)) {
        fresh += 1;
        console.log(`new   ${set}/${key}  (no baseline — UPDATE=1 takes one)`);
        continue;
      }
      const pixels = await diffPixels(judge, readFileSync(base), shot);
      if (pixels >= 0 && pixels <= PIXELS) {
        same += 1;
        continue;
      }
      mkdirSync(join(ROOT, "current", set), { recursive: true });
      const now = join(ROOT, "current", set, `${key}.png`);
      writeFileSync(now, shot);
      changed.push(`${set}/${key}`);
      console.log(`DIFF  ${set}/${key}  (${pixels < 0 ? "another size" : `${pixels} px`})\n        was ${base}\n        now ${now}`);
    }
  }
  await browser.close();

  if (errors.length) console.log(`page errors:\n  ${errors.join("\n  ")}`);
  if (UPDATE) console.log(`baseline: ${fresh} rows → ${join(ROOT, "baseline")}`);
  else console.log(`${same} unchanged, ${changed.length} changed, ${fresh} without a baseline`);
  process.exit(errors.length || changed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
