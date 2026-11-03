/**
 * Role A of tasks/022: /desk/tasks and /desk/inbox. Read only — nothing is accepted, sent or
 * taken back. Opening a task (the panel, «Разобрать») moves the director's read cursor, as the
 * phone's task screen does, and the smoke director may be the owner's own account: only a row with
 * no unread message is opened, and «Разобрать» is left alone while the table shows unread ones.
 */
import { APP_URL, open, record, skip, type Ctx } from "./shared";

export async function checkTasks(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/tasks");
  const rows = page.getByTestId("desk-row");
  const empty = page.getByTestId("desk-empty");
  await rows.first().or(empty.first()).waitFor({ timeout: 20_000 }).catch(() => undefined);
  const count = await rows.count();
  const groups = await page.locator('[role="grid"] [role="rowgroup"] > [role="row"]:not([data-testid="desk-row"])').count();
  record("задачи: таблица с группами или пустое состояние", (count > 0 && groups > 0) || (await empty.count()) > 0, `строк ${count}, групп ${groups}`);
  const tiles = await page.getByTestId("stat-tile").count();
  record("задачи: строка состояния — пять плиток", tiles === 5, `плиток ${tiles}`);
  await ctx.shot("tasks");

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
