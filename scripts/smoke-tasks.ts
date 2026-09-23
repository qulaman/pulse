/**
 * «Задачи» и «Мои дела» as cards (D-83) in a real browser (system Chrome via Playwright)
 * against the dev database. The script makes its own «Tasks smoke …» orders for an
 * employee, moves them through RPCs as the employee would, and checks that the director
 * clears «Ждут вас» from the list — «Принять» on the open card, a one-tap answer to the
 * question that opens next — and that the employee accepts a new order from «Новые».
 * Refuses to run while somebody else is active on dev (FORCE=1 overrides); deletes its
 * orders at the end.
 *   pnpm smoke:tasks            (against http://localhost:3000, APP_URL to override)
 *   EMPLOYEE=erlan.b@demo.local (default) — any demo employee with the demo password
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "tasks");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";

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

async function signIn(email: string, password: string): Promise<Session> {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { supabase, userId: data.session.user.id };
}

async function guardActivity() {
  if (!SERVICE_KEY || process.env.FORCE === "1") return;
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const voice = await admin.from("ai_logs").select("id").eq("source", "voice").gt("created_at", since).limit(1);
  const touched = await admin.from("tasks").select("title").gt("updated_at", since).not("title", "ilike", "%smoke%").limit(3);
  if ((voice.data?.length ?? 0) > 0 || (touched.data?.length ?? 0) > 0) {
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
}

async function createTask(director: Session, assigneeId: string, title: string, deadlineIso: string | null = null): Promise<string> {
  const confirmed = await director.supabase.rpc("confirm_voice_batch", {
    payload: {
      source: "typed",
      transcript: title,
      confirmed_entities: [{ kind: "task", assignee_id: assigneeId, group_id: null, title, body: null, deadline_iso: deadlineIso, priority: "normal", scheduled_send_at: null }],
      was_edited: false,
      edit_fields: [],
      force_now: true,
    },
    client_request_id: randomUUID(),
  });
  const taskId = ((confirmed.data as { task_ids?: string[] } | null)?.task_ids ?? [])[0];
  if (!taskId) throw new Error(`confirm_voice_batch: ${confirmed.error?.message ?? "no task"}`);
  return taskId;
}

const card = (page: Page, testId: string, title: string) => page.locator(`[data-testid="${testId}"]`, { hasText: title });

async function main() {
  await guardActivity();
  const director = await signIn("test@demo.local", "1");
  const employee = await signIn(EMPLOYEE, "demo1234");
  const stamp = Date.now().toString(36);
  const titles = { review: `Tasks smoke ${stamp} приёмка`, question: `Tasks smoke ${stamp} вопрос`, fresh: `Tasks smoke ${stamp} новая` };
  const ids: string[] = [];

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" };

  try {
    // ---- the employee moves two orders into the director's turn ----------------------------
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const reviewId = await createTask(director, employee.userId, titles.review, soon);
    const questionId = await createTask(director, employee.userId, titles.question);
    ids.push(reviewId, questionId);
    for (const [id, to] of [
      [reviewId, "accepted"],
      [reviewId, "pending_review"],
      [questionId, "accepted"],
    ] as const) {
      const moved = await employee.supabase.rpc("transition_task", { task_id: id, to_status: to, payload: {}, client_request_id: randomUUID() });
      if (moved.error) throw new Error(`transition_task ${to}: ${moved.error.message}`);
    }
    const companyId = (await director.supabase.from("tasks").select("company_id").eq("id", questionId).single()).data?.company_id;
    const asked = await employee.supabase.from("task_messages").insert({
      task_id: questionId,
      company_id: companyId,
      sender_id: employee.userId,
      type: "text",
      content: `Какой формат? ${stamp}`,
      meta: { is_question: true },
    });
    record("сотрудник: сдал одну и спросил по другой", !asked.error, asked.error?.message ?? "ok");

    // ---- director: «Ждут вас» opens itself, «Принять» moves on to the question ---------------
    const dctx = await browser.newContext(device);
    const page = await dctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, "test@demo.local", "1");
    await page.goto(`${APP_URL}/sent`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="status-screen"]').waitFor({ timeout: 20_000 });
    const yoursSelected = await page.locator('[data-testid="tab-yours"]').getAttribute("aria-selected");
    record("«Задачи» открываются на «Ждут вас»", yoursSelected === "true");
    await page.screenshot({ path: join(SHOTS, "t1-sent.png") });

    const review = card(page, "sent-task", titles.review);
    await review.waitFor({ timeout: 15_000 });
    const reviewOpen = await review.getAttribute("aria-expanded");
    record("карточка приёмки раскрыта сама", reviewOpen === "true", `aria-expanded=${reviewOpen}`);
    const approve = page.locator('[data-task-id] [data-testid="task-action-approve"]').first();
    await approve.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, "t2-review-open.png") });
    await approve.click();
    await page.waitForTimeout(1200);
    const question = card(page, "sent-task", titles.question);
    const questionOpen = await question.getAttribute("aria-expanded").catch(() => null);
    record("после «Принять» раскрылась следующая — с вопросом", questionOpen === "true", `aria-expanded=${questionOpen}`);
    await page.locator('[data-task-id][data-open]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, "t3-question-open.png") });
    await page.locator('[data-task-id][data-open]').getByRole("button", { name: "Да", exact: true }).click();
    await page.waitForTimeout(1500);

    const reviewRow = await director.supabase.from("tasks").select("status").eq("id", reviewId).single();
    record("в базе: принята (done)", reviewRow.data?.status === "done", `status=${reviewRow.data?.status}`);
    const questionRows = await director.supabase.from("task_messages").select("meta").eq("task_id", questionId).contains("meta", { is_question: true });
    const answered = (questionRows.data ?? []).some((row) => Boolean((row.meta as Record<string, unknown> | null)?.answered_at));
    record("в базе: вопрос закрыт ответом «Да»", answered);

    // the question task left «Ждут вас» and lives in «В работе»
    await page.locator('[data-testid="tab-working"]').click();
    await page.waitForTimeout(600);
    const inWorking = await card(page, "sent-task", titles.question).count();
    record("задача с отвеченным вопросом — во «В работе»", inWorking === 1, `cards=${inWorking}`);
    await page.screenshot({ path: join(SHOTS, "t4-working.png") });

    // ---- the task's own screen (D-87): the status screen, the buttons, «⋯ → Удалить» -----------
    await page.locator('[data-task-id][data-open] [data-testid="task-thread"]').click().catch(async () => {
      await card(page, "sent-task", titles.question).click();
      await page.locator('[data-task-id][data-open] [data-testid="task-thread"]').click();
    });
    await page.waitForURL((url) => url.pathname === `/tasks/${questionId}`, { timeout: 15_000 });
    const screen = page.locator('[data-testid="task-screen"]');
    await screen.waitFor({ timeout: 15_000 });
    record("«Открыть задачу» ведёт на экран задачи", (await screen.getAttribute("data-status")) === "accepted");
    const keysLive = await page.locator('[data-testid="task-action-extend"]').isVisible();
    record("на экране задачи — кнопки директора", keysLive);
    await page.screenshot({ path: join(SHOTS, "t4b-task-screen.png") });
    await page.getByRole("button", { name: "Все действия" }).click();
    await page.locator('[data-testid="more-remove"]').click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/tasks/"), { timeout: 10_000 });
    await page.waitForTimeout(1_500);
    const gone = await director.supabase.from("tasks").select("id").eq("id", questionId).maybeSingle();
    record("«⋯ → Удалить» на экране задачи: задачи нет в базе", gone.data === null);
    record("директор: без ошибок страницы", errors.length === 0, errors.join(" | "));
    await dctx.close();

    // ---- employee: a new order opens by itself, «Принял» is one tap ------------------------
    const freshId = await createTask(director, employee.userId, titles.fresh, soon);
    ids.push(freshId);
    const ectx = await browser.newContext(device);
    const epage = await ectx.newPage();
    await login(epage, EMPLOYEE, "demo1234");
    await epage.goto(`${APP_URL}/tasks`, { waitUntil: "networkidle" });
    await epage.locator('[data-testid="status-screen"]').waitFor({ timeout: 20_000 });
    const fresh = card(epage, "my-task", titles.fresh);
    await fresh.waitFor({ timeout: 15_000 });
    const freshOpen = await fresh.getAttribute("aria-expanded");
    record("«Мои дела»: новая задача раскрыта сама", freshOpen === "true", `aria-expanded=${freshOpen}`);
    await epage.screenshot({ path: join(SHOTS, "t5-employee-new.png") });
    await epage.locator('[data-task-id][data-open] [data-testid="task-action-accept"]').click();
    await epage.waitForTimeout(1500);
    const freshRow = await director.supabase.from("tasks").select("status").eq("id", freshId).single();
    record("в базе: «Принял» → accepted", freshRow.data?.status === "accepted", `status=${freshRow.data?.status}`);
    await epage.locator('[data-testid="tab-working"]').click();
    await epage.waitForTimeout(600);
    await epage.screenshot({ path: join(SHOTS, "t6-employee-working.png") });
    await ectx.close();
  } catch (error) {
    record("smoke:tasks", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
    for (const id of ids) {
      const removed = await director.supabase.rpc("delete_task", { task_id: id });
      // the one deleted from its own screen is already gone
      if (removed.error && !/not_found/.test(removed.error.message)) console.error(`cleanup ${id}: ${removed.error.message}`);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok · screenshots in ${SHOTS}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
