/**
 * The app's sounds (D-204) in a real browser (system Chrome via Playwright) against the dev server.
 * Nobody hears a smoke, so it measures: every node that reaches the speakers is also led into an
 * analyser, and a check reads how many sources started and how high the signal went. A voice must
 * come out (a peak above the floor) and must not clip (a peak well under full scale).
 *
 * Nothing is written to the database: every write of the screens is answered in the browser
 * (scripts/lib/login.ts `readOnly`); the choices of the bench live in the browser's own storage.
 *   pnpm smoke:sounds            (against http://localhost:3000, APP_URL to override)
 *   ACCOUNT=marat@demo.local (default) — a secretary: both the phone's screens and the desk
 */
import { chromium, type Page } from "playwright";

import { CUE_NAMES, CUES } from "../lib/sound";

import { DESKTOP_UA, PHONE, demoPassword, readOnly, signIn } from "./lib/login";
import { APP_URL, finish, record, recordError, skip } from "./lib/smoke";

const ACCOUNT = process.env.ACCOUNT ?? "marat@demo.local";
const PASSWORD = process.env.PASSWORD ?? demoPassword();

/** Quieter than this at the speakers is silence; louder than that is on its way to clipping. */
const FLOOR = 0.004;
const CEILING = 0.7;

/**
 * Runs before the page's own code: every connection to the speakers is doubled into an analyser,
 * read every few milliseconds, and every source that starts is counted. A string: tsx would wrap
 * a function literal in helpers the page does not have.
 */
const PROBE = `(() => {
  const state = { starts: 0, peak: 0, taps: new Map() };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      const ctx = target.context;
      let tap = state.taps.get(ctx);
      if (!tap) {
        tap = ctx.createAnalyser();
        tap.fftSize = 2048;
        state.taps.set(ctx, tap);
        const data = new Float32Array(tap.fftSize);
        setInterval(() => {
          tap.getFloatTimeDomainData(data);
          for (let i = 0; i < data.length; i += 1) state.peak = Math.max(state.peak, Math.abs(data[i]));
        }, 8);
      }
      connect.call(this, tap);
    }
    return connect.call(this, target, ...rest);
  };
  for (const Source of [OscillatorNode, AudioBufferSourceNode]) {
    const start = Source.prototype.start;
    Source.prototype.start = function (...args) {
      state.starts += 1;
      return start.apply(this, args);
    };
  }
  window.__sound = {
    read: () => ({ starts: state.starts, peak: state.peak }),
    reset: () => { state.starts = 0; state.peak = 0; },
  };
})()`;

type Heard = { starts: number; peak: number };

const reset = (page: Page) => page.evaluate("window.__sound.reset()");

/** What came out since the last reset, once the longest voice has rung out. */
async function heard(page: Page, waitMs = 900): Promise<Heard> {
  await page.waitForTimeout(waitMs);
  return (await page.evaluate("window.__sound.read()")) as Heard;
}

const sounded = ({ starts, peak }: Heard) => starts > 0 && peak > FLOOR && peak < CEILING;
const line = ({ starts, peak }: Heard) => `источников ${starts}, пик ${peak.toFixed(3)}`;

