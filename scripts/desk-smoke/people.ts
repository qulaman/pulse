/**
 * Role B of tasks/022, waves 2–3 of D-154: /desk/team as the dispatcher's board (the peek in the
 * panel, the row's menu, the keys), the person's card with the editor in place, /desk/team/new,
 * /desk/reports — the «Табель» card over the feed folded by days, with the filters and the panel, /desk/errands of the director
 * (history filters) and the secretary's queue. Read only — nothing is saved, nobody is created, no
 * code is issued, no request is asked, taken, declined or thanked: the quick requests are counted,
 * never clicked; the forms are typed into and cancelled; the menus are opened and closed. Writes the
 * screens could send from here are cut off in the browser while these checks run.
 */
import { readFile } from "node:fs/promises";

import type { Page } from "playwright";

import { cutShort, open, record, skip, VT_PROBE, vtCount, vtSince, vtWords, watchServerTrips, type Ctx } from "./shared";

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
  await page.addInitScript(VT_PROBE);
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
  const who = (await tile.getAttribute("data-row-key")) ?? "";
  const vtBefore = await vtCount(page);
  const stopWatch = watchServerTrips(page);
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
  // D-184: the card opens as a transition — the circle flies from the tile into it — without asking the server
  const peekRuns = await vtSince(page, vtBefore);
  const flew = peekRuns.some((run) => run.groups.includes(`desk-face-${who}`));
  const asked = stopWatch();
  record(
    "команда (D-184): карточка под рядом открывается переходом — кружок летит из плитки, сервер не спрошен, переход не оборван",
    opened && flew && asked === 0 && !peekRuns.some(cutShort),
    `переходы ${vtWords(peekRuns) || "нет"}; запросов к серверу ${asked}`,
  );
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

  // D-184: «Открыть» — the screen goes deeper as a transition; «Команда ›» brings it back, and the
  // circle and the name fly home into the card (the way in pairs once the page's code is loaded —
  // in `next dev` the first visit loads it, so only the way back is held to the pair)
  await tile.click();
  await card.waitFor({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const tripFrom = await vtCount(page);
  await page.getByTestId("team-card-open").click();
  const person = await page.getByTestId("desk-person-identity").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  await page.getByTestId("desk-person-back").click();
  const home = await card.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await page.waitForTimeout(600);
  const trip = await vtSince(page, tripFrom);
  const deeper = trip.length >= 2 && trip[0].groups.includes("desk-screen");
  const last = trip.at(-1);
  const flewHome = Boolean(last && ["desk-screen", `desk-face-${who}`, `desk-name-${who}`].every((group) => last.groups.includes(group)));
  record(
    "команда (D-184): «Открыть» — экран уходит вглубь переходом; «Команда ›» — обратно, кружок и имя летят в карточку; ни один переход не оборван",
    person && home && deeper && flewHome && !trip.some(cutShort),
    `переходы ${vtWords(trip) || "нет"}`,
  );
  await ctx.shot("team-grid-back");
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
    const heroText = hero ? ((await page.getByTestId("desk-errands-hero").innerText()) ?? "").replace(/\s+/g, " ").trim() : "";
    // «Пульт» (D-175): the keys are counted and looked at — a click or a digit would ask the secretary for real
    const keys = await page.locator('[data-testid="desk-pult-keypad"] [data-testid="desk-pult-key"]').count();
    const words = await page.getByTestId("desk-pult-words").isVisible().catch(() => false);
    const zero = /(^| )0 мин/.test(heroText);
    record("заявки директора «Пульт»: полоса — что делает секретарь, клавиши просьб, «Своими словами», нигде «0 мин»", hero && keys > 0 && words && !zero, `«${heroText.slice(0, 120)}»; клавиш ${keys}`);
    await ctx.shot("errands");

    // «История» — the second view (?view=history): the table under one count naming its period, the thirty days beside it
    await page.getByTestId("seg-history").click();
    const viewed = await page.waitForURL((url) => url.searchParams.get("view") === "history", { timeout: 5_000 }).then(() => true, () => false);
    const stats = await visible(ctx, "desk-errands-stats", 10_000);
    await page.getByTestId("desk-errands-shown").filter({ hasText: /\d/ }).waitFor({ timeout: 8_000 }).catch(() => undefined);
    const shown = ((await page.getByTestId("desk-errands-shown").innerText().catch(() => "")) ?? "").trim();
    record("заявки: «История» вторым видом, один счёт с периодом, 30 дней рядом", viewed && stats && /за всё время|\d/.test(shown) && /·/.test(shown), `${page.url().replace(/^.*\/desk/, "/desk")} · «${shown}»`);
    await ctx.shot("errands-history");

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
    if ((await row.count()) === 0) {
      skip("заявки: панель", "закрытых заявок нет");
    } else {
      await row.click();
      const panel = await visible(ctx, "desk-errand-details", 8_000);
      record("заявки: строка открывает заявку в панели (?e=)", panel && page.url().includes("e="), page.url());
      await ctx.shot("errands-panel");
      await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Escape");
      const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
      // the panel goes at once, the address a moment later (the router's replace)
      const cleared = await page.waitForURL((url) => !url.searchParams.has("e"), { timeout: 5_000 }).then(() => true, () => false);
      record("заявки: Esc закрывает панель и снимает ?e=, вид «История» остаётся", closed && cleared && new URL(page.url()).searchParams.get("view") === "history", page.url());
    }
    // back to «Сейчас»: the address loses its view
    await page.getByTestId("seg-now").click();
    const back = await page.waitForURL((url) => !url.searchParams.has("view"), { timeout: 5_000 }).then(() => true, () => false);
    // the address changes at once, the screen a frame later, in its transition (D-184)
    const pult = await page.getByTestId("desk-pult-keypad").waitFor({ timeout: 5_000 }).then(() => true, () => false);
    record("заявки: «Сейчас» возвращает пульт", back && pult, page.url());

    // «Секретарь» (D-197): «Кнопки» — the table beside the keypad it makes; «Настройки» — who, the
    // repeat push, the guard's phone. Looked at only: an edit is put back, nothing is saved
    const named = (await page.locator('nav a[href="/desk/errands"]').first().innerText().catch(() => "")).trim();
    await page.getByTestId("seg-buttons").click();
    const buttonsAt = await page.waitForURL((url) => url.searchParams.get("view") === "buttons", { timeout: 5_000 }).then(() => true, () => false);
    const table = await visible(ctx, "secretary-actions", 10_000);
    const picture = await page.getByTestId("secretary-actions-preview").isVisible().catch(() => false);
    record("секретарь: раздел так и назван, «Кнопки» — таблица и клавиши, как их увидит директор", named === "Секретарь" && buttonsAt && table && picture, `«${named}»`);
    await ctx.shot("secretary-buttons");
    const firstLabel = page.locator('[data-action-row="0"] [data-col="label"]');
    if (await firstLabel.count()) {
      const was = await firstLabel.inputValue();
      await firstLabel.fill(`${was} ·`);
      const dot = await page.locator('[data-testid="seg-buttons"] [data-dirty]').waitFor({ timeout: 3_000 }).then(() => true, () => false);
      const bar = await visible(ctx, "settings-savebar", 3_000);
      await page.getByTestId("seg-now").click();
      await page.getByTestId("seg-buttons").click();
      const kept = (await firstLabel.inputValue().catch(() => "")) === `${was} ·`;
      await page.getByTestId("settings-reset").click();
      const undone = (await firstLabel.inputValue().catch(() => "")) === was && (await page.getByTestId("settings-savebar").count()) === 0;
      record("секретарь: правка кнопки — точка на вкладке и полоса «Сохранить», переживает «Заявки», «Отменить» возвращает", dot && bar && kept && undone);
    } else {
      skip("секретарь: правка кнопки", "кнопок нет");
    }
    await page.getByTestId("seg-settings").click();
    const settingsAt = await page.waitForURL((url) => url.searchParams.get("view") === "settings", { timeout: 5_000 }).then(() => true, () => false);
    const phone = await visible(ctx, "secretary-tab-settings", 10_000);
    const rows = await page.locator('[data-setting="secretary-who"], [data-setting="secretary-repeat"], [data-setting="secretary-phone"]').count();
    record("секретарь: «Настройки» — кто секретарь, повтор пуша, телефон охраны", settingsAt && phone && rows === 3, `строк ${rows}`);
    await ctx.shot("secretary-settings");
    await page.getByTestId("seg-now").click();
    await page.getByTestId("desk-pult-keypad").waitFor({ timeout: 5_000 }).catch(() => undefined);

    // «Объявления» (D-174): the feed of cards or its empty state; a card opens in the panel from the
    // keys (↓, Enter) and goes with Esc — nothing is acknowledged, sent or deleted
    await open(page, "/desk/ether");
    const cards = page.locator('[data-testid="ether-table"] [data-row-key]');
    const empty = page.locator('[data-testid="desk-empty"]');
    await Promise.any([cards.first().waitFor({ timeout: 10_000 }), empty.first().waitFor({ timeout: 10_000 })]).catch(() => undefined);
    const count = await cards.count();
    const quiet = count === 0 && (await empty.first().isVisible().catch(() => false));
    record("объявления: лента карточек или пустое состояние словами", count > 0 || quiet, `карточек ${count}`);
    await ctx.shot("ether");
    if (count === 0) {
      skip("объявления: карточка в панели с клавиатуры", "объявлений нет");
    } else {
      await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      const opened = await visible(ctx, "ether-panel", 8_000);
      const read = await page.getByTestId("ether-read").isVisible().catch(() => false);
      record("объявления: ↓ и Enter открывают карточку в панели (?id=), в ней кто ознакомился", opened && read && page.url().includes("id="), page.url());
      await ctx.shot("ether-panel");
      await page.keyboard.press("Escape");
      const gone = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
      record("объявления: Esc закрывает панель", gone);
    }
  } finally {
    await release();
  }
}

