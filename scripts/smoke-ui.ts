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

/**
 * Voice path with a fake microphone: Chrome plays FAKE_MIC_WAV into getUserMedia.
 * Enabled only when the env var points at a WAV (System.Speech on Windows makes one).
 */
const FAKE_MIC_WAV = process.env.FAKE_MIC_WAV;

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: FAKE_MIC_WAV
      ? [
          "--use-fake-device-for-media-stream",
          "--use-fake-ui-for-media-stream",
          `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
        ]
      : [],
  });
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

  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "00-login.png") });
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

    // an unsent draft must not drag the director back to /confirm
    await page.getByRole("link", { name: "Пульс" }).click();
    await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 10_000 });
    await page.waitForTimeout(1_500);
    const stayed = new URL(page.url()).pathname === "/pulse";
    const pill = page.getByRole("link", { name: /Черновик/ });
    record("черновик не возвращает на /confirm, виден в плашке", stayed && (await pill.isVisible()), page.url());
    await page.screenshot({ path: join(SHOTS, "04b-draft-pill.png") });
    await pill.click();
    await page.waitForURL((url) => url.pathname === "/confirm", { timeout: 10_000 });
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

  // ---- settings: the director switches points on --------------------------------
  await page.goto(`${APP_URL}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Настройки" }).waitFor({ timeout: 10_000 });
  await page.getByRole("switch", { name: /Очки включены/ }).waitFor({ timeout: 10_000 });
  await page.screenshot({ path: join(SHOTS, "09-settings.png"), fullPage: true });
  const pointsSwitch = page.getByRole("switch", { name: /Очки включены/ });
  if ((await pointsSwitch.getAttribute("aria-checked")) !== "true") await pointsSwitch.click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText("Сохранил настройки").waitFor({ timeout: 10_000 });
  record("настройки: очки включены и сохранены", true);

  // ---- rating: +10 to Марат through the sheet ------------------------------------
  await page.goto(`${APP_URL}/rating`, { waitUntil: "networkidle" });
  const maratRow = page.locator("li", { hasText: "Марат Оспанов" }).first();
  await maratRow.waitFor({ timeout: 10_000 });
  await maratRow.getByRole("button", { name: "+" }).click();
  await page.getByRole("button", { name: /Начислить \+10/ }).click();
  await page.getByText(/\+10 — за скорость/).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "10-rating.png") });
  record("рейтинг: +10 Марату начислено", true);

  // ---- people: create, then edit -------------------------------------------------
  await page.goto(`${APP_URL}/people`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Сотрудники" }).waitFor({ timeout: 10_000 });
  await page.getByText("Марат Оспанов").first().waitFor({ timeout: 10_000 });
  await page.screenshot({ path: join(SHOTS, "13-people.png") });
  await page.getByRole("link", { name: /Добавить/ }).click();
  await page.waitForURL((url) => url.pathname === "/people/new", { timeout: 10_000 });
  const stamp = Date.now().toString(36);
  await page.getByLabel("Почта").fill(`smoke-${stamp}@demo.local`);
  await page.getByLabel("Первый пароль").fill("demo1234");
  await page.getByLabel("Имя и фамилия").fill("Смоук Тестов");
  await page.getByLabel("Должность").fill("Испытатель");
  await page.getByLabel("Как называет директор").fill("Смоук");
  await page.getByRole("button", { name: "Добавить сотрудника" }).click();
  await page.waitForURL((url) => /^\/people\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20_000 });
  record("сотрудник создан → карточка", true, page.url());
  await page.getByLabel("Должность").fill("Старший испытатель");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await page.getByText("Сохранил").waitFor({ timeout: 10_000 });
  await page.screenshot({ path: join(SHOTS, "14-person-edit.png"), fullPage: true });
  record("карточка сотрудника: должность сохранена", true);

  await page.goto(`${APP_URL}/profile`, { waitUntil: "networkidle" });
  await page.getByText("в команде").waitFor({ timeout: 10_000 });
  await page.screenshot({ path: join(SHOTS, "15-profile-director.png") });

  await page.goto(`${APP_URL}/dev/mascot`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "11-mascot.png"), fullPage: true });

  // ---- voice: hold the FAB for six seconds of the fake microphone ---------------
  if (FAKE_MIC_WAV) {
    await director.grantPermissions(["microphone"], { origin: APP_URL });
    await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
    const box = await fab.boundingBox();
    if (!box) throw new Error("FAB has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(6_000);
    await page.screenshot({ path: join(SHOTS, "07-recording.png") });
    await page.mouse.up();

    let voiceConfirm = false;
    try {
      await page.waitForURL((url) => url.pathname === "/confirm", { timeout: 60_000 });
      voiceConfirm = true;
    } catch {
      voiceConfirm = false;
    }
    await page.screenshot({ path: join(SHOTS, "08-voice-confirm.png") });
    record("голос → /confirm (запись → STT → разбор)", voiceConfirm, page.url());
    if (voiceConfirm) {
      const heading = await page.getByRole("heading", { name: /Понял так/ }).textContent();
      const hasMarat = await page.getByText(/Марат/).first().isVisible().catch(() => false);
      record("голос: карточка с Маратом", hasMarat, heading ?? "");
    }
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

  await epage.goto(`${APP_URL}/profile`, { waitUntil: "networkidle" });
  await epage.getByText("за скорость").first().waitFor({ timeout: 10_000 }).catch(() => {});
  await epage.screenshot({ path: join(SHOTS, "12-profile-points.png") });
  const balanceText = await epage.getByTestId("balance").textContent().catch(() => "");
  record("профиль Марата: баланс ≥ 10", Number(balanceText) >= 10, `balance=${balanceText}`);

  for (const e of [...errors, ...eerrors]) console.log("  !", e);
  await browser.close();
}

main()
  .catch((error: unknown) => record("smoke", false, error instanceof Error ? error.message : String(error)))
  .finally(() => process.exit(checks.some((c) => !c.ok) ? 1 : 0));