async function phone(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext(PHONE);
  await context.addInitScript(PROBE);
  const blocked: string[] = [];
  await readOnly(context, APP_URL, blocked);
  const page = await context.newPage();
  try {
    await signIn(page, APP_URL, { email: ACCOUNT, password: PASSWORD });

    // ---- Профиль → «Звук» ------------------------------------------------------------------
    await page.goto(`${APP_URL}/profile`, { waitUntil: "networkidle" });
    const row = page.getByRole("switch", { name: "Звук" }).or(page.getByText("Звук", { exact: true })).first();
    await row.waitFor({ state: "visible", timeout: 15_000 });
    record("телефон: в «Профиле» есть строка «Звук»", true);

    await row.click();
    const off = await page.evaluate("localStorage.getItem('pulse.sound.v1')");
    record("телефон: «Звук» выключается и помнится на устройстве", off === "off", String(off));

    await reset(page);
    await row.click();
    const on = await page.evaluate("localStorage.getItem('pulse.sound.v1')");
    const answer = await heard(page);
    record("телефон: включение отвечает звуком", on === "on" && sounded(answer), line(answer));

    // ---- Лаб → «Звуки» ---------------------------------------------------------------------
    await page.goto(`${APP_URL}/lab/sounds`, { waitUntil: "networkidle" });
    if (!new URL(page.url()).pathname.startsWith("/lab/sounds")) {
      skip("лаборатория: каждый голос каждого момента слышен", `лаборатория закрыта для ${ACCOUNT}`);
      return;
    }
    const silent: string[] = [];
    const loud: string[] = [];
    let voices = 0;
    const peaks: string[] = [];
    for (const cue of CUE_NAMES) {
      const card = page.getByTestId(`sound-cue-${cue}`);
      for (const voice of CUES[cue].voices) {
        await reset(page);
        await card.getByRole("button", { name: new RegExp(`^${voice} ·`) }).click();
        const out = await heard(page);
        voices += 1;
        peaks.push(`${cue}/${voice} ${out.peak.toFixed(3)}`);
        if (out.starts === 0 || out.peak <= FLOOR) silent.push(`${cue}/${voice} (${line(out)})`);
        if (out.peak >= CEILING) loud.push(`${cue}/${voice} (${line(out)})`);
      }
    }
    record(`лаборатория: каждый голос слышен (${voices})`, silent.length === 0, silent.join("; "));
    if (process.env.PEAKS === "1") console.log(`      пики: ${peaks.join(" · ")}`);
    record("лаборатория: ни один голос не перегружает динамик", loud.length === 0, loud.join("; "));

    // a pick stays on the device and is named in «Что прислать»; «без звука» silences the moment
    const send = page.getByTestId("sound-cue-send");
    await send.getByRole("button", { name: /^landed ·/ }).click();
    await send.getByRole("button", { name: "без звука" }).click();
    const picksLine = (await page.getByTestId("sound-picks-line").textContent()) ?? "";
    record("лаборатория: выбор назван в «Что прислать»", picksLine.includes("send: none"), picksLine);
    await page.getByRole("button", { name: "Вернуть как задумано" }).click();
    const cleared = await page.evaluate("localStorage.getItem('pulse.sound.picks.v1')");
    record("лаборатория: «Вернуть как задумано» стирает выбор", cleared === null, String(cleared));

    // loudness: the top step is still under the ceiling on the loudest of our voices
    await reset(page);
    await page.getByRole("button", { name: "Громко", exact: true }).click();
    const top = await heard(page);
    record("лаборатория: на «Громко» звук не перегружен", sounded(top), line(top));
    await page.getByRole("button", { name: "Как есть", exact: true }).click();

    const wrote = blocked.filter((what) => !/receipt|seen|read|push|presence/i.test(what));
    record("телефон: экраны звука ничего не пишут в базу", wrote.length === 0, wrote.slice(0, 5).join(", "));
  } catch (error) {
    recordError("телефон", error);
  } finally {
    await context.close();
  }
}

async function desk(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: "ru-RU" });
  await context.addInitScript(PROBE);
  await readOnly(context, APP_URL, []);
  const page = await context.newPage();
  try {
    await signIn(page, APP_URL, { email: ACCOUNT, password: PASSWORD });
    await page.goto(`${APP_URL}/desk/profile`, { waitUntil: "networkidle" });
    const setting = page.getByTestId("desk-profile-action-sound");
    await setting.waitFor({ state: "visible", timeout: 15_000 });
    record("компьютер: в профиле есть «Звуки действий»", true);

    // a plain button of the desk clicks
    await setting.getByRole("tab", { name: "Со звуком" }).or(setting.getByText("Со звуком")).first().click();
    await page.waitForTimeout(900);
    await reset(page);
    await page.locator("nav a[href^='/desk/']").first().click();
    const click = await heard(page);
    record("компьютер: обычная кнопка щёлкает", sounded(click), line(click));

    // with the sounds off it does not
    await page.goto(`${APP_URL}/desk/profile`, { waitUntil: "networkidle" });
    await setting.getByRole("tab", { name: "Без звука" }).or(setting.getByText("Без звука")).first().click();
    await page.waitForTimeout(400);
    await reset(page);
    await page.locator("nav a[href^='/desk/']").first().click();
    const quiet = await heard(page, 500);
    record("компьютер: «Без звука» — кнопки молчат", quiet.starts === 0, line(quiet));
    await page.evaluate("localStorage.removeItem('pulse.sound.v1')");
  } catch (error) {
    recordError("компьютер", error);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    await phone(browser);
    await desk(browser);
  } finally {
    await browser.close();
  }
  finish();
}

void main();
