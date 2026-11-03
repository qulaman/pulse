/**
 * Role D of tasks/022 and the second wave of D-154: /desk/calendar (the week of hours, the line of
 * now, the layer of deadlines on and off, the month), /desk/notes, /desk/screen. The run's one write
 * lives here — a note made and deleted (private, no push), skipped when `ctx.quiet`. The wall is
 * looked at only, with its remote cut off in the browser while it is.
 */
import type { Page } from "playwright";

import { open, record, skip, type Ctx } from "./shared";

/** A phone sheet drawn as the desk's dialog: in the middle of the window, clear of its edges. */
async function centred(page: Page): Promise<{ ok: boolean; detail: string }> {
  const sheet = page.locator("[data-sheet]");
  const shown = await sheet.waitFor({ timeout: 6_000 }).then(() => true, () => false);
  if (!shown) return { ok: false, detail: "диалог не открылся" };
  await page.waitForTimeout(400);
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  const ok = Boolean(box && viewport && box.y > 20 && box.y + box.height < viewport.height - 20 && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4);
  return { ok, detail: box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}` : "нет" };
}

async function closeSheet(page: Page): Promise<boolean> {
  await page.keyboard.press("Escape");
  return page.locator("[data-sheet]").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
}

/** The search of the address, for a record's detail. */
const search = (page: Page) => new URL(page.url()).search || "—";

/** The deadline marks on the week. */
const deadlineCount = (page: Page) => page.getByTestId("desk-deadline").count();

export async function checkCalendar(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/calendar");

  // the week as hours: seven day columns over a grid of 48 px an hour, 08:00–20:00 at the least
  const week = page.getByTestId("desk-calendar-week");
  const weekShown = await week.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const columns = weekShown ? await page.getByTestId("desk-week-day").count() : 0;
  const hours = weekShown ? ((await week.getAttribute("data-hours")) ?? "") : "";
  const [from, to] = hours.split("-").map(Number);
  const height = weekShown ? ((await page.getByTestId("desk-week-hours").boundingBox())?.height ?? 0) : 0;
  record(
    "календарь: неделя — сетка часов, семь колонок, 48 px на час",
    columns === 7 && from <= 8 && to >= 20 && Math.abs(height - (to - from) * 48) < 2,
    `колонок ${columns}, часы ${hours}, высота ${Math.round(height)}`,
  );

  // the line of now: in today's column while the clock is inside the grid's hours (Aqtobe, +05:00)
  const wallHour = (((Date.now() / 3_600_000 + 5) % 24) + 24) % 24;
  const lines = await page.getByTestId("desk-now-line").count();
  if (wallHour >= from && wallHour <= to) {
    const today = page.getByTestId("desk-week-day").filter({ has: page.getByTestId("desk-now-line") });
    const day = (await today.count()) === 1 ? await today.getAttribute("aria-label") : null;
    record("календарь: линия «сейчас» — одна, в колонке сегодня", lines === 1 && Boolean(day), `линий ${lines}, день ${day}`);
  } else {
    skip("календарь: линия «сейчас»", `часы стены ${wallHour.toFixed(1)} вне сетки ${hours}`);
  }
  record("календарь: «Ближайшее» рядом", await page.getByTestId("desk-calendar-aside").isVisible());
  await ctx.shot("calendar-week");

  // «Сроки задач»: off by default, on by its switch and by D — the address keeps it; nothing is written
  const toggle = page.getByTestId("desk-deadlines-toggle");
  if (await toggle.count()) {
    const offAtFirst = (await toggle.getAttribute("aria-pressed")) === "false" && (await deadlineCount(page)) === 0;
    await toggle.click();
    await page.waitForTimeout(500);
    const on = (await toggle.getAttribute("aria-pressed")) === "true" && new URL(page.url()).searchParams.get("deadlines") === "1";
    const marks = await deadlineCount(page);
    record("календарь: «Сроки задач» — выключены, включаются, ?deadlines=1 в адресе", offAtFirst && on, `меток ${marks} · ${search(page)}`);
    await ctx.shot("calendar-deadlines");
    if (marks > 0) {
      const href = await page.getByTestId("desk-deadline").first().getAttribute("href");
      record("календарь: метка срока ведёт в «Задачи»", /^\/desk\/tasks\?id=[0-9a-f-]{36}$/.test(href ?? ""), href ?? "");
    } else {
      skip("календарь: метка срока ведёт в «Задачи»", "на этой неделе открытых сроков нет");
    }
    // D — the same switch from the keyboard (the physical key: a Russian layout presses it too)
    await toggle.blur();
    await page.keyboard.press("KeyD");
    await page.waitForTimeout(400);
    const offByKey = new URL(page.url()).searchParams.get("deadlines") === null && (await deadlineCount(page)) === 0;
    await page.keyboard.press("KeyD");
    await page.waitForTimeout(400);
    const onByKey = new URL(page.url()).searchParams.get("deadlines") === "1";
    record("календарь: клавиша D выключает и включает сроки", offByKey && onByKey, search(page));
  } else {
    record("календарь: переключатель «Сроки задач» у директора", false, "переключателя нет");
  }

  await page.getByTestId("seg-month").click();
  const month = page.getByTestId("desk-calendar-month");
  const monthShown = await month.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const cells = monthShown ? await page.getByTestId("desk-month-day").count() : 0;
  const dotted = monthShown ? await page.getByTestId("desk-month-deadlines").count() : 0;
  record("календарь: месяц — сетка 7 × недели, сроки точками в днях", cells >= 28 && cells % 7 === 0, `клеток ${cells}, дней со сроками ${dotted}, ${search(page)}`);
  await ctx.shot("calendar-month");

  // a click on a day (its number, clear of the meetings) opens that day's week; the layer stays on
  if (cells > 10) {
    const cell = page.getByTestId("desk-month-day").nth(10);
    const ymd = await cell.getAttribute("aria-label");
    await cell.click({ position: { x: 10, y: 10 } });
    const back = await week.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const days = back ? await page.getByTestId("desk-week-day").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))) : [];
    record("календарь: клик по дню месяца — неделя с этим днём", back && days.includes(ymd), `${ymd} · ${search(page)}`);
  }

  // the layer off again — the address the next visit starts from is plain
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(300);
    record("календарь: «Сроки задач» выключаются снова", new URL(page.url()).searchParams.get("deadlines") === null && (await deadlineCount(page)) === 0, search(page));
  }

  // «Новое мероприятие» — the phone's form as a centred dialog; Esc closes it, nothing is made
  const add = page.getByTestId("desk-event-new");
  if (await add.count()) {
    await add.click();
    const dialog = await centred(page);
    record("календарь: «Новое мероприятие» — диалог по центру", dialog.ok, dialog.detail);
    await ctx.shot("calendar-new-event");
    record("календарь: Esc закрывает диалог", await closeSheet(page));
  } else {
    record("календарь: «Новое мероприятие» у директора", false, "кнопки нет");
  }

  // a meeting opens in the same dialog — looked at, not answered
  const event = page.getByTestId("desk-event").first();
  if (await event.count()) {
    await event.click();
    const dialog = await centred(page);
    record("календарь: мероприятие открывается диалогом", dialog.ok, dialog.detail);
    await ctx.shot("calendar-event");
    await closeSheet(page);
  } else {
    skip("календарь: мероприятие открывается диалогом", "на этой неделе мероприятий нет");
  }
}

export async function checkNotes(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/notes");
  const list = page.getByTestId("desk-notes-list");
  record("заметки: список слева, заметка справа", (await list.isVisible()) && (await page.getByRole("region", { name: "Заметка" }).count()) === 1);
  await ctx.shot("notes");

  // the run's one write: a private note made, saved, deleted and taken out of the bin — no push
  if (ctx.quiet) {
    skip("заметки: создать, сохранить, удалить", "на dev активность");
  } else {
    const words = `смоук ${ctx.stamp}`;
    await page.getByTestId("desk-note-new").click();
    const editor = page.locator('[data-testid="desk-note"] [data-testid="note-editor"]');
    await editor.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    record("заметки: «Новая заметка» — курсор в редакторе", focused === "note-editor", `activeElement=${focused}`);
    await page.keyboard.type(words);
    const saved = await page.getByTestId("note-saved").waitFor({ timeout: 15_000 }).then(() => true, () => false);
    const listed = await list.getByText(words).count();
    record("заметки: текст сохранился сам («Сохранено»), строка в списке", saved && listed === 1, `в списке ${listed}`);
    await ctx.shot("notes-saved");

    await page.getByTestId("desk-note-delete").click();
    const gone = await list.getByText(words).waitFor({ state: "detached", timeout: 8_000 }).then(() => true, () => false);
    record("заметки: «Удалить» убирает из мыслей", gone);
    // out of the bin too: the director's own bin is not left with a smoke line for three days
    await page.getByTestId("seg-trash").click();
    const card = page.getByTestId("note-trashed").filter({ hasText: words });
    const inBin = await card.waitFor({ timeout: 8_000 }).then(() => true, () => false);
    if (inBin) {
      await card.getByRole("button", { name: "Удалить навсегда" }).click();
      await page.getByTestId("desk-purge-confirm").click();
      const purged = await card.waitFor({ state: "detached", timeout: 8_000 }).then(() => true, () => false);
      record("заметки: корзина — «Удалить навсегда»", purged);
    } else {
      record("заметки: удалённая заметка в корзине", false, "карточки нет");
    }
  }

  // the boards: the list, and the first one opened on the right — looked at only
  await page.getByTestId("seg-boards").click();
  const rows = list.getByTestId("desk-row");
  await page.waitForTimeout(800);
  if ((await rows.count()) > 0) {
    await rows.first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/desk/notes/b/"), { timeout: 15_000 });
    const board = await page.getByTestId("desk-board").locator("main").waitFor({ timeout: 15_000 }).then(() => true, () => false);
    const width = board ? ((await page.getByTestId("desk-board").locator("main").boundingBox())?.width ?? 0) : 0;
    record("заметки: доска открывается справа, шире телефона", board && width > 600, `ширина ${Math.round(width)}`);
    await page.waitForTimeout(800);
    await ctx.shot("notes-board");
  } else {
    skip("заметки: доска открывается справа", "досок нет");
  }
}

export async function checkScreen(ctx: Ctx) {
  const { page } = ctx;
  // the wall is live in the office: nothing here is pressed, and as a guard every remote command
  // is cut off in this browser while the screen is checked
  const remote = /\/rest\/v1\/rpc\/(tv_control|tv_board_control|tv_week_board|close_visit)/;
  const sent: string[] = [];
  await page.route(remote, (route) => {
    sent.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  try {
    await open(page, "/desk/screen");

    // the wall as the office sees it: /tv in a frame of 1920×1080, scaled to the column — the hero, two thirds wide
    const frame = page.locator('iframe[title="Стена"]');
    const src = (await frame.count()) === 1 ? await frame.getAttribute("src") : null;
    const loaded = await page
      .waitForFunction(() => Boolean((document.querySelector('iframe[title="Стена"]') as HTMLIFrameElement | null)?.contentDocument?.querySelector("main, div")), undefined, {
        timeout: 20_000,
      })
      .then(() => true, () => false);
    const box = await page.getByTestId("desk-wall-preview").boundingBox();
    // the screen's two columns: the wall's and the panel
    const grid = await page.getByTestId("desk-screen-now").evaluate((node) => node.parentElement?.parentElement?.getBoundingClientRect().width ?? 0);
    const ratio = box ? box.width / box.height : 0;
    const share = box && grid ? box.width / grid : 0;
    record(
      "экран: живой предпросмотр — iframe /tv, 16:9, около 2/3 ширины",
      src === "/tv" && loaded && Math.abs(ratio - 16 / 9) < 0.02 && share > 0.58 && share < 0.72,
      box ? `${Math.round(box.width)}×${Math.round(box.height)}, доля ${share.toFixed(2)}` : "нет",
    );

    // the receipt on the frame's chin: a diode in its tone and the words; «сейчас на стене» under the frame
    const receipt = page.getByTestId("desk-wall-receipt");
    const tone = await receipt.getAttribute("data-tone");
    const words = (await receipt.innerText()).trim();
    record("экран: на рамке — диод и квитанция стены", ["ok", "warn", "muted"].includes(tone ?? "") && words.length > 4, `${tone} · ${words.split("\n")[0]}`);
    const now = page.getByTestId("desk-screen-now");
    const nowBox = await now.boundingBox();
    record("экран: «Сейчас на стене» под предпросмотром", Boolean(nowBox && box && nowBox.y > box.y + box.height) && (await now.innerText()).length > 20);

    // the scenes and the round — one row of segments, not a grid of equal keys; looked at, not pressed
    const scenes = page.getByTestId("desk-screen-scenes");
    const labels = await scenes.getByRole("tab").allInnerTexts();
    const chosen = await scenes.getByRole("tab", { selected: true }).count();
    record("экран: заставки — сегменты с «По кругу», выбрана одна", labels.length >= 5 && labels.includes("По кругу") && chosen === 1, labels.join(" | "));

    // the panel: «Вид на стене» (the clock, the calendar, the rating — segments; the guest — a switch) and «Показать на стене»
    const panel = page.getByTestId("desk-screen-panel");
    const sections = await panel.locator(":scope > section").count();
    const segments = await page.getByTestId("desk-screen-look").getByRole("tablist").count();
    const guest = await page.getByTestId("desk-screen-guest").getAttribute("role");
    const picks = await page.getByTestId("desk-screen-show").getByRole("tab").count();
    record(
      "экран: панель — вид на стене сегментами, гость — переключатель, «Показать» — три вкладки",
      sections === 2 && segments >= 2 && guest === "switch" && picks === 3,
      `разделов ${sections}, сегментов ${segments}, вкладок ${picks}`,
    );
    const listed = await page.getByTestId("desk-screen-pick").locator("button, li").count();
    record("экран: список «Показать на стене» не пуст", listed > 0, `строк ${listed}`);

    await page.waitForTimeout(2500);
    await ctx.shot("screen");
    record("экран: ни одной команды стене", sent.length === 0, sent.join(", "));
  } finally {
    await page.unroute(remote);
  }
}
