/**
 * Role C of tasks/022 (and D-154 waves 2–3): /desk/settings and its screens as desktop screens — the
 * tabs as forms with one save bar, the settings search, the keys; the dictionary, the data, the lab
 * and the points as tables. Nothing is saved: an edit made to see the bar is taken back with
 * «Отменить», dialogs are opened and closed with Esc, and every write request the screens could send
 * is counted — the run fails if there is one.
 */
import type { Page, Request } from "playwright";

import { APP_URL, open, record, type Ctx } from "./shared";

const TABS = [
  // the tab, the groups it has at least (director)
  ["company", 2],
  ["app", 2],
  ["team", 5],
  ["ai", 5],
] as const;

/** A write the settings' screens could send: settings, company, dictionary, lab, points, shop. */
function isWrite(request: Request): boolean {
  if (request.method() === "GET" || request.method() === "HEAD" || request.method() === "OPTIONS") return false;
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/settings") || url.pathname.startsWith("/api/company") || url.pathname.startsWith("/api/dictionary")) return true;
  if (url.pathname.startsWith("/api/admin")) return true;
  if (url.pathname === "/api/lab" || url.pathname.startsWith("/api/lab/parser")) return true;
  if (url.pathname.startsWith("/rest/v1/rpc/")) return /award_points|resolve_points_dispute|set_shop_order_status|cancel_shop_order/.test(url.pathname);
  return url.pathname.startsWith("/rest/v1/shop_items");
}

/** Lets go of the focus, so the next key is the screen's — not a field's (a click may land on one after a scroll). */
const blank = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

export async function checkSettings(ctx: Ctx) {
  const { page } = ctx;
  // this part's own errors and writes, apart from the run's total
  const noise: string[] = [];
  const writes: string[] = [];
  const onError = (error: Error) => noise.push(`${new URL(page.url()).pathname} pageerror: ${error.message}`);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") noise.push(`${new URL(page.url()).pathname} console.error: ${message.text()}`);
  };
  const onRequest = (request: Request) => {
    if (isWrite(request)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  try {
    await tabs(ctx);
    await search(ctx);
    await dictionary(ctx);
    // the developers' tools are the company's flag (settings.dev_tools): open — tested, closed — must stay closed
    await open(ctx.page, "/desk/settings");
    if ((await ctx.page.getByTestId("settings-nav-lab").count()) > 0) {
      await lab(ctx);
      await data(ctx);
    } else {
      await closedTools(ctx);
    }
    await points(ctx);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("request", onRequest);
  }
  record("настройки: ничего не записано — ни одного запроса записи", writes.length === 0, writes.slice(0, 4).join(" | "));
  record("настройки: ошибок страницы и console.error — 0", noise.length === 0, noise.length ? noise.slice(0, 3).join(" | ") : "");
}

async function tabs(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings");
  const nav = page.getByTestId("settings-subnav");
  await nav.waitFor({ timeout: 15_000 });
  const items = await nav.locator('[data-testid^="settings-nav-"]').count();
  const devTools = (await nav.getByTestId("settings-nav-lab").count()) + (await nav.getByTestId("settings-nav-data").count());
  record(
    "настройки: под-навигация директора — поиск, четыре вкладки и экраны рядом (без флага — без «Лаборатории» и «Данных»)",
    items === 6 + devTools && devTools !== 1 && (await nav.getByLabel("Найти настройку").count()) === 1,
    `пунктов ${items}, инструментов разработчика ${devTools}`,
  );

  for (const [tab, groups] of TABS) {
    await page.getByTestId(`settings-nav-${tab}`).click();
    const panel = page.getByTestId(`desk-settings-panel-${tab}`);
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    const planes = panel.locator("[data-settings-group]");
    const ready = await planes
      .nth(groups - 1)
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false);
    // a desktop form: rows with the words on the left and the control on the right, no phone accordions
    const accordions = await panel.locator("section.card button[aria-expanded]").count();
    const url = new URL(page.url());
    record(
      `настройки: вкладка ${tab} — группы строк, без телефонных раскрывашек, ?tab в адресе`,
      ready && accordions === 0 && url.searchParams.get("tab") === tab,
      `групп ${await planes.count()}, раскрывашек ${accordions}, адрес ${url.search}`,
    );
    await page.waitForTimeout(300);
    if (tab === "company") {
      // the chosen item as the side navigation marks its section: a 2 px line of the accent at the left, no accent fill (D-154)
      const marked = await nav.locator('[aria-current="page"]').evaluate((node) => {
        const line = [...node.querySelectorAll("span")].find((span) => span.getBoundingClientRect().width === 2);
        return { line: Boolean(line), fill: getComputedStyle(node).backgroundColor };
      });
      record("настройки: выбранный пункт — линия акцента 2 px, без заливки акцентом", marked.line && !/46,\s*211,\s*183/.test(marked.fill), `${marked.fill}`);
    }
    await ctx.shot(`settings-${tab}`);
    if (tab === "app") await unsaved(ctx);
  }

  // 1–4 outside a field switch the tab
  await blank(page);
  await page.keyboard.press("Digit2");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("tab") === "app", undefined, { timeout: 5_000 }).catch(() => {});
  record("настройки: клавиша 2 — вкладка «Программа»", new URL(page.url()).searchParams.get("tab") === "app", page.url());

  // Ctrl+S with nothing to save: the browser's «save page» never opens, nothing is sent — pressed only
  // when the bar is surely gone, so a leftover edit can never reach dev
  if ((await page.getByTestId("settings-savebar").count()) === 0) {
    await page.keyboard.press("Control+KeyS");
    await page.waitForTimeout(400);
    record("настройки: Ctrl+S без правок — тост «всё сохранено», ничего не отправлено", (await page.getByText("Здесь всё сохранено").count()) > 0);
  } else {
    record("настройки: Ctrl+S без правок — тост «всё сохранено», ничего не отправлено", false, "полоса правок не ушла — Ctrl+S не нажат");
  }

  // the AI tab's dictionary row leads to the desk's dictionary
  await page.getByTestId("settings-nav-ai").click();
  await page.getByTestId("desk-settings-panel-ai").getByTestId("settings-dictionary").click();
  await page.waitForURL((url) => url.pathname === "/desk/settings/dictionary", { timeout: 15_000 }).catch(() => {});
  record("настройки: «Открыть словарь» ведёт в десктопный словарь", new URL(page.url()).pathname === "/desk/settings/dictionary", page.url());
}

