/**
 * Role B of tasks/022, waves 2–3 of D-154: /desk/team as the dispatcher's board (the peek in the
 * panel, the row's menu, the keys), the person's card with the editor in place, /desk/team/new,
 * /desk/reports «День» / «Период» with the filters and the panel, /desk/errands of the director
 * (history filters) and the secretary's queue. Read only — nothing is saved, nobody is created, no
 * code is issued, no request is asked, taken, declined or thanked: the quick requests are counted,
 * never clicked; the forms are typed into and cancelled; the menus are opened and closed. Writes the
 * screens could send from here are cut off in the browser while these checks run.
 */
import { readFile } from "node:fs/promises";

import type { Page } from "playwright";

import { open, record, skip, type Ctx } from "./shared";

const UUID = /\/desk\/team\/([0-9a-f-]{36})/;
const TEAM_ROWS = '[data-testid="desk-team-table"] [data-testid="desk-row"]';
/** «Команда» as the table (D-172: the grid is the default, «Список» the table). */
const TEAM_LIST = "/desk/team?view=list";
const TEAM_TILES = '[data-testid="desk-team-grid"] [data-testid="desk-team-tile"]';

/** The column titles of the desk table under `scope`, lower-cased (CSS upper-cases them) and without the sort marks. */
async function headsOf(ctx: Ctx, scope: string): Promise<string[]> {
  const heads = await ctx.page.locator(`${scope} [role="columnheader"]`).allInnerTexts();
  return heads.map((head) => head.replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim().toLowerCase());
}

/** A row is clicked on its first cell — the name: the load and the task in a row are links of their own. */
function nameCell(ctx: Ctx, rows: string, index: number) {
  return ctx.page.locator(rows).nth(index).locator('[role="gridcell"]').first();
}

const visible = (ctx: Ctx, testId: string, timeout = 10_000) =>
  ctx.page
    .getByTestId(testId)
    .first()
    .waitFor({ timeout })
    .then(() => true, () => false);

