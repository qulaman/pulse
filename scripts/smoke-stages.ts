/**
 * Loading-stage smoke (D-122): a screen must not move while it loads. Every stage of a
 * screen is frozen on purpose in a real browser (system Chrome via Playwright, phone
 * profile) and measured:
 *   nav   A — the route skeleton (loading.tsx): the page's own request is held
 *         B — the page mounted, its data held (Supabase REST + /api)
 *         C — the page with its data
 *   cold  S — the server's HTML with JavaScript off (what a cold start paints first)
 *         D — hydrated, data held
 *         E — with its data
 * Between neighbouring stages the blocks of <main> (in flow, in order; a wrapper around a
 * `data-grow` list and a skeleton group with no box of its own are looked into) must keep their place and height to 2 px, up to the first
 * block whose length depends on the data — a `data-grow` one, or the last block. Blocks may
 * be added or taken away at the end (a skeleton draws the screen only down to the first
 * block whose place depends on the data); what stays must not move. The mascot keeps its
 * place and size. The nav run starts outside the route's section, so a
 * nested screen that shows its parent's skeleton fails too.
 *   pnpm smoke:stages                        (against http://localhost:3000, APP_URL to override)
 *   ROLE=director|employee|secretary|all     (default all)   ROUTES=/pulse,/sent  (filter)
 *   SCENARIOS=nav,cold   SHEETS=1 (a sheet per route: stages side by side + red/cyan overlay)
 * Read-only: signs in with the demo accounts and navigates; held requests are released,
 * never failed. Screenshots land in SHOTS_DIR (default ./.smoke-ui/stages).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui", "stages");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ROLE = process.env.ROLE ?? "all";
const ONLY = process.env.ROUTES?.split(",").filter(Boolean) ?? null;
const SCENARIOS = (process.env.SCENARIOS ?? "nav,cold").split(",");
const SHEETS = process.env.SHEETS === "1";
/** px a block may drift between stages: rounding, never a visible jump. */
const TOLERANCE = 2;

mkdirSync(SHOTS, { recursive: true });

