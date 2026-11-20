/**
 * Cleanup smoke in a real browser (system Chrome via Playwright): the director deletes
 * one order from its page and purges the closed ones on «Задачи». Uses the demo accounts on
 * dev and creates its own «Cleanup smoke …» tasks; refuses to run while somebody else is active
 * on dev (FORCE=1 overrides).
 *   pnpm smoke:cleanup            (against http://localhost:3000, APP_URL to override)
 *   EMPLOYEE=erlan.b@demo.local (default) — any demo employee with the demo password
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

import { PHONE, signIn } from "./lib/login";
import { apiSession, APP_URL, finish, issueTask, record, recordError, refuseWhenBusy } from "./lib/smoke";

const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "cleanup");
const EMPLOYEE = process.env.EMPLOYEE ?? "erlan.b@demo.local";
const DIRECTOR = { email: "test@demo.local", password: "1" };

mkdirSync(SHOTS, { recursive: true });

async function main() {
  await refuseWhenBusy();
  const director = await apiSession(DIRECTOR.email, DIRECTOR.password);
  const employee = await apiSession(EMPLOYEE, "demo1234");
  const stamp = Date.now().toString(36);

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`page error: ${error.message}`));
  try {
    await signIn(page, APP_URL, DIRECTOR);

    // ---- delete one order from its page ---------------------------------------------
    const doomed = await issueTask(director, employee.userId, `Cleanup smoke delete ${stamp}`);
    await page.goto(`${APP_URL}/tasks/${doomed}`, { waitUntil: "networkidle" });
    // an open task keeps «Удалить» under «Все действия» (D-87)
    await page.getByRole("button", { name: "Все действия" }).click();
    await page.locator('[data-testid="more-remove"]').click();
    await page.getByRole("dialog").waitFor({ timeout: 5_000 });
    await page.screenshot({ path: join(SHOTS, "c1-delete-sheet.png") });
    await page.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
    // the card leaves its own page at once; the server call lands once «Отменить» is over (D-139)
    await page.waitForURL((url) => !url.pathname.startsWith("/tasks/"), { timeout: 10_000 });
    await page.waitForTimeout(6_500);
    const { data: stillThere } = await director.supabase.from("tasks").select("id").eq("id", doomed).maybeSingle();
    record("«Удалить» на карточке: задача исчезла из базы", stillThere === null, `left the page for ${new URL(page.url()).pathname}`);

    // ---- purge the closed stack on «Задачи» --------------------------------------------
    const closed = await Promise.all([1, 2].map((n) => issueTask(director, employee.userId, `Cleanup smoke closed ${n} ${stamp}`)));
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
  } catch (error) {
    await page.screenshot({ path: join(SHOTS, "cX-failure.png") }).catch(() => undefined);
    recordError("smoke:cleanup", error);
  } finally {
    await browser.close();
  }

  finish();
}

void main();
