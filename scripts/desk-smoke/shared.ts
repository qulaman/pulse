/**
 * What the desk smoke's parts share (scripts/smoke-desk.ts, D-153): the app's address, the list
 * of checks, the context each part gets, and how a desk screen is opened. Each role of tasks/022
 * writes its steps in its own file next to this one.
 */
import type { Page, Request } from "playwright";

import { APP_URL } from "../lib/smoke";

// .env.local, the address and the list of checks are every smoke's (scripts/lib/smoke.ts)
export { APP_URL, checks, record, skip, type Check } from "../lib/smoke";

/**
 * On while a part answers 500 itself to see the screen name a failure: those are not the app's
 * errors. `ids` — made-up ids a part leads the app to (a task its faked answer named): the base's
 * «no such row» about them is the part's doing, not the app's.
 */
export const injected = { failures: false, ids: [] as string[] };

/**
 * What every part gets: the page (signed in, desktop 1440×900), a run stamp for names it makes,
 * a screenshot helper, and `quiet` — somebody is active on dev, so nothing may be written.
 * Nothing is ever sent, saved, issued or put on the wall (tasks/022 «Правила процесса»).
 */
export type Ctx = { page: Page; stamp: string; shot: (name: string) => Promise<void>; quiet: boolean };

/** Opens a desk screen and lets its first data land. */
export async function open(page: Page, path: string) {
  await page.goto(`${APP_URL}${path}`, { waitUntil: "load" });
  await page.locator("#desk-main").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

/**
 * Counts the view transitions the page starts (D-184): which groups moved, and whether one was cut
 * short — the browser drops a transition whose flying part leaves the page, all its animations at
 * once. A string: tsx would add its own helpers to a function the page does not have. A part puts
 * it in with `page.addInitScript(VT_PROBE)` before its first visit.
 */
export const VT_PROBE = `(() => {
  if (window.__vt || !Document.prototype.startViewTransition) return;
  const log = (window.__vt = []);
  const orig = Document.prototype.startViewTransition;
  Document.prototype.startViewTransition = function (arg) {
    const vt = orig.call(this, arg);
    const run = { t0: performance.now(), groups: [], names: [], ready: null, end: null, skipped: false };
    log.push(run);
    vt.ready.then(() => {
      run.ready = performance.now() - run.t0;
      const moving = document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement && a.effect.pseudoElement.startsWith("::view-transition"));
      run.groups = moving.map((a) => a.effect.pseudoElement).filter((p) => p.startsWith("::view-transition-group(")).map((p) => p.slice(24, -1));
      run.names = moving.map((a) => a.animationName).filter((n) => n && !n.startsWith("-ua-"));
    }, () => { run.skipped = true; });
    vt.finished.then(() => { run.end = performance.now() - run.t0; }, () => {});
    return vt;
  };
})();`;

/** One view transition: the groups that moved, the desk's own keyframes they played (`vt-panel-in` …), its timing. */
export type VtRun = { groups: string[]; names: string[]; ready: number | null; end: number | null; skipped: boolean };
export const vtCount = (page: Page) => page.evaluate("window.__vt ? window.__vt.length : 0") as Promise<number>;
export const vtSince = async (page: Page, from: number): Promise<VtRun[]> => JSON.parse((await page.evaluate(`JSON.stringify((window.__vt || []).slice(${from}))`)) as string);
/** Skipped, or ended well before the shortest of the desk's moves (0.23 s) could have played. */
export const cutShort = (run: VtRun) => run.skipped || (run.ready !== null && run.end !== null && run.end - run.ready < 150);
/**
 * The screen's own trips to the server from now on: requests for its own path — not the router's
 * prefetches, and not the pages it loads ahead for its links («Открыть» loads the full card).
 */
export function watchServerTrips(page: Page): () => number {
  let trips = 0;
  const seen = (request: Request) => {
    if (!request.url().includes("_rsc=") || request.headers()["next-router-prefetch"]) return;
    if (new URL(request.url()).pathname === new URL(page.url()).pathname) trips += 1;
  };
  page.on("request", seen);
  return () => {
    page.off("request", seen);
    return trips;
  };
}
export const vtWords = (runs: VtRun[]) => runs.map((run) => `[${run.groups.filter((g) => !g.startsWith("_t_") && g !== "root").map((g) => g.replace(/-[0-9a-f-]{36}$/, "")).join(" ")}${cutShort(run) ? " оборван" : ""}]`).join(" ");
/** The desk's own keyframes of each run, for a record's detail: `[vt-panel-in] [vt-fade-out vt-arrive]`. */
export const vtNames = (runs: VtRun[]) => runs.map((run) => `[${[...new Set(run.names)].join(" ")}${cutShort(run) ? " оборван" : ""}]`).join(" ");
