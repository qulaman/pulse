/**
 * Role A of tasks/022 and the second wave of D-154: /desk/today, /desk/tasks and /desk/inbox. Read
 * only — nothing is accepted, sent, reminded or taken back, no visitor is answered, no request goes
 * to the secretary. Opening a task (the panel, «Разобрать») moves the director's read cursor, as
 * the phone's task screen does, and the smoke director may be the owner's own account: only a row
 * with no unread message is opened, and «Разобрать» is left alone while the table shows unread ones.
 */
import type { Page } from "playwright";

import { APP_URL, open, record, skip, type Ctx } from "./shared";

/** «Сегодня» (D-154): the hero and every block, or the block's empty state — looked at, nothing pressed. */
async function checkToday(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/today");
  const hero = page.getByTestId("desk-moment");
  const came = await hero.waitFor({ timeout: 20_000 }).then(() => true, () => false);
  const label = came ? ((await page.getByTestId("desk-moment-label").textContent()) ?? "").trim() : "";
  record("сегодня: герой «Момент» — число и фраза", came && label.length > 0, label);
  record("сегодня: один герой, ни одной плитки", (await hero.count()) === 1 && (await page.getByTestId("stat-tile").count()) === 0);
  const light = await page.locator(".desk-light").first().getAttribute("data-tone").catch(() => null);
  const tone = came ? await hero.getAttribute("data-tone") : null;
  record("сегодня: свет экрана — тон момента", Boolean(light && light === tone), `свет ${light}, момент ${tone}`);
  // the team and the decisions land with their own queries: a block or its empty state
  await page
    .getByTestId("today-person")
    .first()
    .or(page.getByTestId("today-team").getByTestId("desk-empty"))
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  for (const [id, name] of [
    ["today-decisions", "«Ждут вашего решения»"],
    ["today-team", "«Команда сейчас»"],
    ["today-agenda", "«Встречи и сроки»"],
    ["today-reception", "«Приёмная»"],
    ["today-feed", "«Лента»"],
  ] as const) {
    const block = page.getByTestId(id);
    const inside = await block.locator('[role="button"], li, [data-testid="desk-empty"], p').count();
    record(`сегодня: блок ${name}`, (await block.count()) === 1 && inside > 0, `элементов ${inside}`);
  }
  const decisions = await page.getByTestId("today-decision").count();
  const entry = await page.getByTestId("desk-inbox-entry").count();
  record("сегодня: «Разобрать по одной» — только когда есть что разбирать", decisions > 0 ? entry === 1 : true, `решений ${decisions}, кнопка ${entry}`);
  const people = await page.getByTestId("today-person").count();
  if (people > 0) record("сегодня: «Команда сейчас» — люди", true, `людей ${people}`);
  else skip("сегодня: «Команда сейчас» — люди", "в команде никого");
  await ctx.shot("today");
  await fullShot(page, ctx, "today-full");
}

/** The whole screen with the main column unrolled — for the eyes, not for a check. */
async function fullShot(page: Page, ctx: Ctx, name: string) {
  await page.evaluate(() => {
    const main = document.getElementById("desk-main");
    const desk = document.querySelector<HTMLElement>("[data-desk]");
    if (main) main.style.overflow = "visible";
    if (desk) desk.style.height = "auto";
  });
  await ctx.shot(name);
  await page.evaluate(() => {
    const main = document.getElementById("desk-main");
    const desk = document.querySelector<HTMLElement>("[data-desk]");
    if (main) main.style.overflow = "";
    if (desk) desk.style.height = "";
  });
}

