/**
 * Cleanup smoke in a real browser (system Chrome via Playwright): the director deletes
 * one order from its page, purges the closed ones on «Задачи», and — only with RESET=1 —
 * zeroes the demo database from Settings. Uses the demo accounts on dev and creates its
 * own «Cleanup smoke …» tasks; refuses to run while somebody else is active on dev
 * (FORCE=1 overrides). The reset wipes the whole company's activity: never run it with
 * RESET=1 while the owner is testing.
 *   pnpm smoke:cleanup            (against http://localhost:3000, APP_URL to override)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "cleanup");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  await page.waitForLoadState("networkidle");
}

async function createTask(director: Session, assigneeId: string, title: string): Promise<string> {
  const confirmed = await director.supabase.rpc("confirm_voice_batch", {
    payload: {
      source: "typed",
      transcript: title,
      confirmed_entities: [{ kind: "task", assignee_id: assigneeId, group_id: null, title, body: null, deadline_iso: null, priority: "normal", scheduled_send_at: null }],
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

async function main() {
  await guardActivity();
  const director = await signIn("test@demo.local", "1");
  const marat = await signIn("marat@demo.local", "demo1234");
  const stamp = Date.now().toString(36);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU" });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`page error: ${error.message}`));
  try {
    await login(page, "test@demo.local", "1");

    // ---- delete one order from its page ---------------------------------------------
    const doomed = await createTask(director, marat.userId, `Cleanup smoke delete ${stamp}`);
    await page.goto(`${APP_URL}/tasks/${doomed}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Удалить", exact: true }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 5_000 });
    await page.screenshot({ path: join(SHOTS, "c1-delete-sheet.png") });
    await page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
    // the card leaves its own page at once; the server call lands right after
    await page.waitForURL((url) => !url.pathname.startsWith("/tasks/"), { timeout: 10_000 });
    await page.waitForTimeout(1_500);
    const { data: stillThere } = await director.supabase.from("tasks").select("id").eq("id", doomed).maybeSingle();
    record("«Удалить» на карточке: задача исчезла из базы", stillThere === null, `left the page for ${new URL(page.url()).pathname}`);

    // ---- purge the closed stack on «Задачи» --------------------------------------------
    const closed = await Promise.all([1, 2].map((n) => createTask(director, marat.userId, `Cleanup smoke closed ${n} ${stamp}`)));
    for (const id of closed) {
      const revoked = await director.supabase.rpc("revoke_task", { task_id: id, client_request_id: randomUUID() });
      if (revoked.error) throw new Error(`revoke_task: ${revoked.error.message}`);
    }
    await page.goto(`${APP_URL}/sent`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /^Закрытые/ }).click();
    const purgeButton = page.getByRole("button", { name: /^Очистить закрытые/ });
    await purgeButton.waitFor({ timeout: 10_000 });
    const label = (await purgeButton.textContent()) ?? "";
    await page.screenshot({ path: join(SHOTS, "c2-closed.png") });
    await purgeButton.click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
    await page.getByText(/^Удалил: \d+/).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(800);
    const { count: closedLeft } = await director.supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["done", "declined", "revoked"]);
    record("«Очистить закрытые»: закрытых задач не осталось", (closedLeft ?? 0) === 0, `${label.trim()} → closed left ${closedLeft ?? 0}`);
    await page.screenshot({ path: join(SHOTS, "c3-purged.png") });

    // ---- the reset button (RESET=1 only: it wipes the whole company's activity) --------
    await page.goto(`${APP_URL}/settings`, { waitUntil: "networkidle" });
    const resetButton = page.getByRole("button", { name: /^Обнулить/ });
    const visible = await resetButton.isVisible().catch(() => false);
    record("настройки: раздел «Демо» с кнопкой обнуления виден (NEXT_PUBLIC_DEMO_MODE=1)", visible);
    if (visible && process.env.RESET === "1") {
      await createTask(director, marat.userId, `Cleanup smoke reset ${stamp}`);
      await resetButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ timeout: 5_000 });
      const wipe = dialog.getByRole("button", { name: "Стереть всё" });
      record("обнуление: кнопка заперта, пока слово не введено", await wipe.isDisabled());
      await dialog.getByLabel("Слово подтверждения").fill("обнулить");
      await page.screenshot({ path: join(SHOTS, "c4-reset-sheet.png") });
      await wipe.click();
      await page.getByText(/^Стёр: /).waitFor({ timeout: 20_000 });
      await page.waitForURL((url) => url.pathname === "/pulse", { timeout: 10_000 });
      const { count: tasksLeft } = await director.supabase.from("tasks").select("id", { count: "exact", head: true });
      const { count: peopleLeft } = await director.supabase.from("profiles").select("id", { count: "exact", head: true });
      record("обнуление: задач нет, люди на месте", (tasksLeft ?? 0) === 0 && (peopleLeft ?? 0) > 0, `tasks ${tasksLeft ?? 0}, people ${peopleLeft ?? 0}`);
      await page.locator('[data-testid="assistant-line"]').first().waitFor({ timeout: 15_000 });
      await page.screenshot({ path: join(SHOTS, "c5-after-reset.png") });
    } else {
      record("обнуление не запускалось (RESET=1 не задан)", true);
    }
  } catch (error) {
    await page.screenshot({ path: join(SHOTS, "cX-failure.png") }).catch(() => undefined);
    record("smoke:cleanup", false, error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