/**
 * The director's marks of the reports (D-198) never reach the database from the smoke: «Просмотрено»
 * (the feed marks what stayed on screen), «Проверено», «Напомнить», «Уважительная» are answered in
 * the browser — the check echoes the marks so the screen behaves as with a server.
 */
async function guardReportWrites(page: Page): Promise<() => Promise<void>> {
  const pattern = /\/api\/reports\/|\/rest\/v1\/rpc\/(mark_daily_reports_seen|check_daily_reports|remind_daily_report|excuse_daily_report)\b/;
  const handler = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    const request = route.request();
    if (request.method() === "GET" || request.method() === "HEAD") return route.continue();
    const body = (request.postDataJSON() ?? {}) as { ids?: string[]; on?: boolean; p_ids?: string[] };
    const now = new Date().toISOString();
    const ids = body.ids ?? body.p_ids ?? [];
    const marks = ids.map((id) => ({ id, seen_at: now, checked_at: body.on ? now : null, checked_by: null, changed_after_check_at: null }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reports: marks }) });
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

export async function checkReports(ctx: Ctx) {
  const { page } = ctx;
  const release = await guardReportWrites(page);
  try {
    await reportsFeed(ctx);
    await reportsTabel(ctx);
  } finally {
    await release();
  }
}

/** One page (D-201): the «Табель» card folded over the feed, the feed folded by days, the filters in the address, the diary, the marks. */
async function reportsFeed(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/reports");
  const noTabs = (await page.getByTestId("seg-feed").count()) + (await page.getByTestId("seg-tabel").count()) === 0;
  const card = await visible(ctx, "desk-tabel", 15_000);
  const list = await visible(ctx, "desk-feed-list", 15_000);
  if (!list) {
    const failed = await page.getByText("Не получилось загрузить").isVisible().catch(() => false);
    record("отчёты: лента загрузилась", false, failed ? "лента не пришла — функция team_daily_reports_feed есть на базе? (миграция D-198)" : "нет desk-feed-list");
    return;
  }
  const fold = page.getByTestId("desk-tabel-fold");
  await fold.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const hasSheet = (await fold.count()) > 0;
  const folded = hasSheet ? (await fold.getAttribute("aria-expanded")) === "false" : true;
  const peopleRows = await page.getByTestId("desk-tabel-row").count();
  const handed = await page.getByTestId("desk-tabel-day").count();
  record(
    "отчёты: одна страница без вкладок — карточка «Табель» над лентой, свёрнута в дни и «Сдали»",
    noTabs && card && folded && peopleRows === 0 && (!hasSheet || handed >= 28),
    `вкладок нет: ${noTabs}; свёрнут: ${folded}; строк людей ${peopleRows}; дней ${handed}`,
  );
  const heads = page.getByTestId("desk-feed-day-head");
  const morning = await page.getByTestId("desk-feed-morning").count();
  const days = page.getByTestId("desk-feed-day");
  const dayCount = await days.count();
  const openDays = await page.locator('[data-testid="desk-feed-day"][data-open]').count();
  const firstOpen = dayCount === 0 || (await days.first().getAttribute("data-open")) !== null;
  record(
    "отчёты: дни под своими заголовками — верхний раскрыт, остальные строкой",
    (await heads.count()) + morning > 0 && firstOpen && (dayCount < 3 || openDays < dayCount),
    `дней ${dayCount}${morning ? " + утренняя строка" : ""}; раскрыто ${openDays}`,
  );
  const feedText = (await page.getByTestId("desk-feed-list").innerText()).replace(/\s+/g, " ");
  record("отчёты: ни прихода, ни ухода, ни часов", !/\d{1,2}:\d\d\s*[–-]\s*\d{1,2}:\d\d|\d,\d ч\b|Пришёл|Ушёл/.test(feedText), feedText.slice(0, 100));
  await ctx.shot("reports-feed");

  // a press on a folded day's head opens it, another one folds it back
  const closed = page.locator('[data-testid="desk-feed-day"]:not([data-open])').first();
  if ((await closed.count()) > 0) {
    const date = (await closed.getAttribute("data-feed-day")) ?? "";
    const one = page.locator(`[data-feed-day="${date}"]`);
    await one.getByTestId("desk-feed-fold").click();
    const opened = (await one.getAttribute("data-open")) !== null;
    await one.getByTestId("desk-feed-fold").click();
    const again = (await one.getAttribute("data-open")) === null;
    record("отчёты: щелчок по заголовку дня раскрывает его и сворачивает обратно", opened && again, date);
  } else {
    skip("отчёты: свернуть и раскрыть день", "свёрнутых дней нет");
  }

  // ← goes to an older day, opens it and writes ?day=, a reload keeps it, T comes back to the top
  if (dayCount > 1) {
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowLeft");
    const written = await page.waitForURL((url) => url.searchParams.has("day"), { timeout: 5_000 }).then(() => true, () => false);
    const day = new URL(page.url()).searchParams.get("day");
    const openedByKey = (await page.locator(`[data-feed-day="${day}"]`).getAttribute("data-open").catch(() => null)) !== null;
    await page.reload();
    await visible(ctx, "desk-feed-list", 15_000);
    await page.waitForTimeout(800);
    const kept = new URL(page.url()).searchParams.get("day") === day && (await page.locator(`[data-feed-day="${day}"][data-open]`).count()) > 0;
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("KeyT");
    const top = await page.waitForURL((url) => !url.searchParams.has("day"), { timeout: 5_000 }).then(() => true, () => false);
    record("отчёты: ← ведёт к дню и раскрывает его (?day=), перезагрузка открывает тот же день, T — к сегодня", written && openedByKey && kept && top, `${day}`);
  } else {
    skip("отчёты: ← → и T", "в ленте один день");
  }

  // a checked report stands as one line; a press opens it in full
  const lines = page.getByTestId("desk-feed-folded");
  if ((await page.getByTestId("desk-feed-entry").count()) === 0 && (await lines.count()) > 0) {
    const before = await lines.count();
    await lines.first().click({ position: { x: 300, y: 10 } });
    await page.waitForTimeout(300);
    record("отчёты: проверенный отчёт — одной строкой, щелчок раскрывает его", (await lines.count()) === before - 1 && (await page.getByTestId("desk-feed-entry").count()) > 0, `строк было ${before}`);
  }
  const entries = page.getByTestId("desk-feed-entry");
  if ((await entries.count()) === 0) {
    skip("отчёты: человек, дневник, отметки", "в раскрытых днях нет ни одного отчёта");
    return;
  }
  // F — a person from the list under the field: the label «Имя ×», ?who=, the feed of that person alone, the card — their row
  const first = entries.first();
  const userId = (await first.getAttribute("data-user")) ?? "";
  const name = (await first.getAttribute("aria-label")) ?? "";
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("KeyF");
  await page.keyboard.type(name.split(" ")[0] ?? "");
  const listed = await visible(ctx, "desk-feed-suggest", 5_000);
  await page.keyboard.press("Enter");
  const who = await page.waitForURL((url) => url.searchParams.get("who") === userId, { timeout: 5_000 }).then(() => true, () => false);
  await visible(ctx, "desk-feed-who", 5_000);
  await page.waitForTimeout(800);
  const users = await page.locator('[data-testid="desk-feed-entry"]').evaluateAll((rows) => [...new Set(rows.map((row) => (row as HTMLElement).dataset.user))]);
  const rowKeys = await page.locator('[data-testid="desk-tabel-row"]').evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowKey));
  record(
    "отчёты: F — человек из списка, метка «Имя ×», ?who=, лента только его, в табеле — его строка",
    listed && who && users.every((id) => id === userId) && rowKeys.length <= 1 && rowKeys.every((id) => id === userId),
    `${name}: в ленте ${users.length} чел., строк табеля ${rowKeys.length}`,
  );
  await ctx.shot("reports-who");
  await page.getByTestId("desk-feed-who").getByRole("button").click();
  const cleared = await page.waitForURL((url) => !url.searchParams.has("who"), { timeout: 5_000 }).then(() => true, () => false);
  // «Не проверены» — in the address
  await page.getByTestId("seg-new").click();
  const only = await page.waitForURL((url) => url.searchParams.get("only") === "new", { timeout: 5_000 }).then(() => true, () => false);
  await page.getByTestId("seg-all").click();
  record("отчёты: × снимает человека, «Не проверены» — ?only=new", cleared && only, page.url());

  // a click on a report opens the diary on its day (?p=&day=), with «Все отчёты ›»; Esc closes it
  await page.waitForTimeout(600);
  if ((await page.getByTestId("desk-feed-entry").count()) === 0 && (await lines.count()) > 0) await lines.first().click({ position: { x: 300, y: 10 } });
  await visible(ctx, "desk-feed-entry", 10_000);
  await page.getByTestId("desk-feed-entry").first().locator(".rep-day-who").click();
  const diary = await visible(ctx, "desk-diary", 8_000);
  const all = await page.getByTestId("desk-diary-all").isVisible().catch(() => false);
  record("отчёты: щелчок по отчёту открывает дневник (?p=), в нём «Все отчёты ›»", diary && all && page.url().includes("p="), page.url());
  await ctx.shot("reports-diary");
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  const shut = await page.waitForURL((url) => !url.searchParams.has("p"), { timeout: 5_000 }).then(() => true, () => false);
  record("отчёты: Esc закрывает дневник и снимает ?p=", shut, page.url());

  // «Проверить» (answered in the browser): the report folds into its line at once, «Отменить» brings it back
  const button = page.locator('[data-testid="desk-feed-check"][aria-pressed="false"]').first();
  if (await button.isVisible().catch(() => false)) {
    const row = page.locator('[data-testid="desk-feed-entry"]', { has: page.locator('[data-testid="desk-feed-check"][aria-pressed="false"]') }).first();
    const key = (await row.getAttribute("data-row-key")) ?? "";
    await button.click();
    await page.waitForTimeout(300);
    const line = page.locator(`[data-testid="desk-feed-folded"][data-row-key="${key}"]`);
    const foldedNow = (await line.count()) === 1;
    await line.getByTestId("desk-feed-uncheck").click().catch(() => undefined);
    await page.waitForTimeout(300);
    const back = (await page.locator(`[data-testid="desk-feed-entry"][data-row-key="${key}"] [data-testid="desk-feed-check"][aria-pressed="false"]`).count()) === 1;
    record("отчёты: «Проверить» сворачивает отчёт в строку сразу, «Отменить» возвращает (запись — в браузере)", foldedNow && back, `свернулся: ${foldedNow}; вернулся: ${back}`);
  } else {
    skip("отчёты: «Проверить»", "непроверенных отчётов на экране нет (или не директор)");
  }
}

