/**
 * Role D of tasks/022, the second wave of D-154 and the third (mouse and keyboard): /desk/calendar
 * (the week of hours, the line of now, the layer of deadlines, the month, the meeting's card beside
 * its block, the quick card of a slot, the desk form, the keys), /desk/notes (the list's keys, the
 * page editor, the board as an outline), /desk/screen. The run's one write lives here — a note made
 * and deleted (private, no push), skipped when `ctx.quiet`. No meeting is made or changed (the
 * cards are opened and closed with Esc, nothing typed), no line of a board is typed, the wall is
 * looked at only, with its remote cut off in the browser while it is.
 */
import type { Page } from "playwright";

import { open, record, skip, type Ctx } from "./shared";

/** A desk dialog: in the middle of the window, clear of its edges. */
async function centred(page: Page, testId: string): Promise<{ ok: boolean; detail: string }> {
  const form = page.getByTestId(testId);
  const shown = await form.waitFor({ timeout: 6_000 }).then(() => true, () => false);
  if (!shown) return { ok: false, detail: "диалог не открылся" };
  await page.waitForTimeout(400);
  const box = await page.locator(".desk-dialog").filter({ has: form }).boundingBox();
  const viewport = page.viewportSize();
  const ok = Boolean(box && viewport && box.y > 20 && box.y + box.height < viewport.height - 20 && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4);
  return { ok, detail: box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}` : "нет" };
}

/** Esc, and the thing is gone. */
async function escapes(page: Page, testId: string): Promise<boolean> {
  await page.keyboard.press("Escape");
  return page.getByTestId(testId).waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
}

/** The «?» help lists a group of this screen's keys. */
async function helpLists(page: Page, title: string): Promise<boolean> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("Shift+Slash");
  const help = page.getByTestId("desk-shortcuts");
  const shown = await help.waitFor({ timeout: 4_000 }).then(() => true, () => false);
  const listed = shown ? (await help.getByRole("heading", { name: title, exact: true }).count()) > 0 : false;
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached", timeout: 4_000 }).catch(() => undefined);
  return listed;
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

  // W and M — the views by the keys (the address keeps them)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press("KeyM");
  const byM = await page.getByTestId("desk-calendar-month").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await page.keyboard.press("KeyW");
  const byW = await week.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  record("календарь: клавиши M и W — месяц и неделя", byM && byW && new URL(page.url()).searchParams.get("view") === null, search(page));

  // «Новое мероприятие» (and N) — the desk's own form, a centred dialog; Esc closes it, nothing is made
  const add = page.getByTestId("desk-event-new");
  if (await add.count()) {
    await add.click();
    const dialog = await centred(page, "desk-event-form");
    const titled = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    record("календарь: «Новое мероприятие» — настольная форма по центру, курсор в названии", dialog.ok && titled === "desk-event-title", `${dialog.detail} · фокус ${titled}`);
    await ctx.shot("calendar-new-event");
    record("календарь: Esc закрывает форму", await escapes(page, "desk-event-form"));
    await page.keyboard.press("KeyN");
    const byN = await page.getByTestId("desk-event-form").waitFor({ timeout: 5_000 }).then(() => true, () => false);
    record("календарь: клавиша N открывает форму", byN && (await escapes(page, "desk-event-form")));
  } else {
    record("календарь: «Новое мероприятие» у директора", false, "кнопки нет");
  }

  // a meeting opens as a card beside its block, the grid in sight — looked at, not answered
  const event = page.getByTestId("desk-event").first();
  if (await event.count()) {
    await event.click();
    const card = page.getByTestId("desk-event-card");
    const shown = await card.waitFor({ timeout: 6_000 }).then(() => true, () => false);
    await page.waitForTimeout(300);
    const cardBox = await card.boundingBox();
    const blockBox = await event.boundingBox();
    const beside = Boolean(cardBox && blockBox && (cardBox.x >= blockBox.x + blockBox.width - 1 || cardBox.x + cardBox.width <= blockBox.x + 1));
    record("календарь: мероприятие — карточка рядом с блоком, сетка видна", shown && beside, cardBox && blockBox ? `карточка x=${Math.round(cardBox.x)}, блок ${Math.round(blockBox.x)}–${Math.round(blockBox.x + blockBox.width)}` : "нет");
    await ctx.shot("calendar-event");
    record("календарь: Esc закрывает карточку", await escapes(page, "desk-event-card"));
  } else {
    skip("календарь: мероприятие — карточка рядом с блоком", "на этой неделе мероприятий нет");
  }

  // a click on an empty stretch of a day ahead: the block of the new meeting and the quick card;
  // Esc lets it go — nothing is typed, nothing is made
  const days = page.getByTestId("desk-week-day");
  const ymds = await days.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const ahead = ymds.findIndex((ymd) => ymd > today);
  if (ahead >= 0) {
    const column = days.nth(ahead);
    const box = await column.boundingBox();
    // the first empty half-hour from the top of the day: no meeting, no deadline under the click
    const spot = box
      ? await column.evaluate((node, height) => {
          const taken = [...node.querySelectorAll("[data-testid=desk-event], [data-testid=desk-deadline]")].map((el) => {
            const rect = el.getBoundingClientRect();
            return [rect.top - node.getBoundingClientRect().top, rect.bottom - node.getBoundingClientRect().top];
          });
          for (let y = 12; y < height - 12; y += 24) if (!taken.some(([top, bottom]) => y > top - 4 && y < bottom + 4)) return y;
          return null;
        }, box.height)
      : null;
    if (box && spot !== null) {
      await page.mouse.click(box.x + box.width / 2, box.y + spot);
      const quick = page.getByTestId("desk-quick-create");
      const shown = await quick.waitFor({ timeout: 5_000 }).then(() => true, () => false);
      const ghost = await page.getByTestId("desk-slot-ghost").count();
      const focus = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
      record("календарь: клик по пустому часу — блок и быстрая карточка, курсор в названии", shown && ghost === 1 && focus === "desk-quick-title", `блок ${ghost}, фокус ${focus}`);
      await ctx.shot("calendar-quick");
      const gone = await escapes(page, "desk-quick-create");
      record("календарь: Esc отпускает новое мероприятие — блока нет", gone && (await page.getByTestId("desk-slot-ghost").count()) === 0);
    } else {
      skip("календарь: клик по пустому часу", "свободного места в дне нет");
    }
  } else {
    skip("календарь: клик по пустому часу", "на этой неделе нет дней впереди");
  }

  record("календарь: клавиши в справке «?»", await helpLists(page, "Календарь"));
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

  // the keys of the list: ↓ chooses a note, Ctrl+F — the search; nothing is written
  await open(page, "/desk/notes");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  const before = new URL(page.url()).searchParams.get("n");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  const chosen = new URL(page.url()).searchParams.get("n");
  if ((await list.getByTestId("desk-row").count()) > 0) record("заметки: ↓ выбирает заметку в списке", chosen !== null && chosen !== before, search(page));
  else skip("заметки: ↓ выбирает заметку", "мыслей нет");
  await page.keyboard.press("Control+KeyF");
  const searching = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "search");
  record("заметки: Ctrl+F — поиск", searching);
  await page.keyboard.press("Escape");
  record("заметки: клавиши в справке «?»", await helpLists(page, "Заметки"));

  // the boards: the list, and the first one opened on the right as an outline — looked at, walked, not typed in
  await page.getByTestId("seg-boards").click();
  const rows = list.getByTestId("desk-row");
  await page.waitForTimeout(800);
  if ((await rows.count()) > 0) {
    await rows.first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/desk/notes/b/"), { timeout: 15_000 });
    const outline = page.getByTestId("desk-outline");
    const shown = await outline.waitFor({ timeout: 15_000 }).then(() => true, () => false);
    const width = shown ? ((await page.getByTestId("desk-board").boundingBox())?.width ?? 0) : 0;
    const lines = shown ? await outline.getByTestId("desk-outline-line").count() : 0;
    record("заметки: доска — настольный редактор пунктов справа", shown && width > 600, `ширина ${Math.round(width)}, строк ${lines}`);
    await page.waitForTimeout(600);
    await ctx.shot("notes-board");
    if (lines >= 2) {
      // a click into a line and ↓ — the caret walks to the next line; Esc lets it go, nothing changed
      const fields = outline.locator("[data-testid=desk-outline-line] textarea");
      await fields.first().click();
      await page.keyboard.press("End");
      const first = await page.evaluate(() => document.activeElement?.getAttribute("data-line"));
      await page.keyboard.press("ArrowDown");
      const second = await page.evaluate(() => document.activeElement?.getAttribute("data-line"));
      record("заметки: доска — ↓ переводит курсор на следующую строку", Boolean(first && second && first !== second), `${first?.slice(0, 8)} → ${second?.slice(0, 8)}`);
      await page.keyboard.press("Escape");
    } else {
      skip("заметки: доска — ↓ по строкам", "на доске меньше двух строк");
    }
    record("заметки: клавиши доски в справке «?»", await helpLists(page, "Доска"));
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
    // each segment carries its key («Часы 2»): the words without it
    const labels = (await scenes.getByRole("tab").allInnerTexts()).map((text) => text.replace(/\s*\d+\s*$/, "").trim());
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

    // the keys of the remote are said, not pressed: the digits on the scenes and the help
    const hinted = (await scenes.innerText()).includes("клавиши 1–");
    record("экран: у заставок — их клавиши, в справке «?» — «Экран»", hinted && (await helpLists(page, "Экран")));

    await page.waitForTimeout(2500);
    await ctx.shot("screen");
    record("экран: ни одной команды стене", sent.length === 0, sent.join(", "));
  } finally {
    await page.unroute(remote);
  }
}