export async function checkTasks(ctx: Ctx) {
  const { page } = ctx;
  await checkToday(ctx);
  await open(page, "/desk/tasks");
  const rows = page.getByTestId("desk-row");
  const empty = page.getByTestId("desk-empty");
  await rows.first().or(empty.first()).waitFor({ timeout: 20_000 }).catch(() => undefined);
  const count = await rows.count();
  const groups = await page.locator('[role="grid"] [role="rowgroup"] > [role="row"]:not([data-testid="desk-row"])').count();
  record("задачи: таблица с группами или пустое состояние", (count > 0 && groups > 0) || (await empty.count()) > 0, `строк ${count}, групп ${groups}`);
  const tiles = await page.getByTestId("stat-tile").count();
  const hero = await page.getByTestId("desk-moment").count();
  const bar = await page.getByTestId("desk-moment-bar").count();
  record("задачи: «Момент» вместо плиток — герой и полоса стадий", hero === 1 && bar === 1 && tiles === 0, `героев ${hero}, плиток ${tiles}`);
  const counters = await page.getByTestId("desk-moment-counters").locator("button").count();
  record("задачи: вторичные счётчики героя — фильтры", counters === 4, `счётчиков ${counters}`);
  await ctx.shot("tasks");

  // a counter is a filter: «Просрочено» writes ?due=overdue, again — takes it off; the tab comes back
  const firstTab = await page.locator('[role="tab"][aria-selected="true"]').first().getAttribute("data-testid");
  await page.getByTestId("moment-overdue").click();
  await page.waitForTimeout(400);
  const dueOn = new URL(page.url()).searchParams.get("due");
  await page.getByTestId("moment-overdue").click();
  await page.waitForTimeout(400);
  record("задачи: счётчик героя ставит и снимает фильтр", dueOn === "overdue" && !new URL(page.url()).searchParams.get("due"), `?due=${dueOn}`);
  if (firstTab) await page.getByTestId(firstTab).click();
  await page.waitForTimeout(400);

  // the grouping is the address's: «По человеку» (the column «Кто» leaves), then the tab's own again
  const groupSelect = page.getByTestId("desk-group");
  await groupSelect.selectOption("person");
  await page.waitForTimeout(500);
  const grouped = new URL(page.url()).searchParams.get("group");
  const whoColumn = await page.locator('[role="columnheader"]', { hasText: "Кто" }).count();
  record("задачи: группировка «по человеку» пишется в адрес", grouped === "person" && whoColumn === 0, `?group=${grouped}`);
  await ctx.shot("tasks-by-person");
  await groupSelect.selectOption({ index: 0 });
  await page.waitForTimeout(400);
  record("задачи: своя группировка вкладки — без ?group", !new URL(page.url()).searchParams.get("group"), page.url().replace(APP_URL, ""));

  // a group folds and unfolds by its head: its rows leave the eye, not the table
  const toggle = page.getByTestId("desk-group-toggle").first();
  if (await toggle.count()) {
    const before = await rows.filter({ visible: true }).count();
    await toggle.click();
    await page.waitForTimeout(300);
    const folded = await rows.filter({ visible: true }).count();
    const shut = await toggle.getAttribute("aria-expanded");
    await toggle.click();
    await page.waitForTimeout(300);
    const after = await rows.filter({ visible: true }).count();
    record("задачи: группа сворачивается и разворачивается", shut === "false" && folded < before && after === before, `${before} → ${folded} → ${after}`);
  } else {
    skip("задачи: группа сворачивается", "групп нет");
  }

  // a row the director has read: opening it changes nothing for them
  const unreadMark = page.locator('[aria-label="новое сообщение"]');
  const unread = await unreadMark.count();
  const safe = rows.filter({ hasNot: unreadMark });
  const safeCount = await safe.count();

  if (count > 0) {
    // ↓ moves the selection while the table holds the keys
    await page.locator('[role="grid"]').focus();
    await page.keyboard.press("ArrowDown");
    const chosen = await page.locator('[data-testid="desk-row"][aria-selected="true"]').count();
    record("задачи: ↓ выбирает строку", chosen === 1, `выбрано ${chosen}`);
    const hint = ((await page.getByTestId("desk-keys-hint").textContent()) ?? "").replace(/\s+/g, " ");
    record("задачи: подсказка — клавиши выбранной строки", hint.includes("выбор") && hint.includes("открыть"), hint.slice(0, 90));
    // the chosen row shows its moves at its right end (a closed row has none); nothing is pressed
    const keyed = await page.locator('[data-testid="desk-row"][aria-selected="true"]').getAttribute("data-row-key");
    const moves = await page.locator(`[data-testid="desk-row"][data-row-key="${keyed}"] [data-testid="desk-moves"]`).filter({ visible: true }).count();
    if (moves > 0) record("задачи: у выбранной строки — её ходы", true);
    else skip("задачи: у выбранной строки — её ходы", "у строки нет ходов (закрыта)");
  }

  if (safeCount > 0) {
    // a read row → the panel with the task; Esc closes it and drops ?id
    await safe.first().click();
    const panel = page.getByTestId("desk-task-panel");
    const opened = await panel.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    const id = new URL(page.url()).searchParams.get("id");
    record("задачи: строка открывает панель", opened && Boolean(id), `?id=${id}`);
    await page.waitForTimeout(1200);
    await ctx.shot("tasks-panel");
    await page.keyboard.press("Escape");
    const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("задачи: Esc закрывает панель", closed && !new URL(page.url()).searchParams.get("id"), page.url().replace(APP_URL, ""));

    // O — the same row (still chosen) in the panel with the caret in its reply field (nothing is typed); Esc lets
    // go of the field, Esc again closes the panel
    await page.locator('[role="grid"]').focus();
    await page.keyboard.press("KeyO");
    await page.getByTestId("desk-task-panel").waitFor({ timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const inReply = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="desk-task-panel"] [data-testid="composer"]')));
    const replyOpen = await page.getByTestId("thread-closed").count();
    record("задачи: O — панель и курсор в поле ответа", inReply || replyOpen > 0, inReply ? "" : "переписка закрыта");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const shut = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("задачи: Esc, Esc — поле отпущено, панель закрыта", shut);

    // a row's «⋯» — the phone's «Действия», a centred dialog here; looked at and closed, nothing pressed
    await rows.first().getByTestId("desk-row-more").click();
    const sheet = page.locator("[data-sheet]");
    const asked = await sheet.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const moves = asked ? await sheet.locator('[data-testid^="more-"]').count() : 0;
    record("задачи: «⋯» строки — диалог действий", asked && moves > 0, `действий ${moves}`);
    await page.waitForTimeout(300);
    await ctx.shot("tasks-row-more");
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);

    // a search narrows the table; cleared, the rows come back
    const search = page.getByRole("searchbox", { name: "Поиск по задачам" });
    await search.fill(`нет-такой-задачи-${ctx.stamp}`);
    await page.waitForTimeout(500);
    const found = await rows.count();
    const q = new URL(page.url()).searchParams.get("q");
    record("задачи: поиск фильтрует таблицу", found === 0 && (await empty.count()) > 0 && Boolean(q), `строк ${found}, ?q=${q}`);
    await search.fill("");
    await page.waitForTimeout(500);
    record("задачи: пустой поиск возвращает строки", (await rows.count()) === count, `строк ${await rows.count()}`);
  } else if (count > 0) {
    skip("задачи: строка открывает панель", "во всех строках непрочитанное — не открываю, чтобы не снять отметку");
  } else {
    skip("задачи: строка открывает панель", "задач нет");
    skip("задачи: поиск фильтрует таблицу", "задач нет");
  }

  // the tabs are the address's
  await page.getByTestId("seg-closed").click();
  await page.waitForTimeout(600);
  record("задачи: вкладка «Закрытые» пишется в адрес", new URL(page.url()).searchParams.get("tab") === "closed", page.url().replace(APP_URL, ""));
  await ctx.shot("tasks-closed");

  if (unread > 0) {
    // «Разобрать» shows a whole task with its thread — it would mark the director's unread as read
    skip("разобрать: открывается", `в таблице непрочитанное (${unread}) — не открываю`);
    return;
  }
  await open(page, "/desk/inbox");
  const card = page.getByTestId("desk-inbox-card");
  const done = page.getByTestId("desk-empty");
  await card.or(done).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const stack = await card.count();
  const progress = stack > 0 ? await page.getByTestId("desk-inbox-progress").innerText() : "";
  record("разобрать: открывается — карточка или «Всё разобрано»", stack > 0 || (await done.count()) > 0, stack > 0 ? progress.replace(/\s+/g, " ").slice(0, 40) : "очередь пуста");
  if (stack > 0) {
    const reason = ((await page.getByTestId("desk-inbox-reason").textContent()) ?? "").trim();
    record("разобрать: причина — заголовком в тоне", reason.length > 0, reason);
    record("разобрать: очередь сбоку", (await page.getByTestId("desk-inbox-queue").count()) === 1);
  }
  await page.waitForTimeout(1200);
  await ctx.shot("inbox");

  // → and S walk the stack without touching a task
  const total = Number(/из (\d+)/.exec(progress)?.[1] ?? 0);
  if (total > 1) {
    const first = await card.getAttribute("data-task-id");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const second = await card.getAttribute("data-task-id");
    const position = (await page.getByTestId("desk-inbox-progress").innerText()).replace(/\s+/g, " ");
    record("разобрать: → — следующая задача", second !== first && position.startsWith("2 из"), position.slice(0, 12));
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    await page.keyboard.press("KeyS");
    await page.waitForTimeout(400);
    const after = await card.getAttribute("data-task-id");
    record("разобрать: S — пропустить в конец очереди", after !== first, "");
  } else {
    skip("разобрать: → и S", "в очереди меньше двух задач");
  }
}
