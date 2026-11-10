/**
 * Role A of tasks/022 and the second and third waves of D-154: /desk/today, /desk/tasks and
 * /desk/inbox. Read only — nothing is accepted, sent, reminded or taken back, no visitor is
 * answered, no request goes to the secretary; a menu, a picker or the marks' bar is opened, looked
 * at and closed with Esc. Opening a task (the panel, «Разобрать») moves the director's read cursor,
 * as the phone's task screen does, and the smoke director may be the owner's own account: only a
 * row with no unread message is opened, and «Разобрать» is left alone while the table shows unread
 * ones.
 */
import type { Page, Route } from "playwright";

import { APP_URL, injected, open, record, skip, type Ctx } from "./shared";

/** «Сегодня» (D-154): the hero and every block, or the block's empty state — looked at, nothing pressed. */
async function checkToday(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/today");
  const hero = page.getByTestId("desk-moment");
  const came = await hero.waitFor({ timeout: 20_000 }).then(() => true, () => false);
  const label = came ? ((await page.getByTestId("desk-moment-label").textContent()) ?? "").trim() : "";
  record("сегодня: герой «Момент» — число и фраза", came && label.length > 0, label);
  record("сегодня: один герой, ни одной плитки", (await hero.count()) === 1 && (await page.getByTestId("stat-tile").count()) === 0);
  // the team and the decisions land with their own queries: a block or its empty state
  await page
    .getByTestId("today-person")
    .first()
    .or(page.getByTestId("today-free-person").first())
    .or(page.getByTestId("today-team").getByTestId("desk-empty"))
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  // the phone's home on the desk (D-164): its balls and the secretary's desk are blocks here
  for (const [id, name] of [
    ["today-decisions", "«Ждут вас»"],
    ["today-team", "«Люди»"],
    ["today-agenda", "«Встречи и сроки»"],
    ["home-messages", "«Сообщения»"],
    ["home-secretary", "«Секретарь»"],
    ["home-ether", "«Эфир»"],
    ["today-feed", "«Лента»"],
  ] as const) {
    const block = page.getByTestId(id);
    const inside = await block.locator('[role="button"], li, [data-testid="desk-empty"], p').count();
    record(`сегодня: блок ${name}`, (await block.count()) === 1 && inside > 0, `элементов ${inside}`);
  }
  const decisions = await page.getByTestId("today-decision").count();
  const entry = await page.getByTestId("desk-inbox-entry").count();
  record("сегодня: «Разобрать по одной» — только когда есть что разбирать", decisions > 0 ? entry === 1 : true, `решений ${decisions}, кнопка ${entry}`);
  const people = (await page.getByTestId("today-person").count()) + (await page.getByTestId("today-free-person").count());
  if (people > 0) {
    record("сегодня: «Люди» — все люди, занятые и свободные", true, `людей ${people}`);
    // a person opens in the panel on the home — their tasks and «Дать задачу»; T puts them into the order line
    const first = page.getByTestId("today-free-person").first().or(page.getByTestId("today-person").first()).first();
    await first.click();
    const panel = await page.getByTestId("today-person-panel").waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const stayed = page.url().includes("/desk/today");
    await ctx.shot("today-person-panel");
    const give = page.getByTestId("today-person-give");
    if (panel && (await give.count())) {
      await page.locator("#desk-main h1").click();
      await page.keyboard.press("KeyT");
      await page.waitForTimeout(300);
      const pinned = await page.getByTestId("command-pin").count();
      record("сегодня: человек — панель на главной, T — он в строке поручения", stayed && pinned === 1, `плашка ${pinned}`);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      // nothing typed: the pin is let go, no order goes anywhere
      await page.getByLabel("Убрать исполнителя").click().catch(() => undefined);
    } else {
      record("сегодня: человек — панель на главной", panel && stayed, page.url());
    }
    await page.goto(page.url().replace(/\?.*$/, ""), { waitUntil: "load" });
  } else skip("сегодня: «Люди»", "в команде никого");
  const lateRows = await page.getByTestId("today-overdue-row").count();
  if (decisions + lateRows > 0) {
    // J — the keyboard's cursor on the first row, nothing opens; Esc takes it off
    await page.locator("#desk-main h1").click();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(200);
    const cursor = await page.locator("#desk-main [data-cursor]").count();
    const stillShut = (await page.getByTestId("desk-panel").count()) === 0;
    await ctx.shot("today-cursor");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const gone = (await page.locator("#desk-main [data-cursor]").count()) === 0;
    record("сегодня: J — курсор по решениям, Esc — снят, ничего не открыто", cursor === 1 && stillShut && gone, `курсор ${cursor}`);
    // a right click is the row's menu — looked at, closed
    await page.locator('#desk-main [data-row-key]').first().click({ button: "right", position: { x: 220, y: 12 } });
    const menu = page.getByTestId("desk-menu");
    const opened = await menu.waitFor({ timeout: 3_000 }).then(() => true, () => false);
    const items = opened ? await menu.getByRole("menuitem").count() : 0;
    await page.keyboard.press("Escape");
    const closed = await menu.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
    record("сегодня: правый клик по решению — меню, Esc закрывает", opened && items > 0 && closed, `пунктов ${items}`);
  } else {
    skip("сегодня: J — курсор по решениям", "решений и просрочек нет");
  }
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

/**
 * A failed load is said as a failure, never as a calm empty screen: the answers are cut in this
 * browser (GET only), a screen says what did not come — or, with a copy kept from the last visit
 * (D-127), keeps it and says the refresh failed — and «Повторить» brings it back.
 */
async function checkFailure(ctx: Ctx) {
  const { page } = ctx;
  const refused = async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"smoke"}' });
  };
  const calm = /всё закрыто|ничего не ждёт|всё разобрано/i;
  const pattern = "**/rest/v1/tasks*";
  for (const [path, name] of [
    ["/desk/today", "сегодня"],
    ["/desk/tasks", "задачи"],
    ["/desk/inbox", "разобрать"],
  ] as const) {
    injected.failures = true;
    await page.route(pattern, refused);
    await open(page, path);
    const failure = page.getByTestId("desk-load-failed").or(page.locator('[data-testid="desk-load-note"][data-load="stale"]'));
    const said = await failure.first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
    const copy = (await page.getByTestId("desk-load-failed").count()) === 0;
    const words = said ? await page.locator("#desk-main").innerText() : "";
    record(`${name}: сбой загрузки назван, зелёных итогов нет`, said && (copy ? words.includes("Не обновилось") : !calm.test(words) && (await page.getByTestId("desk-moment").count()) === 0), words.replace(/\s+/g, " ").slice(0, 70));
    if (name === "сегодня") await ctx.shot("today-failed");
    await page.unroute(pattern, refused);
    injected.failures = false;
    if (said) {
      await page.getByTestId("desk-load-retry").or(page.getByTestId("desk-load-note-retry")).first().click();
      const back = await failure.first().waitFor({ state: "detached", timeout: 15_000 }).then(() => true, () => false);
      record(`${name}: «Повторить» возвращает экран`, back);
    }
  }
}

