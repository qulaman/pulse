/**
 * Role C of tasks/022: /desk/settings and its screens. Nothing is saved: an edit made to see the
 * «unsaved» dot is taken back with the section's own «Отменить», the demo reset and «Начислить»
 * dialogs are opened and closed, the lab compares nothing and the shop hands nothing out.
 */
import { APP_URL, open, record, type Ctx } from "./shared";

const TABS = [
  // the tab, the sections (Disclosure cards) it has for the director
  ["company", 2],
  ["app", 2],
  ["team", 2],
  ["ai", 3],
] as const;

export async function checkSettings(ctx: Ctx) {
  const { page } = ctx;
  // this part's own errors, apart from the run's total
  const noise: string[] = [];
  const onError = (error: Error) => noise.push(`${new URL(page.url()).pathname} pageerror: ${error.message}`);
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") noise.push(`${new URL(page.url()).pathname} console.error: ${message.text()}`);
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  try {
    await tabs(ctx);
    await dictionary(ctx);
    await lab(ctx);
    await data(ctx);
    await points(ctx);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
  }
  record("настройки: ошибок страницы и console.error — 0", noise.length === 0, noise.length ? noise.slice(0, 3).join(" | ") : "");
}

async function tabs(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings");
  const nav = page.getByTestId("settings-subnav");
  await nav.waitFor({ timeout: 15_000 });
  const items = await nav.locator('[data-testid^="settings-nav-"]').count();
  record("настройки: под-навигация директора — четыре вкладки и четыре экрана", items === 8, `пунктов ${items}`);

  for (const [tab, sections] of TABS) {
    await page.getByTestId(`settings-nav-${tab}`).click();
    const panel = page.getByTestId(`desk-settings-panel-${tab}`);
    await panel.waitFor({ state: "visible", timeout: 10_000 });
    const cards = panel.locator("section.card");
    const ready = await cards
      .nth(sections - 1)
      .waitFor({ timeout: 15_000 })
      .then(() => true, () => false);
    const count = await cards.count();
    const url = new URL(page.url());
    record(
      `настройки: вкладка ${tab} — секции на месте, ?tab в адресе`,
      ready && count >= sections && url.searchParams.get("tab") === tab,
      `секций ${count}, адрес ${url.pathname}${url.search}`,
    );
    // the navigation's highlight crossfades for 120 ms
    await page.waitForTimeout(300);
    await ctx.shot(`settings-${tab}`);
    if (tab === "company") await demoReset(ctx);
    if (tab === "app") await unsavedDot(ctx);
  }

  // a phone link inside a reused section lands on the desk twin: «Словарь» of the AI tab
  await page.getByTestId("desk-settings-panel-ai").getByTestId("settings-dictionary").click();
  await page.waitForURL((url) => url.pathname === "/desk/settings/dictionary", { timeout: 15_000 }).catch(() => {});
  record("настройки: ссылка секции на телефонный адрес ведёт в десктоп", new URL(page.url()).pathname === "/desk/settings/dictionary", page.url());
}

/** «Обнулить демо-базу»: at the foot of «Компания», its dialog opened and closed — never confirmed. */
async function demoReset(ctx: Ctx) {
  const { page } = ctx;
  const panel = page.getByTestId("desk-settings-panel-company");
  const button = panel.getByRole("button", { name: "Обнулить…" });
  if ((await button.count()) === 0) {
    record("настройки: «Обнулить демо-базу» внизу «Компании»", true, "не демо-сборка — блока нет");
    return;
  }
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const sheet = page.locator("[data-sheet]");
  await sheet.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300);
  const erase = page.getByRole("button", { name: "Стереть всё" });
  const locked = await erase.isDisabled();
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  const centred = Boolean(box && viewport && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4);
  record("настройки: «Обнулить демо-базу» — диалог по центру, без слова не стирает", locked && centred, box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "нет");
  await ctx.shot("settings-demo-reset");
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 5_000 });
}

