/**
 * The desk of the director and the secretary (D-153, tasks/022) in a real browser — system
 * Chrome via Playwright — against the dev database and a running app.
 *   1. Director, desktop 1440×900: signs in and lands on /desk/tasks; every desk screen opens
 *      with no page error and no console error; screenshots of each; the order line parses a
 *      phrase into the panel and is CANCELLED — never sent (sending wakes the team's phones);
 *      a phone sheet opens as a centred dialog; «Телефонная версия» keeps /pulse a phone screen.
 *   2. Director, phone 390×844: /pulse, /sent, /settings stay phone screens, no move to the desk;
 *      the calendar's sheet is still a bottom sheet.
 *   3. Secretary (marat@ on dev), desktop: /desk → /desk/errands, /desk/tasks → /desk/errands.
 *   4. WebKit (Safari's engine) on a desktop UA without the client hint: lands on the desk.
 * Nothing is sent, the wall is not touched, no setting is saved, no code is issued. The only
 * write is a note made and deleted (notes are private, no push) — skipped while somebody is
 * active on dev in the last 10 minutes.
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-desk.ts   (APP_URL, SMOKE_OUT to override)
 *   ONLY=tasks,team,errands,reports,calendar,notes,screen,settings,shell,phone,secretary,safari — a part of it
 * The screens' own steps live in scripts/desk-smoke/* — one file per role of tasks/022.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";

import { APP_URL, checks, open, record, skip, type Ctx } from "./desk-smoke/shared";
import { checkCalendar, checkNotes, checkScreen } from "./desk-smoke/planning";
import { checkErrands, checkReports, checkSecretary, checkTeam } from "./desk-smoke/people";
import { checkSettings } from "./desk-smoke/settings";
import { checkTasks } from "./desk-smoke/tasks";

const OUT = process.env.SMOKE_OUT ?? join(process.cwd(), ".smoke-ui", "desk");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECTOR = { email: process.env.DIRECTOR ?? "test@demo.local", password: process.env.DIRECTOR_PASSWORD ?? "1" };
const SECRETARY = { email: process.env.SECRETARY ?? "marat@demo.local", password: process.env.SECRETARY_PASSWORD ?? "demo1234" };
/** `ONLY=tasks,notes` — just these parts (a role checking its own screens); default — everything. */
const ONLY = new Set((process.env.ONLY ?? "").split(",").map((part) => part.trim()).filter(Boolean));
const runs = (part: string) => ONLY.size === 0 || ONLY.has(part);

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

mkdirSync(OUT, { recursive: true });

/** Page errors and console errors of every page, with the screen they came from. */
const errors: string[] = [];
const shots: string[] = [];

/** The sign-in screen's own 401s before anyone is signed in are not the desk's — kept apart, reported. */
const signInNoise: string[] = [];

function watch(page: Page, who: string) {
  const note = (line: string) => {
    const path = new URL(page.url()).pathname;
    (path === "/login" ? signInNoise : errors).push(`${who} ${path} ${line}`);
  };
  page.on("pageerror", (error) => note(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") note(`console.error: ${message.text()}`);
  });
}

function shooter(page: Page, prefix: string) {
  return async (name: string) => {
    const path = join(OUT, `${prefix}-${name}.png`);
    await page.screenshot({ path });
    shots.push(path);
  };
}

/** Somebody worked on dev in the last 10 minutes: the run stays read-only (tasks/022 «Проверки»). */
async function ownerActive(): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin.from("ai_logs").select("id").gt("created_at", since).limit(1);
  return (data?.length ?? 0) > 0;
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "load" });
  const mail = page.getByLabel("Почта");
  if (!(await mail.isVisible().catch(() => false))) await page.getByTestId("login-switch").click();
  await mail.fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/* ---- the shell: the lead's checks ------------------------------------------------------------ */

