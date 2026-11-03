/**
 * Role B of tasks/022, waves 2–3 of D-154: /desk/team as the dispatcher's board (the peek in the
 * panel, the row's menu, the keys), the person's card with the editor in place, /desk/team/new,
 * /desk/reports «День» / «Период» with the filters and the panel, /desk/errands of the director
 * (history filters) and the secretary's queue. Read only — nothing is saved, nobody is created, no
 * code is issued, no request is asked, taken, declined or thanked: the quick requests are counted,
 * never clicked; the forms are typed into and cancelled; the menus are opened and closed. Writes the
 * screens could send from here are cut off in the browser while these checks run.
 */
import type { Page } from "playwright";

import { open, record, skip, type Ctx } from "./shared";

const UUID = /\/desk\/team\/([0-9a-f-]{36})/;
const TEAM_ROWS = '[data-testid="desk-team-table"] [data-testid="desk-row"]';

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
    await teamTable(ctx);
    await personCard(ctx);
    await newPerson(ctx);
  } finally {
    await release();
  }
}

async function teamTable(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/team");
  const rows = page.locator(TEAM_ROWS);
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const count = await rows.count();
  const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
  record("команда: таблица людей", count > 0, `строк ${count}; колонки: ${heads.join(" | ")}`);
  record(
    "команда директора: имя, нагрузка, сейчас, вход — без трёх колонок нулей и «Доступности»",
    ["имя", "нагрузка", "сейчас", "вход"].every((h) => heads.includes(h)) && !heads.some((h) => ["в работе", "просрочено", "на приёмке", "доступность"].includes(h)),
  );
  const box = count ? await rows.first().boundingBox() : null;
  record("команда: строка ~40 px", Boolean(box && box.height <= 44), box ? `высота ${Math.round(box.height)}` : "нет строки");
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

  // the load leads to the person's tasks; on a quiet dev — the hero's «задач в работе»
  const load = page.getByTestId("team-load").first();
  if (await load.count()) {
    const href = (await load.getAttribute("href")) ?? "";
    await load.click();
    const went = await page.waitForURL((url) => url.pathname === "/desk/tasks" && url.searchParams.has("who"), { timeout: 15_000 }).then(() => true, () => false);
    record("команда: нагрузка ведёт в «Задачи» человека", went, `${href} → ${page.url()}`);
  } else {
    const fact = page.getByTestId("hero-fact-open");
    const href = (await fact.getAttribute("href").catch(() => null)) ?? "";
    record("команда: «задач в работе» ведёт в «Задачи» (открытых задач нет — нагрузка пуста)", href.startsWith("/desk/tasks"), href);
  }

  // F puts the caret in the search, which narrows the table (typed, then cleared — nothing else)
  await open(page, "/desk/team");
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
    "команда: правая кнопка — меню строки («Открыть карточку», «Изменить»…)",
    menu && items.some((t) => t.startsWith("Открыть карточку")) && items.some((t) => t.startsWith("Изменить")),
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
  await open(page, "/desk/team");
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

  // E — the facts turn into fields in place; typed, «несохранено» shows; Esc, Esc — gone, nothing saved
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
    const armed = await visible(ctx, "person-form-armed", 3_000);
    await ctx.shot("team-edit-armed");
    await page.keyboard.press("Escape");
    const gone = await page.getByTestId("desk-person-editor").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("карточка: несохранённое заметно; Esc — предупреждение, Esc ещё раз — отмена", dirty && armed && gone && !page.url().includes("edit=1"), page.url());
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
  await open(page, "/desk/team");
  await page.locator(TEAM_ROWS).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
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
  // Esc twice — back to the team, nobody created
  await page.getByTestId("person-name").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const back = await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 10_000 }).then(() => true, () => false);
  record("новый сотрудник: Esc, Esc — назад в «Команду», никто не создан", back, page.url());
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
      await page.waitForTimeout(300);
      const none = await page.locator('[data-testid="desk-errands-history"] [data-testid="desk-empty"]').isVisible();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
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
  const bar = await page.getByTestId("desk-day-bar").isVisible().catch(() => false);
  const heroText = hero ? ((await page.getByTestId("desk-day-hero").innerText()) ?? "").replace(/\s+/g, " ") : "";
  record("отчёты «День»: герой «N из M сдали» и честная полоса", hero && bar && /из \d+ сдали|сдали в выходной/.test(heroText), heroText.slice(0, 120));
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

    await open(page, "/desk/team");
    const rows = page.locator(TEAM_ROWS);
    await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
    record(
      "секретарь: команда без задач и очков",
      (await rows.count()) > 0 && !heads.includes("нагрузка") && !heads.includes("сейчас") && !heads.includes("очки") && heads.includes("вход"),
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