/** The «Табель» card with its people: an old link opens it, the month in the address, the paper, the diary from a cell, the feed from a day. */
async function reportsTabel(ctx: Ctx) {
  const { page } = ctx;
  // a link from before D-201 that meant the tab: the card opens with its people
  await open(page, "/desk/reports?tab=tabel");
  const grid = await visible(ctx, "desk-tabel", 15_000);
  const rows = page.locator('[data-testid="desk-tabel-row"]');
  await rows.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const dates = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  const heads = await page.getByTestId("desk-tabel-day").count();
  const feedToo = await page.getByTestId("desk-feed-list").isVisible().catch(() => false);
  record(
    "отчёты «Табель»: старая ссылка ?tab=tabel раскрывает людей; месяц календарный, люди × дни, лента под карточкой",
    grid && feedToo && /^[А-Я][а-я]+ \d{4}$/.test(dates) && heads >= 28 && heads <= 31 && (await rows.count()) > 0,
    `${dates}; дней ${heads}; людей ${await rows.count()}`,
  );
  const states = await page.locator('[data-testid="desk-tabel-cell"]').evaluateAll((cells) => [...new Set(cells.map((c) => (c as HTMLElement).dataset.state ?? ""))]);
  record("отчёты «Табель»: в клетках состояния, без часов", states.length > 0 && !(await page.locator('[data-testid="desk-tabel-cell"]').first().innerText()).match(/\d,\d|ч\b/), states.join(", "));
  await ctx.shot("reports-tabel");

  // ‹ a month back, written into the address; «Этот месяц» — this month again
  await page.getByTestId("desk-period-prev").click();
  await page.waitForTimeout(800);
  const before = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  const month = new URL(page.url()).searchParams.get("month");
  await page.getByTestId("desk-reports-today").click();
  await page.waitForTimeout(500);
  const again = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  record("отчёты «Табель»: ‹ — месяц раньше (?month=), «Этот месяц» возвращает", before !== dates && Boolean(month) && again === dates, `${dates} → ${before} (${month}) → ${again}`);

  // what the screen hands out: the табель for Excel — days as numbers, no points; the paper — every row
  const save = page.getByTestId("desk-report-csv");
  if ((await rows.count()) > 0 && (await save.isEnabled())) {
    await save.click();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Табель/ }).click()]);
    const bytes = await readFile(await file.path());
    const text = bytes.toString("utf8");
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const head = text.replace(/^﻿/, "").split("\r\n")[0] ?? "";
    record(
      "отчёты «Табель»: «Скачать для Excel → Табель» — табель по дням с BOM и CRLF, без очков",
      /^Табель отчётов .+ \d{4}\.csv$/.test(file.suggestedFilename()) && bom && head.startsWith("Сотрудник;") && /;1;2;3;/.test(head) && !/очк/i.test(head) && !/[^\r]\n/.test(text),
      `${file.suggestedFilename()}: ${head.slice(0, 80)}`,
    );
    // «Распечатать → Табель» puts the табель on the paper (the print dialog itself is not opened here)
    await page.evaluate("window.print = () => {}");
    await page.getByTestId("desk-report-print").click();
    await page.getByRole("menuitem", { name: /Табель/ }).click();
    await page.waitForTimeout(300);
    const onScreen = await rows.count();
    const sheet = page.getByTestId("desk-print-sheet");
    const printed = await sheet.locator("tbody tr").count();
    record("отчёты «Табель»: «Распечатать → Табель» — на листе все люди", (await sheet.getAttribute("data-kind")) === "tabel" && printed === onScreen, `строк ${printed} из ${onScreen}`);
  } else {
    skip("отчёты «Табель»: выгрузка и печать", "в табеле никого нет");
  }

  // a name opens the diary; a cell — the diary on that day; a day's head — that day in the feed, open
  if ((await rows.count()) > 0) {
    await rows.first().locator("button, a").first().click();
    const diary = await visible(ctx, "desk-diary", 8_000);
    record("отчёты «Табель»: имя открывает дневник", diary && page.url().includes("p="), page.url());
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    await rows.first().locator('[data-testid="desk-tabel-cell"]').first().click();
    const onDay = await page.waitForURL((url) => url.searchParams.has("p") && url.searchParams.has("day"), { timeout: 5_000 }).then(() => true, () => false);
    record("отчёты «Табель»: клетка открывает дневник на этом дне (?p=&day=)", onDay && (await visible(ctx, "desk-diary", 8_000)), page.url());
    await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  }

  // «Свернуть»: the people go, the days and «Сдали» stay; the choice is this computer's
  const fold = page.getByTestId("desk-tabel-fold");
  if ((await fold.count()) > 0) {
    await fold.click();
    await page.waitForTimeout(300);
    const none = (await rows.count()) === 0 && (await fold.getAttribute("aria-expanded")) === "false";
    await ctx.shot("reports-tabel-folded");
    await fold.click();
    await page.waitForTimeout(300);
    const kept = await page.evaluate("localStorage.getItem('pulse.desk.reports.sheet')");
    record("отчёты «Табель»: «Свернуть» убирает людей, «Показать людей» возвращает; выбор запомнен", none && (await rows.count()) > 0 && kept === "open", `в памяти: ${kept}`);
    // the smoke leaves the card as it found it: folded
    await fold.click();
  }
  await page.getByTestId("desk-tabel-day").first().click();
  const toFeed = await page.waitForURL((url) => url.searchParams.has("day"), { timeout: 5_000 }).then(() => true, () => false);
  record("отчёты «Табель»: заголовок дня ведёт к этому дню в ленте", toFeed && (await visible(ctx, "desk-feed", 8_000)), page.url());
}