async function checkShell(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/profile");
  await ctx.shot("profile");
  const nav = await page.getByRole("navigation", { name: "Разделы" }).getByRole("link").count();
  record("боковая навигация директора: девять разделов и профиль", nav === 10, `ссылок ${nav}`);

  // a phone sheet inside the desk is a centred dialog: «Выйти на других устройствах» — opened, looked at, closed
  await page.getByRole("button", { name: "Выйти на других устройствах" }).click();
  const sheet = page.locator("[data-sheet]");
  await sheet.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(400);
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  const centred = Boolean(box && viewport && box.y > 40 && box.y + box.height < viewport.height - 40 && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4);
  record("шторка в десктопе — диалог по центру", centred, box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}` : "нет");
  await ctx.shot("sheet-as-dialog");
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 5_000 });

  // the order line: Ctrl+K, a phrase, the cards in the panel — and «Отменить». Never «Отправить».
  await open(page, "/desk/tasks");
  await page.keyboard.press("Control+KeyK");
  const focused = await page.evaluate(() => document.activeElement?.id);
  record("Ctrl+K ставит курсор в строку поручения", focused === "desk-command", `activeElement=${focused}`);
  await page.keyboard.type(`Смоук ${ctx.stamp}: Ерлану проверить смету по объекту до пятницы`);
  await page.keyboard.press("Enter");
  const confirm = page.getByTestId("desk-confirm");
  const parsed = await confirm.waitFor({ timeout: 90_000 }).then(() => true, () => false);
  const send = page.getByTestId("desk-confirm-send");
  const cards = parsed ? await send.count() : 0;
  record("строка поручения: подтверждение в панели", parsed && cards > 0, parsed ? "" : "панель не открылась за 90 с");
  await ctx.shot("command-confirm");
  if (parsed) {
    const cancel = page.getByTestId("desk-confirm-cancel");
    if (await cancel.count()) await cancel.click();
    else await page.keyboard.press("Escape");
    const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("«Отменить» закрывает панель, ничего не отправлено", closed);
  }

  // a push opened on the computer: the proxy answers its phone address with the desk screen and the
  // push's query. Asked as a request of this browser (its cookies and user agent), not rendered —
  // no task or thread is opened, the read cursor stays put
  const nobody = "00000000-0000-0000-0000-000000000000";
  for (const [from, to] of [
    [`/tasks/${nobody}`, `/desk/tasks?id=${nobody}`],
    [`/secretary?e=${nobody}`, `/desk/errands?e=${nobody}`],
    [`/calendar?e=${nobody}`, `/desk/calendar?e=${nobody}`],
    [`/notes?n=${nobody}`, `/desk/notes?n=${nobody}`],
    ["/rating", "/desk/settings/points"],
    ["/shop", "/desk/settings/points?view=shop"],
  ] as const) {
    const answer = await page.request.get(`${APP_URL}${from}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP_UA } });
    const location = (answer.headers().location ?? "").replace(APP_URL, "");
    record(`пуш на компьютере: ${from} → ${to}`, answer.status() >= 300 && answer.status() < 400 && location === to, `${answer.status()} ${location}`);
  }
  // the dispute's push is `/rating#disputes`: the hash rides the redirect and opens «Споры»
  await page.goto(`${APP_URL}/rating#disputes`, { waitUntil: "load" });
  await page.getByTestId("seg-disputes").waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  record("пуш «Оспаривает» открывает «Споры»", (await page.getByTestId("seg-disputes").getAttribute("aria-selected")) === "true", page.url().replace(APP_URL, ""));

  // a desktop window narrower than 960 px: the hint, the screen still works
  await page.setViewportSize({ width: 900, height: 800 });
  await open(page, "/desk/team");
  const hint = await page.getByText("Этот экран удобнее на телефоне").count();
  record("окно уже 960 px — плашка «удобнее на телефоне»", hint === 1, `плашек ${hint}`);
  await ctx.shot("narrow");
  await page.setViewportSize({ width: 1440, height: 900 });

  // «Телефонная версия»: the cookie, /pulse as a phone screen, no move back
  await open(page, "/desk/profile");
  await page.getByTestId("phone-view").click();
  await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 20_000 });
  const cookie = (await page.context().cookies()).find((c) => c.name === "pulse_view");
  record("«Телефонная версия» ставит cookie и ведёт на /pulse", cookie?.value === "phone", `cookie=${cookie?.value}`);
  await page.goto(`${APP_URL}/sent`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  record("с cookie /sent остаётся телефонным", new URL(page.url()).pathname === "/sent", page.url());
  await page.screenshot({ path: join(OUT, "director-phone-view-sent.png") });
  shots.push(join(OUT, "director-phone-view-sent.png"));

  // back to the desk for the rest of the run: the phone profile's «Версия для компьютера» (stage 2), else by hand
  await page.goto(`${APP_URL}/profile`, { waitUntil: "load" });
  const deskRow = page.getByRole("button", { name: /Версия для компьютера/ });
  // the rows come under the points block once the profile has hydrated
  await deskRow.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  if (await deskRow.count()) {
    await deskRow.first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/desk"), { timeout: 20_000 });
    const after = (await page.context().cookies()).find((c) => c.name === "pulse_view");
    record("«Версия для компьютера» снимает cookie и ведёт на /desk", !after?.value, new URL(page.url()).pathname);
  } else {
    await page.context().clearCookies({ name: "pulse_view" });
    skip("«Версия для компьютера» в телефонном профиле", "строки ещё нет");
  }
}

