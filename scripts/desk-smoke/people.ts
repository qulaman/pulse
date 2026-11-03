/**
 * Role B of tasks/022, second wave D-154: /desk/team as the dispatcher's board, the person's card,
 * /desk/reports «День» / «Период», /desk/errands of the director and the secretary's queue. Read
 * only — nothing is saved, nobody is created, no code is issued, no request is asked, taken,
 * declined or thanked: the quick requests are counted, never clicked; the forms and the reasons'
 * dialog are opened and looked at, the panel is opened and closed.
 */
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

export async function checkTeam(ctx: Ctx) {
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
    await page.waitForTimeout(800);
    await ctx.shot("team-load-tasks");
  } else {
    const fact = page.getByTestId("hero-fact-open");
    const href = (await fact.getAttribute("href").catch(() => null)) ?? "";
    record("команда: «задач в работе» ведёт в «Задачи» (открытых задач нет — нагрузка пуста)", href.startsWith("/desk/tasks"), href);
  }

  // the search narrows the table (typed, then cleared — nothing else)
  await open(page, "/desk/team");
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const search = page.getByRole("searchbox", { name: "Поиск по команде" });
  await search.fill("яяяяя");
  await page.waitForTimeout(300);
  const none = await page.getByTestId("desk-empty").isVisible();
  await search.fill("");
  record("команда: поиск сужает таблицу", none);
  if (count === 0) return skip("команда: карточка", "в таблице нет строк");

  // an employee — whose login the director manages (another director's he does not)
  const employee = await rows.filter({ hasText: /Сотрудник|Шустряк|Специалист/ }).first().getAttribute("data-row-key").catch(() => null);
  await nameCell(ctx, TEAM_ROWS, 0).click();
  const opened = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
  const id = UUID.exec(page.url())?.[1] ?? null;
  const card = opened && (await visible(ctx, "desk-person", 15_000));
  const identity = await visible(ctx, "desk-person-identity", 5_000);
  record("команда: строка открывает карточку — герой и две колонки", Boolean(card) && identity, page.url());
  await page.waitForTimeout(800);
  await ctx.shot("team-card");
  if (!id) return;

  // «Дать задачу» pins the person in the order line and puts the caret there — nothing is sent
  const give = page.getByTestId("desk-person-give");
  if (await give.count()) {
    await give.click();
    await page.waitForTimeout(400);
    const focused = await page.evaluate(() => document.activeElement?.id ?? "");
    record("карточка: «Дать задачу» — курсор в строке поручения", focused === "desk-command", `activeElement=${focused}`);
    await ctx.shot("team-give");
    await page.keyboard.press("Escape");
  } else {
    skip("карточка: «Дать задачу»", "у этой карточки кнопки нет");
  }

  // a director's card (the signed-in one's own among them): no «Дать задачу»
  await open(page, "/desk/team");
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const director = rows.filter({ hasText: /директор/i }).first();
  if (await director.count()) {
    await director.locator('[role="gridcell"]').first().click();
    await page.waitForURL(UUID, { timeout: 15_000 }).catch(() => undefined);
    await visible(ctx, "desk-person", 10_000);
    record("карточка директора: без «Дать задачу»", (await page.getByTestId("desk-person-give").count()) === 0, page.url());
  } else {
    skip("карточка директора", "директора в таблице нет");
  }

  // ?edit=1 opens the editor at once — looked at, never saved
  await open(page, `/desk/team/${id}?edit=1`);
  const editor = await visible(ctx, "desk-person-editor");
  const idle = editor && (await page.getByTestId("desk-person-save").isDisabled());
  record("карточка: ?edit=1 раскрывает редактор, «Сохранить» ждёт правки", editor && idle);
  await ctx.shot("team-edit");

  // the login block of an employee: the code panel waits for «Выдать код» — never pressed here
  if (employee) {
    await open(page, `/desk/team/${employee}`);
    const login = await visible(ctx, "desk-login");
    const issue = await page.getByTestId("code-issue").count();
    record("карточка сотрудника: блок «Вход» с кодом входа (не выдан)", login && issue === 1);
    await page.getByTestId("desk-login").scrollIntoViewIfNeeded();
    await ctx.shot("team-login");
  } else {
    skip("карточка сотрудника: блок «Вход»", "в команде нет сотрудника");
  }

  await open(page, "/desk/team/new");
  record("новый сотрудник: форма создания (не отправлена)", await visible(ctx, "desk-person-editor"));
  await ctx.shot("team-new");
}

