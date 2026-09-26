/**
 * The push channel end to end (D-114) in a real browser (system Chrome via Playwright): the
 * director signs in with notifications allowed, the app subscribes the browser by itself
 * (PushSync → /api/push/subscribe), «Проверить уведомления» on /profile/notifications queues a
 * real `test` row, the worker sends it through the push service, the service worker shows it
 * and says «увидел» — the screen must answer «Пришло на телефон». Then (D-125) how the shade
 * shows it — the monochrome badge, the language, the moment of the event — and «Принял» from
 * the shade: a task to this very person (authored by them too, so nobody else's screens see
 * it), its push with the action, the service worker's own accept, the task `accepted` and the
 * receipt `acted_at`; the task is deleted after. The browser's device is removed at the end.
 * Touches nothing of anybody else: one own device row, one own test row, one own task.
 *   pnpm smoke:push             (against http://localhost:3000, APP_URL to override)
 *   DIRECTOR=test@demo.local PASSWORD=1 PAGE=/profile/notifications (defaults; any role signs
 *   in — an employee's «Проверить» lives on PAGE=/profile)
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import webpush from "web-push";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DIRECTOR = process.env.DIRECTOR ?? "test@demo.local";
const PASSWORD = process.env.PASSWORD ?? "1";
const PAGE = process.env.PAGE ?? "/profile/notifications";

type Shown = { badge: string; lang: string; timestamp: number; actions: string[] } | null;

/** The notification the service worker put in the shade under `tag` (page code as a string: tsx helpers do not exist there). */
const shownScript = (tag: string) => `(async () => {
  const reg = await navigator.serviceWorker.ready;
  const [n] = await reg.getNotifications({ tag: ${JSON.stringify(tag)} });
  return n ? { badge: n.badge, lang: n.lang, timestamp: n.timestamp, actions: (n.actions || []).map((a) => a.action) } : null;
})()`;

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
    await page.goto(`${APP_URL}${PAGE}`, { waitUntil: "networkidle" });
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

    await foreignKeyHeals(page);

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

    // how the shade shows it (D-125)
    const test = (await page.evaluate(shownScript("push-test"))) as Shown;
    check(Boolean(test?.badge.endsWith("/icons/badge-96.png")), "the shade gets the monochrome badge", test?.badge ?? "no notification");
    check(test?.lang === "ru", "the notification speaks Russian", test?.lang ?? "");
    check(Boolean(test && Math.abs(Date.now() - test.timestamp) < 120_000), "it carries the moment of the event", String(test?.timestamp ?? ""));

    await acceptFromShade(page, context);
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

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launchPersistentContext>>["newPage"]>>;
type Context = Awaited<ReturnType<typeof chromium.launchPersistentContext>>;

/**
 * A browser subscribed under another VAPID key (D-125) — another deploy, a rotated pair: the
 * push service would answer 403 forever. The server knows that foreign endpoint; on the next
 * start the app replaces it by itself and the server forgets the old one.
 */
async function foreignKeyHeals(page: Page): Promise<void> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ours = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const foreign = webpush.generateVAPIDKeys().publicKey;
  const foreignEndpoint = (await page.evaluate(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    const old = await reg.pushManager.getSubscription();
    if (old) {
      await fetch("/api/push/subscribe", { method: "DELETE", credentials: "include",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: old.endpoint }) });
      await old.unsubscribe();
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ${JSON.stringify(foreign)} });
    const json = sub.toJSON();
    await fetch("/api/push/subscribe", { method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent.slice(0, 300) }) });
    return sub.endpoint;
  })()`)) as string;

  // the next start: PushSync checks the key 1.5 s after paint
  await page.reload({ waitUntil: "networkidle" });
  const keyScript = `(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub || !sub.options.applicationServerKey) return null;
    const bytes = new Uint8Array(sub.options.applicationServerKey);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return { endpoint: sub.endpoint, key: btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "") };
  })()`;
  type Sub = { endpoint: string; key: string } | null;
  let now: Sub = null;
  for (let i = 0; i < 15; i += 1) {
    await page.waitForTimeout(1_000);
    now = (await page.evaluate(keyScript)) as Sub;
    if (now?.key === ours) break;
  }
  check(now?.key === ours && now.endpoint !== foreignEndpoint, "a subscription under another key is replaced by itself", now?.key.slice(0, 12) ?? "none");

  const me = (await page.evaluate(`fetch("/api/me", { credentials: "include" }).then((r) => r.json())`)) as { profile?: { userId: string } };
  let rows: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const { data } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", me.profile?.userId ?? "");
    rows = (data ?? []).map((r) => r.endpoint);
    if (!rows.includes(foreignEndpoint) && rows.includes(now?.endpoint ?? "")) break;
    await page.waitForTimeout(500);
  }
  // the person's other phones stay as they were: only the dead endpoint goes
  check(
    !rows.includes(foreignEndpoint) && rows.includes(now?.endpoint ?? ""),
    "and the server forgets the dead endpoint",
    `${rows.length} device(s)`,
  );
}

/** «Принял» from the shade (D-125), end to end through the real push and the real worker. */
async function acceptFromShade(page: Page, context: Context): Promise<void> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const me = (await page.evaluate(`fetch("/api/me", { credentials: "include" }).then((r) => r.json())`)) as {
    profile?: { userId: string; companyId: string };
  };
  const myId = me.profile?.userId;
  const companyId = me.profile?.companyId;
  if (!myId || !companyId) {
    check(false, "«Принял» from the shade — who am I", JSON.stringify(me).slice(0, 120));
    return;
  }

  const { data: task, error } = await admin
    .from("tasks")
    .insert({ company_id: companyId, author_id: myId, assignee_id: myId, title: "Смоук: принять из шторки", status: "sent" })
    .select("id")
    .single();
  if (error || !task) {
    check(false, "«Принял» from the shade — a task to myself", error?.message ?? "");
    return;
  }
  try {
    // the row was written past the API routes: the same kick the app sends after such writes
    await page.evaluate(`fetch("/api/push/kick", { method: "POST", credentials: "include" })`);
    let shown: Shown = null;
    for (let i = 0; i < 20 && !shown; i += 1) {
      await page.waitForTimeout(1_000);
      shown = (await page.evaluate(shownScript(`task:${task.id}`))) as Shown;
    }
    check(Boolean(shown?.actions.includes("accept") && shown.actions.includes("open")), "a new task arrives with «Принял» and «Открыть»", JSON.stringify(shown?.actions ?? null));

    const worker = context.serviceWorkers()[0];
    const accepted = worker
      ? await worker.evaluate(`acceptFromShade({ task_id: ${JSON.stringify(task.id)}, url: "/tasks/${task.id}" })`)
      : false;
    check(accepted === true, "the worker takes the task through /transition", String(accepted));

    let status = "";
    let acted: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const { data } = await admin.from("tasks").select("status").eq("id", task.id).single();
      const { data: receipt } = await admin
        .from("notification_deliveries")
        .select("acted_at")
        .eq("task_id", task.id)
        .eq("event_kind", "task_sent")
        .maybeSingle();
      status = data?.status ?? "";
      acted = receipt?.acted_at ?? null;
      if (status === "accepted" && acted) break;
      await page.waitForTimeout(500);
    }
    check(status === "accepted", "the task is accepted", status);
    check(Boolean(acted), "and the director's card gets «принял»", acted ?? "no acted_at");
  } finally {
    await admin.from("tasks").delete().eq("id", task.id);
  }
}

void main();