/** A safety net under the checks: no write of these screens leaves the browser (a slip of a click stays here). */
async function guardWrites(page: Page): Promise<() => Promise<void>> {
  const pattern = /\/api\/(people|push\/test)|\/rest\/v1\/(profiles|rpc\/(transition_errand|errand_|thank_errand))/;
  const handler = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") return route.continue();
    record("смоук: запись остановлена в браузере", false, `${method} ${route.request().url()}`);
    return route.abort();
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

export async function checkTeam(ctx: Ctx) {
  const { page } = ctx;
  const release = await guardWrites(page);
  try {
    await teamGrid(ctx);
    await teamTable(ctx);
    await personCard(ctx);
    await newPerson(ctx);
    await personMoves(ctx);
  } finally {
    await release();
  }
}

/**
 * The moves that end something, up to their last click: «Удалить…» is opened and cancelled — from
 * the row's menu and by the Delete key (D-160), the leave question is answered, the promotion is
 * cancelled, a failed load is staged in the browser.
 */
async function personMoves(ctx: Ctx) {
  const { page } = ctx;
  await open(page, TEAM_LIST);
  const rows = page.locator(TEAM_ROWS);
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const employee = rows.filter({ hasText: /Сотрудник|Шустряк|Специалист/ }).first();
  if ((await employee.count()) === 0) return skip("увольнение и черновик", "в команде нет сотрудника");
  const id = (await employee.getAttribute("data-row-key")) ?? "";

  // «Удалить…» from the row's menu: the name and what happens — erased, or out of the team with the history — then «Отмена»
  await employee.locator('[role="gridcell"]').first().click({ button: "right" });
  await page.getByTestId("desk-menu").getByRole("menuitem", { name: /^Удалить/ }).click();
  const dialog = await visible(ctx, "remove-dialog", 5_000);
  await page.getByTestId("remove-reading").waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  const said = dialog ? (await page.getByTestId("remove-dialog").innerText()).replace(/\s+/g, " ") : "";
  record("команда: «Удалить…» в меню строки — диалог говорит, что будет: уйдёт из команды с историей или исчезнет", dialog && /уйдёт из команды|нет истории/i.test(said), said.slice(0, 160));
  await ctx.shot("team-remove");
  await page.getByTestId("remove-cancel").click();
  await page.getByTestId("remove-dialog").waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
  // the Delete key on the chosen row opens the same dialog; Esc closes it, nothing is removed
  await employee.locator('[role="gridcell"]').first().click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Delete");
  const byKey = await visible(ctx, "remove-dialog", 5_000);
  await page.keyboard.press("Escape");
  const keyGone = await page.getByTestId("remove-dialog").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  record("команда: Delete на выбранной строке — тот же диалог, Esc закрывает", byKey && keyGone);
  // who left is out of sight until asked for: «Ушедшие · N» in the toolbar
  const goneToggle = page.getByTestId("desk-team-gone");
  if (await goneToggle.count()) {
    const before = await page.locator(TEAM_ROWS).count();
    await goneToggle.click();
    await page.waitForTimeout(300);
    const after = await page.locator(TEAM_ROWS).count();
    record("команда: ушедшие скрыты, «Ушедшие · N» показывает их", after > before, `${before} → ${after}`);
    await goneToggle.click();
  } else {
    skip("команда: «Ушедшие»", "ушедших нет");
  }

  // an unsaved card: «Команда ›» asks; «Остаться» keeps the words, «Не сохранять» goes
  await open(page, `/desk/team/${id}?edit=1`);
  await visible(ctx, "desk-person-editor");
  await page.waitForTimeout(400);
  record("карточка: тумблера «Работает» в форме больше нет, телефон и фото есть", (await page.getByRole("switch").count()) === 0 && (await page.getByTestId("person-phone").count()) === 1 && (await page.getByTestId("person-photo").count()) === 1);
  await page.getByTestId("person-name").press("End");
  await page.keyboard.type(" смоук");
  await page.getByTestId("desk-person-back").click();
  const asks = await visible(ctx, "person-leave", 3_000);
  await ctx.shot("team-leave");
  if (asks) {
    await page.getByTestId("leave-stay").click();
    await page.getByTestId("person-leave").waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
  }
  const kept = (await page.getByTestId("person-name").inputValue()).endsWith(" смоук");
  record("карточка: «Команда ›» с черновиком спрашивает, «Остаться» его хранит", asks && kept && page.url().includes("edit=1"), page.url());

  // the director's role asks on «Сохранить» — cancelled there
  const role = page.getByTestId("person-role");
  if ((await role.count()) && (await role.isEnabled()) && (await role.locator('option[value="director"]').count())) {
    const was = await role.inputValue();
    await role.selectOption("director");
    await page.getByTestId("desk-person-save").click();
    const promote = await visible(ctx, "person-promote", 3_000);
    await ctx.shot("team-promote");
    if (promote) await page.getByTestId("promote-cancel").click();
    await role.selectOption(was);
    record("карточка: роль «Директор» спрашивает подтверждение", promote);
  } else {
    skip("карточка: подтверждение роли «Директор»", "этому зрителю роль не предлагается");
  }

  await page.getByTestId("desk-person-back").click();
  if (await visible(ctx, "person-leave", 3_000)) await page.getByTestId("leave-discard").click();
  const left = await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 10_000 }).then(() => true, () => false);
  record("карточка: «Не сохранять» уходит", left, page.url());

  // nothing came: the failure is said, the zeros are not. A browser that has been here restores
  // the last roster from its offline copy (D-127) — honest, and not this case: a clean context
  const browser = page.context().browser();
  if (!browser) return skip("команда: сбой загрузки", "нет браузера для чистого контекста");
  const clean = await browser.newContext({ storageState: await page.context().storageState(), viewport: page.viewportSize() });
  try {
    const first = await clean.newPage();
    await guardWrites(first);
    const failing = /\/rest\/v1\/profiles\?/;
    await first.route(failing, (route) => route.abort("failed"));
    await open(first, TEAM_LIST);
    const retry = first.getByTestId("desk-team-retry");
    const failed = await retry.waitFor({ timeout: 20_000 }).then(() => true, () => false);
    const words = (await first.locator("#desk-main").innerText()).replace(/\s+/g, " ");
    record("команда: сбой загрузки — «Не смог загрузить» и «Повторить», без нулей", failed && !words.includes("на месте") && !words.includes("просрочек нет"), words.slice(0, 100));
    await first.unroute(failing);
    await retry.click();
    const back = await first.locator(TEAM_ROWS).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
    record("команда: «Повторить» возвращает таблицу", back);
  } finally {
    await clean.close();
  }
}

/**
 * «Команда» as a grid (D-172): tiles of people; a click opens the card right under the tile's row,
 * with its tabs — the dashboard for a person at work, the data that turns into the editor in place,
 * the tasks; the same tile again or Esc closes it. Nothing is saved: the editor is cancelled.
 */
