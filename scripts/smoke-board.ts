/**
 * Live-board smoke in a real browser (system Chrome via Playwright): the director
 * keeps /pulse open while an employee acts through the RPCs, and every change must
 * land on the board as a recoloured tile — no reload, no refetch on the hot path.
 * Measures the latency from the employee's call to the painted tile.
 *   pnpm smoke:board            (against http://localhost:3000, APP_URL to override)
 * Talks to the dev project with the demo accounts; creates its own task («Board smoke …»)
 * and touches nothing else. Refuses to run while somebody else is active on dev
 * (FORCE=1 overrides). Screenshots land in SHOTS_DIR (default ./.smoke-ui/board).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "board");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "demo1234";
/** What «мгновенно» means here: the employee's call is answered and the tile has changed within this. */
const LATENCY_LIMIT_MS = Number(process.env.BOARD_LATENCY_MS ?? "1500");
const WAIT_MS = 10_000;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.local");
  process.exit(1);
}

mkdirSync(SHOTS, { recursive: true });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

type Session = { supabase: SupabaseClient; userId: string };

async function signIn(email: string, password = PASSWORD): Promise<Session> {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, userId: data.session.user.id };
}

/** dev is shared with the owner: their live session must not be disturbed by a scripted one. */
async function guardActivity() {
  if (!SERVICE_KEY || process.env.FORCE === "1") return;
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const voice = await admin.from("ai_logs").select("id").eq("source", "voice").gt("created_at", since).limit(1);
  const touched = await admin.from("tasks").select("title").gt("updated_at", since).not("title", "ilike", "Board smoke%").limit(3);
  const busy = (voice.data?.length ?? 0) > 0 || (touched.data?.length ?? 0) > 0;
  if (busy) {
    console.error(`somebody is active on dev in the last 30 min (${touched.data?.map((t) => t.title).join("; ") || "voice"}); set FORCE=1 to run anyway`);
    process.exit(2);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

const tile = (page: Page, taskId: string) => page.locator(`[data-testid="board-tile"][data-task-id="${taskId}"]`);

/** Waits for the tile to carry the attribute value; returns the wall-clock latency from `from`. */
async function until(page: Page, taskId: string, attr: "data-lane" | "data-status", value: string, from: number): Promise<number | null> {
  try {
    await page.locator(`[data-testid="board-tile"][data-task-id="${taskId}"][${attr}="${value}"]`).first().waitFor({ state: "attached", timeout: WAIT_MS });
    return Date.now() - from;
  } catch {
    return null;
  }
}

async function assistantSays(page: Page): Promise<string> {
  return (await page.locator('[data-testid="assistant-line"]').last().textContent().catch(() => "")) ?? "";
}

async function main() {
  await guardActivity();
  // the same person as in the browser: only the task author's reply closes a question (trigger 3)
  const director = await signIn("test@demo.local", "1");
  const marat = await signIn("marat@demo.local");

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  // a tablet width: the board (tiles in lanes) is what this smoke reads; the phone gets the deck (D-60)
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
  const page = await context.newPage();
  // a thrown render or a failed request shows up here, next to the check it broke
  page.on("pageerror", (error) => console.log(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`console error: ${message.text().slice(0, 300)}`);
  });
  try {
    await login(page, "test@demo.local", "1");
    await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="assistant-line"]').first().waitFor({ timeout: 15_000 });
    // the Realtime listener attaches a moment after SUBSCRIBED; a change fired earlier is caught by the settle snapshot only
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: join(SHOTS, "b0-open.png") });
    const opening = await assistantSays(page);
    record("открытие: ассистент здоровается и даёт сводку", /^Добр/.test(opening), opening);

    // ---- a new task lands on the board without a reload ------------------------------
    const stamp = Date.now().toString(36);
    const title = `Board smoke ${stamp}`;
    const t0 = Date.now();
    const confirmed = await director.supabase.rpc("confirm_voice_batch", {
      payload: {
        source: "typed",
        transcript: title,
        confirmed_entities: [{ kind: "task", assignee_id: marat.userId, group_id: null, title, body: null, deadline_iso: null, priority: "normal", scheduled_send_at: null }],
        was_edited: false,
        edit_fields: [],
        force_now: true,
      },
      client_request_id: randomUUID(),
    });
    const taskId = ((confirmed.data as { task_ids?: string[] } | null)?.task_ids ?? [])[0];
    record("директор: задача создана через RPC", Boolean(taskId), confirmed.error?.message ?? `task=${taskId}`);
    if (!taskId) throw new Error("no task — cannot continue");

    // the calm lane may be folded while something needs the director — open it for the smoke
    const workRow = page.getByRole("button", { name: /^В работе/ });
    const appeared = await until(page, taskId, "data-lane", "work", t0);
    if (appeared === null && (await workRow.isVisible().catch(() => false)) && (await workRow.getAttribute("aria-expanded")) !== "true") {
      await workRow.click();
    }
    const shown = appeared ?? (await until(page, taskId, "data-lane", "work", t0));
    record("новая задача появилась на доске без перезагрузки", shown !== null, shown === null ? "timeout" : `${shown} ms after the call (INSERT → one coalesced refetch)`);
    await page.screenshot({ path: join(SHOTS, "b1-new.png") });

    // ---- accepted: patched from the payload, the assistant comments ---------------------
    const t1 = Date.now();
    const accepted = await marat.supabase.rpc("transition_task", { task_id: taskId, to_status: "accepted", payload: {}, client_request_id: randomUUID() });
    record("марат: принял", !accepted.error, accepted.error?.message ?? "ok");
    const acceptedIn = await until(page, taskId, "data-status", "accepted", t1);
    record("плитка перекрасилась в «в работе» без запроса", acceptedIn !== null && acceptedIn <= LATENCY_LIMIT_MS, acceptedIn === null ? "timeout" : `${acceptedIn} ms (limit ${LATENCY_LIMIT_MS})`);
    await page.waitForTimeout(300);
    const saidAccepted = await assistantSays(page);
    record("ассистент сказал «принята в работу»", saidAccepted.includes("принята в работу"), saidAccepted);

    // ---- a question: the tile moves to the question lane with quick answers --------------
    const t2 = Date.now();
    const asked = await marat.supabase.from("task_messages").insert({
      task_id: taskId,
      company_id: (await director.supabase.from("tasks").select("company_id").eq("id", taskId).single()).data?.company_id,
      sender_id: marat.userId,
      type: "text",
      content: `Какой формат? ${stamp}`,
      meta: { is_question: true },
    });
    record("марат: спросил", !asked.error, asked.error?.message ?? "ok");
    const questionIn = await until(page, taskId, "data-lane", "question", t2);
    record("плитка переехала в «вопрос» с чипами ответа", questionIn !== null && questionIn <= LATENCY_LIMIT_MS, questionIn === null ? "timeout" : `${questionIn} ms`);
    await page.screenshot({ path: join(SHOTS, "b2-question.png") });
    const saidQuestion = await assistantSays(page);
    record("ассистент процитировал вопрос", saidQuestion.includes("спрашивает") && saidQuestion.includes("Какой формат?"), saidQuestion);

    const t3 = Date.now();
    await tile(page, taskId).getByRole("button", { name: "Да", exact: true }).click();
    const answeredIn = await until(page, taskId, "data-lane", "work", t3);
    record("ответ чипом закрыл вопрос, плитка вернулась в «в работе»", answeredIn !== null, answeredIn === null ? "timeout" : `${answeredIn} ms`);

    // ---- handed in: the review lane with «Принято» on the tile --------------------------
    const t4 = Date.now();
    const done = await marat.supabase.rpc("transition_task", { task_id: taskId, to_status: "pending_review", payload: {}, client_request_id: randomUUID() });
    record("марат: сдал", !done.error, done.error?.message ?? "ok");
    const reviewIn = await until(page, taskId, "data-lane", "review", t4);
    record("плитка переехала в «на приёмке»", reviewIn !== null && reviewIn <= LATENCY_LIMIT_MS, reviewIn === null ? "timeout" : `${reviewIn} ms`);
    await page.screenshot({ path: join(SHOTS, "b3-review.png") });
    const saidReview = await assistantSays(page);
    record("ассистент сказал «сдана, ждёт приёмки»", saidReview.includes("сдана"), saidReview);

    // ---- the director accepts on the tile: goodbye in gold, then gone ------------------
    const t5 = Date.now();
    await tile(page, taskId).getByRole("button", { name: "Принято", exact: true }).click();
    const closingIn = await until(page, taskId, "data-lane", "closed", t5);
    record("«Принято» на плитке: прощание в тот же кадр (optimistic)", closingIn !== null && closingIn < 400, closingIn === null ? "timeout" : `${closingIn} ms`);
    await page.screenshot({ path: join(SHOTS, "b4-goodbye.png") });
    // the goodbye lasts: the tile is still there a second later (the refetch after the
    // mutation must not cut it short), and gone within a few seconds
    await page.waitForTimeout(900);
    const stillSayingGoodbye = (await tile(page, taskId).count()) > 0;
    record("прощание длится, пока рефетч убирает строку", stillSayingGoodbye, `${Date.now() - t5} ms after the tap`);
    try {
      await tile(page, taskId).waitFor({ state: "detached", timeout: 5_000 });
      record("плитка ушла с доски после прощания", true, `${Date.now() - t5} ms`);
    } catch {
      record("плитка ушла с доски после прощания", false, "still on the board after 5 s");
    }
    const saidDone = await assistantSays(page);
    record("ассистент сказал «Принято»", saidDone.startsWith("Принято"), saidDone);

    // ---- a reload agrees with the live board -------------------------------------------
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-testid="assistant-line"]').first().waitFor({ timeout: 15_000 });
    const stillThere = await tile(page, taskId).count();
    record("после перезагрузки закрытой задачи на доске нет", stillThere === 0, `tiles=${stillThere}`);
    await page.screenshot({ path: join(SHOTS, "b5-reload.png") });
  } catch (error) {
    await page.screenshot({ path: join(SHOTS, "bX-failure.png") }).catch(() => undefined);
    record("smoke:board", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