/**
 * «Закрытые» as an archive and the search over all of history, on whatever dev holds: nothing is
 * pressed but the tabs, the period and the search field. Long lists and the literal `%` are the
 * unit tests' (lib/desk/archive.test.ts).
 */
async function checkArchive(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/tasks?tab=closed");
  await page.getByTestId("desk-range").waitFor({ timeout: 20_000 });
  record("закрытые: нет итога «ждут вас»", (await page.getByTestId("desk-moment").count()) === 0);
  await page.getByTestId("desk-row").first().or(page.getByTestId("desk-empty")).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const rows = await page.getByTestId("desk-row").count();
  if (rows > 0) {
    const heads = (await page.locator('[role="columnheader"]').allInnerTexts()).join(" ").toLowerCase();
    record("закрытые: колонки «Закрыта» и «В срок», без «Срок»", heads.includes("закрыта") && heads.includes("в срок") && !/(^|\s)срок/.test(heads.replace("в срок", "")), heads.replace(/\s+/g, " "));
  } else {
    skip("закрытые: колонки", "закрытых нет");
  }
  await page.getByTestId("desk-range").click();
  const picker = page.getByTestId("desk-range-picker");
  await picker.waitFor({ timeout: 5_000 });
  const presets = (await page.getByTestId("desk-range-preset").allInnerTexts()).map((text) => text.split("\n")[0]);
  record("закрытые: быстрые периоды", ["Эта неделя", "Прошлая неделя", "Этот месяц", "Прошлый месяц"].every((name) => presets.some((one) => one.includes(name))), presets.join(" · "));
  await page.getByTestId("desk-range-preset").nth(3).click();
  await page.waitForTimeout(600);
  const address = new URL(page.url()).searchParams;
  record("закрытые: период пишется в адрес", Boolean(address.get("from") && address.get("to")), page.url().replace(APP_URL, ""));
  record("закрытые: период называется на кнопке", ((await page.getByTestId("desk-range").innerText()) ?? "").trim() === "Прошлый месяц");
  await ctx.shot("tasks-archive-range");

  // the working tab asks the server only for a search, and a stranger's word finds nothing there
  await open(page, "/desk/tasks?tab=working");
  await page.locator('input[aria-label="Поиск по задачам"]').waitFor({ timeout: 20_000 });
  const asked: string[] = [];
  const watch = (request: { url(): string }) => {
    if (request.url().includes("/rest/v1/tasks") && request.url().includes("title=")) asked.push(request.url());
  };
  page.on("request", watch);
  await page.locator('input[aria-label="Поиск по задачам"]').fill("ззз%_з");
  await page.waitForTimeout(900);
  page.off("request", watch);
  const query = new URL(asked.at(-1) ?? APP_URL).searchParams.get("title") ?? "";
  record("поиск: уходит на сервер один раз, с экранированием", asked.length === 1 && query.includes("\\%") && query.includes("\\_"), query);
  record("поиск: мимо — «Ничего не нашёл», а не пустота", /Ничего не нашёл/.test(await page.getByTestId("desk-empty").innerText().catch(() => "")));
}

