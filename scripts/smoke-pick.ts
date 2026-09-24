/**
 * Pulse, the waiting screen (D-84): a tap on an idle person's circle wakes the face, the face
 * looks at them (gaze + a dashed line), and the ways to give them a task come out over its
 * head — «Записать», «Текстом», or holding the face. A tap on a lit circle — somebody at work
 * (D-118) — opens his card with his tasks, each a link to its screen, the face looks at him, and a
 * touch elsewhere puts the card away. Read-only by default: it picks, opens the text sheet and
 * the card, closes. With FAKE_MIC_WAV it also holds the face with a person picked and
 * checks that the parsed task is for that person — that writes an ai_logs row and an audio
 * file (no task is sent).
 *   pnpm smoke:pick                                  (against http://localhost:3000)
 *   FAKE_MIC_WAV=<phrase without a name>.wav pnpm smoke:pick
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "pick");
const WAV = process.env.FAKE_MIC_WAV;
mkdirSync(SHOTS, { recursive: true });

const checks: { name: string; ok: boolean }[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: WAV ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}`] : [],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    permissions: ["microphone"],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Почта").fill("test@demo.local");
    await page.getByLabel("Пароль").fill("1");
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="people-field"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1200);

    const orbs = page.locator('[data-testid="crew"][data-busy="0"]');
    const count = await orbs.count();
    record("на экране ожидания есть свободные люди", count > 0, `${count}`);
    if (count === 0) throw new Error("no idlers to pick — every person has open work");

    const target = orbs.first();
    const person = await target.getAttribute("data-person");
    await target.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, "p1-picked.png") });
    const card = page.locator('[data-testid="pick-card"]');
    record("карточка вышла над маскотом", await card.isVisible());
    const cardBox = await card.boundingBox();
    const faceBox = await page.locator('[data-testid="mascot-lever"]').boundingBox();
    record("карточка — прямо над лицом", Boolean(cardBox && faceBox && cardBox.y + cardBox.height <= faceBox.y + 20));
    record("маскот смотрит на человека", (await page.locator('[data-gaze="on"]').count()) === 1 && (await page.locator('[data-testid="look-line"]').count()) === 1);
    // the face, not the small secretary at the desk (D-85), who is a mascot too
    record("маскот проснулся", (await page.locator('[data-testid="mascot-lever"] svg.mascot').first().getAttribute("data-state")) !== "sleeping");
    record("кружок выбран", (await page.locator('[data-testid="crew"][data-picked="1"]').getAttribute("data-person")) === person);

    await page.locator('[data-testid="pick-text"]').click();
    await page.waitForTimeout(500);
    record("«Текстом» — шторка с исполнителем", await page.locator('[data-testid="text-pin"]').isVisible());
    await page.screenshot({ path: join(SHOTS, "p2-text.png") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    if (WAV) {
      const name = ((await card.locator(".truncate").first().textContent()) ?? "").trim();
      const lever = page.locator('[data-testid="mascot-lever"]');
      const box = await lever.boundingBox();
      if (!box) throw new Error("no face to hold");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700);
      record("удержание маскота пишет", (await lever.getAttribute("data-recording")) === "1");
      await page.screenshot({ path: join(SHOTS, "p3-holding.png") });
      await page.waitForTimeout(3200);
      await page.mouse.up();
      await page.getByText(/Понял так/).waitFor({ timeout: 45_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, "p4-parsed.png") });
      const text = (await page.locator("main").textContent()) ?? "";
      record("разобранная задача — для выбранного", Boolean(name) && text.includes(name.split(/\s+/)[0]!), name);
      // nothing is sent: the draft is dropped
      await page.getByRole("button", { name: "Отменить" }).click().catch(() => undefined);
    } else {
      await page.locator('[data-testid="pick-close"]').click();
      await page.waitForTimeout(600);
      record("× снимает выбор, взгляд отпущен", (await page.locator('[data-testid="pick-card"]').count()) === 0 && (await page.locator('[data-gaze="on"]').count()) === 0);

      // somebody at work (D-118): his card, his tasks as links, the face on him, a touch away closes
      const lit = page.locator('[data-testid="crew"][data-busy="1"]:not([data-ring="done"])');
      if ((await lit.count()) > 0) {
        await lit.first().click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: join(SHOTS, "p5-card.png") });
        const rows = page.locator('[data-testid="crew-task"]');
        const href = (await rows.first().getAttribute("href")) ?? "";
        record("тап по занятому — карточка с его задачами", (await page.locator('[data-testid="crew-card"]').isVisible()) && (await rows.count()) > 0);
        record("строка ведёт на экран задачи", /^\/tasks\/[0-9a-f-]{36}$/.test(href), href);
        record("«Все дела» — на карточку человека", /^\/people\//.test((await page.locator('[data-testid="crew-all"]').getAttribute("href")) ?? ""));
        record("маскот смотрит на занятого", (await page.locator('[data-gaze="on"]').count()) === 1);
        await page.mouse.click(12, 200);
        await page.waitForTimeout(500);
        record("касание мимо убирает карточку", (await page.locator('[data-testid="crew-card"]').count()) === 0 && (await page.locator('[data-gaze="on"]').count()) === 0);
      } else {
        console.log("—     занятых на доске нет: карточка не проверена");
      }
    }
    record("без ошибок страницы", errors.length === 0, errors.join(" | "));
  } catch (error) {
    record("smoke:pick", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok · screenshots in ${SHOTS}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
