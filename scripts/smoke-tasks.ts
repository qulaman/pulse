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
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

import { IPHONE_UA, signIn } from "./lib/login";
import { apiSession, APP_URL, finish, issueTask, record, recordError, refuseWhenBusy } from "./lib/smoke";

const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "tasks");
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";
const DIRECTOR = { email: "test@demo.local", password: "1" };

mkdirSync(SHOTS, { recursive: true });

const card = (page: Page, testId: string, title: string) => page.locator(`[data-testid="${testId}"]`, { hasText: title });

async function main() {
  await refuseWhenBusy();
  const director = await apiSession(DIRECTOR.email, DIRECTOR.password);
  const employee = await apiSession(EMPLOYEE, "demo1234");
  const stamp = Date.now().toString(36);
  const titles = { review: `Tasks smoke ${stamp} приёмка`, question: `Tasks smoke ${stamp} вопрос`, fresh: `Tasks smoke ${stamp} новая` };
  const ids: string[] = [];

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU", userAgent: IPHONE_UA };

  try {
    // the director signs in before anything is written: LOGIN_ONLY=1 ends the run right there
    const dctx = await browser.newContext(device);
    const page = await dctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await signIn(page, APP_URL, DIRECTOR);

    // ---- the employee moves two orders into the director's turn ----------------------------
    const soon = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const reviewId = await issueTask(director, employee.userId, titles.review, soon);
    const questionId = await issueTask(director, employee.userId, titles.question);
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
    // «Принять» reaches the server once its «Отменить» is over (D-139)
    await page.waitForTimeout(3_500);

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
    // the server hears «Удалить» once «Отменить» is over (D-139)
    await page.waitForTimeout(6_500);
    const gone = await director.supabase.from("tasks").select("id").eq("id", questionId).maybeSingle();
    record("«⋯ → Удалить» на экране задачи: задачи нет в базе", gone.data === null);
    record("директор: без ошибок страницы", errors.length === 0, errors.join(" | "));
    await dctx.close();

    // ---- employee: a new order opens by itself, «Принял» is one tap ------------------------
    const freshId = await issueTask(director, employee.userId, titles.fresh, soon);
    ids.push(freshId);
    const ectx = await browser.newContext(device);
    const epage = await ectx.newPage();
    await signIn(epage, APP_URL, { email: EMPLOYEE, password: "demo1234" });
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
    recordError("smoke:tasks", error);
  } finally {
    await browser.close();
    for (const id of ids) {
      const removed = await director.supabase.rpc("delete_task", { task_id: id });
      // the one deleted from its own screen is already gone
      if (removed.error && !/not_found/.test(removed.error.message)) console.error(`cleanup ${id}: ${removed.error.message}`);
    }
  }

  finish(`screenshots in ${SHOTS}`);
}

void main();