async function teamGrid(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/team");
  const tiles = page.locator(TEAM_TILES);
  await tiles.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const count = await tiles.count();
  record("команда: по умолчанию — сетка плиток, вид «Сетка / Список»", count > 0 && (await page.getByTestId("desk-team-view-list").count()) === 1, `плиток ${count}`);
  if (count === 0) return skip("команда: карточка под рядом", "в команде никого");
  await ctx.shot("team-grid");

  // an employee, whose card has the dashboard — the tile says «Сотрудник» or a position of the crew
  const employee = tiles.filter({ hasText: /Сотрудник|Шустряк|Специалист/ }).first();
  const tile = (await employee.count()) ? employee : tiles.first();
  await tile.click();
  const card = page.getByTestId("team-card");
  const opened = await card.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  // the card comes down 10 px into its place: measured once it has landed
  await page.waitForTimeout(450);
  const tileBox = await tile.boundingBox();
  const cardBox = opened ? await card.boundingBox() : null;
  const under = Boolean(tileBox && cardBox && cardBox.y >= tileBox.y + tileBox.height - 1);
  const lit = (await tile.getAttribute("data-open")) !== null;
  record("команда: щелчок по плитке — карточка под её рядом, плитка подсвечена, ?p= в адресе", opened && under && lit && page.url().includes("p="), page.url());
  await page.waitForTimeout(500);
  await ctx.shot("team-grid-card");

  const stats = page.getByTestId("seg-stats");
  if (await stats.count()) {
    await stats.click();
    const board = await page.getByTestId("person-stats").waitFor({ timeout: 8_000 }).then(() => true, () => false);
    const tilesOf = board ? await page.getByTestId("person-stats").locator('[data-testid^="person-stat-"]').count() : 0;
    record("карточка в сетке: «Показатели» — дашборд человека", board && tilesOf > 0, `плиток ${tilesOf}`);
    await page.waitForTimeout(1000);
    await ctx.shot("team-grid-stats");
  } else {
    skip("карточка в сетке: «Показатели»", "у этого человека нет дашборда (не сотрудник)");
  }

  // «Данные»: the facts; «Изменить» turns them into the editor in place — cancelled, nothing saved
  await page.getByTestId("seg-data").click();
  const facts = await page.getByTestId("desk-person-facts").waitFor({ timeout: 5_000 }).then(() => true, () => false);
  const edit = page.getByTestId("team-card-edit");
  if (await edit.count()) {
    await edit.click();
    const editor = await page.getByTestId("desk-person-editor").waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const stayed = page.url().includes("/desk/team?") && !page.url().includes("edit=1");
    await ctx.shot("team-grid-edit");
    await page.getByRole("button", { name: "Отменить", exact: true }).click().catch(() => undefined);
    const back = await page.getByTestId("desk-person-facts").waitFor({ timeout: 5_000 }).then(() => true, () => false);
    record("карточка в сетке: «Данные» — факты, «Изменить» — редактор прямо в карточке, «Отменить» — обратно", facts && editor && stayed && back, page.url());
  } else {
    record("карточка в сетке: «Данные» — факты", facts);
  }

  // Esc closes the card; the same tile twice opens and closes it
  await page.locator("#desk-main h1").click();
  await page.keyboard.press("Escape");
  const closed = await card.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  await tile.click();
  await card.waitFor({ timeout: 5_000 }).catch(() => undefined);
  await tile.click();
  const toggled = await card.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  record("карточка в сетке: Esc и повторный щелчок по плитке закрывают её", closed && toggled, page.url());
}

