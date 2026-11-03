/**
 * What the desk smoke's parts share (scripts/smoke-desk.ts, D-153): the app's address, the list
 * of checks, the context each part gets, and how a desk screen is opened. Each role of tasks/022
 * writes its steps in its own file next to this one.
 */
import type { Page } from "playwright";

process.loadEnvFile(".env.local");

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export type Check = { name: string; ok: boolean; detail: string };
export const checks: Check[] = [];

export function record(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

export function skip(name: string, why: string) {
  checks.push({ name, ok: true, detail: `пропущено: ${why}` });
  console.log(`skip  ${name}  ${why}`);
}

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
