/**
 * Role B of tasks/022: /desk/team, /desk/errands, /desk/reports and the secretary's desk. Read
 * only — nothing is saved, nobody is created, no code is issued, no request is taken or thanked:
 * the forms are opened and looked at, the panel is opened and closed.
 */
import { open, record, skip, type Ctx } from "./shared";

const UUID = /\/desk\/team\/([0-9a-f-]{36})/;

/** The column titles of the desk table under `scope`, lower-cased (CSS upper-cases them) and without the sort marks. */
async function headsOf(ctx: Ctx, scope: string): Promise<string[]> {
  const heads = await ctx.page.locator(`${scope} [role="columnheader"]`).allInnerTexts();
  return heads.map((head) => head.replace(/[▲▼]/g, "").trim().toLowerCase());
}

export async function checkTeam(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/team");
  const rows = page.locator('[data-testid="desk-team-table"] [data-testid="desk-row"]');
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const count = await rows.count();
  const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
  record("команда: таблица людей", count > 0, `строк ${count}; колонки: ${heads.join(" | ")}`);
  record("команда директора: загрузка и вход в колонках", ["в работе", "просрочено", "на приёмке", "ближайший срок", "вход"].every((h) => heads.includes(h)));
  await ctx.shot("team");
  // an employee — whose login the director manages (another director's he does not)
  const employee = await rows.filter({ hasText: "Сотрудник" }).first().getAttribute("data-row-key").catch(() => null);

  // the search narrows the table (typed, then cleared — nothing else)
  const search = page.getByRole("searchbox", { name: "Поиск по команде" });
  await search.fill("яяяяя");
  await page.waitForTimeout(300);
  const none = await page.getByTestId("desk-empty").isVisible();
  await search.fill("");
  record("команда: поиск сужает таблицу", none);
  if (count === 0) return skip("команда: карточка", "в таблице нет строк");

  await rows.first().click();
  const opened = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
  const id = UUID.exec(page.url())?.[1] ?? null;
  const card = opened && (await page.getByTestId("desk-person").waitFor({ timeout: 15_000 }).then(() => true, () => false));
  record("команда: строка открывает карточку в две колонки", Boolean(card), page.url());
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

  // ?edit=1 opens the editor at once — looked at, never saved
  await open(page, `/desk/team/${id}?edit=1`);
  const editor = await page.getByTestId("desk-person-editor").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const save = page.getByTestId("desk-person-save");
  const idle = editor && (await save.isDisabled());
  record("карточка: ?edit=1 раскрывает редактор, «Сохранить» ждёт правки", editor && idle);
  await ctx.shot("team-edit");

  // the login block of an employee: the code panel waits for «Выдать код» — never pressed here
  if (employee) {
    await open(page, `/desk/team/${employee}`);
    const login = await page.getByTestId("desk-login").waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const issue = await page.getByTestId("code-issue").count();
    record("карточка сотрудника: блок «Вход» с кодом входа (не выдан)", login && issue === 1);
    await page.getByTestId("desk-login").scrollIntoViewIfNeeded();
    await ctx.shot("team-login");
  } else {
    skip("карточка сотрудника: блок «Вход»", "в команде нет сотрудника");
  }

  await open(page, "/desk/team/new");
  const form = await page.getByTestId("desk-person-editor").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  record("новый сотрудник: форма создания (не отправлена)", form);
  await ctx.shot("team-new");
}

/** The director's view of the errands; the secretary's queue — `checkSecretary`. */
export async function checkErrands(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/errands");
  const now = await page.getByTestId("desk-errands-now").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const stats = await page.getByTestId("desk-errands-stats").isVisible();
  record("заявки директора: «Сейчас» и статистика за 30 дней", now && stats);
  await ctx.shot("errands");

  // a closed request opens in the panel and goes with Esc — a click on the row, not on «Спасибо»
  const row = page.locator('[data-testid="desk-errands-history"] [data-testid="desk-row"] [role="gridcell"]').first();
  if ((await row.count()) === 0) return skip("заявки: панель", "закрытых заявок нет");
  await row.click();
  const panel = await page.getByTestId("desk-errand-details").waitFor({ timeout: 8_000 }).then(() => true, () => false);
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
  const day = page.getByTestId("reports-tab-day");
  const period = page.getByTestId("reports-tab-period");
  const tabs = (await day.isVisible()) && (await period.isVisible());
  const box = await page.getByTestId("desk-reports").boundingBox();
  record("отчёты: вкладки «День» и «Период»", tabs, box ? `ширина ${Math.round(box.width)}` : "нет контейнера");
  record("отчёты: телефонная шапка спрятана", !(await page.locator('[data-testid="desk-reports"] .page-head').isVisible().catch(() => false)));
  await ctx.shot("reports-day");
  if (!tabs) return;
  await period.click();
  await page.waitForTimeout(1500);
  record("отчёты: «Период» — в адресе ?tab=period", page.url().includes("tab=period"), page.url());
  await ctx.shot("reports-period");
}

/** On the secretary's desk (her page is signed in already). */
export async function checkSecretary(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/errands");
  const queue = await page.getByTestId("desk-errand-queue").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const presence = await page.getByTestId("desk-presence").isVisible();
  const cards = await page.getByTestId("desk-errand-card").count();
  record("секретарь: очередь заявок и «На месте»", queue && presence, `карточек ${cards}`);
  await ctx.shot("errands");

  await open(page, "/desk/team");
  const rows = page.locator('[data-testid="desk-team-table"] [data-testid="desk-row"]');
  await rows.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const heads = await headsOf(ctx, '[data-testid="desk-team-table"]');
  record("секретарь: команда без задач и очков", (await rows.count()) > 0 && !heads.includes("в работе") && !heads.includes("очки"), heads.join(" | "));
  await ctx.shot("team");

  // a card she may edit: the first person who is not a director
  const editable = rows.filter({ hasNotText: "Директор" }).first();
  if ((await editable.count()) === 0) return skip("секретарь: карточка", "некого открыть");
  await editable.click();
  const opened = await page.waitForURL(UUID, { timeout: 15_000 }).then(() => true, () => false);
  await page.getByTestId("desk-person").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const tasks = await page.getByTestId("desk-person-tasks").count();
  const give = await page.getByTestId("desk-person-give").count();
  record("секретарь: карточка без задач и «Дать задачу»", opened && tasks === 0 && give === 0, page.url());
  await page.waitForTimeout(600);
  await ctx.shot("team-card");

  await page.goto(page.url().replace(/\/desk\/.*$/, "/desk/reports"), { waitUntil: "load" });
  const home = await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 10_000 }).then(() => true, () => false);
  record("секретарь: /desk/reports уводит на /desk/errands", home, page.url());
}