/** The director's view of the errands; the secretary's queue — `checkSecretary`. */
export async function checkErrands(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/errands");
  const hero = await visible(ctx, "desk-errands-hero");
  const heroText = hero ? ((await page.getByTestId("desk-errands-hero").innerText()) ?? "").split("\n")[0] : "";
  // the quick requests are counted and looked at — a click would ask the secretary for real
  const quick = await page.locator('[data-testid="desk-quick-errands"] button').count();
  const stats = await page.getByTestId("desk-errands-stats").isVisible();
  record("заявки директора: герой «сейчас у секретаря», просьбы в один клик, 30 дней", hero && quick > 0 && stats, `«${heroText}»; кнопок ${quick}`);
  await ctx.shot("errands");

  // a closed request opens in the panel and goes with Esc — a click on the row, not on «Спасибо»
  const row = page.locator('[data-testid="desk-errands-history"] [data-testid="desk-row"] [role="gridcell"]').first();
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

  // the day steps back and returns — by the arrow and by ←
  const title = page.getByTestId("desk-day-title");
  const today = (await title.innerText().catch(() => "")).trim();
  await page.getByRole("button", { name: "Предыдущий день" }).click();
  await page.waitForTimeout(600);
  const yesterday = (await title.innerText().catch(() => "")).trim();
  await page.getByRole("button", { name: "К сегодня" }).click();
  await page.waitForTimeout(400);
  const back = (await title.innerText().catch(() => "")).trim();
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const byKey = (await title.innerText().catch(() => "")).trim();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  record("отчёты «День»: ‹ › и ← → листают дни", yesterday !== today && back === today && byKey === yesterday, `${today} → ${yesterday} → ${back}; ← ${byKey}`);

  await page.getByTestId("seg-period").click();
  const period = await page.waitForURL((url) => url.searchParams.get("tab") === "period", { timeout: 5_000 }).then(() => true, () => false);
  const periodHero = await visible(ctx, "desk-period-hero", 15_000);
  const strip = await page.getByTestId("desk-period-strip").isVisible().catch(() => false);
  const periodRows = await page.locator('[data-testid="desk-reports-period"] [data-testid="desk-row"]').count();
  record("отчёты «Период»: ?tab=period, герой с долей сдачи, столбики по дням, люди таблицей", period && periodHero && strip, `строк ${periodRows}; ${page.url()}`);
  // the strip's columns stay thin — never a wall of blocks
  const widest = await page.locator('[data-testid="desk-period-strip"] [role="img"]').evaluateAll((cols) => Math.max(0, ...cols.map((c) => (c as HTMLElement).getBoundingClientRect().width)));
  record("отчёты «Период»: столбики тонкие", widest > 0 && widest <= 24, `шире всех ${Math.round(widest)} px`);
  await ctx.shot("reports-period");
  const week = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  await page.getByTestId("seg-month").click();
  await page.waitForTimeout(1500);
  const month = (await page.getByTestId("desk-period-dates").innerText().catch(() => "")).trim();
  record("отчёты «Период»: «Месяц» меняет даты", week !== month && month.length > 0, `${week} → ${month}`);
  await ctx.shot("reports-month");
}

/** On the secretary's desk (her page is signed in already). */
export async function checkSecretary(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/errands");
  const queue = await visible(ctx, "desk-errand-queue");
  const presence = await page.getByTestId("desk-presence").isVisible();
  const hero = await page.getByTestId("desk-errands-hero").isVisible().catch(() => false);
  const cards = await page.getByTestId("desk-errand-card").count();
  record("секретарь: герой, очередь заявок и «На месте»", queue && presence && hero, `карточек ${cards}`);
  if (cards > 0) {
    // the first is chosen, ↓ moves the choice; «N» opens the reasons and Esc closes them — none is picked
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
      const dialog = await page.getByRole("dialog").waitFor({ timeout: 3_000 }).then(() => true, () => false);
      await ctx.shot("errands-decline");
      await page.keyboard.press("Escape");
      const gone = await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
      record("секретарь: N — причины «Не могу», Esc — закрыть (ничего не выбрано)", dialog && gone);
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

  // a card she may edit: the first person who is not a director
  const editable = rows.filter({ hasNotText: /директор/i }).first();
  if ((await editable.count()) === 0) return skip("секретарь: карточка", "некого открыть");
  await editable.locator('[role="gridcell"]').first().click();
  const opened = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
  await visible(ctx, "desk-person", 10_000);
  const tasks = await page.getByTestId("desk-person-tasks").count();
  const give = await page.getByTestId("desk-person-give").count();
  record("секретарь: карточка без задач и «Дать задачу»", opened && tasks === 0 && give === 0, page.url());
  await page.waitForTimeout(600);
  await ctx.shot("team-card");

  await page.goto(page.url().replace(/\/desk\/.*$/, "/desk/reports"), { waitUntil: "load" });
  const home = await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 10_000 }).then(() => true, () => false);
  record("секретарь: /desk/reports уводит на /desk/errands", home, page.url());
}