/** An edit lights the tab's dot, the row's accent line and the one save bar; «Отменить» takes it all back. */
async function unsaved(ctx: Ctx) {
  const { page } = ctx;
  const panel = page.getByTestId("desk-settings-panel-app");
  const toggle = panel.getByRole("switch", { name: "Праздничные наряды" });
  await toggle.waitFor({ timeout: 5_000 });
  await toggle.click();
  const lit = await page
    .locator('[data-testid="settings-nav-app"][data-dirty]')
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  const bar = page.getByTestId("settings-savebar");
  const shown = await bar.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  const sticky = shown ? await bar.evaluate((node) => getComputedStyle(node).position === "sticky") : false;
  const changed = await panel.locator('[data-setting="mascot-seasons"][data-changed]').count();
  record("настройки: правка — точка на вкладке, линия у строки, одна полоса «Не сохранено · Сохранить (Ctrl S)»", lit && shown && sticky && changed === 1, `точка ${lit}, полоса ${shown}, липкая ${sticky}`);
  await page.waitForTimeout(400);
  await ctx.shot("settings-unsaved");
  await page.getByTestId("settings-reset").click();
  const cleared = await page
    .locator('[data-testid="settings-nav-app"]:not([data-dirty])')
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  record("настройки: «Отменить» снимает правку, полосу и точку — ничего не сохранено", cleared && (await bar.count()) === 0);
}