async function teamTable(ctx: Ctx) {
  const { page } = ctx;
  await open(page, TEAM_LIST);
  const rows = page.locator(TEAM_ROWS);
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const count = await rows.count();
  const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
  record("команда: таблица людей", count > 0, `строк ${count}; колонки: ${heads.join(" | ")}`);
  record(
    "команда директора: имя, нагрузка, сейчас, уведомления — без трёх колонок нулей и «Доступности»",
    ["имя", "нагрузка", "сейчас", "уведомления"].every((h) => heads.includes(h)) && !heads.some((h) => ["в работе", "просрочено", "на приёмке", "доступность"].includes(h)),
  );
  const box = count ? await rows.first().boundingBox() : null;
  // «Графит» gives a row 38 px (D-171), «Журнал» 34
  record("команда: строка 34–40 px", Boolean(box && box.height <= 40), box ? `высота ${Math.round(box.height)}` : "нет строки");
  const hero = await visible(ctx, "desk-team-hero");
  const heroText = hero ? ((await page.getByTestId("desk-team-hero").innerText()) ?? "").replace(/\s+/g, " ") : "";
  record("команда: герой «на месте» с числами", hero && heroText.includes("на месте"), heroText.slice(0, 120));
  // directors and the wall stand apart, below the people who get the work
  const groups = (await page.locator('[data-testid="desk-team-table"] [role="rowgroup"] [role="row"]:not([data-testid="desk-row"]) span').allInnerTexts()).map((t) => t.toLowerCase());
  record("команда: директора и экран — отдельной группой", groups.some((t) => t.includes("директора и экран")), groups.filter(Boolean).join(" | "));
  await ctx.shot("team");

  // a number of the hero filters the table — pressed, looked at, pressed again
  const filter = page.locator('[data-testid^="hero-fact-"]:is(button)').first();
  if (await filter.count()) {
    const label = ((await filter.innerText()) ?? "").replace(/\s+/g, " ");
    await filter.click();
    const chip = await visible(ctx, "desk-team-filter", 3_000);
    const narrowed = await rows.count();
    await ctx.shot("team-filter");
    await filter.click();
    await page.waitForTimeout(300);
    const back = await rows.count();
    record("команда: число героя фильтрует таблицу и снимается повторно", chip && narrowed <= count && back === count, `«${label}»: ${narrowed} из ${count}, после — ${back}`);
  } else {
    skip("команда: фильтр по числу героя", "проблемных чисел нет");
  }

  // the load leads to the person's tasks; on a quiet dev — the hero's «открытых задач»
  const load = page.getByTestId("team-load").first();
  if (await load.count()) {
    const href = (await load.getAttribute("href")) ?? "";
    await load.click();
    const went = await page.waitForURL((url) => url.pathname === "/desk/tasks" && url.searchParams.has("who"), { timeout: 15_000 }).then(() => true, () => false);
    record("команда: нагрузка ведёт в «Задачи» человека", went, `${href} → ${page.url()}`);
  } else {
    const fact = page.getByTestId("hero-fact-open");
    const href = (await fact.getAttribute("href").catch(() => null)) ?? "";
    record("команда: «открытых задач» ведёт в «Задачи» (открытых задач нет — нагрузка пуста)", href.startsWith("/desk/tasks"), href);
  }

  // F puts the caret in the search, which narrows the table (typed, then cleared — nothing else)
  await open(page, TEAM_LIST);
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.keyboard.press("KeyF");
  const search = page.getByRole("searchbox", { name: "Поиск по команде" });
  const focused = await search.evaluate((el) => el === document.activeElement).catch(() => false);
  await search.fill("яяяяя");
  await page.waitForTimeout(300);
  const none = await page.getByTestId("desk-empty").isVisible();
  await search.fill("");
  await page.keyboard.press("Escape");
  record("команда: F — в поиск, поиск сужает таблицу", focused && none);
  if (count === 0) return skip("команда: панель и карточка", "в таблице нет строк");

  // a click peeks in the panel (?p=), the table stays; ↓ moves the choice and the panel follows
  await nameCell(ctx, TEAM_ROWS, 0).click();
  const peek = await visible(ctx, "person-peek", 8_000);
  const first = new URL(page.url()).searchParams.get("p");
  record("команда: щелчок — человек в панели справа (?p=), таблица на месте", peek && Boolean(first) && (await rows.count()) === count, page.url());
  await ctx.shot("team-peek");
  if (count > 1) {
    await page.keyboard.press("ArrowDown");
    const moved = await page.waitForURL((url) => Boolean(url.searchParams.get("p")) && url.searchParams.get("p") !== first, { timeout: 5_000 }).then(() => true, () => false);
    record("команда: ↓ — соседний человек, панель следует", moved, page.url());
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(400);
  }

  // the right button: the row's moves at the cursor, with their keys — looked at, Esc closes
  await nameCell(ctx, TEAM_ROWS, 0).click({ button: "right" });
  const menu = await visible(ctx, "desk-menu", 3_000);
  const items = menu ? (await page.getByTestId("desk-menu").getByRole("menuitem").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()) : [];
  record(
    "команда: правая кнопка — меню строки («Открыть карточку», «Изменить», «Удалить…»)",
    menu && items.some((t) => t.startsWith("Открыть карточку")) && items.some((t) => t.startsWith("Изменить")) && items.some((t) => /^(Удалить|Выключить экран)/.test(t)),
    items.join(" | "),
  );
  await ctx.shot("team-menu");
  await page.keyboard.press("Escape");
  const menuGone = await page.getByTestId("desk-menu").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  record("команда: Esc закрывает меню, панель остаётся", menuGone && (await page.getByTestId("person-peek").count()) === 1);

  // «?» — the screen's keys in the help
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+Slash");
  const help = await visible(ctx, "desk-shortcuts", 3_000);
  const helpText = help ? (await page.getByTestId("desk-shortcuts").innerText()).toLowerCase() : "";
  record("команда: «?» — справка с клавишами экрана", help && helpText.includes("команда") && helpText.includes("дать задачу"), helpText.slice(0, 80).replace(/\s+/g, " "));
  await page.keyboard.press("Escape");
  await page.getByTestId("desk-shortcuts").waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);

  // Esc closes the panel; Enter on the chosen row opens the card
  await page.keyboard.press("Escape");
  const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
  record("команда: Esc закрывает панель", closed);
  await page.keyboard.press("Enter");
  const card = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
  record("команда: Enter на выбранной строке — карточка", card && (await visible(ctx, "desk-person", 15_000)), page.url());
}

