/**
 * UI smoke in a real browser (system Chrome via Playwright): director types a
 * command through the FAB, confirms it, the employee sees the card.
 *   pnpm smoke:ui            — against http://localhost:3000 (APP_URL to override)
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui), console errors are printed.
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui");
const PHRASE = process.env.SMOKE_PHRASE ?? "Марат, подготовь КП по Казхрому завтра до обеда";

mkdirSync(SHOTS, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

function watch(page: Page, tag: string) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(`[${tag}] console: ${msg.text().slice(0, 300)}`);
  });
  page.on("pageerror", (err) => errors.push(`[${tag}] pageerror: ${err.message.slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/api/")) {
      errors.push(`[${tag}] ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return errors;
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const iphone = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
  };

  // ---- director -------------------------------------------------------------
  const director = await browser.newContext(iphone);
  const page = await director.newPage();
  const errors = watch(page, "director");

  await login(page, "test@demo.local", "1");
  record("director: вход → /pulse", page.url().includes("/pulse"), page.url());
  await page.screenshot({ path: join(SHOTS, "01-pulse.png") });

  const fab = page.getByRole("button", { name: /Записать голосовое|Идёт запись/ });
  record("FAB виден", await fab.isVisible());
  await fab.tap();
  const sheetField = page.getByPlaceholder(/Ерлану подготовить/);
  await sheetField.waitFor({ state: "visible", timeout: 5_000 });
  record("тап по FAB → шторка текста", true);
  await page.screenshot({ path: join(SHOTS, "02-text-sheet.png") });

  await sheetField.fill(PHRASE);
  await page.getByRole("button", { name: "Отправить" }).click();

  let reachedConfirm = false;
  try {
    await page.waitForURL((url) => url.pathname === "/confirm", { timeout: 40_000 });
    reachedConfirm = true;
  } catch {
    reachedConfirm = false;
  }
  await page.screenshot({ path: join(SHOTS, "03-after-submit.png") });
  record("текст → /confirm", reachedConfirm, page.url());

  let sent = false;
  if (reachedConfirm) {
    await page.getByRole("heading", { name: /Понял так/ }).waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(SHOTS, "04-confirm.png") });
    const sendButton = page.getByRole("button", { name: /Отправить \d+ из \d+/ });
    const label = await sendButton.textContent();
    record("кнопка «Отправить N из M»", (await sendButton.isEnabled()) === true, label ?? "");
    await sendButton.click();
    try {
      await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 30_000 });
      sent = true;
    } catch {
      sent = false;
    }
    await page.screenshot({ path: join(SHOTS, "05-after-send.png") });
    record("отправка → /pulse", sent, page.url());
  }

  // ---- employee -------------------------------------------------------------
  const employee = await browser.newContext(iphone);
  const epage = await employee.newPage();
  const eerrors = watch(epage, "marat");
  await login(epage, "marat@demo.local", "demo1234");
  record("marat: вход → /feed", epage.url().includes("/feed"), epage.url());
  await epage.waitForTimeout(2_000);
  await epage.screenshot({ path: join(SHOTS, "06-feed.png") });
  const card = epage.getByText(/Казхром/i).first();
  record("карточка задачи в ленте Марата", await card.isVisible().catch(() => false));

  for (const e of [...errors, ...eerrors]) console.log("  !", e);
  await browser.close();
}

main()
  .catch((error: unknown) => record("smoke", false, error instanceof Error ? error.message : String(error)))
  .finally(() => process.exit(checks.some((c) => !c.ok) ? 1 : 0));
