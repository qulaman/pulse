/**
 * Layout-shift smoke in a real browser (system Chrome via Playwright): the screen
 * must not jump on a route change, on opening a card, on going back, or while a
 * sheet slides in and out. Every layout-shift entry counts, including the ones a
 * browser would forgive right after a tap: that is exactly where the jank lives.
 *   pnpm smoke:jank            (against http://localhost:3000, APP_URL to override)
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui");
/** Cumulative shift allowed per interaction; 0.05 is well under the "good" CLS bar of 0.1. */
const LIMIT = Number(process.env.JANK_LIMIT ?? "0.05");
const SETTLE_MS = 1_500;

mkdirSync(SHOTS, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
let lastPage: Page | null = null;
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

type Shift = { value: number; at: number; sources: string[] };

/** Installed before any script of the page: collects every layout-shift with its sources. */
const COLLECTOR = `
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const sources = (entry.sources || []).map((s) => {
        const n = s.node;
        if (!n) return "?";
        const tag = n.tagName ? n.tagName.toLowerCase() : n.nodeName;
        const cls = typeof n.className === "string" && n.className ? "." + n.className.split(" ").slice(0, 2).join(".") : "";
        return tag + cls;
      });
      window.__shifts.push({ value: entry.value, at: entry.startTime, sources });
    }
  }).observe({ type: "layout-shift", buffered: true });
`;

async function mark(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function shiftsSince(page: Page, since: number) {
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate((from) => {
    const all = (window as unknown as { __shifts: Shift[] }).__shifts;
    const hits = all.filter((s) => s.at >= from);
    const total = hits.reduce((sum, s) => sum + s.value, 0);
    const sources = [...new Set(hits.flatMap((s) => s.sources))].slice(0, 6);
    return { total, count: hits.length, sources };
  }, since);
}

async function measure(page: Page, name: string, action: () => Promise<void>) {
  const since = await mark(page);
  await action();
  const { total, count, sources } = await shiftsSince(page, since);
  const where = sources.length ? `  at: ${sources.join(", ")}` : "";
  record(name, total <= LIMIT, `shift=${total.toFixed(4)} (${count} entries)${where}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

/** An empty database has nothing to open: send one task by text, the way smoke:ui does. */
async function ensureTask(page: Page) {
  await page.goto(`${APP_URL}/sent`, { waitUntil: "networkidle" });
  const any = await page.locator('[data-testid="sent-task"]').first().isVisible().catch(() => false);
  if (any) return;
  await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Записать голосовое|Идёт запись/ }).tap();
  const field = page.getByPlaceholder(/Ерлану подготовить/);
  await field.waitFor({ state: "visible", timeout: 5_000 });
  await field.fill(`Марат, подготовь КП по Казхрому ${Date.now().toString(36)} завтра до обеда`);
  await page.getByRole("button", { name: "Отправить" }).click();
  await page.waitForURL((url) => url.pathname === "/confirm", { timeout: 40_000 });
  await page.getByRole("heading", { name: /Понял так/ }).waitFor({ timeout: 10_000 });
  const sendNow = page.getByRole("button", { name: "отправить сейчас" });
  if (await sendNow.isVisible().catch(() => false)) await sendNow.click();
  else await page.getByRole("button", { name: /Отправить \d+ из \d+/ }).click();
  await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 30_000 });
  record("посев: задача отправлена текстом", true);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const phone = {
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
  };

  // ---- director: Пульс → Задачи → карточка → назад → вкладки ------------------------
  const director = await browser.newContext(phone);
  await director.addInitScript(COLLECTOR);
  const page = await director.newPage();
  lastPage = page;
  await login(page, "test@demo.local", "1");
  await ensureTask(page);
  await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE_MS);

  await measure(page, "директор: Пульс → Задачи", async () => {
    await page.getByRole("link", { name: "Задачи" }).click();
    await page.waitForURL((url) => url.pathname === "/sent", { timeout: 10_000 });
    await page.locator('[data-testid="sent-task"]').first().waitFor({ timeout: 15_000 });
  });
  await page.screenshot({ path: join(SHOTS, "j1-sent.png") });

  // «Задачи» are a desk (D-80): the first tap on a row puts the task on the display, the
  // second opens its thread
  const row = page.locator('[data-testid="sent-task"]').first();
  const title = (await row.locator("h2").first().textContent().catch(() => null))?.trim() ?? "";
  record("есть задача для открытия", Boolean(title), title);
  if (title) {
    await measure(page, "директор: тап по строке → задача на дисплее", async () => {
      await row.click();
      await page.locator('[data-testid="desk-lcd"]', { hasText: title }).waitFor({ timeout: 5_000 });
    });
    await page.screenshot({ path: join(SHOTS, "j1b-desk.png") });

    await measure(page, "директор: второй тап → карточка задачи", async () => {
      await row.click();
      await page.waitForURL((url) => url.pathname.startsWith("/tasks/"), { timeout: 10_000 });
      // the thread opens with its card folded to a head: the composer says the page is there
      await page.getByPlaceholder(/Написать/).waitFor({ timeout: 10_000 });
    });
    await page.screenshot({ path: join(SHOTS, "j2-thread-director.png") });
    const tabBar = page.getByRole("navigation", { name: "Основная навигация" });
    record("карточка: таб-бар на месте", await tabBar.isVisible());
    const composer = page.getByPlaceholder(/Написать/);
    const composerBox = await composer.boundingBox();
    const tabBox = await tabBar.boundingBox();
    const above = Boolean(composerBox && tabBox && composerBox.y + composerBox.height <= tabBox.y + 1);
    record("карточка: композер чата над таб-баром", above, `composer.bottom=${composerBox ? Math.round(composerBox.y + composerBox.height) : "?"} tab.top=${tabBox ? Math.round(tabBox.y) : "?"}`);

    await measure(page, "директор: карточка → назад", async () => {
      await page.getByRole("button", { name: "Назад" }).click();
      await page.waitForURL((url) => url.pathname === "/sent", { timeout: 10_000 });
      await page.locator('[data-testid="sent-task"]').first().waitFor({ timeout: 10_000 });
    });

    // the device is taller than a phone: once its keys pass under the header a folded copy
    // sticks there, fixed and out of the flow — the list under it must not move
    await measure(page, "директор: прокрутка «Задач» — голова сворачивается", async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.locator('[data-testid="desk-lcd"]').waitFor({ timeout: 5_000 });
    });
    await page.screenshot({ path: join(SHOTS, "j1c-desk-folded.png") });
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  await measure(page, "директор: вкладка Настройки", async () => {
    await page.getByRole("link", { name: "Настройки" }).click();
    await page.waitForURL((url) => url.pathname === "/settings", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
  });
  await measure(page, "директор: вкладка Пульс", async () => {
    await page.getByRole("link", { name: "Пульс" }).click();
    await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
  });
  await page.screenshot({ path: join(SHOTS, "j3-pulse.png") });

  // ---- employee: Дела → шторка «Уточнить» → закрыть → карточка → назад ----------------
  const employee = await browser.newContext(phone);
  await employee.addInitScript(COLLECTOR);
  const epage = await employee.newPage();
  lastPage = epage;
  await login(epage, "marat@demo.local", "demo1234");
  await epage.goto(`${APP_URL}/tasks`, { waitUntil: "networkidle" });
  await epage.waitForTimeout(SETTLE_MS);
  await epage.screenshot({ path: join(SHOTS, "j4-tasks.png") });

  const askButton = epage.getByRole("button", { name: "Уточнить" }).first();
  const hasAsk = await askButton.isVisible().catch(() => false);
  record("есть карточка с кнопкой «Уточнить»", hasAsk);
  if (hasAsk) {
    await measure(epage, "сотрудник: открыть шторку «Уточнить»", async () => {
      await askButton.click();
      await epage.getByRole("dialog").waitFor({ timeout: 5_000 });
    });
    await epage.screenshot({ path: join(SHOTS, "j5-sheet-open.png") });
    const focused = await epage.evaluate(() => document.activeElement?.tagName.toLowerCase());
    record("шторка: поле получило фокус после анимации", focused === "textarea", `activeElement=${focused}`);
    await measure(epage, "сотрудник: закрыть шторку", async () => {
      await epage.getByRole("button", { name: "Закрыть" }).click();
      await epage.getByRole("dialog").waitFor({ state: "detached", timeout: 5_000 });
    });
    await epage.screenshot({ path: join(SHOTS, "j6-sheet-closed.png") });
  }

  const elink = epage.locator('article a[href^="/tasks/"]').first();
  const ehref = await elink.getAttribute("href").catch(() => null);
  if (ehref) {
    await measure(epage, "сотрудник: список → карточка задачи", async () => {
      await elink.click();
      await epage.waitForURL((url) => url.pathname === ehref, { timeout: 10_000 });
      await epage.locator("article").first().waitFor({ timeout: 10_000 });
    });
    await epage.screenshot({ path: join(SHOTS, "j7-thread-employee.png") });
    const nav = epage.getByRole("navigation", { name: "Основная навигация" });
    record("карточка сотрудника: таб-бар на месте", await nav.isVisible());
    await measure(epage, "сотрудник: карточка → назад", async () => {
      await epage.getByRole("button", { name: "Назад" }).click();
      await epage.waitForURL((url) => url.pathname === "/tasks", { timeout: 10_000 });
      await epage.locator("article").first().waitFor({ timeout: 10_000 });
    });
  }

  await browser.close();
}

main()
  .catch(async (error: unknown) => {
    await lastPage?.screenshot({ path: join(SHOTS, "j99-fail.png"), fullPage: true }).catch(() => undefined);
    record("smoke:jank", false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => process.exit(checks.some((c) => !c.ok) ? 1 : 0));
