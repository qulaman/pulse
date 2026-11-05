/**
 * The desk of the director and the secretary (D-153, tasks/022) in a real browser — system
 * Chrome via Playwright — against the dev database and a running app.
 *   1. Director, desktop 1440×900: signs in and lands on /desk/today (D-154); every desk screen opens
 *      with no page error and no console error; screenshots of each; the frame's keys («[», «G …»,
 *      «?»), the palette of the order line, the profile as an account page; the order line parses a
 *      phrase into the panel (or says honestly that the parser is down — skipped, external) and is
 *      CANCELLED — never sent (sending wakes the team's phones); the confirm editor is driven on a
 *      parse answered in the browser, with the send refused in the browser too; «Телефонная
 *      версия» keeps /pulse a phone screen.
 *   2. Director, phone 390×844: /pulse, /sent, /settings stay phone screens, no move to the desk;
 *      the calendar's sheet is still a bottom sheet.
 *   3. Secretary (marat@ on dev), desktop: /desk → /desk/errands, /desk/tasks → /desk/errands; a phone
 *      sheet («Посетитель») opens as a centred dialog; her «G …» letters.
 *   4. WebKit (Safari's engine) on a desktop UA without the client hint: lands on the desk.
 * Nothing is sent, the wall is not touched, no setting is saved, no code is issued. The only
 * write is a note made and deleted (notes are private, no push) — skipped while somebody is
 * active on dev in the last 10 minutes.
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-desk.ts   (APP_URL, SMOKE_OUT to override)
 *   ONLY=tasks,team,errands,reports,calendar,notes,screen,settings,shell,phone,secretary,safari — a part of it
 * The screens' own steps live in scripts/desk-smoke/* — one file per role of tasks/022.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit, type Browser, type BrowserContext, type Page } from "playwright";

import { APP_URL, checks, injected, open, record, skip, type Ctx } from "./desk-smoke/shared";
import { checkCalendar, checkNotes, checkScreen } from "./desk-smoke/planning";
import { checkErrands, checkReports, checkSecretary, checkTeam } from "./desk-smoke/people";
import { checkSettings } from "./desk-smoke/settings";
import { checkTasks } from "./desk-smoke/tasks";

const OUT = process.env.SMOKE_OUT ?? join(process.cwd(), ".smoke-ui", "desk");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIRECTOR = { email: process.env.DIRECTOR ?? "test@demo.local", password: process.env.DIRECTOR_PASSWORD ?? "1" };
const SECRETARY = { email: process.env.SECRETARY ?? "marat@demo.local", password: process.env.SECRETARY_PASSWORD ?? "demo1234" };
/** `ONLY=tasks,notes` — just these parts (a role checking its own screens); default — everything. */
const ONLY = new Set((process.env.ONLY ?? "").split(",").map((part) => part.trim()).filter(Boolean));
const runs = (part: string) => ONLY.size === 0 || ONLY.has(part);

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

mkdirSync(OUT, { recursive: true });

/** Page errors and console errors of every page, with the screen they came from. */
const errors: string[] = [];
const shots: string[] = [];

/** The sign-in screen's own 401s before anyone is signed in are not the desk's — kept apart, reported. */
const signInNoise: string[] = [];

function watch(page: Page, who: string) {
  const note = (line: string) => {
    const path = new URL(page.url()).pathname;
    (path === "/login" ? signInNoise : errors).push(`${who} ${path} ${line}`);
  };
  page.on("pageerror", (error) => note(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !(injected.failures && message.text().includes("status of 500"))) note(`console.error: ${message.text()}`);
  });
}

function shooter(page: Page, prefix: string) {
  return async (name: string) => {
    const path = join(OUT, `${prefix}-${name}.png`);
    await page.screenshot({ path });
    shots.push(path);
  };
}

