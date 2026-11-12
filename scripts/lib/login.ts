/**
 * The way into the app for a smoke that only looks (tasks/032): a phone that says it is an iPhone —
 * a desktop user agent sends the director and the secretary to /desk (proxy.ts, D-153) — and the
 * email form, which the sign-in screen keeps behind «Войти по почте и паролю» (it opens on the
 * code, D-135). `readOnly` answers every write of the screens in the browser: dev is shared with
 * live people, and a smoke that opens a card must not mark it read for them. Signing in is the one
 * thing of such a run that reaches the base. The password is never printed.
 */
import type { BrowserContext, BrowserContextOptions, Page, Route } from "playwright";

export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** The phone the screens are made for: 375 × 667, touch, an iPhone user agent. */
export const PHONE: BrowserContextOptions = {
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: IPHONE_UA,
  locale: "ru-RU",
};

export type Account = { email: string; password: string };

/** Signs in by email and password and waits for the home screen the app sends the role to. */
export async function signIn(page: Page, appUrl: string, account: Account) {
  await page.goto(`${appUrl}/login`, { waitUntil: "networkidle" });
  const mail = page.getByLabel("Почта");
  // the switch says «по почте» while the code form is up; a tap before hydration is lost — tap again
  const toMail = page.getByTestId("login-switch").filter({ hasText: "почте" });
  for (let tries = 0; tries < 3 && !(await mail.isVisible().catch(() => false)); tries++) {
    await toMail.click({ timeout: 10_000 }).catch(() => undefined);
    await mail.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  }
  await mail.fill(account.email);
  try {
    await page.getByLabel("Пароль").fill(account.password);
  } catch {
    // Playwright's own message stays out: nothing of what was typed may reach the log
    throw new Error(`вход ${account.email}: поле «Пароль» не нашлось`);
  }
  // exact: «Войти по почте и паролю» and «Войти по коду» are buttons too
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

/** RPCs that only read; any other RPC writes and is answered in the browser. */
const READ_RPC = new Set([
  "fn_rating",
  "push_health",
  "director_busy",
  "my_daily_report",
  "my_daily_report_history",
  "team_daily_report_day",
  "team_daily_report_period",
  "tv_board",
  "tv_calendar",
  "tv_focus",
  "tv_overlay",
  "tv_rating",
  "tv_summary",
]);

/** Handlers that only read but take POST: their ids do not fit a URL. */
const READ_POST_API = new Set(["/api/lab/recordings"]);

/**
 * Every write of the screens is answered here before it leaves — receipts «увидел», read marks,
 * acks, RPCs that change rows, server actions — and named in `blocked`. Reads go to the server.
 * Install it before signing in: the home screen writes too.
 */
export async function readOnly(context: BrowserContext, appUrl: string, blocked: string[]) {
  const app = new URL(appUrl).origin;
  const answer = (route: Route, what: string, status: number, body: string) => {
    blocked.push(what);
    return route.fulfill({ status, contentType: "application/json", body });
  };
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const reads = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (url.origin === app) {
      const writes = reads ? /^\/api\/push\/(sweep|test)/.test(path) : !READ_POST_API.has(path);
      if (path.startsWith("/api/") && !path.startsWith("/api/auth/") && writes) {
        return answer(route, `${method} ${path}`, 200, "{}");
      }
      if (!reads && request.headers()["next-action"]) return answer(route, `server action ${path}`, 200, "{}");
      return route.fallback();
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").pop() ?? "";
      return READ_RPC.has(name) ? route.fallback() : answer(route, `rpc ${name}`, 200, "null");
    }
    if (path.startsWith("/rest/v1/") && !reads) return answer(route, `${method} ${path}`, 201, "[]");
    // a signed link to read a file is not a write; an upload is
    if (path.startsWith("/storage/v1/") && !reads && !path.startsWith("/storage/v1/object/sign/")) {
      return answer(route, `${method} ${path}`, 200, "{}");
    }
    // the token (sign-in, refresh) passes; anything else of auth that changes the user does not
    if (path.startsWith("/auth/v1/") && !reads && !path.includes("/token")) return answer(route, `${method} ${path}`, 200, "{}");
    return route.fallback();
  });
}