/** The settings search: a word finds the setting on another tab, Enter lands on its row. */
async function search(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings?tab=company");
  await page.keyboard.press("Control+KeyF");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  await page.keyboard.type("обед");
  const results = page.getByTestId("settings-search-results");
  const found = await results
    .getByText("Слова о сроках")
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  await ctx.shot("settings-search");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("tab") === "ai", undefined, { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const inView = await page.evaluate(() => {
    const row = document.getElementById("set-conventions");
    if (!row) return false;
    const box = row.getBoundingClientRect();
    return box.top < window.innerHeight && box.bottom > 0;
  });
  record("настройки: Ctrl+F → «обед» → Enter — вкладка «ИИ-модель», строка «Слова о сроках» в виду", focused === "Найти настройку" && found && inView, `фокус ${focused}, найдено ${found}, в виду ${inView}`);
  await ctx.shot("settings-search-landed");
}

async function dictionary(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/dictionary");
  const names = page.getByRole("grid", { name: "Имена людей" });
  const people = await names
    .getByTestId("desk-row")
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => names.getByTestId("desk-row").count(), () => 0);
  record("словарь: имена — таблицей во всю ширину", people > 0 && ((await names.boundingBox())?.width ?? 0) > 800, `людей ${people}`);
  await ctx.shot("settings-dictionary-names");
  // ↓ and Enter open the name field in the row; Esc closes it — nothing typed, nothing sent
  await names.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const field = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  record("словарь: ↓ и Enter — поле имени в строке", field.startsWith("Как ещё зовут"), field);
  await page.keyboard.press("Escape");

  await blank(page);
  await page.keyboard.press("Digit2");
  const words = await page
    .locator("#dictionary-panel-words")
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true, () => false);
  record("словарь: клавиша 2 — «Слова», ?tab в адресе", words && new URL(page.url()).searchParams.get("tab") === "words", page.url());
  await page.waitForTimeout(800);
  await blank(page);
  await page.keyboard.press("KeyN");
  const add = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  record("словарь: N — поле нового слова", add === "Новое слово или список", add);
  await page.keyboard.press("Escape");
  await ctx.shot("settings-dictionary-words");
}

/** Without `settings.dev_tools`: nothing leads to the two screens, and their addresses go to the settings. */
async function closedTools(ctx: Ctx) {
  const { page } = ctx;
  for (const path of ["/desk/settings/lab", "/desk/settings/data"]) {
    await open(page, path);
    record(`инструменты разработчика закрыты: ${path} уводит в настройки`, new URL(page.url()).pathname === "/desk/settings", page.url());
  }
  await open(page, "/desk/settings?tab=ai");
  record("инструменты разработчика закрыты: в «ИИ-модель» нет ссылки на «Лабораторию»", (await page.getByTestId("settings-parser-rules").count()) === 0);
}

async function lab(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/lab");
  const models = page.getByTestId("seg-models");
  await models.waitFor({ timeout: 15_000 });
  const selected = (await models.getAttribute("aria-selected")) === "true";
  const shelf = page.locator('#desk-main a[href="/lab/about"]');
  const outside = (await shelf.count()) === 1 && (await shelf.getAttribute("target")) === "_blank";
  const phoneHead = await page.locator("#desk-main .page-head").isVisible().catch(() => false);
  const tables = await page
    .getByRole("grid", { name: "Расходы по распознаваниям" })
    .or(page.getByTestId("desk-empty"))
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  record("лаб: «Модели» — форма и таблицы, полка страниц — в новой вкладке, без телефонной шапки", selected && outside && !phoneHead && tables, `полка ${outside}, таблицы ${tables}`);
  await ctx.shot("settings-lab");
  await blank(page);
  await page.keyboard.press("Digit2");
  await page.waitForTimeout(800);
  record("лаб: клавиша 2 — «Парсер»", (await page.getByTestId("seg-parser").getAttribute("aria-selected")) === "true" && new URL(page.url()).searchParams.get("tab") === "parser", page.url());
  await ctx.shot("settings-lab-parser");
}

async function data(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/data");
  const sheet = page.getByTestId("data-sheet");
  const cells = await sheet
    .locator("td")
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => sheet.locator("td").count(), () => 0);
  record("данные: первая таблица — лист с ячейками", cells > 0, `ячеек ${cells}`);
  if (cells > 0) {
    await sheet.locator("td").first().click();
    await page.keyboard.press("Enter");
    const panel = await page
      .getByTestId("data-record")
      .waitFor({ timeout: 5_000 })
      .then(() => true, () => false);
    record("данные: ячейка и Enter — запись целиком в панели справа", panel);
    await ctx.shot("settings-data-record");
    await page.keyboard.press("Escape");
  }
  await ctx.shot("settings-data");
  await page.getByRole("tab", { name: "Сообщения", exact: true }).click();
  await page.waitForTimeout(800);
  record("данные: таблица в адресе (?table)", new URL(page.url()).searchParams.get("table") === "task_messages", page.url());
}