/** Somebody worked on dev in the last 10 minutes: the run stays read-only (tasks/022 «Проверки»). */
async function ownerActive(): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_KEY) return false;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin.from("ai_logs").select("id").gt("created_at", since).limit(1);
  return (data?.length ?? 0) > 0;
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "load" });
  const mail = page.getByLabel("Почта");
  if (!(await mail.isVisible().catch(() => false))) await page.getByTestId("login-switch").click();
  await mail.fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/* ---- the shell: the lead's checks ------------------------------------------------------------ */

/** The parse answered in the browser (D-154 wave 3): the editor is checked on a known order, never on the model's mood. */
function knownOrder() {
  const at = (days: number, hour: number) => {
    const wall = new Date(Date.now() + 5 * 3_600_000);
    const day = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + days, hour));
    return `${day.toISOString().slice(0, 13)}:00:00+05:00`;
  };
  const task = { kind: "task", group_id: null, body: null, scheduled_send_at: null, deadline_confidence: null, deadline_source_text: null };
  // the people of the answer are made up: a pick from the list takes a real person of the roster
  const one = { user_id: "00000000-0000-4000-8000-000000000001", full_name: "Смоук Первый", score: 0.6 };
  const two = { user_id: "00000000-0000-4000-8000-000000000002", full_name: "Смоук Второй", score: 0.6 };
  return [
    { ...task, title: "Проверить смету по объекту", source_span: "смета", assignee_queries: ["Смоук"], assignee_id: one.user_id, assignee_name: one.full_name, assignee_confidence: 0.95, deadline_iso: at(2, 18), deadline_confidence: 0.95, deadline_source_text: "до пятницы", priority: "normal", assignee: { status: "matched", user_id: one.user_id, candidates: [{ ...one, score: 0.95 }], flag: "ok" } },
    { ...task, title: "Позвонить поставщику", source_span: "позвонить", assignee_queries: ["Смоук"], assignee_id: null, assignee_name: null, assignee_confidence: 0.4, deadline_iso: null, priority: "high", assignee: { status: "ambiguous", user_id: null, candidates: [one, two], flag: "check" }, blocked: "assignee_unmatched" },
    { kind: "event", title: "Планёрка", body: null, location: null, starts_at_iso: at(1, 10), ends_at_iso: null, time_confidence: 0.9, time_source_text: "завтра в десять", participant_queries: [], participant_names: [], participant_ids: [], everyone: true, remind_before_min: 15, repeat: "none", source_span: "планёрка", participants: [] },
    { kind: "announcement", text: "В пятницу короткий день", source_span: "короткий день" },
  ];
}