async function personCard(ctx: Ctx) {
  const { page } = ctx;
  await open(page, TEAM_LIST);
  const rows = page.locator(TEAM_ROWS);
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  if ((await rows.count()) === 0) return skip("карточка", "в таблице нет строк");
  // an employee — whose login the director manages (another director's he does not)
  const employee = await rows.filter({ hasText: /Сотрудник|Шустряк|Специалист/ }).first().getAttribute("data-row-key").catch(() => null);
  const anyone = (await rows.first().getAttribute("data-row-key")) ?? "";
  const id = employee ?? anyone;

  await open(page, `/desk/team/${id}`);
  const card = await visible(ctx, "desk-person", 15_000);
  const identity = await visible(ctx, "desk-person-identity", 5_000);
  const facts = await visible(ctx, "desk-person-facts", 5_000);
  const back = await page.getByTestId("desk-person-back").count();
  record("карточка: «Команда ›», герой, факты карточки в строках «подпись — значение»", card && identity && facts && back === 1, page.url());
  await page.waitForTimeout(600);
  await ctx.shot("team-card");

  // «Дать задачу» pins the person in the order line and puts the caret there — nothing is sent
  const give = page.getByTestId("desk-person-give");
  if (await give.count()) {
    await give.click();
    await page.waitForTimeout(400);
    const focused = await page.evaluate(() => document.activeElement?.id ?? "");
    record("карточка: «Дать задачу» — курсор в строке поручения", focused === "desk-command", `activeElement=${focused}`);
    await ctx.shot("team-give");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  } else {
    skip("карточка: «Дать задачу»", "у этой карточки кнопки нет");
  }

  // E — the facts turn into fields in place; typed, «несохранено» shows; Esc asks, «Не сохранять» — gone, nothing saved
  await open(page, `/desk/team/${id}`);
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("KeyE");
  const editor = await visible(ctx, "desk-person-editor", 5_000);
  const idle = editor && (await page.getByTestId("desk-person-save").isDisabled());
  const caret = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? "");
  record("карточка: E — поля на месте фактов, курсор в имени, «Сохранить» ждёт правки", editor && idle && caret === "person-name", `${page.url()} фокус=${caret}`);
  await ctx.shot("team-edit");
  if (editor) {
    await page.keyboard.press("End");
    await page.keyboard.type(" смоук");
    const dirty = await visible(ctx, "person-form-dirty", 3_000);
    await page.keyboard.press("Escape");
    const asked = await visible(ctx, "person-leave", 3_000);
    await ctx.shot("team-edit-asked");
    if (asked) await page.getByTestId("leave-discard").click();
    const gone = await page.getByTestId("desk-person-editor").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("карточка: несохранённое заметно; Esc спрашивает, «Не сохранять» — отмена", dirty && asked && gone && !page.url().includes("edit=1"), page.url());
  }

  // ?edit=1 still opens the editor at once (the phone's /people/<id>/edit leads here)
  await open(page, `/desk/team/${id}?edit=1`);
  record("карточка: ?edit=1 раскрывает редактор", await visible(ctx, "desk-person-editor"));

  // the login block: the code waits for «Выдать код» — never pressed here; ?login=1 puts the caret on it
  if (employee) {
    await open(page, `/desk/team/${employee}?login=1`);
    const login = await visible(ctx, "desk-login");
    const issue = page.getByTestId("code-issue");
    const onIt = (await issue.count()) === 1 && (await issue.evaluate((el) => el === document.activeElement).catch(() => false));
    record("карточка сотрудника: «Вход» — код не выдан, ?login=1 ставит фокус на «Выдать код»", login && onIt);
    await ctx.shot("team-login");
  } else {
    skip("карточка сотрудника: блок «Вход»", "в команде нет сотрудника");
  }
}

async function newPerson(ctx: Ctx) {
  const { page } = ctx;
  await open(page, TEAM_LIST);
  await page.locator(TEAM_ROWS).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  // somebody already in the team, for the double's warning — read off the first row's name
  const known = ((await page.locator(TEAM_ROWS).first().locator("[title]").first().getAttribute("title").catch(() => null)) ?? "").split(" · ")[0].trim();
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("KeyN");
  const went = await page.waitForURL((url) => url.pathname === "/desk/team/new", { timeout: 10_000 }).then(() => true, () => false);
  const form = await visible(ctx, "desk-person-editor");
  record("новый сотрудник: N из «Команды» — форма, курсор в имени", went && form && (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid)) === "person-name");
  // Ctrl+Enter on an empty form says what is missing, under the field — nothing goes out
  await page.keyboard.press("Control+Enter");
  const error = await visible(ctx, "form-error", 3_000);
  record("новый сотрудник: Ctrl+Enter без имени — ошибка под полем, ничего не отправлено", error);
  // the spoken forms as chips: Enter adds, Backspace takes back
  await page.getByTestId("person-name").fill("Смоук Проверка");
  const chips = await page.getByTestId("alias-chip").count();
  await page.getByTestId("alias-input").fill("Проверяшка");
  await page.getByTestId("alias-input").press("Enter");
  const more = await page.getByTestId("alias-chip").count();
  await page.getByTestId("alias-input").press("Backspace");
  const less = await page.getByTestId("alias-chip").count();
  record("новый сотрудник: «Как называет» — чипы: Enter добавляет, Backspace убирает", chips >= 1 && more === chips + 1 && less === chips, `${chips} → ${more} → ${less}`);
  await page.getByTestId("seg-email").click();
  const email = await visible(ctx, "new-person-email", 3_000);
  const password = ((await page.getByTestId("password-input").inputValue().catch(() => "")) ?? "").length;
  record("новый сотрудник: «Почта и пароль» — почта и готовый пароль", email && password >= 6, `пароль ${password} симв.`);
  await ctx.shot("team-new");
  // a name already in the team is said under the field before «Добавить»
  if (known) {
    await page.getByTestId("person-name").fill(known);
    const twin = await visible(ctx, "person-twin", 3_000);
    record("новый сотрудник: имя, которое уже есть в команде, — предупреждение под полем", twin, known);
    await ctx.shot("team-new-twin");
  } else {
    skip("новый сотрудник: двойник", "в команде нет строк");
  }
  // Esc with words in the form asks; «Не сохранять» — back to the team, nobody created
  await page.getByTestId("person-name").focus();
  await page.keyboard.press("Escape");
  const asks = await visible(ctx, "person-leave", 3_000);
  if (asks) await page.getByTestId("leave-discard").click();
  const back = await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 10_000 }).then(() => true, () => false);
  record("новый сотрудник: Esc спрашивает, «Не сохранять» — назад в «Команду», никто не создан", asks && back, page.url());
}