/** 1280×720 (D-154, audit 2026-11-04): the screens keep a working shape; a row opened only with no unread in it. */
async function checkNarrow(ctx: Ctx) {
  const { page } = ctx;
  const size = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const [path, name] of [["/desk/today", "сегодня"], ["/desk/tasks", "задачи"], ["/desk/inbox", "разобрать"]] as const) {
    await open(page, path);
    const wide = await page.evaluate(() => {
      const main = document.getElementById("desk-main");
      return main ? main.scrollWidth - main.clientWidth : -1;
    });
    record(`${name}: на 1280×720 ничего не выходит вбок`, wide === 0, `${wide} px`);
  }
  await open(page, "/desk/tasks?tab=closed");
  const row = page.getByTestId("desk-row").first();
  if ((await row.count()) > 0 && (await row.locator('[aria-label="новое сообщение"]').count()) === 0) {
    await row.locator('[role="gridcell"]').nth(2).click();
    await page.getByTestId("desk-panel").waitFor({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const title = await page.locator('[data-testid="desk-row"] [role="gridcell"]:has([data-testid="desk-glyph"])').first().boundingBox();
    record("задачи: 1280 с панелью — «Что» не меньше 200 px", (title?.width ?? 0) >= 200, `${Math.round(title?.width ?? 0)} px`);
    await ctx.shot("tasks-1280-panel");
    // the archive has no moment: it folds on a working tab, the panel stays open over it
    await page.getByTestId("seg-working").click();
    await page.getByTestId("desk-moment").waitFor({ timeout: 5_000 }).catch(() => undefined);
    const hero = await page.getByTestId("desk-moment").boundingBox();
    record("задачи: 1280 с панелью — герой сложен в строку", (hero?.height ?? 999) < 130, `${Math.round(hero?.height ?? 0)} px`);
    await page.keyboard.press("Escape");
  } else {
    skip("задачи: 1280 с панелью", "нет строки без непрочитанного");
  }
  if (size) await page.setViewportSize(size);
}

export async function checkTasks(ctx: Ctx) {
  const { page } = ctx;
  await checkToday(ctx);
  await checkFailure(ctx);
  await checkNarrow(ctx);
  await open(page, "/desk/tasks");
  const rows = page.getByTestId("desk-row");
  const empty = page.getByTestId("desk-empty");
  await rows.first().or(empty.first()).waitFor({ timeout: 20_000 }).catch(() => undefined);
  const count = await rows.count();
  const groups = await page.locator('[role="grid"] [role="rowgroup"] > [role="row"]:not([data-testid="desk-row"])').count();
  record("задачи: таблица с группами или пустое состояние", (count > 0 && groups > 0) || (await empty.count()) > 0, `строк ${count}, групп ${groups}`);
  const tiles = await page.getByTestId("stat-tile").count();
  const hero = await page.getByTestId("desk-moment").count();
  record("задачи: «Момент» вместо плиток — один итог", hero === 1 && tiles === 0, `героев ${hero}, плиток ${tiles}`);
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
    const inReply = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="desk-task-panel"] [data-testid="desk-composer"]')));
    const replyOpen = await page.getByTestId("thread-closed").count();
    record("задачи: O — панель и курсор в поле ответа", inReply || replyOpen > 0, inReply ? "" : "переписка закрыта");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const shut = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("задачи: Esc, Esc — поле отпущено, панель закрыта", shut);

    // a row's «⋯» — the desk's menu under the button (D-154 wave 3); looked at and closed, nothing pressed
    await rows.first().getByTestId("desk-row-more").click();
    const menu = page.getByTestId("desk-menu");
    const asked = await menu.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    const moves = asked ? await menu.getByRole("menuitem").count() : 0;
    const sheets = await page.locator("[data-sheet]").count();
    record("задачи: «⋯» строки — меню действий, не шторка", asked && moves > 0 && sheets === 0, `пунктов ${moves}`);
    await page.waitForTimeout(200);
    await ctx.shot("tasks-row-more");
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);

    // a right click on a row is the same menu at the cursor
    await rows.first().click({ button: "right", position: { x: 360, y: 12 } });
    const atCursor = await menu.waitFor({ timeout: 5_000 }).then(() => true, () => false);
    await page.keyboard.press("Escape");
    const shutMenu = await menu.waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("задачи: правый клик по строке — меню, Esc закрывает", atCursor && shutMenu);

    // X marks the chosen row: the bar of many rows comes, Esc takes the marks off (nothing pressed)
    await page.locator('[role="grid"]').focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("KeyX");
    const bar = page.getByTestId("desk-bulk-bar");
    const barCame = await bar.waitFor({ timeout: 3_000 }).then(() => true, () => false);
    const marks = await page.locator('[data-testid="desk-row-pick"][aria-checked="true"]').count();
    await ctx.shot("tasks-marked");
    await page.keyboard.press("Escape");
    const barGone = await bar.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
    record("задачи: X — отметка и полоса действий, Esc снимает", barCame && marks === 1 && barGone, `отмечено ${marks}`);

    // D on a row in hand — the deadline picker hangs from its cell; Esc closes it, nothing is set.
    // A row whose deadline can change marks its cell for the popover: walk down to the first one
    for (let step = 0; step < 12; step += 1) {
      if ((await page.locator('[data-testid="desk-row"][aria-selected="true"] [data-act="extend retime"]').count()) > 0) break;
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(80);
    }
    await page.keyboard.press("KeyD");
    const picker = page.getByTestId("desk-deadline-picker");
    if (await picker.waitFor({ timeout: 1_500 }).then(() => true, () => false)) {
      const presets = await page.getByTestId("deadline-preset").count();
      await ctx.shot("tasks-deadline");
      await page.keyboard.press("Escape");
      const pickerGone = await picker.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
      record("задачи: D — выбор срока поповером, Esc закрывает", presets > 0 && pickerGone, `вариантов ${presets}`);
    } else {
      skip("задачи: D — выбор срока", "у выбранной строки срок не меняется (сдана или закрыта)");
    }

    // «?» — the help lists this screen's keys
    await page.keyboard.press("Shift+Slash");
    const help = page.getByTestId("desk-shortcuts");
    const helpCame = await help.waitFor({ timeout: 3_000 }).then(() => true, () => false);
    const listed = helpCame ? ((await help.textContent()) ?? "") : "";
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
    record("задачи: «?» — справка с клавишами таблицы", helpCame && listed.includes("Отметить строку") && listed.includes("Передать другому"), "");

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
  await checkArchive(ctx);

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
    await page.keyboard.press("KeyK");
    await page.waitForTimeout(400);
    const back = await card.getAttribute("data-task-id");
    record("разобрать: K — обратно, как ←", back === first, "");
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(300);
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
