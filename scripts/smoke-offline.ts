/**
 * Offline smoke (D-127) in a real browser (system Chrome via Playwright, phone profile), against a
 * PRODUCTION build — only a production build registers the caching worker (lib/offline/worker.ts):
 *   - the worker takes over and keeps the build's files and the screens opened;
 *   - the data the screens showed is kept on the phone (IndexedDB snapshot of the query cache);
 *   - without network a reload opens a kept screen with its data, a tab opens a kept screen,
 *     and a screen never opened says «Нет связи» plainly;
 *   - a start with the network held shows the kept data at once, not skeletons;
 *   - the sign-in screen forgets both (the next person on the phone starts clean).
 *   pnpm smoke:offline            (against http://localhost:3000, APP_URL to override)
 * Read-only: signs in with the demo director and navigates. Screenshots in SHOTS_DIR (./.smoke-ui/offline).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "offline");
const EMAIL = process.env.EMAIL ?? "test@demo.local";
const PASSWORD = process.env.PASS ?? "1";

mkdirSync(SHOTS, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

/** Strings, not functions: tsx would inject helpers the page does not have. */
const KEPT_QUERIES = `new Promise((resolve) => {
  const open = indexedDB.open("pulse-offline", 1);
  open.onupgradeneeded = () => { open.result.createObjectStore("kv"); };
  open.onerror = () => resolve(-1);
  open.onsuccess = () => {
    const tx = open.result.transaction("kv", "readonly");
    const get = tx.objectStore("kv").get("queries");
    get.onsuccess = () => { resolve(get.result ? get.result.state.queries.length : 0); open.result.close(); };
    get.onerror = () => { resolve(-1); open.result.close(); };
  };
})`;
const KEPT_CACHES = `(async () => {
  const names = await caches.keys();
  const count = async (name) => (names.includes(name) ? (await (await caches.open(name)).keys()).length : 0);
  return { names, files: await count("pulse-static-v1"), screens: await count("pulse-pages-v1") };
})()`;
/** Skeleton groups still on the screen: the data has not arrived. */
const BONES = `document.querySelectorAll('main [aria-busy="true"]').length`;

async function signIn(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill(EMAIL);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  return page;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
  // any page error — a hydration mismatch (#418) above all: the kept data must come back
  // only after the page hydrated
  const errors = new Set<string>();
  let offline = false;
  context.on("page", (p) => p.on("pageerror", (error) => errors.add(`${new URL(p.url()).pathname}${offline ? " (без сети)" : ""}: ${error.message.slice(0, 120)}`)));
  const page = await signIn(context);

  // ---- the worker takes over, the screens and their data are kept ----------------------------
  await page.waitForFunction("navigator.serviceWorker && navigator.serviceWorker.controller !== null", undefined, { timeout: 20_000 }).catch(() => {});
  const controlled = await page.evaluate("Boolean(navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.includes('offline=1'))");
  record("воркер с офлайн-копией управляет страницей", controlled === true);

  const screens = ["/pulse", "/sent", "/calendar", "/notes", "/profile"];
  for (const path of screens) {
    await page.goto(`${APP_URL}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1_200);
  }
  await page.waitForTimeout(2_500); // the snapshot is written 1.5 s after the last change
  const kept = (await page.evaluate(KEPT_CACHES)) as { names: string[]; files: number; screens: number };
  record("файлы сборки на телефоне", kept.files > 20, `${kept.files} файлов`);
  record("открытые экраны на телефоне", kept.screens >= screens.length, `${kept.screens} экранов`);
  const queries = (await page.evaluate(KEPT_QUERIES)) as number;
  record("данные экранов на телефоне", queries > 5, `${queries} запросов в снимке`);

  // ---- without network ------------------------------------------------------------------------
  await context.setOffline(true);
  offline = true;
  await page.goto(`${APP_URL}/sent`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: join(SHOTS, "01-offline-sent.png") });
  const sentTitle = await page.getByRole("heading", { name: "Задачи" }).isVisible().catch(() => false);
  const sentBones = (await page.evaluate(BONES)) as number;
  const banner = (await page.getByRole("status").allInnerTexts().catch(() => [])).join(" ");
  record("без сети «Задачи» открываются", sentTitle, page.url());
  record("без сети — с данными, не заглушкой", sentBones === 0, `${sentBones} заглушек`);
  record("плашка говорит, на когда данные", /Нет связи · данные на/.test(banner), banner || "—");

  await page.locator('nav[aria-label="Основная навигация"] a[href="/calendar"]').tap();
  await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: join(SHOTS, "02-offline-tab-calendar.png") });
  const calendarTitle = await page.getByRole("heading", { name: "Календарь" }).isVisible().catch(() => false);
  record("без сети вкладка «Календарь» открывается", calendarTitle, page.url());

  await page.goto(`${APP_URL}/admin`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: join(SHOTS, "03-offline-never-opened.png") });
  const plain = await page.getByRole("heading", { name: "Нет связи" }).isVisible().catch(() => false);
  record("неоткрытый экран без сети — «Нет связи», не динозавр", plain);

  await context.setOffline(false);
  offline = false;
  await page.goto(`${APP_URL}/sent`, { waitUntil: "networkidle" });
  record("со связью экраны снова с сервера", await page.getByRole("heading", { name: "Задачи" }).isVisible().catch(() => false));

  // ---- a start with the network held: the kept data at once ---------------------------------------
  const cold = await context.newPage();
  await cold.route("**/rest/v1/**", () => {}); // held for good: only the phone's copy can fill the screen
  await cold.goto(`${APP_URL}/sent`, { waitUntil: "domcontentloaded" });
  await cold.waitForTimeout(2_500);
  await cold.screenshot({ path: join(SHOTS, "04-start-network-held.png") });
  const coldBones = (await cold.evaluate(BONES)) as number;
  record("запуск без ответа сервера — данные с телефона", coldBones === 0, `${coldBones} заглушек`);
  await cold.close();

  // ---- the sign-in screen forgets it all --------------------------------------------------------
  await context.clearCookies();
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);
  const afterQueries = (await page.evaluate(KEPT_QUERIES)) as number;
  const afterCaches = (await page.evaluate(KEPT_CACHES)) as { screens: number };
  record("вход стирает данные с телефона", afterQueries === 0, `${afterQueries} запросов`);
  record("вход стирает сохранённые экраны", afterCaches.screens === 0, `${afterCaches.screens} экранов`);

  record("без ошибок страницы", errors.size === 0, [...errors].join(" | "));

  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} offline checks passed`);
  process.exit(failed.length ? 1 : 0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