async function points(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/points");
  const grid = page.getByRole("grid", { name: "Балансы команды" });
  const shown = await grid
    .getByTestId("desk-row")
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true, () => false);
  const rows = shown ? await grid.getByTestId("desk-row").count() : 0;
  record("очки: таблица балансов", rows > 0, `строк ${rows}`);

  // one hero instead of five equal tiles: the points on hands large, what waits — orders, disputes — beside it
  const hero = page.getByTestId("points-hero");
  const heroText = (await hero.isVisible()) ? await hero.innerText() : "";
  const tiles = await page.locator("#desk-main").getByTestId("stat-tile").count();
  record(
    "очки: сводка — герой «На руках у команды», выдача и споры рядом, без плиток",
    /на руках у команды/i.test(heroText) && (await page.getByTestId("points-hero-shop").count()) === 1 && (await page.getByTestId("points-hero-disputes").count()) === 1 && tiles === 0,
    heroText.split("\n").slice(0, 3).join(" · "),
  );
  // numbers apart by thousands and a real minus: no «1000880», no hyphen in front of a figure (D-154)
  const figures = `${heroText}\n${shown ? await grid.innerText() : ""}`;
  const raw = figures.match(/\d{4,}|(?:^|[\s(])-\d/gm) ?? [];
  record("очки: числа с разрядами и настоящим «−»", raw.length === 0, raw.slice(0, 4).join(" "));
  await ctx.shot("settings-points");

  // «Начислить» opens its dialog with the people picker — closed without a word typed, nothing awarded
  const award = page.getByTestId("points-award");
  if (await award.isEnabled()) {
    await award.click();
    const dialog = page.getByRole("dialog", { name: "Начислить очки" });
    const opened = await dialog.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const picker = await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox");
    record("очки: «Начислить» — диалог, курсор в поиске человека", opened && picker && (await dialog.getByLabel("Кому").count()) === 1);
    await page.waitForTimeout(300);
    await ctx.shot("settings-points-award");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  } else {
    record("очки: «Начислить» — диалог, курсор в поиске человека", true, "очки выключены — кнопка неактивна");
  }

  // the other views, by their keys: a list or its empty state, never a blank — looked at, nothing pressed
  const main = page.locator("#desk-main");
  const views = [
    ["Digit2", "disputes", main.locator('[data-testid="dispute-card"], [data-testid="desk-empty"]')],
    ["Digit3", "history", main.getByRole("grid", { name: "История очков" }).or(main.getByTestId("desk-empty"))],
    ["Digit4", "shop", main.getByRole("region", { name: "Награды" })],
  ] as const;
  const seen: string[] = [];
  for (const [key, view, mark] of views) {
    await blank(page);
    await page.keyboard.press(key);
    const on = (await page.getByTestId(`seg-${view}`).getAttribute("aria-selected")) === "true";
    if (on && (await mark.first().waitFor({ timeout: 15_000 }).then(() => true, () => false))) seen.push(view);
    await page.waitForTimeout(600);
    await ctx.shot(`settings-points-${view}`);
    if (view === "history") {
      // the ledger's sums: a plus in gold, a minus quiet with «−» — never a hyphen, never the alarm's red
      const sums = await main.getByRole("grid", { name: "История очков" }).locator(".nums").evaluateAll((nodes) =>
        nodes.map((node) => ({ text: node.textContent ?? "", color: getComputedStyle(node).color })).filter((item) => /^[+−]?\d/.test(item.text.trim())),
      );
      const danger = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--danger)";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      const bad = sums.filter((item) => item.text.includes("-") || item.color === danger);
      record("очки: история — минусы приглушённые с «−»", sums.length === 0 || bad.length === 0, `сумм ${sums.length}, не так ${bad.length}`);
    }
  }
  record("очки: клавиши 2–4 — «Споры», «История», «Магазин»", seen.length === views.length, `${seen.join(", ")} · ${APP_URL}`);

  // «+ Награда» — the desk's form with the card's preview, closed with Esc; nothing saved
  const addItem = page.getByTestId("shop-add-item");
  if (await addItem.count()) {
    await addItem.click();
    const dialog = page.getByRole("dialog", { name: "Новая награда" });
    const opened = await dialog.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const form = opened ? await dialog.getByTestId("shop-item-form").count() : 0;
    record("очки: «+ Награда» — настольная форма с превью карточки", opened && form === 1);
    await page.waitForTimeout(300);
    await ctx.shot("settings-points-item");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  }
}