async function checkShell(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/profile");
  await ctx.shot("profile");
  const nav = await page.getByRole("navigation", { name: "Разделы" }).getByRole("link").count();
  record("боковая навигация директора: одиннадцать разделов и профиль", nav === 12, `ссылок ${nav}`);

  // the profile is a computer's account page: a label on the left, its control on the right (D-154 wave 3)
  const parts = ["desk-profile-password", "desk-profile-push", "desk-notify-rules", "desk-profile-view", "desk-profile-others", "desk-profile-signout"];
  await page.getByTestId("desk-notify-rules").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const present = await Promise.all(parts.map((id) => page.getByTestId(id).count()));
  const radios = await page.locator('[data-testid="desk-notify-rules"] input[type="radio"]').count();
  record("профиль: аккаунт, уведомления браузера, правила таблицей, рабочий стол, сеансы", present.every((n) => n === 1) && radios >= 40, `${parts.filter((_, i) => present[i] !== 1).join(", ") || "все блоки"}; ячеек ${radios}`);

  // «Выйти на других устройствах» asks in the desk's dialog in the middle — looked at and closed, never confirmed
  await page.getByRole("button", { name: "Выйти на других устройствах" }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(300);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  const centred = Boolean(box && viewport && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4 && box.y > 40);
  record("профиль: «Выйти на других устройствах» — диалог по центру", centred, box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)}` : "нет");
  await ctx.shot("profile-dialog");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5_000 });

  // «[» folds the navigation to icons; the fold outlives a reload (the cookie draws it); «[» unfolds
  const navWidth = () => page.getByRole("navigation", { name: "Разделы" }).evaluate((el) => Math.round(el.getBoundingClientRect().width));
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("BracketLeft");
  await page.waitForTimeout(300);
  const folded = await navWidth();
  await page.reload({ waitUntil: "load" });
  await page.locator("#desk-main").waitFor({ timeout: 20_000 });
  const kept = await navWidth();
  await ctx.shot("nav-folded");
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("BracketLeft");
  await page.waitForTimeout(300);
  const wide = await navWidth();
  record("«[» сворачивает навигацию в значки и обратно, свёртка переживает перезагрузку", folded === 64 && kept === 64 && wide === 232, `${folded} → ${kept} → ${wide}`);

  // «G» and a letter go to a section (the letters by the key, a Russian layout too); a pause shows them
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(600);
  const card = await page.getByTestId("desk-chord").isVisible();
  await page.keyboard.press("KeyK");
  const jumped = await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 15_000 }).then(() => true, () => false);
  record("«G K» ведёт в «Команду», после паузы видна карточка букв", jumped && card, `${new URL(page.url()).pathname}; карточка ${card}`);

  // «?» lists the keys of the screen and of the desk
  await page.locator("#desk-main").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press("Shift+Slash");
  const help = page.getByTestId("desk-shortcuts");
  const shown = await help.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  // the text as written: the group titles are drawn in capitals, innerText would read them so
  const words = shown ? ((await help.evaluate((el) => el.textContent)) ?? "") : "";
  await page.waitForTimeout(250);
  record("«?» — справка: переходы «G …», строка поручения, «Везде»", shown && words.includes("Переходы") && words.includes("Строка поручения") && words.includes("Везде"), shown ? "" : "не открылась");
  await ctx.shot("help");
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);

  // the palette: words that name a section, ↓ and Enter go there; Esc hides the list first
  await page.keyboard.press("Control+KeyK");
  await page.keyboard.type("проф", { delay: 20 });
  const palette = page.getByTestId("command-palette");
  const listed = await palette.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await ctx.shot("palette");
  await page.keyboard.press("Escape");
  const hidden = await palette.waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  const stillIn = await page.evaluate(() => document.activeElement?.id === "desk-command");
  // ↓ brings the hidden list back with its first row picked
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const went = await page.waitForURL((url) => url.pathname === "/desk/profile", { timeout: 15_000 }).then(() => true, () => false);
  record("палитра: «проф» → раздел «Профиль» (↓, Enter); Esc сначала прячет список", listed && hidden && stillIn && went, `список ${listed}, Esc ${hidden}/${stillIn}, переход ${went}`);

  // a name under the caret offers the people; Tab pins the first by id
  await page.locator("#desk-main").waitFor({ timeout: 20_000 });
  await page.keyboard.press("Control+KeyK");
  await page.keyboard.type("Ай", { delay: 40 });
  const offered = await page.locator('[data-testid="command-palette"] [data-kind="pin"]').first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  if (offered) {
    await page.keyboard.press("Tab");
    const pinned = await page.getByTestId("command-pin").isVisible();
    record("строка поручения: имя под курсором — подсказка людей, Tab закрепляет человека", pinned);
    await page.keyboard.press("Backspace");
  } else skip("строка поручения: подсказка людей", "в компании нет имени на «Ай»");
  await page.keyboard.press("Control+KeyA");
  await page.keyboard.press("Backspace");

  // the order line on dev: Ctrl+K, a phrase, the editor in the panel — or an honest failure with
  // «Повторить» when the parser is down (external; skipped, not red). Never «Отправить».
  await open(page, "/desk/tasks");
  await page.keyboard.press("Control+KeyK");
  const focused = await page.evaluate(() => document.activeElement?.id);
  record("Ctrl+K ставит курсор в строку поручения", focused === "desk-command", `activeElement=${focused}`);
  await page.keyboard.type(`Смоук ${ctx.stamp}: Ерлану проверить смету по объекту до пятницы`);
  await page.keyboard.press("Enter");
  const confirm = page.getByTestId("desk-confirm");
  const answered = await confirm.waitFor({ timeout: 90_000 }).then(() => true, () => false);
  const state = answered ? await confirm.getAttribute("data-state") : null;
  await ctx.shot("command-confirm");
  if (state === "error") {
    const why = (await page.getByTestId("desk-confirm-error").innerText().catch(() => "")).trim();
    const retry = await page.getByTestId("desk-confirm-retry").isVisible();
    record("разбор не удался — панель говорит почему и даёт «Повторить»", retry, why);
    skip("строка поручения: подтверждение в панели", `разбор на dev не ответил (внешнее): «${why}»`);
  } else {
    const rows = await page.getByTestId("desk-entity").count();
    record("строка поручения: подтверждение в панели", answered && (state !== "confirm" || rows > 0), answered ? `${state}, строк ${rows}` : "панель не открылась за 90 с");
  }
  if (answered) {
    await page.getByTestId("desk-confirm-cancel").click();
    const closed = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false);
    record("«Отменить» закрывает панель, ничего не отправлено", closed);
  }

  // the editor on a known answer: the parse is answered in this browser, the send is refused here too
  await page.route("**/api/voice/parse", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entities: knownOrder(), inbox_id: null, suspicious: false }) }));
  await page.route("**/api/voice/confirm", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  try {
    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type(`Смоук ${ctx.stamp}: известный разбор`);
    await page.keyboard.press("Enter");
    await confirm.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    const rows = await page.getByTestId("desk-entity").count();
    const head = await page.getByTestId("desk-panel-head").count();
    const at = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    record("редактор: строка на сущность, липкая шапка, курсор — в «Кому» той, где имя подходит нескольким", rows === 4 && head === 1 && at.startsWith("Кому: Позвонить"), `строк ${rows}; фокус «${at}»`);
    // «Кому»: ↓ opens the people, typing narrows, Enter picks
    await page.keyboard.press("ArrowDown");
    const options = page.getByTestId("person-options");
    const opened = await options.waitFor({ timeout: 3_000 }).then(() => true, () => false);
    const count = opened ? await options.locator('[role="option"]').count() : 0;
    await ctx.shot("confirm-who");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const who = await page.getByTestId("desk-entity-who").nth(1).inputValue();
    const sendable = await page.getByTestId("desk-confirm-send").innerText();
    record("«Кому»: ↓ — список людей, Enter — выбран; поручение готово к отправке", opened && count > 1 && who.length > 0 && !sendable.includes("из"), `людей ${count}; «${who}»; кнопка «${sendable}»`);
    // Tab → «Что» → «Срок»: the words «пт 15» become Friday 15:00
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const onWhen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    await page.keyboard.type("пт 15", { delay: 20 });
    const preview = await page.getByTestId("when-preview").innerText().catch(() => "");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const when = await page.getByTestId("desk-entity-when").nth(1).inputValue();
    record("«Срок»: Tab доходит до поля, «пт 15» — пятница 15:00", onWhen.startsWith("Срок:") && when.includes("15:00") && preview.includes("15:00"), `«${onWhen}» → «${when}»`);
    await ctx.shot("confirm-edited");
    // × takes an entity out
    await page.getByTestId("desk-entity-remove").last().click();
    const left = await page.getByTestId("desk-entity").count();
    record("× убирает сущность из поручения", left === 3, `осталось ${left}`);
    // the panel's edge is dragged wider and remembered; a double click puts it back
    const edge = page.getByTestId("desk-panel-edge");
    const rect = await edge.boundingBox();
    const before = await page.getByTestId("desk-panel").evaluate((el) => Math.round(el.getBoundingClientRect().width));
    if (rect) {
      await page.mouse.move(rect.x + 3, rect.y + 300);
      await page.mouse.down();
      await page.mouse.move(rect.x - 80, rect.y + 300, { steps: 4 });
      await page.mouse.move(rect.x - 157, rect.y + 300, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(200);
    const after = await page.getByTestId("desk-panel").evaluate((el) => Math.round(el.getBoundingClientRect().width));
    const stored = await page.evaluate(() => localStorage.getItem("pulse.desk.panel"));
    await ctx.shot("panel-wide");
    await edge.dblclick();
    await page.waitForTimeout(200);
    const reset = await page.getByTestId("desk-panel").evaluate((el) => Math.round(el.getBoundingClientRect().width));
    record("панель: край тянется мышью (360–720), ширина запоминается, двойной клик — обратно", after - before >= 150 && stored === String(after) && reset === 440, `${before} → ${after} (запомнено ${stored}) → ${reset}`);
    await page.getByTestId("desk-confirm-cancel").click();
    await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 5_000 });
  } finally {
    await page.unroute("**/api/voice/parse");
    await page.unroute("**/api/voice/confirm");
  }

  // a push opened on the computer: the proxy answers its phone address with the desk screen and the
  // push's query. Asked as a request of this browser (its cookies and user agent), not rendered —
  // no task or thread is opened, the read cursor stays put
  const nobody = "00000000-0000-0000-0000-000000000000";
  for (const [from, to] of [
    [`/tasks/${nobody}`, `/desk/tasks?id=${nobody}`],
    [`/secretary?e=${nobody}`, `/desk/errands?e=${nobody}`],
    [`/calendar?e=${nobody}`, `/desk/calendar?e=${nobody}`],
    [`/notes?n=${nobody}`, `/desk/notes?n=${nobody}`],
    ["/pulse", "/desk/today"],
    ["/rating", "/desk/settings/points"],
    ["/shop", "/desk/settings/points?view=shop"],
  ] as const) {
    const answer = await page.request.get(`${APP_URL}${from}`, { maxRedirects: 0, headers: { "user-agent": DESKTOP_UA } });
    const location = (answer.headers().location ?? "").replace(APP_URL, "");
    record(`пуш на компьютере: ${from} → ${to}`, answer.status() >= 300 && answer.status() < 400 && location === to, `${answer.status()} ${location}`);
  }
  // the dispute's push is `/rating#disputes`: the hash rides the redirect and opens «Споры»
  await page.goto(`${APP_URL}/rating#disputes`, { waitUntil: "load" });
  await page.getByTestId("seg-disputes").waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  record("пуш «Оспаривает» открывает «Споры»", (await page.getByTestId("seg-disputes").getAttribute("aria-selected")) === "true", page.url().replace(APP_URL, ""));

  // a desktop window narrower than 960 px: the hint, the screen still works
  await page.setViewportSize({ width: 900, height: 800 });
  await open(page, "/desk/team");
  const hint = await page.getByText("Этот экран удобнее на телефоне").count();
  record("окно уже 960 px — плашка «удобнее на телефоне»", hint === 1, `плашек ${hint}`);
  await ctx.shot("narrow");
  await page.setViewportSize({ width: 1440, height: 900 });

  // «Телефонная версия» (in the menu of the circle «я», D-154): the cookie, /pulse as a phone screen, no move back
  await open(page, "/desk/profile");
  await page.getByTestId("desk-me").click();
  await page.getByTestId("phone-view").click();
  await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 20_000 });
  const cookie = (await page.context().cookies()).find((c) => c.name === "pulse_view");
  record("«Телефонная версия» ставит cookie и ведёт на /pulse", cookie?.value === "phone", `cookie=${cookie?.value}`);
  await page.goto(`${APP_URL}/sent`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  record("с cookie /sent остаётся телефонным", new URL(page.url()).pathname === "/sent", page.url());
  await page.screenshot({ path: join(OUT, "director-phone-view-sent.png") });
  shots.push(join(OUT, "director-phone-view-sent.png"));

  // back to the desk for the rest of the run: the phone profile's «Версия для компьютера» (stage 2), else by hand
  await page.goto(`${APP_URL}/profile`, { waitUntil: "load" });
  const deskRow = page.getByRole("button", { name: /Версия для компьютера/ });
  // the rows come under the points block once the profile has hydrated
  await deskRow.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  if (await deskRow.count()) {
    await deskRow.first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/desk"), { timeout: 20_000 });
    const after = (await page.context().cookies()).find((c) => c.name === "pulse_view");
    record("«Версия для компьютера» снимает cookie и ведёт на /desk", !after?.value, new URL(page.url()).pathname);
  } else {
    await page.context().clearCookies({ name: "pulse_view" });
    skip("«Версия для компьютера» в телефонном профиле", "строки ещё нет");
  }
}

