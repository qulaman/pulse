/**
 * Role D of tasks/022: /desk/calendar, /desk/notes, /desk/screen. The run's one write lives here —
 * a note made and deleted (private, no push), skipped when `ctx.quiet`. The wall is looked at only.
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

export async function checkCalendar(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/calendar");

  const week = page.getByTestId("desk-calendar-week");
  const weekShown = await week.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const columns = weekShown ? await week.locator(":scope > section").count() : 0;
  record("календарь: неделя — семь колонок", columns === 7, `колонок ${columns}`);
  record("календарь: «Сегодня и ближайшее» рядом", await page.getByTestId("desk-calendar-aside").isVisible());
  await ctx.shot("calendar-week");

  await page.getByTestId("seg-month").click();
  const month = page.getByTestId("desk-calendar-month");
  const monthShown = await month.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const cells = monthShown ? await page.getByTestId("desk-month-day").count() : 0;
  record("календарь: месяц — сетка 7 × недели", cells >= 28 && cells % 7 === 0, `клеток ${cells}, ${new URL(page.url()).search}`);
  await ctx.shot("calendar-month");

  // a click on a day (its number, clear of the meetings) opens that day's week
  if (cells > 10) {
    const cell = page.getByTestId("desk-month-day").nth(10);
    const ymd = await cell.getAttribute("aria-label");
    await cell.click({ position: { x: 10, y: 10 } });
    const back = await week.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const days = back ? await week.locator(":scope > section").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))) : [];
    record("календарь: клик по дню месяца — неделя с этим днём", back && days.includes(ymd), `${ymd} · ${new URL(page.url()).search}`);
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
  await open(page, "/desk/screen");

  // the wall as the office sees it: /tv in a frame of 1920×1080, scaled to the column — looked at only
  const frame = page.locator('iframe[title="Стена"]');
  const src = (await frame.count()) === 1 ? await frame.getAttribute("src") : null;
  const loaded = await page
    .waitForFunction(() => Boolean((document.querySelector('iframe[title="Стена"]') as HTMLIFrameElement | null)?.contentDocument?.querySelector("main, div")), undefined, { timeout: 20_000 })
    .then(() => true, () => false);
  const box = await page.getByTestId("desk-wall-preview").boundingBox();
  const ratio = box ? box.width / box.height : 0;
  record("экран: живой предпросмотр — iframe /tv, 16:9", src === "/tv" && loaded && Math.abs(ratio - 16 / 9) < 0.02, box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "нет");
  record("экран: квитанция и «сейчас на стене» под предпросмотром", (await page.getByTestId("desk-screen-now").innerText()).length > 20);

  // the panel: the scenes and the rest of the remote's keys — nothing is pressed, the wall is live
  const scenes = await page.getByTestId("desk-screen-scenes").getByRole("button").count();
  record("экран: панель — кнопки сцен и «По кругу»", scenes >= 5, `кнопок ${scenes}`);
  const sections = await page.getByTestId("desk-screen-panel").locator(":scope > section").count();
  record("экран: панель пульта — разделы", sections >= 6, `разделов ${sections}`);
  await page.waitForTimeout(2500);
  await ctx.shot("screen");
}