/** The director's view of the errands; the secretary's queue — `checkSecretary`. */
export async function checkErrands(ctx: Ctx) {
  const { page } = ctx;
  const release = await guardWrites(page);
  try {
    await open(page, "/desk/errands");
    const hero = await visible(ctx, "desk-errands-hero");
    const heroText = hero ? ((await page.getByTestId("desk-errands-hero").innerText()) ?? "").split("\n")[0] : "";
    // the quick requests are counted and looked at — a click would ask the secretary for real
    const quick = await page.locator('[data-testid="desk-quick-errands"] button').count();
    const stats = await page.getByTestId("desk-errands-stats").isVisible();
    record("заявки директора: герой «сейчас у секретаря», просьбы в один клик, 30 дней", hero && quick > 0 && stats, `«${heroText}»; кнопок ${quick}`);
    await ctx.shot("errands");

    // the history's filters: a state, the words — looked at, then all again
    const history = '[data-testid="desk-errands-history"] [data-testid="desk-row"]';
    const all = await page.locator(history).count();
    if (all > 0) {
      await page.getByTestId("seg-done").click();
      await page.waitForTimeout(300);
      const done = await page.locator(history).count();
      await page.getByTestId("seg-all").first().click();
      await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("KeyF");
      await page.keyboard.type("яяяяя");
      // the search goes to the server after a pause: wait for what it says, not for a time
      const nothing = page.locator('[data-testid="desk-errands-history"] [data-testid="desk-empty"]');
      await nothing.waitFor({ timeout: 5_000 }).catch(() => undefined);
      const none = await nothing.isVisible();
      await page.keyboard.press("Escape");
      await page.locator(history).first().waitFor({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      const back = await page.locator(history).count();
      record("заявки: фильтр «Готово», F — поиск по истории, сброс", done <= all && none && back === all, `все ${all}, готово ${done}, после ${back}`);
    } else {
      skip("заявки: фильтры истории", "закрытых заявок нет");
    }

    // a closed request opens in the panel and goes with Esc — a click on the row, not on «Спасибо»
    const row = page.locator(`${history} [role="gridcell"]`).first();
    if ((await row.count()) === 0) return skip("заявки: панель", "закрытых заявок нет");
    await row.click();
    const panel = await visible(ctx, "desk-errand-details", 8_000);
    record("заявки: строка открывает заявку в панели (?e=)", panel && page.url().includes("e="), page.url());
    await ctx.shot("errands-panel");
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    // the panel goes at once, the address a moment later (the router's replace)
    const cleared = await page.waitForURL((url) => !url.searchParams.has("e"), { timeout: 5_000 }).then(() => true, () => false);
    record("заявки: Esc закрывает панель и снимает ?e=", closed && cleared, page.url());
  } finally {
    await release();
  }
}

export async function checkReports(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/reports");
  const tabs = (await page.getByTestId("seg-day").isVisible()) && (await page.getByTestId("seg-period").isVisible());
  record("отчёты: вкладки «День» и «Период»", tabs);
  const hero = await visible(ctx, "desk-day-hero", 15_000);
  const heroText = hero ? ((await page.getByTestId("desk-day-hero").innerText()) ?? "").replace(/\s+/g, " ") : "";
  record("отчёты «День»: итог «N из M сдали», полосы-дубля нет", hero && (await page.getByTestId("desk-day-bar").count()) === 0 && /из \d+ сдали|сдали в выходной/.test(heroText), heroText.slice(0, 120));
  const rows = page.locator('[data-testid="desk-reports-day"] [data-testid="desk-row"]');
  const count = await rows.count();
  const heads = await headsOf(ctx, '[data-testid="desk-reports-day"]');
  record("отчёты «День»: люди таблицей", count > 0 && ["кто", "пришёл", "ушёл", "задачи", "чем занимался"].every((h) => heads.includes(h)), `строк ${count}; ${heads.join(" | ")}`);
  await ctx.shot("reports-day");

  // the people's filter: F and words, then «Сдали» — looked at, then all again
  if (count > 0) {
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("KeyF");
    await page.keyboard.type("яяяяя");
    await page.waitForTimeout(300);
    const none = await page.locator('[data-testid="desk-reports-day"] [data-testid="desk-empty"]').isVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.getByTestId("seg-in").click();
    await page.waitForTimeout(300);
    const handed = await rows.count();
    await page.getByTestId("seg-all").first().click();
    await page.waitForTimeout(300);
    record("отчёты «День»: поиск человека (F) и «Сдали» сужают таблицу", none && handed <= count && (await rows.count()) === count, `сдали ${handed} из ${count}`);
  }

  // a row opens the whole report in the panel (?p=), Esc closes it
  if (count > 0) {
    await rows.first().locator('[role="gridcell"]').first().click();
    const panel = await visible(ctx, "desk-report-panel", 8_000);
    record("отчёты «День»: строка открывает отчёт в панели (?p=)", panel && page.url().includes("p="), page.url());
    await ctx.shot("reports-day-panel");
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    const cleared = await page.waitForURL((url) => !url.searchParams.has("p"), { timeout: 5_000 }).then(() => true, () => false);
    record("отчёты «День»: Esc закрывает панель и снимает ?p=", closed && cleared, page.url());
  }

  // the day steps back and returns — by the arrow, by ← and by T
  const title = page.getByTestId("desk-day-title");
  const today = (await title.innerText().catch(() => "")).trim();
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await page.waitForTimeout(600);
  const yesterday = (await title.innerText().catch(() => "")).trim();
  await page.getByRole("button", { name: "К сегодня" }).click();
  await page.waitForTimeout(400);
  const back = (await title.innerText().catch(() => "")).trim();
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const byKey = (await title.innerText().catch(() => "")).trim();
  await page.keyboard.press("KeyT");
  await page.waitForTimeout(400);
  const byT = (await title.innerText().catch(() => "")).trim();
  record("отчёты «День»: ‹ ›, ← и T листают дни", yesterday !== today && back === today && byKey === yesterday && byT === today, `${today} → ${yesterday} → ${back}; ← ${byKey}; T ${byT}`);

  await page.getByTestId("seg-period").click();
  const period = await page.waitForURL((url) => url.searchParams.get("tab") === "period", { timeout: 5_000 }).then(() => true, () => false);
  const periodHero = await visible(ctx, "desk-period-hero", 15_000);
  const strip = await page.getByTestId("desk-period-strip").isVisible().catch(() => false);
  const periodRows = page.locator('[data-testid="desk-reports-period"] [data-testid="desk-row"]');
  record("отчёты «Период»: ?tab=period, герой с долей сдачи, столбики по дням, люди таблицей", period && periodHero && strip, `строк ${await periodRows.count()}; ${page.url()}`);
  // the strip's columns stay thin — never a wall of blocks
  const widest = await page.locator('[data-testid="desk-period-strip"] [data-day]').evaluateAll((cols) => Math.max(0, ...cols.map((c) => (c as HTMLElement).getBoundingClientRect().width)));
  record("отчёты «Период»: столбики тонкие", widest > 0 && widest <= 24, `шире всех ${Math.round(widest)} px`);
  await ctx.shot("reports-period");

  // a row opens the person's period in the panel
  if ((await periodRows.count()) > 0) {
    await periodRows.first().locator('[role="gridcell"]').first().click();
    const panel = await visible(ctx, "desk-period-panel", 8_000);
    record("отчёты «Период»: строка — период человека в панели", panel && page.url().includes("p="), page.url());
    await ctx.shot("reports-period-panel");
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  }

  // ← steps the week back; T returns; «Месяц» changes the dates
  const week = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(800);
  const earlier = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  await page.keyboard.press("KeyT");
  await page.waitForTimeout(400);
  const again = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  record("отчёты «Период»: ← — неделя раньше, T — по сегодня", earlier !== week && again === week, `${week} → ${earlier} → ${again}`);
  await page.getByTestId("seg-month").click();
  await page.waitForTimeout(1500);
  const month = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  record("отчёты «Период»: «Месяц» меняет даты", week !== month && month.length > 0, `${week} → ${month}`);
  await ctx.shot("reports-month");

  // what the screen hands out: the file — bytes, name, the total; the paper sheet — every row and column
  const save = page.getByTestId("desk-report-csv");
  if (await save.isEnabled()) {
    const [file] = await Promise.all([page.waitForEvent("download"), save.click()]);
    const bytes = await readFile(await file.path());
    const text = bytes.toString("utf8");
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    record(
      "отчёты «Период»: «Скачать для Excel» — CSV с BOM, «;», CRLF и итогом",
      /^Табель \d\d\.\d\d–\d\d\.\d\d\.csv$/.test(file.suggestedFilename()) && bom && text.includes("Сотрудник;Сдача;Сдал;") && /\r\nИтого;[^\r\n]*\r\n$/.test(text) && !/[^\r]\n/.test(text),
      file.suggestedFilename(),
    );
    const onScreen = await periodRows.count();
    const sheet = page.getByTestId("desk-print-sheet");
    const printed = await sheet.locator("tbody tr").count();
    record("отчёты «Период»: лист печати — все строки, заголовок и итог", printed === onScreen && (await sheet.locator("h2").innerText()).startsWith("Табель") && (await sheet.locator("tfoot td").first().innerText()) === "Итого", `строк ${printed} из ${onScreen}`);
    record("отчёты «Период»: «Печать» рядом с выгрузкой", await page.getByTestId("desk-report-print").isEnabled());
  } else {
    skip("отчёты «Период»: выгрузка и печать", "в таблице никого нет");
  }

  // a day's column opens that day
  const column = page.locator('[data-testid="desk-period-strip"] [data-day]').first();
  const day = await column.getAttribute("data-day");
  await column.click();
  const toDay = await page.waitForURL((url) => url.searchParams.get("tab") !== "period", { timeout: 5_000 }).then(() => true, () => false);
  record("отчёты «Период»: столбик дня открывает этот день", toDay && (await visible(ctx, "desk-day-title", 5_000)), `${day} → ${page.url()}`);
}

/** On the secretary's desk (her page is signed in already). */
export async function checkSecretary(ctx: Ctx) {
  const { page } = ctx;
  const release = await guardWrites(page);
  try {
    await open(page, "/desk/errands");
    const queue = await visible(ctx, "desk-errand-queue");
    const presence = await page.getByTestId("desk-presence").isVisible();
    const hero = await page.getByTestId("desk-errands-hero").isVisible().catch(() => false);
    const cards = await page.getByTestId("desk-errand-card").count();
    record("секретарь: герой, очередь заявок и «На месте»", queue && presence && hero, `заявок ${cards}`);
    if (cards > 0) {
      // the first is chosen, ↓ moves the choice; «N» opens the reasons as a menu and Esc closes it — none is picked
      const chosen = await page.locator('[data-testid="desk-errand-card"][data-chosen]').count();
      const hint = await page.getByTestId("desk-keys-hint").isVisible();
      let moved = true;
      if (cards > 1) {
        const first = await page.locator('[data-testid="desk-errand-card"][data-chosen]').getAttribute("data-errand-id");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);
        moved = (await page.locator('[data-testid="desk-errand-card"][data-chosen]').getAttribute("data-errand-id")) !== first;
        await page.keyboard.press("ArrowUp");
      }
      record("секретарь: первая заявка выбрана, ↑/↓ — выбор, подсказка клавиш", chosen === 1 && hint && moved, `выбрано ${chosen}`);
      const waiting = page.locator('[data-testid="desk-errand-card"][data-chosen][data-status="sent"]');
      if ((await waiting.count()) && (await waiting.getByTestId("desk-errand-decline").count())) {
        await page.keyboard.press("KeyN");
        const menu = await visible(ctx, "desk-menu", 3_000);
        const reasons = menu ? await page.getByTestId("desk-menu").getByRole("menuitem").count() : 0;
        await ctx.shot("errands-decline");
        await page.keyboard.press("Escape");
        const gone = await page.getByTestId("desk-menu").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
        record("секретарь: N — причины «Не могу» меню у кнопки (1–3), Esc — закрыть (ничего не выбрано)", menu && reasons === 3 && gone, `причин ${reasons}`);
        // Q — the questions to the director in a popover; Esc closes it
        await page.keyboard.press("KeyQ");
        const ask = await visible(ctx, "desk-errand-ask", 3_000);
        await ctx.shot("errands-ask");
        await page.keyboard.press("Escape");
        const askGone = await page.getByTestId("desk-errand-ask").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
        record("секретарь: Q — вопросы директору у строки, Esc — закрыть (ничего не спрошено)", ask && askGone);
      }
    } else {
      skip("секретарь: очередь с клавиатуры", "заявок в очереди нет");
    }
    await ctx.shot("errands");

    await open(page, TEAM_LIST);
    const rows = page.locator(TEAM_ROWS);
    await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
    record(
      "секретарь: команда без задач и очков",
      (await rows.count()) > 0 && !heads.includes("нагрузка") && !heads.includes("сейчас") && !heads.includes("очки") && heads.includes("уведомления"),
      heads.join(" | "),
    );
    await ctx.shot("team");

    // a card she may edit: the first person who is not a director — peeked, then opened by a double click
    const editable = rows.filter({ hasNotText: /директор/i }).first();
    if ((await editable.count()) === 0) return skip("секретарь: карточка", "некого открыть");
    await editable.locator('[role="gridcell"]').first().click();
    const peek = await visible(ctx, "person-peek", 8_000);
    const peekTasks = await page.getByTestId("person-peek-tasks").count();
    record("секретарь: панель человека без задач и «Дать задачу»", peek && peekTasks === 0 && (await page.getByTestId("person-peek-give").count()) === 0);
    await editable.locator('[role="gridcell"]').first().dblclick();
    const opened = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
    await visible(ctx, "desk-person", 10_000);
    const tasks = await page.getByTestId("desk-person-tasks").count();
    const give = await page.getByTestId("desk-person-give").count();
    record("секретарь: двойной щелчок — карточка, без задач и «Дать задачу»", opened && tasks === 0 && give === 0, page.url());
    await page.waitForTimeout(600);
    await ctx.shot("team-card");

    await page.goto(page.url().replace(/\/desk\/.*$/, "/desk/reports"), { waitUntil: "load" });
    const home = await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 10_000 }).then(() => true, () => false);
    record("секретарь: /desk/reports уводит на /desk/errands", home, page.url());
  } finally {
    await release();
  }
}