// the service worker answers the build's files and the screens itself (D-127): it would slip
// past the requests this smoke holds — the stages are measured without it
const PHONE = { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ru-RU", serviceWorkers: "block" as const };

type Account = { role: string; email: string; password: string; routes: (ids: Ids) => string[] };
type Ids = { task: string | null; person: string | null; board: string | null };

const ACCOUNTS: Account[] = [
  {
    role: "director",
    email: "test@demo.local",
    password: "1",
    routes: (ids) => [
      "/pulse", "/sent", "/calendar", "/notes", ids.board && `/notes/b/${ids.board}`, "/screen", "/confirm",
      "/settings", "/settings/dictionary", "/profile", "/profile/notifications", "/lab", "/lab/mascot", "/admin",
      "/people", ids.person && `/people/${ids.person}`, ids.person && `/people/${ids.person}/edit`, "/people/new",
      "/ether", "/rating", "/shop", "/secretary", ids.task && `/tasks/${ids.task}`,
    ].filter(Boolean) as string[],
  },
  {
    role: "employee",
    email: "erlan.b@demo.local",
    password: "demo1234",
    routes: (ids) =>
      ["/feed", "/tasks", "/calendar", "/rating", "/profile", "/ether", "/shop", ids.task && `/tasks/${ids.task}`].filter(Boolean) as string[],
  },
  {
    role: "secretary",
    email: "marat@demo.local",
    password: "demo1234",
    // «Команда» sends the secretary to the roster in «Настройки» (D-104): a redirect, not a screen
    routes: () => ["/feed", "/secretary", "/settings", "/rating", "/profile"],
  },
];

/** Real ids for the dynamic screens, read under the account's own RLS. */
async function idsFor(account: Account): Promise<Ids> {
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
  const me = data.user?.id ?? "";
  const mine = account.role === "director" ? "author_id" : "assignee_id";
  const task = await supabase.from("tasks").select("id").eq(mine, me).neq("status", "scheduled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const person = await supabase.from("profiles").select("id").neq("id", me).eq("is_active", true).in("role", ["employee", "manager"]).limit(1).maybeSingle();
  // a board in the bin opens «Доски нет» — not the screen being measured
  const board = await supabase.from("mind_boards").select("id").is("deleted_at", null).limit(1).maybeSingle();
  return { task: task.data?.id ?? null, person: person.data?.id ?? null, board: board.data?.id ?? null };
}

type Block = { k: string; y: number; h: number; grow: boolean };
type Box = { y: number; h: number; x: number; w: number } | null;
type Stage = { stage: string; file: string; path: string; blocks: Block[]; mascot: Box; header: Box; broken: string | null };

/** A string, not a function: tsx would inject helpers the page does not have. */
const MEASURE = `(() => {
  const sy = window.scrollY;
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.top + sy), h: Math.round(b.height), x: Math.round(b.left), w: Math.round(b.width) }; };
  const shown = (el) => el.getClientRects().length > 0;
  const inFlow = (el) => { const p = getComputedStyle(el).position; return p !== "fixed" && p !== "absolute"; };
  // a skeleton group with no box of its own (no padding, border or fill) only groups blocks:
  // look into it, or a whole skeleton wrapped in one group would pass as one block
  const bare = (el) => {
    if (el.getAttribute("aria-busy") !== "true" || el.children.length < 2) return false;
    const cs = getComputedStyle(el);
    // only a stack: a row of chips or a grid of tiles is one block
    const stack = cs.display === "block" || (cs.display === "flex" && cs.flexDirection.startsWith("column"));
    if (!stack) return false;
    const clear = cs.backgroundImage === "none" && (cs.backgroundColor === "transparent" || cs.backgroundColor === "rgba(0, 0, 0, 0)");
    return clear && parseFloat(cs.paddingTop) === 0 && parseFloat(cs.paddingBottom) === 0 && parseFloat(cs.borderTopWidth) === 0;
  };
  const label = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.getAttribute("data-testid") || el.getAttribute("data-band") || "";
    const cls = typeof el.className === "string" ? el.className.split(/\\s+/).filter(Boolean).slice(0, 3).join(".") : "";
    return tag + (id ? "#" + id : "") + (cls ? "." + cls : "");
  };
  const blocks = [];
  const walk = (el, depth) => {
    for (const child of el.children) {
      if (!shown(child) || !inFlow(child)) continue;
      const b = child.getBoundingClientRect();
      if (b.height <= 1) continue;
      const grow = child.hasAttribute("data-grow");
      if (!grow && depth < 4 && (bare(child) || child.querySelector("[data-grow]"))) { walk(child, depth + 1); continue; }
      blocks.push({ k: label(child), y: Math.round(b.top + sy), h: Math.round(b.height), grow });
    }
  };
  const main = [...document.querySelectorAll("main")].find(shown);
  if (main) walk(main, 0);
  // a stage that shows the error screen, or nothing, is a broken stage, not a steady one
  const broken = !main ? "пустой экран" : /Что-то пошло не так|Вышла новая версия/.test(document.body.innerText) ? "экран ошибки" : null;
  const mascot = [...document.querySelectorAll("main svg.mascot")].find(shown);
  const header = [...document.querySelectorAll("header.border-b")].find(shown);
  return { blocks, mascot: box(mascot), header: box(header), broken };
})()`;

async function capture(page: Page, name: string, stage: string): Promise<Stage> {
  const file = join(SHOTS, `${name}__${stage}.png`);
  await page.screenshot({ path: file });
  const marks = (await page.evaluate(MEASURE)) as Omit<Stage, "stage" | "file" | "path">;
  return { stage, file, path: new URL(page.url()).pathname, ...marks };
}

/** Holds the page's own request (the RSC of a navigation) and the data fetches until released. */
function holder(page: Page, target: string) {
  const held: { rsc: Route[]; data: Route[] } = { rsc: [], data: [] };
  const on = { rsc: false, data: false };
  const origin = new URL(APP_URL).origin;
  const isData = (url: URL) =>
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/storage/v1/") ||
    (url.origin === origin && url.pathname.startsWith("/api/") && url.pathname !== "/api/version");
  void page.route("**/*", (route) => {
    const request = route.request();
    const headers = request.headers();
    const url = new URL(request.url());
    if (on.rsc && headers["rsc"] && !headers["next-router-prefetch"] && url.pathname === target) return void held.rsc.push(route);
    if (on.data && ["fetch", "xhr"].includes(request.resourceType()) && isData(url)) return void held.data.push(route);
    return void route.continue().catch(() => {});
  });
  const release = async (kind: "rsc" | "data") => {
    on[kind] = false;
    for (const route of held[kind].splice(0)) await route.continue().catch(() => {});
  };
  return { on, held, release };
}

/** What moved between two stages, or nothing. */
function compare(from: Stage, to: Stage): string[] {
  const out: string[] = [];
  const a = from.blocks;
  const b = to.blocks;
  for (let i = 0; ; i++) {
    const x = a[i];
    const y = b[i];
    // blocks may be added or taken away at the end — what stays must not move
    if (!x || !y) break;
    if (Math.abs(x.y - y.y) > TOLERANCE) {
      out.push(`блок #${i} ${y.k} сдвинулся на ${y.y - x.y} px (было ${x.k})`);
      break;
    }
    const last = i === a.length - 1 || i === b.length - 1;
    if (x.grow || y.grow || last) break;
    if (Math.abs(x.h - y.h) > TOLERANCE) {
      out.push(`блок #${i} ${y.k}: высота ${x.h} → ${y.h}`);
      break;
    }
  }
  const m1 = from.mascot;
  const m2 = to.mascot;
  if (m1 && m2) {
    const c1 = m1.y + m1.h / 2;
    const c2 = m2.y + m2.h / 2;
    if (Math.abs(c1 - c2) > TOLERANCE || Math.abs(m1.h - m2.h) > TOLERANCE) out.push(`маскот: центр ${Math.round(c2 - c1)} px, размер ${m1.h} → ${m2.h}`);
  }
  const h1 = from.header;
  const h2 = to.header;
  if (Boolean(h1) !== Boolean(h2)) out.push(`шапка бренда ${h1 ? "пропадает" : "появляется"}`);
  return out;
}

type Result = { role: string; route: string; name: string; fails: string[]; notes: string[]; stages: Stage[] };

async function signIn(context: BrowserContext, account: Account) {
  const page = await context.newPage();
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill(account.email);
  await page.getByLabel("Пароль").fill(account.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.close();
}

async function settle(page: Page, ms: number) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function checkRoute(browser: Browser, context: BrowserContext, account: Account, target: string): Promise<Result> {
  const name = `${account.role}${target.replaceAll("/", "_")}`.slice(0, 80);
  const result: Result = { role: account.role, route: target, name, fails: [], notes: [], stages: [] };
  const errors = new Set<string>();

  if (SCENARIOS.includes("nav")) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.add(error.message));
    const hold = holder(page, target);
    // from outside the route's section: a nested screen must not borrow its parent's skeleton
    const section = `/${target.split("/")[1]}`;
    const start = section === "/calendar" ? "/profile" : "/calendar";
    await page.goto(`${APP_URL}${start}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1_000);
    await page.evaluate(`window.next.router.prefetch(${JSON.stringify(target)})`);
    await page.waitForTimeout(1_500);
    hold.on.rsc = true;
    hold.on.data = true;
    await page.evaluate(`window.next.router.push(${JSON.stringify(target)})`);
    await page.waitForTimeout(1_500);
    const A = await capture(page, name, "A-route-skeleton");
    const skeleton = A.path === target;
    if (!skeleton) result.notes.push("нет заглушки маршрута: до ответа сервера остаётся прежний экран");
    await hold.release("rsc");
    await page.waitForTimeout(2_000);
    const B = await capture(page, name, "B-page-pending");
    await hold.release("data");
    await settle(page, 2_500);
    const C = await capture(page, name, "C-final");
    if (C.path !== target) result.notes.push(`переадресация на ${C.path}`);
    if (skeleton) for (const f of compare(A, B)) result.fails.push(`переход, заглушка → без данных: ${f}`);
    for (const f of compare(B, C)) result.fails.push(`переход, без данных → с данными: ${f}`);
    result.stages.push(A, B, C);
    await page.close();
  }

  if (SCENARIOS.includes("cold")) {
    const state = await context.storageState();
    const noJs = await browser.newContext({ ...PHONE, javaScriptEnabled: false, storageState: state });
    const bare = await noJs.newPage();
    await bare.goto(`${APP_URL}${target}`, { waitUntil: "load" });
    await bare.waitForTimeout(800);
    const S = await capture(bare, name, "S-server-html");
    await noJs.close();

    const page = await context.newPage();
    page.on("pageerror", (error) => errors.add(error.message));
    const hold = holder(page, target);
    hold.on.data = true;
    await page.goto(`${APP_URL}${target}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);
    const D = await capture(page, name, "D-cold-pending");
    await hold.release("data");
    await settle(page, 2_500);
    const E = await capture(page, name, "E-cold-final");
    if (S.path === target) for (const f of compare(S, D)) result.fails.push(`холодный, HTML сервера → без данных: ${f}`);
    for (const f of compare(D, E)) result.fails.push(`холодный, без данных → с данными: ${f}`);
    result.stages.push(S, D, E);
    await page.close();
  }

  for (const stage of result.stages) {
    // the nav's A stage on a route without a skeleton is the previous screen — not this one's to judge
    if (stage.broken && !(stage.stage.startsWith("A-") && stage.path !== target)) result.fails.push(`${stage.stage}: ${stage.broken}`);
  }
  for (const message of errors) result.fails.push(`ошибка страницы: ${message}`);
  return result;
}

/** Stages side by side and an overlay of the first skeleton (red) over the final screen (cyan). */
async function sheet(browser: Browser, result: Result) {
  const page = await browser.newPage({ viewport: { width: 1640, height: 800 } });
  const rows = [result.stages.slice(0, 3), result.stages.slice(3, 6)].filter((row) => row.length === 3);
  const data = rows.map((row) => row.map((s) => ({ label: s.stage, src: `data:image/png;base64,${readFileSync(s.file).toString("base64")}` })));
  await page.setContent(`<body style="margin:0;background:#1b1b1b;color:#ddd;font:13px sans-serif"><h1 style="font-size:15px;margin:8px">${result.role} ${result.route}</h1><div id=root></div></body>`);
  await page.evaluate(`(async (rows) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const root = document.getElementById("root");
    for (const row of rows) {
      const line = document.createElement("div");
      line.style.cssText = "display:flex;gap:6px;padding:4px 8px";
      const imgs = [];
      for (const s of row) {
        const fig = document.createElement("figure");
        fig.style.cssText = "margin:0;width:400px";
        const img = await load(s.src);
        img.style.width = "100%";
        imgs.push(img);
        fig.append(img, Object.assign(document.createElement("figcaption"), { textContent: s.label }));
        line.append(fig);
      }
      const canvas = document.createElement("canvas");
      canvas.width = imgs[0].naturalWidth;
      canvas.height = imgs[0].naturalHeight;
      canvas.style.width = "400px";
      const g = canvas.getContext("2d");
      const grab = (img) => { g.drawImage(img, 0, 0); return g.getImageData(0, 0, canvas.width, canvas.height).data; };
      const first = grab(imgs[0]);
      const last = grab(imgs[2]);
      const out = g.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < first.length; i += 4) {
        const a = (first[i] + first[i + 1] + first[i + 2]) / 3 * 2.2;
        const c = (last[i] + last[i + 1] + last[i + 2]) / 3 * 2.2;
        out.data[i] = Math.min(255, a);
        out.data[i + 1] = Math.min(255, c);
        out.data[i + 2] = Math.min(255, c);
        out.data[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      const fig = document.createElement("figure");
      fig.style.cssText = "margin:0;width:400px";
      fig.append(canvas, Object.assign(document.createElement("figcaption"), { textContent: "красный — " + row[0].label + ", голубой — " + row[2].label }));
      line.append(fig);
      root.append(line);
    }
  })(${JSON.stringify(data)})`);
  await page.screenshot({ path: join(SHOTS, `sheet__${result.name}.png`), fullPage: true });
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results: Result[] = [];
  for (const account of ACCOUNTS.filter((a) => ROLE === "all" || a.role === ROLE)) {
    const ids = await idsFor(account);
    const routes = account.routes(ids).filter((route) => !ONLY || ONLY.some((only) => route === only || route.startsWith(`${only}/`) || (only.endsWith("*") && route.startsWith(only.slice(0, -1)))));
    if (routes.length === 0) continue;
    const context = await browser.newContext(PHONE);
    await signIn(context, account);
    for (const route of routes) {
      const result = await checkRoute(browser, context, account, route);
      results.push(result);
      const tag = result.fails.length ? "FAIL" : "ok  ";
      console.log(`${tag}  ${account.role} ${route}${result.notes.length ? `  (${result.notes.join("; ")})` : ""}`);
      for (const fail of result.fails) console.log(`        ${fail}`);
      if (SHEETS) await sheet(browser, result);
    }
    await context.close();
  }
  await browser.close();
  const failed = results.filter((r) => r.fails.length);
  console.log(`\n${results.length - failed.length}/${results.length} screens hold still while they load`);
  process.exit(failed.length ? 1 : 0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