/** An edit lights the tab's dot; the section's own «Сохранить» stands in the flow; «Отменить» takes it back. */
async function unsavedDot(ctx: Ctx) {
  const { page } = ctx;
  const panel = page.getByTestId("desk-settings-panel-app");
  const section = panel.locator("section.card", { hasText: "Маскот" });
  await section.getByRole("button", { expanded: false }).first().click();
  const toggle = section.getByRole("switch").first();
  await toggle.waitFor({ timeout: 5_000 });
  await toggle.click();
  const navItem = page.getByTestId("settings-nav-app");
  const lit = await navItem
    .and(page.locator("[data-dirty]"))
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  const save = section.getByRole("button", { name: "Сохранить" });
  const inFlow = await save.evaluate((node) => {
    for (let el: HTMLElement | null = node as HTMLElement; el; el = el.parentElement) {
      const position = getComputedStyle(el).position;
      if (position === "fixed" || position === "sticky") return false;
    }
    return true;
  });
  record("настройки: правка ставит точку на вкладке, «Сохранить» — в потоке секции", lit && inFlow, `точка ${lit}, в потоке ${inFlow}`);
  await page.waitForTimeout(500);
  await ctx.shot("settings-unsaved");
  await section.getByRole("button", { name: "Отменить" }).click();
  const cleared = await page
    .locator('[data-testid="settings-nav-app"]:not([data-dirty])')
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  record("настройки: «Отменить» в секции снимает точку, ничего не сохранено", cleared);
}

async function dictionary(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/dictionary");
  await page.getByTestId("dictionary-tab-names").waitFor({ timeout: 15_000 });
  const list = page.locator("#dictionary-panel-names > div > ul").first();
  const people = await list
    .locator(":scope > li")
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => list.locator(":scope > li").count(), () => 0);
  const columns = people ? await list.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length) : 0;
  record("словарь: имена людей — в две колонки", people > 0 && columns === 2, `людей ${people}, колонок ${columns}`);
  await ctx.shot("settings-dictionary-names");
  if (people) {
    await list.scrollIntoViewIfNeeded();
    await ctx.shot("settings-dictionary-people");
  }
  await page.getByTestId("dictionary-tab-words").click();
  const words = await page
    .locator("#dictionary-panel-words")
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true, () => false);
  record("словарь: вкладка «Слова», ?tab в адресе", words && new URL(page.url()).searchParams.get("tab") === "words", page.url());
  await ctx.shot("settings-dictionary-words");
}

async function lab(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/lab");
  const models = page.getByTestId("lab-tab-models");
  await models.waitFor({ timeout: 15_000 });
  const selected = (await models.getAttribute("aria-selected")) === "true";
  const shelf = await page.locator('#desk-main a[href="/lab/about"]').count();
  const phoneHead = await page.locator("#desk-main .page-head").isVisible().catch(() => false);
  record("лаб: вкладка «Модели», полка страниц — ссылками, без телефонной шапки", selected && shelf === 1 && !phoneHead, `полка ${shelf}, шапка ${phoneHead}`);
  await ctx.shot("settings-lab");
}

async function data(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/settings/data");
  const rows = page.locator("#desk-main table tbody tr:not(.skeleton)");
  await rows.first().waitFor({ timeout: 20_000 }).catch(() => {});
  const first = (await rows.count()) > 0 ? ((await rows.first().textContent()) ?? "") : "";
  const filled = (await rows.count()) >= 1 && first !== "Пусто" && !/^Ошибка/.test(first);
  record("данные: первая таблица — строки есть", filled, `строк ${await rows.count()}`);
  await ctx.shot("settings-data");
  await page.locator("#desk-main").getByRole("button", { name: "Сообщения", exact: true }).click();
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
  await ctx.shot("settings-points");

  // «Начислить» opens its dialog — closed without a word typed, nothing awarded
  const award = page.getByTestId("points-award");
  if (await award.isEnabled()) {
    await award.click();
    const dialog = page.getByRole("dialog", { name: "Начислить очки" });
    const opened = await dialog.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    record("очки: «Начислить» — диалог с выбором человека", opened && (await dialog.getByLabel("Кому").count()) === 1);
    await page.waitForTimeout(300);
    await ctx.shot("settings-points-award");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  } else {
    record("очки: «Начислить» — диалог с выбором человека", true, "очки выключены — кнопка неактивна");
  }

  // the other views: a list or its empty state, never a blank — looked at, nothing pressed
  const main = page.locator("#desk-main");
  const views = [
    ["disputes", main.locator('[data-testid="dispute-card"], [data-testid="desk-empty"]')],
    ["history", main.getByRole("grid", { name: "История очков" }).or(main.getByTestId("desk-empty"))],
    ["shop", main.getByRole("region", { name: "Награды" })],
  ] as const;
  const seen: string[] = [];
  for (const [view, mark] of views) {
    await page.getByTestId(`seg-${view}`).click();
    if (await mark.first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) seen.push(view);
    await page.waitForTimeout(600);
    await ctx.shot(`settings-points-${view}`);
  }
  record("очки: «Споры», «История», «Магазин» открываются", seen.length === views.length, `${seen.join(", ")} · ${APP_URL}`);
}