async function phoneContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE_UA,
    locale: "ru-RU",
  });
}

async function desktopContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: "ru-RU" });
}

async function runPhone(browser: Browser) {
  const context = await phoneContext(browser);
  const page = await context.newPage();
  watch(page, "phone");
  const shot = shooter(page, "phone");
  await login(page, DIRECTOR.email, DIRECTOR.password);
  await page.waitForTimeout(1000);
  record("телефон: директор после входа — на /pulse", new URL(page.url()).pathname === "/pulse", page.url());
  for (const path of ["/pulse", "/sent", "/settings"]) {
    await page.goto(`${APP_URL}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const at = new URL(page.url()).pathname;
    record(`телефон: ${path} открывается без перевода на /desk`, at === path, at);
    await shot(path.slice(1));
  }
  const surface = await page.evaluate(() => document.documentElement.dataset.surface ?? null);
  record("телефон: на <html> нет data-surface", surface === null, String(surface));

  // the bar lost «Настройки» and «Лаб» (D-153 §11); the profile leads to the desk and to the settings
  await page.goto(`${APP_URL}/profile`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const hrefs = await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  record("телефон: таб-бар директора — Пульс, Задачи, Календарь, Заметки, Экран, Профиль", hrefs.join(",") === "/pulse,/sent,/calendar,/notes,/screen,/profile", hrefs.join(","));
  const deskRow = await page.getByRole("button", { name: "Версия для компьютера" }).count();
  const address = (await page.getByTestId("desk-address").textContent())?.trim() ?? "";
  record("телефон: в профиле «Версия для компьютера» с адресом", deskRow === 1 && address.endsWith("/desk"), address);
  await page.screenshot({ path: join(OUT, "phone-profile.png"), fullPage: true });
  shots.push(join(OUT, "phone-profile.png"));

  // the calendar's sheet is still a bottom sheet: the first event, or «+»
  await page.goto(`${APP_URL}/calendar`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const plus = page.getByRole("button", { name: /Новое|Добавить|\+/ }).first();
  const event = page.locator("[data-event-id]").first();
  if (await event.count()) await event.click();
  else if (await plus.count()) await plus.click();
  const sheet = page.locator("[data-sheet]");
  const opened = await sheet.waitFor({ timeout: 6_000 }).then(() => true, () => false);
  if (opened) {
    await page.waitForTimeout(500);
    const box = await sheet.boundingBox();
    const bottom = box ? Math.round(box.y + box.height) : -1;
    record("телефон: шторка календаря — снизу, во всю ширину", Boolean(box && bottom >= 844 - 2 && box.width >= 380), box ? `низ=${bottom} ширина=${Math.round(box.width)}` : "нет");
    await shot("calendar-sheet");
    await page.keyboard.press("Escape");
  } else {
    record("телефон: шторка календаря открывается", false, "не нашёл события или «+»");
  }
  await context.close();
}

/** Safari's engine sends no `sec-ch-ua-mobile`: a Mac's user agent alone must land on the desk. */
async function runSafari() {
  let browser: Browser;
  try {
    browser = await webkit.launch({ headless: true });
  } catch (error) {
    skip("WebKit", `не запустился: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    return;
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: SAFARI_UA, locale: "ru-RU" });
    const page = await context.newPage();
    watch(page, "safari");
    await login(page, DIRECTOR.email, DIRECTOR.password);
    await page.waitForURL((url) => url.pathname.startsWith("/desk"), { timeout: 20_000 }).catch(() => {});
    record("WebKit, Mac без подсказки — директор на /desk/tasks", new URL(page.url()).pathname === "/desk/tasks", page.url());
    // the first screen's reads finish before moving on: WebKit reports a fetch cut by a navigation as an error
    await page.locator("#desk-main").waitFor({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Команда" }).click();
    await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 15_000 }).catch(() => undefined);
    await page.getByTestId("desk-row").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const rows = await page.getByTestId("desk-row").count();
    record("WebKit: «Команда» рисуется", rows > 0, `строк ${rows}`);
    await page.screenshot({ path: join(OUT, "safari-team.png") });
    shots.push(join(OUT, "safari-team.png"));
    await context.close();
  } finally {
    await browser.close();
  }
}

