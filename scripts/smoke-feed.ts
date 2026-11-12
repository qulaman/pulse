/**
 * Лента of an employee (D-62, D-110, D-167) in a real browser (system Chrome via Playwright) against
 * the dev server — with NOTHING written to the database: every write the screen would make (receipts
 * «увидел», reads, accepts, answers, the daily report) is answered in the browser before it leaves,
 * and the reads of the board, Эфир and the calendar are replaced by one working day. So it runs any
 * time, next to live people on dev, and sees the same day every time.
 *
 * The day: a new order, a rework, an overdue one, a director's unread word, one in work, one on
 * review; an announcement not yet acknowledged; a meeting in 40 minutes the person is invited to.
 * It runs at 11:00 by the screen's own clock, so the evening report never adds to the counts. With
 * orders waiting Лента opens with «Дела» up; put away, the card stays down at rest, the face speaks and
 * the button under it says where a tap leads; a touch on the card over the face opens «Дела» for good
 * (D-173).
 *   pnpm smoke:feed            (against http://localhost:3000, APP_URL to override)
 *   EMPLOYEE=erlan.b@demo.local (default) — any demo employee with the demo password
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui/feed).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page, type Route } from "playwright";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "feed");
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
/** The phone the screen is made for; a desktop browser is sent to /desk by the proxy. */
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
/** RPCs that only read; every other RPC writes and is answered here. */
const READ_RPC = new Set(["fn_rating", "push_health", "my_daily_report", "my_daily_report_history"]);

