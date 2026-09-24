/**
 * The team on the waiting screen (D-118) in a real browser against the dev database: the
 * director watches /pulse while the script walks one order of its own through its life, as the
 * people would — and every step has to show on that person's circle, through Realtime:
 *   handed out   the grey circle flies through the face and comes out lit, ring «waiting»;
 *   «Принял»     the arc goes round («spinning»);
 *   a question   the «?» badge on the circle;
 *   a tap        his card with the order, the row a link to its screen, the face on him;
 *   handed in    the ring closes («closed»);
 *   accepted     gold for a moment, then the circle floats back down to the idlers.
 * Refuses to run while somebody else is active on dev (FORCE=1 overrides); deletes its order at
 * the end.
 *   pnpm smoke:team             (against http://localhost:3000, APP_URL to override)
 *   EMPLOYEE=erlan.b@demo.local (default) — a demo employee with the demo password and no open work
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "team");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.local");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const checks: { name: string; ok: boolean }[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok });
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

/** Waits until the page says so, polling: the change arrives over Realtime, not on a click. */
async function until(page: Page, what: () => Promise<boolean>, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await what().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function main() {
  await guardActivity();
  const director = await signIn("test@demo.local", "1");
  const employee = await signIn(EMPLOYEE, "demo1234");
  const title = `Team smoke ${Date.now().toString(36)}`;
  let taskId: string | null = null;

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const open = await director.supabase
      .from("tasks")
      .select("id")
      .eq("assignee_id", employee.userId)
      .in("status", ["sent", "accepted", "in_progress", "rework", "pending_review", "declined"])
      .limit(1);
    if (open.data?.length) throw new Error(`${EMPLOYEE} has open work — the flight up needs an idler (EMPLOYEE=… another one)`);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Почта").fill("test@demo.local");
    await page.getByLabel("Пароль").fill("1");
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.goto(`${APP_URL}/pulse`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="people-field"]').waitFor({ timeout: 20_000 });

    const circle = page.locator(`[data-testid="crew"][data-person="${employee.userId}"]`);
    record("сотрудник стоит внизу серым", (await circle.getAttribute("data-busy")) === "0");
    await page.screenshot({ path: join(SHOTS, "t1-idle.png") });

    // ---- handed out: through the face, out lit ---------------------------------------------
    const confirmed = await director.supabase.rpc("confirm_voice_batch", {
      payload: {
        source: "typed",
        transcript: title,
        confirmed_entities: [{ kind: "task", assignee_id: employee.userId, group_id: null, title, body: null, deadline_iso: null, priority: "normal", scheduled_send_at: null }],
        was_edited: false,
        edit_fields: [],
        force_now: true,
      },
      client_request_id: randomUUID(),
    });
    taskId = ((confirmed.data as { task_ids?: string[] } | null)?.task_ids ?? [])[0] ?? null;
    if (!taskId) throw new Error(`confirm_voice_batch: ${confirmed.error?.message ?? "no task"}`);
    const flew = await until(page, async () => (await page.locator('[data-testid="crew-flight"][data-dir="up"]').count()) > 0);
    await page.screenshot({ path: join(SHOTS, "t2-flight.png") });
    record("задача выдана — кружок летит через лицо", flew);
    record("приземлился наверху, кольцо ждёт", await until(page, async () => (await circle.getAttribute("data-ring")) === "waiting"));

    // ---- «Принял»: the arc goes round --------------------------------------------------------
    const accepted = await employee.supabase.rpc("transition_task", { task_id: taskId, to_status: "accepted", payload: {}, client_request_id: randomUUID() });
    if (accepted.error) throw new Error(`transition_task accepted: ${accepted.error.message}`);
    record("«Принял» — дуга крутится", await until(page, async () => (await circle.getAttribute("data-ring")) === "spinning"));

    // ---- a question: the badge ---------------------------------------------------------------
    const companyId = (await director.supabase.from("tasks").select("company_id").eq("id", taskId).single()).data?.company_id;
    const asked = await employee.supabase.from("task_messages").insert({
      task_id: taskId,
      company_id: companyId,
      sender_id: employee.userId,
      type: "text",
      content: "Куда везти?",
      meta: { is_question: true },
    });
    if (asked.error) throw new Error(`question: ${asked.error.message}`);
    record("вопрос — значок «?» на кружке", await until(page, async () => (await circle.locator('[data-badge="question"]').count()) === 1));
    await page.screenshot({ path: join(SHOTS, "t3-question.png") });

    // ---- a tap: his card -----------------------------------------------------------------------
    await circle.click();
    const row = page.locator('[data-testid="crew-task"]', { hasText: title });
    record("тап — карточка с его задачей", await until(page, async () => (await row.count()) === 1, 3_000));
    record("строка ведёт на экран задачи", (await row.getAttribute("href")) === `/tasks/${taskId}`);
    record("в карточке — вопрос", await page.locator('[data-testid="crew-card"]', { hasText: "Куда везти?" }).isVisible());
    record("маскот смотрит на него", (await page.locator('[data-gaze="on"]').count()) === 1);
    // the thought over the head steps aside for the card: let that finish before the picture
    await page.waitForTimeout(400);
    record("мысль над головой уступила карточке", (await page.locator('[data-testid="thought"]').count()) === 0);
    await page.screenshot({ path: join(SHOTS, "t4-card.png") });
    await page.mouse.click(12, 200);
    record("касание мимо убирает карточку", await until(page, async () => (await page.locator('[data-testid="crew-card"]').count()) === 0, 2_000));

    // ---- handed in: the ring closes ----------------------------------------------------------
    const handed = await employee.supabase.rpc("transition_task", { task_id: taskId, to_status: "pending_review", payload: {}, client_request_id: randomUUID() });
    if (handed.error) throw new Error(`transition_task pending_review: ${handed.error.message}`);
    record("сдал — кольцо замкнулось", await until(page, async () => (await circle.getAttribute("data-ring")) === "closed"));

    // ---- accepted: gold, then down -------------------------------------------------------------
    const done = await director.supabase.rpc("transition_task", { task_id: taskId, to_status: "done", payload: {}, client_request_id: randomUUID() });
    if (done.error) throw new Error(`transition_task done: ${done.error.message}`);
    const gold = await until(page, async () => (await circle.getAttribute("data-ring")) === "done");
    await page.screenshot({ path: join(SHOTS, "t5-gold.png") });
    record("принято — кольцо замыкается золотом", gold);
    const down = await until(page, async () => (await page.locator('[data-testid="crew-flight"][data-dir="down"]').count()) > 0, 5_000);
    record("и кружок спускается вниз", down);
    record("снова серый внизу", await until(page, async () => (await circle.getAttribute("data-busy")) === "0", 6_000));
    await page.screenshot({ path: join(SHOTS, "t6-back.png") });
    record("без ошибок страницы", errors.length === 0, errors.join(" | "));
    await context.close();
  } catch (error) {
    record("smoke:team", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
    if (taskId) {
      const removed = await director.supabase.rpc("delete_task", { task_id: taskId });
      if (removed.error && !/not_found/.test(removed.error.message)) console.error(`cleanup ${taskId}: ${removed.error.message}`);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok · screenshots in ${SHOTS}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
