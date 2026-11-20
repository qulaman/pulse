/**
 * What the desk smoke's parts share (scripts/smoke-desk.ts, D-153): the app's address, the list
 * of checks, the context each part gets, and how a desk screen is opened. Each role of tasks/022
 * writes its steps in its own file next to this one.
 */
import type { Page } from "playwright";

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