/** On the secretary's desk (her page is signed in already). */
export async function checkSecretary(ctx: Ctx) {
  const { page } = ctx;
  const release = await guardWrites(page);
  try {
    await open(page, "/desk/errands");
    // «Стойка» (D-175): the head with the section's tabs (D-197) and her presence, the director's door, the queue
    const queue = await visible(ctx, "desk-errand-queue");
    const head = await page.getByTestId("stoika-head").isVisible().catch(() => false);
    const presence = await page.getByTestId("desk-presence").isVisible();
    const door = await page.getByTestId("stoika-door").isVisible().catch(() => false);
    const empty = await page.getByTestId("stoika-slot").isVisible().catch(() => false);
    const cards = await page.getByTestId("desk-errand-card").count();
    record("секретарь: «Стойка» — шапка, «На месте», очередь (дверь директора, место новой просьбы)", queue && head && presence && (cards > 0 || empty), `заявок ${cards}${door ? " · дверь" : ""}`);
    if (cards > 0) {
      // the first is chosen and holds its keys, ↓ moves the choice; «N» opens the reasons as a menu and Esc closes it — none is picked
      const chosen = await page.locator('[data-testid="desk-errand-card"][data-chosen]').count();
      const hint = (await page.locator('[data-testid="desk-errand-card"][data-chosen] .stoika-cap').count()) > 0;
      let moved = true;
      if (cards > 1) {
        const first = await page.locator('[data-testid="desk-errand-card"][data-chosen]').getAttribute("data-errand-id");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);
        moved = (await page.locator('[data-testid="desk-errand-card"][data-chosen]').getAttribute("data-errand-id")) !== first;
        await page.keyboard.press("ArrowUp");
      }
      record("секретарь: первая заявка выбрана, клавиши в её кнопках, ↑/↓ — выбор", chosen === 1 && hint && moved, `выбрано ${chosen}`);
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