async function runSecretary(browser: Browser) {
  const context = await desktopContext(browser);
  const page = await context.newPage();
  watch(page, "secretary");
  try {
    await login(page, SECRETARY.email, SECRETARY.password);
  } catch (error) {
    skip("секретарь", `не вошла: ${error instanceof Error ? error.message : error}`);
    await context.close();
    return;
  }
  await page.waitForURL((url) => url.pathname.startsWith("/desk") || url.pathname === "/feed", { timeout: 20_000 }).catch(() => {});
  const home = new URL(page.url()).pathname;
  if (home === "/feed" || !home.startsWith("/desk")) {
    skip("секретарь", `${SECRETARY.email} — не секретарь на dev (дом ${home})`);
    await context.close();
    return;
  }
  record("секретарь: после входа — /desk/errands", home === "/desk/errands", home);
  await page.goto(`${APP_URL}/desk`, { waitUntil: "load" });
  await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 15_000 }).catch(() => {});
  record("секретарь: /desk → /desk/errands", new URL(page.url()).pathname === "/desk/errands", page.url());
  await page.goto(`${APP_URL}/desk/tasks`, { waitUntil: "load" });
  await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 15_000 }).catch(() => {});
  record("секретарь: /desk/tasks уводит на /desk/errands", new URL(page.url()).pathname === "/desk/errands", page.url());
  const nav = await page.getByRole("navigation", { name: "Разделы" }).getByRole("link").count();
  record("секретарь: в навигации четыре раздела и профиль", nav === 5, `ссылок ${nav}`);
  await checkSecretary({ page, stamp: "", shot: shooter(page, "secretary"), quiet: true });
  await context.close();
}

async function main() {
  const quiet = await ownerActive();
  if (quiet) console.log("dev: в последние 10 минут была активность — запись (заметка) будет пропущена");
  const stamp = Date.now().toString(36);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    // ---- 1. director on a computer -------------------------------------------------------------
    const context = await desktopContext(browser);
    const page = await context.newPage();
    watch(page, "director");
    await login(page, DIRECTOR.email, DIRECTOR.password);
    await page.waitForURL((url) => url.pathname === "/desk/tasks", { timeout: 20_000 }).catch(() => {});
    record("директор на компьютере после входа — /desk/tasks", new URL(page.url()).pathname === "/desk/tasks", page.url());
    await page.goto(`${APP_URL}/sent`, { waitUntil: "load" });
    await page.waitForURL((url) => url.pathname === "/desk/tasks", { timeout: 15_000 }).catch(() => {});
    record("телефонный адрес /sent на компьютере → /desk/tasks", new URL(page.url()).pathname === "/desk/tasks", page.url());
    await page.locator("#desk-main").waitFor({ timeout: 20_000 });
    const surface = await page
      .waitForFunction(() => document.documentElement.dataset.surface === "desk", undefined, { timeout: 10_000 })
      .then(() => "desk", () => page.evaluate(() => document.documentElement.dataset.surface ?? null));
    record("на <html> — data-surface=desk", surface === "desk", String(surface));

    const ctx: Ctx = { page, stamp, shot: shooter(page, "director"), quiet };
    for (const [name, check] of [
      ["tasks", checkTasks],
      ["team", checkTeam],
      ["errands", checkErrands],
      ["reports", checkReports],
      ["calendar", checkCalendar],
      ["notes", checkNotes],
      ["screen", checkScreen],
      ["settings", checkSettings],
    ] as const) {
      if (!runs(name)) continue;
      try {
        await check(ctx);
      } catch (error) {
        record(`check ${name}`, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
        await ctx.shot(`${name}-failed`).catch(() => {});
      }
    }
    if (runs("shell")) {
      try {
        await checkShell(ctx);
      } catch (error) {
        record("оболочка", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
        await ctx.shot("shell-failed").catch(() => {});
      }
    }
    await context.close();

    // ---- 2. the phone did not change ------------------------------------------------------------
    if (runs("phone")) await runPhone(browser);

    // ---- 3. the secretary --------------------------------------------------------------------
    if (runs("secretary")) await runSecretary(browser);

    // ---- 4. Safari's engine ------------------------------------------------------------------
    if (runs("safari")) await runSafari();
  } finally {
    await browser.close();
  }

  record("ошибок страницы и console.error — 0", errors.length === 0, errors.length ? `${errors.length}` : "");
  for (const line of errors) console.log(`  ${line}`);
  if (signInNoise.length) {
    console.log(`экран входа до входа (не десктоп): ${signInNoise.length}`);
    for (const line of new Set(signInNoise)) console.log(`  ${line}`);
  }
  console.log(`\nскриншоты (${shots.length}): ${OUT}`);
  for (const path of shots) console.log(`  ${path}`);
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
  process.exit(failed.length ? 1 : 0);
}

void main();