mkdirSync(SHOTS, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

// ---- one working day, in the shapes the screen reads -----------------------------------------

type Row = Record<string, unknown>;
/** Aqtobe is UTC+5 all year: «today» and «17:30» are read on that wall clock. */
const AQTOBE_MS = 5 * 3_600_000;

function day(meId: string, companyId: string, { at = Date.now(), evening = false }: { at?: number; evening?: boolean } = {}) {
  const iso = (minutesFromNow: number) => new Date(at + minutesFromNow * 60_000).toISOString();
  const ymd = new Date(at + AQTOBE_MS).toISOString().slice(0, 10);
  const boss = "00000000-0000-0000-0000-00000000b055";
  const bossName = { full_name: "Тимур Сапаров" };
  const meName = { full_name: "Сотрудник Смоук" };
  const task = (n: number, title: string, status: string, extra: Row = {}): Row => ({
    id: `5e000000-0000-0000-0000-00000000000${n}`,
    company_id: companyId,
    author_id: boss,
    assignee_id: meId,
    parent_task_id: null,
    group_id: null,
    title,
    body: null,
    deadline: null,
    priority: "normal",
    status,
    source: "voice",
    source_audio_path: null,
    source_transcript: null,
    scheduled_send_at: null,
    recurrence_rule_id: null,
    accepted_at: null,
    completed_at: null,
    closed_at: null,
    created_at: iso(-180),
    updated_at: iso(-30),
    passed_to: null,
    recurrence_on: null,
    notes: [],
    last: [],
    reads: [],
    assignee: meName,
    author: bossName,
    passed: null,
    ...extra,
  });
  const word = task(4, "Пропуска для проверяющих на пятницу", "accepted", {
    deadline: iso(60 * 50),
    accepted_at: iso(-300),
    last: [{ id: "5e0000m3", content: "Сколько человек будет? Нужны паспорта всех", type: "text", sender_id: boss, seq: 3, created_at: iso(-25) }],
    reads: [{ last_seq: 2 }],
  });
  // the evening: nothing new, nothing burning, nothing unread — only orders in work and the report
  const tasks = evening
    ? [
        task(5, "Заказать каски и жилеты на объект", "accepted", { deadline: iso(60 * 72), accepted_at: iso(-60 * 20) }),
        task(6, "Фото фасада после покраски", "pending_review", { deadline: iso(180), accepted_at: iso(-480), completed_at: iso(-50) }),
      ]
    : [
        task(1, "Проверить счета от «Казхрома» и отдать в бухгалтерию", "sent", { deadline: iso(240), created_at: iso(-12), updated_at: iso(-12), priority: "high" }),
        task(2, "Смета по складу №2 — добавить доставку", "rework", { deadline: iso(60 * 26), accepted_at: iso(-60 * 26) }),
        task(3, "Акт сверки с «Актобе-Энерго»", "accepted", { deadline: iso(-95), accepted_at: iso(-60 * 30) }),
        word,
        task(5, "Заказать каски и жилеты на объект", "accepted", { deadline: iso(60 * 72), accepted_at: iso(-60 * 20) }),
        task(6, "Фото фасада после покраски", "pending_review", { deadline: iso(180), accepted_at: iso(-480), completed_at: iso(-50) }),
      ];
  const message = (seq: number, from: string, content: string, minutes: number): Row => ({
    id: `5e0000m${seq}`,
    task_id: word.id,
    company_id: companyId,
    sender_id: from,
    type: "text",
    content,
    meta: {},
    seq,
    file_path: null,
    created_at: iso(minutes),
    sender: from === boss ? bossName : meName,
  });
  const thread = [
    message(1, boss, "Сделай пропуска для проверяющих к пятнице", -300),
    message(2, meId, "Принял, сегодня закажу", -240),
    message(3, boss, "Сколько человек будет? Нужны паспорта всех", -25),
  ];
  const announcements = [
    { id: "5e0000a1", company_id: companyId, author_id: boss, audio_path: null, created_at: iso(-70), transcript: "Всем: завтра в 9:00 планёрка в большом зале, без опозданий.", author: bossName, acks: [] },
  ];
  const events = [
    {
      id: "5e0000c1",
      company_id: companyId,
      author_id: boss,
      title: "Планёрка по объекту «Береке»",
      body: null,
      location: "Кабинет директора",
      starts_at: iso(40),
      ends_at: iso(100),
      remind_before_min: 30,
      everyone: false,
      reminded_at: null,
      cancelled_at: null,
      audio_path: null,
      source_transcript: null,
      inbox_item_id: null,
      created_at: iso(-600),
      updated_at: iso(-600),
      recurrence_rule_id: null,
      recurrence_on: null,
      participants: [
        { person: bossName, reason: null as string | null, status: "going", user_id: boss, event_id: "5e0000c1", created_at: iso(-600), responded_at: iso(-600) as string | null },
        { person: meName, reason: null as string | null, status: "invited", user_id: meId, event_id: "5e0000c1", created_at: iso(-600), responded_at: null as string | null },
      ],
    },
  ];
  // today's report as `my_daily_report` hands it: a working day, one task handed in, not submitted
  const report = {
    date: ymd,
    today: true,
    workday: true,
    holiday: false,
    enabled: true,
    report: null as Row | null,
    tasks: [{ id: "5e000000-0000-0000-0000-000000000006", title: "Фото фасада после покраски", status: "pending_review", completed_at: iso(-50), closed_at: null, on_time: true }],
    suggest: { arrived_at: `${ymd}T09:00:00+05:00`, left_at: new Date(at).toISOString() },
    points: { enabled: true, reward: 1, penalty: 0 },
  };
  return {
    at,
    meId,
    tasks,
    thread,
    announcements: evening ? [] : announcements,
    events: evening ? [] : events,
    report,
  };
}

// ---- the browser: writes answered locally, reads replaced by the day -------------------------

async function guard(context: BrowserContext, blocked: string[], data: () => ReturnType<typeof day> | null) {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const app = url.origin === new URL(APP_URL).origin;
    if (app && path.startsWith("/api/") && !path.startsWith("/api/auth/") && (method !== "GET" || /^\/api\/push\/(seen|kick|badge|subscribe)/.test(path))) {
      blocked.push(`${method} ${path}`);
      const today = data();
      // an order's move stays in the day: the next read of the board sees it, as after a real send
      const moved = /^\/api\/tasks\/([^/]+)\/transition$/.exec(path);
      if (moved && today) {
        const args = (request.postDataJSON() ?? {}) as { to_status?: string };
        const row = today.tasks.find((task) => task.id === moved[1]);
        if (row && args.to_status) Object.assign(row, { status: args.to_status, updated_at: new Date().toISOString() });
      }
      // the report handed in: what `submit_daily_report` would answer
      if (path === "/api/daily-report" && today) {
        const args = (request.postDataJSON() ?? {}) as { arrived_at?: string; left_at?: string; summary?: string };
        const now = args.left_at ?? new Date(today.at).toISOString();
        today.report.report = {
          id: "5e0000r1",
          user_id: today.meId,
          report_date: today.report.date,
          status: "submitted",
          arrived_at: args.arrived_at ?? null,
          left_at: args.left_at ?? null,
          summary: args.summary ?? "",
          tasks: today.report.tasks,
          submitted_at: now,
          updated_at: now,
          points: 1,
        };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ report: today.report.report, points_awarded: 1 }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (path === "/rest/v1/rpc/my_daily_report" && data()) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data()!.report) });
    }
    if (path.startsWith("/rest/v1/rpc/") && !READ_RPC.has(path.split("/").pop() ?? "")) {
      const name = path.split("/").pop();
      blocked.push(`rpc ${name}`);
      // the answer stays in the day as the server would keep it: the next read of the calendar sees it
      const today = data();
      if (name === "respond_event" && today) {
        const args = (request.postDataJSON() ?? {}) as { p_event?: string; p_status?: string; p_reason?: string };
        const event = today.events.find((row) => row.id === args.p_event);
        const mine = event?.participants.find((person) => person.user_id === today.meId);
        if (mine) Object.assign(mine, { status: args.p_status, reason: args.p_reason ?? null, responded_at: new Date().toISOString() });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    }
    if (path.startsWith("/rest/v1/") && !path.startsWith("/rest/v1/rpc/") && method !== "GET" && method !== "HEAD") {
      blocked.push(`${method} ${path}`);
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    if (path.startsWith("/auth/v1/") && method !== "GET" && !path.includes("/token")) {
      blocked.push(`${method} ${path}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    const today = data();
    const single = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (today && method === "GET" && path.startsWith("/rest/v1/") && !single) {
      const table = path.split("/").pop();
      const replaced =
        table === "tasks"
          ? today.tasks
          : table === "task_messages"
            ? today.thread
                .filter((m) => `eq.${m.task_id}` === url.searchParams.get("task_id"))
                .sort((a, b) => ((url.searchParams.get("order") ?? "").includes("desc") ? Number(b.seq) - Number(a.seq) : Number(a.seq) - Number(b.seq)))
            : table === "announcements"
              ? today.announcements
              : table === "events"
                ? today.events
                : undefined;
      if (replaced !== undefined) {
        const response = await route.fetch();
        return route.fulfill({ response, body: JSON.stringify(replaced), headers: { ...response.headers(), "content-type": "application/json" } });
      }
    }
    return route.fallback();
  });
}

async function signIn(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  const byMail = page.getByText("Войти по почте и паролю");
  if (await byMail.count()) await byMail.click();
  await page.getByLabel("Почта").fill(EMPLOYEE);
  await page.getByLabel("Пароль").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

/**
 * 17:30 on a working day, by the screen's own clock: nothing new, only orders in work, the report
 * not in. The face calls for it, a tap opens «Дела» with the report on top, «Сдать» hands it in.
 */
async function evening(context: BrowserContext, me: { userId: string; companyId: string }, blocked: string[]) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
  const wall = new Date(Date.now() + AQTOBE_MS).toISOString().slice(0, 10);
  const at = new Date(`${wall}T17:30:00+05:00`).getTime();
  await page.clock.install({ time: at });
  evening.today = day(me.userId, me.companyId, { at, evening: true });
  await page.goto(`${APP_URL}/feed`, { waitUntil: "networkidle" });
  const face = page.locator('[data-testid="mascot-lever"]').first();
  await face.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await shot("06-evening-rest");
  record("вечером несданный отчёт — лицо зовёт", (await page.locator('[data-testid="mascot-lever"] svg.mascot').first().getAttribute("data-state")) === "calling");
  await face.click();
  await page.waitForTimeout(1300);
  await shot("07-evening-tap");
  const card = page.locator('[data-testid="panel-card"]');
  record("с делами в руках тап по лицу открывает «Дела»", (await card.getAttribute("data-panel")) === "tasks");
  // in work in time is not the person's move, and the report adds nothing to the number the tab's badge
  // shows too — it lights the ball instead (D-173)
  const tasksBall = page.locator('[data-testid="orbit-ball"][data-ball="tasks"]').first();
  const ball = await tasksBall.getAttribute("aria-label");
  const quiet = await tasksBall.getAttribute("data-quiet");
  record("вечером шарик «Дела» без числа, но не серый — зовёт к отчёту", ball === "Дела: 0" && quiet === "0", `${ball}, quiet ${quiet}`);
  record("слова говорят, что отчёт не сдан", (await page.locator('[data-testid="assistant-line"]').allInnerTexts()).some((text) => text.includes("Отчёт за день ещё не сдан")));
  const submit = card.getByRole("button", { name: "Сдать" }).first();
  record("в «Делах» первым — отчёт со «Сдать»", await submit.isVisible());
  const row = card.locator('[data-testid="report-due-row"], [data-testid^="report-due"]').first();
  const before = await row.boundingBox();
  // two taps in a row, as a thumb in a hurry does: the report goes once (principle 7)
  await submit.dblclick();
  await page.waitForTimeout(1200);
  record("двойной тап по «Сдать» — одна отправка", blocked.filter((call) => call === "POST /api/daily-report").length === 1);
  const after = await row.boundingBox();
  record("после «Сдать» строка отчёта не уезжает из-под пальца", Boolean(before && after && Math.abs(before.y - after.y) < 4), `${Math.round(before?.y ?? -1)} → ${Math.round(after?.y ?? -1)}`);
  await shot("08-evening-submitted");
  record("отчёт сдан одной кнопкой", (await card.innerText()).includes("Сдан в 17:3"));
  record("вечер без ошибок страницы", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}
evening.today = null as ReturnType<typeof day> | null;

/**
 * 17:30 again, on the small phone (360×780), with one new order (D-173): Лента opens with «Дела» up,
 * the report row stays under the order, «Принял» is above the tab bar; after «Принял» on the last
 * order the row does not jump to the top — its place was decided when the card opened.
 */
async function eveningOrder(context: BrowserContext, me: { userId: string; companyId: string }) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 780 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
  const wall = new Date(Date.now() + AQTOBE_MS).toISOString().slice(0, 10);
  const at = new Date(`${wall}T17:30:00+05:00`).getTime();
  await page.clock.install({ time: at });
  const today = day(me.userId, me.companyId, { at, evening: true });
  today.tasks.unshift(day(me.userId, me.companyId, { at }).tasks[0]!);
  evening.today = today;
  await page.goto(`${APP_URL}/feed`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="mascot-lever"]').first().waitFor({ timeout: 20_000 });
  const card = page.locator('[data-testid="panel-card"]');
  await card.waitFor({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot("09-evening-order-360");
  record("вечером с новым поручением «Дела» подняты сами", (await card.getAttribute("data-panel").catch(() => null)) === "tasks");
  const order = card.locator("article").filter({ hasText: "Казхрома" }).first();
  const row = card.locator('[data-testid^="report-due"]').first();
  const accept = order.getByRole("button", { name: "Принял" });
  const nav = await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox();
  const [orderBox, rowBox, acceptBox] = [await order.boundingBox(), await row.boundingBox(), await accept.boundingBox()];
  record("отчёт за день — под поручением, не над ним", Boolean(orderBox && rowBox && rowBox.y > orderBox.y), `поручение y${Math.round(orderBox?.y ?? -1)}, отчёт y${Math.round(rowBox?.y ?? -1)}`);
  record(
    "«Принял» на 360×780 — над таб-баром",
    Boolean(acceptBox && nav && acceptBox.y + acceptBox.height <= nav.y),
    `«Принял» ${Math.round(acceptBox?.y ?? -1)}–${Math.round((acceptBox?.y ?? 0) + (acceptBox?.height ?? 0))}, таб-бар с ${Math.round(nav?.y ?? -1)}`,
  );
  await accept.click();
  await page.waitForTimeout(1500);
  await shot("10-evening-order-accepted");
  const [firstBox, rowAfter] = [await card.locator("article").first().boundingBox(), await row.boundingBox()];
  record("после «Принял» на последнем поручении отчёт не прыгает наверх", Boolean(firstBox && rowAfter && rowAfter.y > firstBox.y), `первая карточка y${Math.round(firstBox?.y ?? -1)}, отчёт y${Math.round(rowAfter?.y ?? -1)}`);
  record("вечер с поручением без ошибок страницы", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    userAgent: IPHONE_UA,
    serviceWorkers: "block",
  });
  const blocked: string[] = [];
  let today: ReturnType<typeof day> | null = null;
  let who: { userId: string; companyId: string } | null = null;
  await guard(context, blocked, () => evening.today ?? today);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // Chrome's notice that a vibration came before the page's first touch (a face's act right after a
    // reload, D-119): the phone simply stays still — the browser's rule, not a fault of the page
    if (message.type() === "error" && !/401|Failed to load resource|Blocked call to navigator\.vibrate/.test(message.text())) errors.push(message.text().slice(0, 300));
  });
  const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });
  // 11:00 of a working day by the screen's own clock: the evening report (from 17:00) adds nothing
  const morning = new Date(`${new Date(Date.now() + AQTOBE_MS).toISOString().slice(0, 10)}T11:00:00+05:00`).getTime();
  await page.clock.install({ time: morning });
  const mode = () => page.locator("main[data-board]").getAttribute("data-mode");

  try {
    await signIn(page);
    // who the screen belongs to, read from the screen's own session
    const me = await page.evaluate(async () => {
      const response = await fetch("/api/me");
      if (!response.ok) return null;
      const body = (await response.json()) as { profile?: { userId?: string; companyId?: string } };
      return body.profile ?? null;
    });
    record("вход сотрудником", Boolean(me?.userId && me?.companyId), EMPLOYEE);
    if (!me?.userId || !me.companyId) throw new Error("no session");
    who = { userId: me.userId, companyId: me.companyId };
    today = day(me.userId, me.companyId, { at: morning });

    await page.goto(`${APP_URL}/feed`, { waitUntil: "networkidle" });
    const face = page.locator('[data-testid="mascot-lever"]').first();
    await face.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1300);
    await shot("01-load");
    record("экран не упал", (await page.getByText("Что-то пошло не так").count()) === 0);

    // orders wait for the person's move: Лента opens with «Дела» up, no tap (D-173), the newest on top
    const card = page.locator('[data-testid="panel-card"]');
    record("новые поручения ждут — «Дела» подняты без тапа", (await mode()) === "panel" && (await card.getAttribute("data-panel")) === "tasks");
    const tasksBall = page.locator('[data-testid="orbit-ball"][data-ball="tasks"]').first();
    // one number for «Дела» (D-173): new + rework + overdue — the tab's badge counts the same
    record("шарик «Дела» — 3: новая, доработка, просроченная", (await tasksBall.getAttribute("aria-label")) === "Дела: 3", (await tasksBall.getAttribute("aria-label")) ?? "");
    const box = await card.boundingBox();
    record("карточка занимает больше половины экрана", Boolean(box && box.height > 852 / 2), box ? `${Math.round(box.height)} px` : "");
    record("первая — новая задача", (await card.locator("article").first().innerText()).includes("Казхрома"));
    const words = await page.locator('[data-testid="assistant-line"]').allInnerTexts();
    record("над открытой карточкой — не больше двух строк слов", words.length <= 2, words.join(" / "));
    record("слова называют то, что ждёт", words.some((text) => text.startsWith("Ждут вас:")));

    // «Принял»: the card's copy flies into the face's hands, the card itself is already in work
    const accept = card.getByRole("button", { name: "Принял" }).first();
    await accept.click();
    const flew = await page
      .locator("[data-fly-layer]")
      .first()
      .waitFor({ state: "attached", timeout: 400 })
      .then(() => true)
      .catch(() => false);
    record("«Принял» — копия карточки летит в лицо", flew);
    await page.waitForTimeout(900);
    record("сама карточка уже «В работе»", (await card.locator("article").filter({ hasText: "Казхрома" }).first().innerText()).includes("Выполнено"));
    record("переход ушёл одним вызовом (перехвачен)", blocked.filter((call) => call.endsWith("/transition")).length === 1);
    await shot("02b-accepted");

    // into a task and back: the same card is open, not the face at rest
    await card.locator("a[href^='/tasks/5e']").first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/tasks/"), { timeout: 15_000 });
    await page.goBack();
    await page.locator('[data-testid="panel-card"]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    record("после задачи и назад — «Дела» снова открыты", (await card.getAttribute("data-panel")) === "tasks");

    // scroll «Дела», then «Сообщения»: the word of the director is at the top, not scrolled away
    await card.locator(".overflow-y-auto").first().evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
    await page.waitForTimeout(300);
    await page.locator('[data-testid="orbit-ball"][data-ball="messages"]').first().click({ force: true });
    await page.waitForTimeout(1100);
    await shot("03-messages");
    const scrolled = await card.locator(".overflow-y-auto").first().evaluate((node) => node.scrollTop);
    record("другой шарик открывает раздел с начала", scrolled === 0, `scrollTop ${scrolled}`);
    record("слово директора видно", await page.getByText("Сколько человек будет?").first().isVisible());

    // the grip sends the card down, the balls orbit again
    const grip = page.locator('[data-testid="panel-grip"]');
    const g = await grip.boundingBox();
    if (g) {
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + i * 18);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(900);
    }
    // the card slides down under the screen's own clock (installed above): give the exit its time
    await card.waitFor({ state: "detached", timeout: 3_000 }).catch(() => {});
    // the grip puts the card away to rest, not to the balls (D-173): the words and the way back are there
    await page.waitForTimeout(1600);
    const goAfterGrip = await page.locator('[data-testid="face-go"]').innerText().catch(() => "");
    record("рывок за ручку убирает карточку — в покой, с «Открыть дела ›»", (await card.count()) === 0 && (await mode()) === "idle" && goAfterGrip.includes("Открыть дела"), `${await mode()}, карточек ${await card.count()}, кнопка «${goAfterGrip}»`);
    await shot("04-grip-rest");

    // at rest (D-173): the card put away stays down, the face says the greeting and the line that
    // matters most, and a real button under it names where a tap leads
    await page.waitForTimeout(1000);
    await shot("04b-rest");
    record("убранная карточка сама не поднимается", (await mode()) === "idle" && (await card.count()) === 0, (await mode()) ?? "");
    const restWords = await page.locator('[data-testid="assistant-line"]').allInnerTexts();
    record("в покое лицо говорит: приветствие и главное", restWords.length >= 1 && restWords.length <= 2 && restWords[0].includes("на доработке"), restWords.join(" / "));
    const go = page.locator('[data-testid="face-go"]');
    const goBox = await go.boundingBox();
    const faceBox = await face.boundingBox();
    record(
      "под лицом — кнопка «Открыть дела ›» не ниже 44 px",
      (await go.innerText()).includes("Открыть дела") && Boolean(goBox && goBox.height >= 44 && faceBox && goBox.y >= faceBox.y + faceBox.height - 4 && goBox.y - (faceBox.y + faceBox.height) < 40),
      goBox && faceBox ? `${Math.round(goBox.height)} px, ${Math.round(goBox.y - (faceBox.y + faceBox.height))} px под лицом` : "нет кнопки",
    );
    // a reload is the same visit: the orders put away do not raise the card again
    await page.reload({ waitUntil: "networkidle" });
    await face.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    record("после перезагрузки убранные дела карточку не поднимают", (await mode()) === "idle" && (await card.count()) === 0, (await mode()) ?? "");

    // a touch on the card the face holds up over its head opens «Дела» and leaves it open: no click
    // after the touch lands on the ball that slid under the finger (D-173)
    const prop = await page.locator('[data-prop="call-card"]').first().boundingBox();
    if (prop) await page.touchscreen.tap(prop.x + prop.width / 2, prop.y + prop.height / 2);
    await page.waitForTimeout(1600);
    await shot("04c-prop-touch");
    record("тап по карточке над лицом открыл «Дела», и они открыты", Boolean(prop) && (await mode()) === "panel" && (await card.getAttribute("data-panel")) === "tasks", prop ? (await mode()) ?? "" : "нет карточки над лицом");
    // and at the very top edge of the face's button, where the ball's row slides in under the finger
    await face.click();
    await page.waitForTimeout(900);
    await face.click();
    await page.waitForTimeout(1500);
    const edge = await face.boundingBox();
    if (edge) await page.touchscreen.tap(edge.x + edge.width / 2 + 10, edge.y + 2);
    await page.waitForTimeout(1600);
    record("тап по верхнему краю лица открыл «Дела», и они открыты", (await mode()) === "panel" && (await card.getAttribute("data-panel")) === "tasks", (await mode()) ?? "");

    // the invitation is answered in its row: «Буду» in one tap, the row says so quietly
    const calendarBall = page.locator('[data-testid="orbit-ball"][data-ball="calendar"]').first();
    record("шарик «Календарь» считает приглашение", ((await calendarBall.getAttribute("aria-label")) ?? "").endsWith(": 1"));
    await calendarBall.click({ force: true });
    await page.waitForTimeout(1100);
    const going = page.locator('[data-testid="invite-going"]').first();
    record("у приглашения «Буду / Не смогу» прямо в строке", (await going.isVisible()) && (await page.locator('[data-testid="invite-declined"]').first().isVisible()));
    await going.click();
    await page.waitForTimeout(700);
    await shot("05-invite");
    record("после «Буду» строка тихо говорит ответ", ((await page.locator('[data-testid="invite-said"]').first().innerText().catch(() => "")) ?? "").includes("Буду"));
    record("ответ ушёл одним вызовом (перехвачен)", blocked.filter((call) => call === "rpc respond_event").length === 1);

    // a new order raises the card again (D-173): it arrives, the screen reads the day anew
    const fresh = day(me.userId, me.companyId, { at: morning }).tasks[0]!;
    today.tasks.push({ ...fresh, id: "5e000000-0000-0000-0000-000000000007", title: "Забрать накладные со склада" });
    await page.reload({ waitUntil: "networkidle" });
    await face.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    await shot("05b-new-order");
    record("новое поручение снова поднимает «Дела»", (await mode()) === "panel" && (await card.getAttribute("data-panel")) === "tasks" && (await card.innerText()).includes("Забрать накладные"), (await mode()) ?? "");

    record("в базу ничего не ушло, кроме перехваченного", true, [...new Set(blocked)].join(", ") || "ничего не пытались писать");
    record("без ошибок страницы", errors.length === 0, errors.slice(0, 3).join(" | "));
  } catch (error) {
    record("сценарий дошёл до конца", false, error instanceof Error ? error.message : String(error));
    await shot("99-fail").catch(() => {});
  }

  try {
    if (!who) throw new Error("the day pass found nobody");
    await evening(context, who, blocked);
  } catch (error) {
    record("вечер дошёл до конца", false, error instanceof Error ? error.message : String(error));
  }

  try {
    if (!who) throw new Error("the day pass found nobody");
    await eveningOrder(context, who);
  } catch (error) {
    record("вечер с поручением дошёл до конца", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} проверок Ленты прошли`);
  process.exit(failed.length ? 1 : 0);
}

void main();
