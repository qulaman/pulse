/**
 * Layout-shift smoke in a real browser (system Chrome via Playwright): the screen
 * must not jump on a route change, on opening a card, on going back, or while a
 * sheet slides in and out. Every layout-shift entry counts, including the ones a
 * browser would forgive right after a tap: that is exactly where the jank lives.
 *   pnpm smoke:jank            (against http://localhost:3000, APP_URL to override)
 *   EMPLOYEE=erlan.b@demo.local (default) — any demo employee with the demo password
 * Read-only (scripts/lib/login.ts): it only looks — the screens' writes are answered in the
 * browser, and with no task sent on dev it says so instead of sending one.
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { PHONE, readOnly, signIn } from "./lib/login";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui");
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";
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
/** A step the data of dev does not allow today (nothing to open): said, not failed — the smoke writes nothing to make it. */
const skip = (name: string, why: string) => console.log(`skip  ${name}  ${why}`);

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

/** The pile of «Задачи» that holds a card: the one the screen opens on, or «Закрытые». */
type Pile = "first" | "closed";

const firstCard = (page: Page, timeout: number) =>
  page
    .locator('[data-testid="sent-task"]')
    .first()
    .waitFor({ timeout })
    .then(() => true)
    .catch(() => false);

/**
 * The director's «Задачи» need one card to open: an open task, or — with none open on dev — a
 * closed one. The smoke only looks: with nothing sent at all it stops here and says so, it does
 * not send a task to a live person.
 */
async function findPile(page: Page): Promise<Pile | null> {
  await page.goto(`${APP_URL}/sent`, { waitUntil: "networkidle" });
  let pile: Pile | null = (await firstCard(page, 10_000)) ? "first" : null;
  if (!pile) {
    await page.getByTestId("tab-closed").click();
    if (await firstCard(page, 10_000)) pile = "closed";
  }
  record("на dev есть задача для открытия", pile !== null, pile === "closed" ? "открытых нет — берём «Закрытые»" : pile ? "" : "отправьте задачу руками: смоук ничего не пишет");
  return pile;
}

/** «Задачи» open on their first pile: the closed one is a tap away, outside the measured step. */
async function showPile(page: Page, pile: Pile) {
  const closed = page.getByTestId("tab-closed");
  if (pile === "closed" && (await closed.getAttribute("aria-selected")) !== "true") {
    await closed.click();
    await page.waitForTimeout(SETTLE_MS);
  }
  await page.locator('[data-testid="sent-task"]').first().waitFor({ timeout: 15_000 });
}

/** The screen of «Задачи» is there with its data: a card of the first pile, or its tabs once the reads are done. */
async function sentLoaded(page: Page, pile: Pile) {
  if (pile === "first") return void (await page.locator('[data-testid="sent-task"]').first().waitFor({ timeout: 15_000 }));
  await page.locator('[role="tablist"]').waitFor({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const blocked: string[] = [];

  // ---- director: Пульс → Задачи → карточка → назад → вкладки ------------------------
  const director = await browser.newContext(PHONE);
  await readOnly(director, APP_URL, blocked);
  await director.addInitScript(COLLECTOR);
  const page = await director.newPage();
  lastPage = page;
  await signIn(page, APP_URL, { email: "test@demo.local", password: "1" });
  const pile = await findPile(page);
  if (!pile) return;
  await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE_MS);

  await measure(page, "директор: Пульс → Задачи", async () => {
    await page.getByRole("link", { name: "Задачи" }).click();
    await page.waitForURL((url) => url.pathname === "/sent", { timeout: 10_000 });
    await sentLoaded(page, pile);
  });
  await page.screenshot({ path: join(SHOTS, "j1-sent.png") });
  await showPile(page, pile);

  // «Задачи» are cards (D-83): a tap opens the card in place, «Переписка» opens its thread.
  // The pile that asks for a move opens its first card by itself — close it first.
  const row = page.locator('[data-testid="sent-task"]').first();
  const title = (await row.textContent().catch(() => null))?.trim() ?? "";
  record("есть задача для открытия", Boolean(title), title.slice(0, 40));
  if (title) {
    if ((await row.getAttribute("aria-expanded")) === "true") {
      await row.click();
      await page.waitForTimeout(SETTLE_MS);
    }
    await measure(page, "директор: тап по карточке → раскрылась на месте", async () => {
      await row.click();
      await page.locator('[data-testid="task-body"]').first().waitFor({ timeout: 5_000 });
    });
    await page.screenshot({ path: join(SHOTS, "j1b-card-open.png") });

    await measure(page, "директор: «Переписка» → карточка задачи", async () => {
      await page.locator('[data-testid="task-thread"]').first().click();
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
      await sentLoaded(page, pile);
    });
    await showPile(page, pile);

    // the tabs stick under the header while the list scrolls — sticky, not re-laid out
    await measure(page, "директор: прокрутка «Задач» — вкладки липнут", async () => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.locator('[role="tablist"]').waitFor({ state: "visible", timeout: 5_000 });
    });
    await page.screenshot({ path: join(SHOTS, "j1c-tabs-stuck.png") });
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // «Настройки» left the phone bar for the desk (D-153): they open from «Профиль», one row away
  await measure(page, "директор: вкладка Профиль", async () => {
    await page.getByRole("link", { name: "Профиль" }).click();
    await page.waitForURL((url) => url.pathname === "/profile", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
  });
  await measure(page, "директор: Профиль → Настройки", async () => {
    await page.getByRole("link", { name: /^Настройки, Команда/ }).click();
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
  const employee = await browser.newContext(PHONE);
  await readOnly(employee, APP_URL, blocked);
  await employee.addInitScript(COLLECTOR);
  const epage = await employee.newPage();
  lastPage = epage;
  await signIn(epage, APP_URL, { email: EMPLOYEE, password: "demo1234" });
  await epage.goto(`${APP_URL}/tasks`, { waitUntil: "networkidle" });
  await epage.waitForTimeout(SETTLE_MS);
  await epage.screenshot({ path: join(SHOTS, "j4-tasks.png") });

  const askButton = epage.getByRole("button", { name: "Уточнить" }).first();
  const hasAsk = await askButton.isVisible().catch(() => false);
  if (!hasAsk) skip("сотрудник: шторка «Уточнить»", `у ${EMPLOYEE} на dev нет дела в работе`);
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
  const ehref = await elink.getAttribute("href", { timeout: 5_000 }).catch(() => null);
  if (!ehref) skip("сотрудник: список → карточка задачи", `у ${EMPLOYEE} на dev нет ни одного дела`);
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

  const kinds = [...new Set(blocked)];
  console.log(`only read: ${blocked.length} writes answered in the browser${kinds.length ? ` — ${kinds.slice(0, 12).join(", ")}` : ""}`);
  await browser.close();
}

main()
  .catch(async (error: unknown) => {
    await lastPage?.screenshot({ path: join(SHOTS, "j99-fail.png"), fullPage: true }).catch(() => undefined);
    record("smoke:jank", false, error instanceof Error ? error.message : String(error));
  })
  .finally(() => process.exit(checks.some((c) => !c.ok) ? 1 : 0));
