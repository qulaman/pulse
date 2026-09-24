/**
 * The push channel end to end (D-114) in a real browser (system Chrome via Playwright): the
 * director signs in with notifications allowed, the app subscribes the browser by itself
 * (PushSync → /api/push/subscribe), «Проверить уведомления» on /profile/notifications queues a
 * real `test` row, the worker sends it through the push service, the service worker shows it
 * and says «увидел» — the screen must answer «Пришло на телефон». The browser's device is
 * removed at the end. Touches nothing of anybody else: one own device row, one own test row.
 *   pnpm smoke:push             (against http://localhost:3000, APP_URL to override)
 *   DIRECTOR=test@demo.local PASSWORD=1 (defaults)
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DIRECTOR = process.env.DIRECTOR ?? "test@demo.local";
const PASSWORD = process.env.PASSWORD ?? "1";

let failed = 0;
function check(ok: boolean, what: string, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed += 1;
}

async function main() {
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "pulse-push-")), {
    channel: "chrome",
    headless: process.env.HEADFUL !== "1",
    viewport: { width: 390, height: 844 },
    locale: "ru-RU",
    permissions: ["notifications"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Почта").fill(DIRECTOR);
    await page.getByLabel("Пароль").fill(PASSWORD);
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

    // the app registers the worker and the subscription by itself (PushSync, 1.5 s after paint)
    await page.goto(`${APP_URL}/profile/notifications`, { waitUntil: "networkidle" });
    // the push service answers in a few seconds: ask the browser until it has a subscription
    let endpoint: string | null = null;
    for (let i = 0; i < 15 && !endpoint; i += 1) {
      await page.waitForTimeout(1_000);
      endpoint = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return (await reg.pushManager.getSubscription())?.endpoint ?? null;
      });
    }
    check(Boolean(endpoint), "the app subscribed this browser by itself", endpoint?.slice(0, 48) ?? "no subscription");

    await page.reload({ waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: "Проверить уведомления" });
    await button.waitFor({ timeout: 10_000 });
    await button.click();
    let verdict = "";
    for (let i = 0; i < 25; i += 1) {
      await page.waitForTimeout(1_500);
      verdict = (await page.getByText(/Пришло на телефон|не включены|не прошёл|Не пришло|Не получилось/).first().textContent().catch(() => "")) ?? "";
      if (verdict) break;
    }
    check(verdict.startsWith("Пришло на телефон"), "«Проверить» — the push came back as shown", verdict || "no answer in 37 s");
  } finally {
    // this browser's device leaves the director's list again
    await page
      .evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      })
      .catch(() => undefined);
    await context.close();
  }
  console.log(failed ? `${failed} failed` : "all ok");
  process.exit(failed ? 1 : 0);
}

void main();
