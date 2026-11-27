/**
 * Pulse, the mark as a lever (D-212): it is pulled, never held. Down — it listens, and the recording
 * goes on with the finger off the mark (a pull up drops it); up — the typed input; right — the
 * secretary comes out from the right, hidden while at rest; left — nothing; a tap — the balls.
 * Nothing is written round the mark: it answers the pull itself.
 *
 * Read-only: every write of the screen is answered in the browser, the microphone is Chrome's fake
 * one and the one recording made is dropped by the pull up — nothing reaches the base or the AI.
 *   pnpm smoke:lever                                 (against http://localhost:3000)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type CDPSession, type Page } from "playwright";

import { DIRECTOR_EMAIL, IPHONE_UA, demoPassword, readOnly, signIn } from "./lib/login";
import { APP_URL, finish, record, recordError } from "./lib/smoke";

const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "lever");
mkdirSync(SHOTS, { recursive: true });

type Point = { x: number; y: number };

/** A finger: down at `from`, dragged to each of `to` in small steps, then lifted unless `hold`. */
async function drag(cdp: CDPSession, page: Page, from: Point, to: Point[], { hold = false, restMs = 0 }: { hold?: boolean; restMs?: number } = {}) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  if (restMs) await page.waitForTimeout(restMs);
  let at = from;
  for (const next of to) {
    for (let step = 1; step <= 6; step++) {
      const point = { x: at.x + ((next.x - at.x) * step) / 6, y: at.y + ((next.y - at.y) * step) / 6 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
      await page.waitForTimeout(16);
    }
    at = next;
  }
  if (!hold) await lift(cdp);
}