async function phoneContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE_UA,
    locale: "ru-RU",
  });
}

async function desktopContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: DESKTOP_UA, locale: "ru-RU" });
}

async function runPhone(browser: Browser) {
  const context = await phoneContext(browser);
  const page = await context.newPage();
  watch(page, "phone");
  const shot = shooter(page, "phone");
  await login(page, DIRECTOR.email, DIRECTOR.password);
  await page.waitForTimeout(1000);
  record("телефон: директор после входа — на /pulse", new URL(page.url()).pathname === "/pulse", page.url());
  for (const path of ["/pulse", "/sent", "/settings"]) {
    await page.goto(`${APP_URL}${path}`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const at = new URL(page.url()).pathname;
    record(`телефон: ${path} открывается без перевода на /desk`, at === path, at);
    await shot(path.slice(1));
  }
  const surface = await page.evaluate(() => document.documentElement.dataset.surface ?? null);
  record("телефон: на <html> нет data-surface", surface === null, String(surface));

  // the bar lost «Настройки» and «Лаб» (D-153 §11); the profile leads to the desk and to the settings
  await page.goto(`${APP_URL}/profile`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const hrefs = await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  record("телефон: таб-бар директора — Пульс, Задачи, Календарь, Заметки, Экран, Профиль", hrefs.join(",") === "/pulse,/sent,/calendar,/notes,/screen,/profile", hrefs.join(","));
  const deskRow = await page.getByRole("button", { name: "Версия для компьютера" }).count();
  const address = (await page.getByTestId("desk-address").textContent())?.trim() ?? "";
  record("телефон: в профиле «Версия для компьютера» с адресом", deskRow === 1 && address.endsWith("/desk"), address);
  await page.screenshot({ path: join(OUT, "phone-profile.png"), fullPage: true });
  shots.push(join(OUT, "phone-profile.png"));

  // the calendar's sheet is still a bottom sheet: the first event, or «+»
  await page.goto(`${APP_URL}/calendar`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const plus = page.getByRole("button", { name: /Новое|Добавить|\+/ }).first();
  const event = page.locator("[data-event-id]").first();
  if (await event.count()) await event.click();
  else if (await plus.count()) await plus.click();
  const sheet = page.locator("[data-sheet]");
  const opened = await sheet.waitFor({ timeout: 6_000 }).then(() => true, () => false);
  if (opened) {
    await page.waitForTimeout(500);
    const box = await sheet.boundingBox();
    const bottom = box ? Math.round(box.y + box.height) : -1;
    record("телефон: шторка календаря — снизу, во всю ширину", Boolean(box && bottom >= 844 - 2 && box.width >= 380), box ? `низ=${bottom} ширина=${Math.round(box.width)}` : "нет");
    await shot("calendar-sheet");
    await page.keyboard.press("Escape");
  } else {
    record("телефон: шторка календаря открывается", false, "не нашёл события или «+»");
  }
  await context.close();
}

/** Safari's engine sends no `sec-ch-ua-mobile`: a Mac's user agent alone must land on the desk. */
async function runSafari() {
  let browser: Browser;
  try {
    browser = await webkit.launch({ headless: true });
  } catch (error) {
    skip("WebKit", `не запустился: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    return;
  }
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: SAFARI_UA, locale: "ru-RU" });
    const page = await context.newPage();
    watch(page, "safari");
    await login(page, DIRECTOR.email, DIRECTOR.password);
    await page.waitForURL((url) => url.pathname.startsWith("/desk"), { timeout: 20_000 }).catch(() => {});
    record("WebKit, Mac без подсказки — директор на /desk/today", new URL(page.url()).pathname === "/desk/today", page.url());
    // the first screen's reads finish before moving on: WebKit reports a fetch cut by a navigation as an error
    await page.locator("#desk-main").waitFor({ timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("link", { name: "Команда" }).click();
    await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 15_000 }).catch(() => undefined);
    await page.getByTestId("desk-row").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const rows = await page.getByTestId("desk-row").count();
    record("WebKit: «Команда» рисуется", rows > 0, `строк ${rows}`);
    await page.screenshot({ path: join(OUT, "safari-team.png") });
    shots.push(join(OUT, "safari-team.png"));
    await context.close();
  } finally {
    await browser.close();
  }
}

async function runSecretary(browser: Browser) {
  const context = await desktopContext(browser);
  const page = await context.newPage();
  watch(page, "secretary");
  try {
    await login(page, SECRETARY.email, SECRETARY.password);
  } catch (error) {
    skip("секретарь", `не вошла: ${error instanceof Error ? error.message : error}`);
    await context.close();
    return;
  }
  await page.waitForURL((url) => url.pathname.startsWith("/desk") || url.pathname === "/feed", { timeout: 20_000 }).catch(() => {});
  const home = new URL(page.url()).pathname;
  if (home === "/feed" || !home.startsWith("/desk")) {
    skip("секретарь", `${SECRETARY.email} — не секретарь на dev (дом ${home})`);
    await context.close();
    return;
  }
  record("секретарь: после входа — /desk/errands", home === "/desk/errands", home);
  await page.goto(`${APP_URL}/desk`, { waitUntil: "load" });
  await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 15_000 }).catch(() => {});
  record("секретарь: /desk → /desk/errands", new URL(page.url()).pathname === "/desk/errands", page.url());
  await page.goto(`${APP_URL}/desk/tasks`, { waitUntil: "load" });
  await page.waitForURL((url) => url.pathname === "/desk/errands", { timeout: 15_000 }).catch(() => {});
  record("секретарь: /desk/tasks уводит на /desk/errands", new URL(page.url()).pathname === "/desk/errands", page.url());
  const nav = await page.getByRole("navigation", { name: "Разделы" }).getByRole("link").count();
  record("секретарь: в навигации пять разделов и профиль", nav === 6, `ссылок ${nav}`);

  // a phone sheet inside the desk is a centred dialog: «Посетитель» over every screen — opened, looked at, closed
  const visitor = page.getByTestId("visitor-button");
  if (await visitor.count()) {
    await visitor.click();
    const sheet = page.locator("[data-sheet]");
    await sheet.waitFor({ timeout: 5_000 });
    await page.waitForTimeout(400);
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize();
    const centred = Boolean(box && viewport && box.y > 40 && box.y + box.height < viewport.height - 40 && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4);
    record("шторка в десктопе — диалог по центру («Посетитель» секретаря)", centred, box ? `x=${Math.round(box.x)} y=${Math.round(box.y)} w=${Math.round(box.width)} h=${Math.round(box.height)}` : "нет");
    await page.screenshot({ path: join(OUT, "secretary-sheet-as-dialog.png") });
    shots.push(join(OUT, "secretary-sheet-as-dialog.png"));
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached", timeout: 5_000 });
  } else skip("шторка в десктопе — диалог по центру", "нет кнопки «Посетитель»");

  // «G» and her letters: «G K» — «Команда»; «G I» («Разобрать») is no section of hers and leaves the screen be
  await page.locator("#desk-main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("KeyG");
  await page.keyboard.press("KeyK");
  const team = await page.waitForURL((url) => url.pathname === "/desk/team", { timeout: 15_000 }).then(() => true, () => false);
  await page.locator("#desk-main").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await page.keyboard.press("KeyG");
  await page.keyboard.press("KeyI");
  await page.waitForTimeout(800);
  record("секретарь: «G K» — «Команда», «G I» никуда не ведёт", team && new URL(page.url()).pathname === "/desk/team", new URL(page.url()).pathname);
  await page.goto(`${APP_URL}/desk/errands`, { waitUntil: "load" });
  await checkSecretary({ page, stamp: "", shot: shooter(page, "secretary"), quiet: true });
  await context.close();
}

async function main() {
  const quiet = await ownerActive();
  if (quiet) console.log("dev: в последние 10 минут была активность — запись (заметка) будет пропущена");
  const stamp = Date.now().toString(36);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    // ---- 1. director on a computer -------------------------------------------------------------
    const context = await desktopContext(browser);
    const page = await context.newPage();
    watch(page, "director");
    await login(page, DIRECTOR.email, DIRECTOR.password);
    await page.waitForURL((url) => url.pathname === "/desk/today", { timeout: 20_000 }).catch(() => {});
    record("директор на компьютере после входа — «Сегодня» /desk/today", new URL(page.url()).pathname === "/desk/today", page.url());
    await page.goto(`${APP_URL}/sent`, { waitUntil: "load" });
    await page.waitForURL((url) => url.pathname === "/desk/tasks", { timeout: 15_000 }).catch(() => {});
    record("телефонный адрес /sent на компьютере → /desk/tasks", new URL(page.url()).pathname === "/desk/tasks", page.url());
    await page.locator("#desk-main").waitFor({ timeout: 20_000 });
    const surface = await page
      .waitForFunction(() => document.documentElement.dataset.surface === "desk", undefined, { timeout: 10_000 })
      .then(() => "desk", () => page.evaluate(() => document.documentElement.dataset.surface ?? null));
    record("на <html> — data-surface=desk", surface === "desk", String(surface));

    const ctx: Ctx = { page, stamp, shot: shooter(page, "director"), quiet };
    for (const [name, check] of [
      ["tasks", checkTasks],
      ["team", checkTeam],
      ["errands", checkErrands],
      ["reports", checkReports],
      ["calendar", checkCalendar],
      ["notes", checkNotes],
      ["screen", checkScreen],
      ["settings", checkSettings],
    ] as const) {
      if (!runs(name)) continue;
      try {
        await check(ctx);
      } catch (error) {
        record(`check ${name}`, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
        await ctx.shot(`${name}-failed`).catch(() => {});
      }
    }
    if (runs("shell")) {
      try {
        await checkShell(ctx);
      } catch (error) {
        record("оболочка", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
        await ctx.shot("shell-failed").catch(() => {});
      }
    }
    await context.close();

    // ---- 2. the phone did not change ------------------------------------------------------------
    if (runs("phone")) await runPhone(browser);

    // ---- 3. the secretary --------------------------------------------------------------------
    if (runs("secretary")) await runSecretary(browser);

    // ---- 4. Safari's engine ------------------------------------------------------------------
    if (runs("safari")) await runSafari();
  } finally {
    await browser.close();
  }

  record("ошибок страницы и console.error — 0", errors.length === 0, errors.length ? `${errors.length}` : "");
  for (const line of errors) console.log(`  ${line}`);
  if (signInNoise.length) {
    console.log(`экран входа до входа (не десктоп): ${signInNoise.length}`);
    for (const line of new Set(signInNoise)) console.log(`  ${line}`);
  }
  console.log(`\nскриншоты (${shots.length}): ${OUT}`);
  for (const path of shots) console.log(`  ${path}`);
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
  process.exit(failed.length ? 1 : 0);
}

void main();