const lift = (cdp: CDPSession) => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    userAgent: IPHONE_UA,
    permissions: ["microphone"],
  });
  const blocked: string[] = [];
  await readOnly(context, APP_URL, blocked);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await signIn(page, APP_URL, { email: DIRECTOR_EMAIL, password: demoPassword(DIRECTOR_EMAIL) });
    await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
    const lever = page.locator('[data-testid="mascot-lever"]');
    await lever.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    const cdp = await context.newCDPSession(page);
    const face = lever.locator(".mascot").first();
    const slot = page.locator('[data-testid="desk-slot"]');
    const centre = async (): Promise<Point> => {
      const box = await lever.boundingBox();
      if (!box) throw new Error("no mark on the screen");
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const c = await centre();
    await page.screenshot({ path: join(SHOTS, "l0-rest.png") });

    // ---- the secretary: hidden at rest, out on the pull to the right ---------------------------
    const hasSecretary = await page.evaluate(() => document.querySelector('[data-testid="mascot-lever"]')?.getAttribute("aria-label")?.includes("секретарь") ?? false);
    const busyAtRest = (await slot.count()) > 0;
    if (!hasSecretary) console.log("—     в компании нет секретаря: тяга вправо не проверена");
    else if (busyAtRest) console.log("—     у секретаря есть просьба в работе: он на экране, «скрыт в покое» не проверено");
    else record("секретарь в покое скрыт", true);

    if (hasSecretary) {
      await drag(cdp, page, c, [{ x: c.x + 26, y: c.y }], { hold: true });
      await page.waitForTimeout(350);
      record("тянут вправо — секретарь выглядывает", (await slot.count()) === 1);
      record("зрачок смотрит в сторону тяги", (await lever.locator(".bk[data-gaze]").count()) === 1 && (await lever.getAttribute("data-pull")) === "right");
      record("коротко — ещё не взведено", (await lever.getAttribute("data-armed")) !== "1");
      await drag(cdp, page, { x: c.x + 26, y: c.y }, [{ x: c.x + 64, y: c.y }], { hold: true }).catch(() => undefined);
      await lift(cdp);
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(SHOTS, "l1-secretary.png") });
      record("отпустили за порогом — карточка секретаря", await page.locator('[data-testid="secretary-card"]').isVisible());
      record("секретарь на экране", (await slot.count()) === 1);
      await page.locator('[data-testid="secretary-close"]').click();
      await page.waitForTimeout(900);
      if (!busyAtRest) record("карточку закрыли — секретарь ушёл", (await slot.count()) === 0);

      // short of the way: he looks out and goes back
      await drag(cdp, page, c, [{ x: c.x + 30, y: c.y }]);
      await page.waitForTimeout(900);
      if (!busyAtRest) record("недотянули — секретарь ушёл обратно", (await slot.count()) === 0 && (await page.locator('[data-testid="secretary-card"]').count()) === 0);
    }

    // ---- up: the typed input -------------------------------------------------------------------
    await drag(cdp, page, c, [{ x: c.x, y: c.y - 64 }], { hold: true });
    await page.waitForTimeout(200);
    const armedUp = (await lever.getAttribute("data-armed")) === "1" && (await lever.locator('.bk[data-glyph="lines"]').count()) === 1;
    await page.screenshot({ path: join(SHOTS, "l3-up-armed.png") });
    await lift(cdp);
    await page.waitForTimeout(700);
    record("вверх за порог — точка стала строками текста", armedUp);
    record("отпустили — поле текста", await page.locator("textarea").first().isVisible());
    await page.screenshot({ path: join(SHOTS, "l4-text.png") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    // ---- left: nothing -------------------------------------------------------------------------
    await drag(cdp, page, c, [{ x: c.x - 70, y: c.y }], { hold: true });
    await page.waitForTimeout(150);
    const leftDead = (await lever.getAttribute("data-armed")) !== "1";
    await lift(cdp);
    await page.waitForTimeout(400);
    record("влево — ничего", leftDead && (await lever.getAttribute("data-recording")) === "0" && (await page.locator("textarea:visible").count()) === 0);

    // ---- down: the voice, the finger off the mark ----------------------------------------------
    await drag(cdp, page, c, [{ x: c.x, y: c.y + 30 }]);
    await page.waitForTimeout(400);
    record("вниз недотянули — записи нет", (await lever.getAttribute("data-recording")) === "0");
    await drag(cdp, page, c, [{ x: c.x, y: c.y + 64 }], { hold: true });
    await page.waitForTimeout(250);
    record("вниз за порог — маскот уже слушает", (await face.getAttribute("data-state")) === "listening" && (await lever.getAttribute("data-recording")) === "0");
    await page.screenshot({ path: join(SHOTS, "l5-down-armed.png") });
    await lift(cdp);
    await page.waitForTimeout(1400);
    record("отпустили — запись идёт без пальца", (await lever.getAttribute("data-recording")) === "1");
    record("под маскотом — как закончить", await page.locator('[data-testid="lever-recording-ways"]').isVisible());
    await page.screenshot({ path: join(SHOTS, "l6-recording.png") });
    // up, far enough: the recording is dropped — nothing leaves the phone
    await drag(cdp, page, c, [{ x: c.x, y: c.y - 84 }], { hold: true });
    await page.waitForTimeout(200);
    const cancelArmed = (await lever.getAttribute("data-armed")) === "1" && (await page.getByText("Отпустите — отменю").count()) === 1;
    await page.screenshot({ path: join(SHOTS, "l7-cancel-armed.png") });
    await lift(cdp);
    await page.waitForTimeout(900);
    record("вверх во время записи — «отмена» взведена", cancelArmed);
    record("отпустили — запись снята", (await lever.getAttribute("data-recording")) === "0");
    record("фраза никуда не ушла", !blocked.some((what) => what.includes("/api/voice") || what.includes("/storage/")), blocked.filter((what) => what.includes("voice") || what.includes("storage")).join(" | "));

    // ---- a tap: the balls ----------------------------------------------------------------------
    await drag(cdp, page, c, []);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(SHOTS, "l8-ring.png") });
    record("тап — шарики вышли", (await page.locator('[data-testid="balls"]').getAttribute("data-show")) === "ring");

    record("без ошибок страницы", errors.length === 0, errors.join(" | "));
  } catch (error) {
    recordError("smoke:lever", error);
  } finally {
    await browser.close();
  }
  finish(`screenshots in ${SHOTS}`);
}

void main();
