/**
 * «Заметки» in a real browser (system Chrome via Playwright), as the director
 * test@demo.local: a typed note lands with a receipt on the display, the dictaphone
 * key records → the note appears as «Распознаю…» → the words arrive, a card opens and
 * autosaves, pins, the search marks hits, delete → the bin → «Вернуть», and the purge.
 *   pnpm smoke:notes                         — against http://localhost:3000 (APP_URL to override)
 *   FAKE_MIC_WAV=<wav> pnpm smoke:notes      — also dictates: Chrome plays the WAV as the microphone
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui). Everything the run created is
 * hard-deleted at the end by id (service role) — the owner's notes are never touched.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? join(process.cwd(), ".smoke-ui");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FAKE_MIC_WAV = process.env.FAKE_MIC_WAV;
const STAMP = Date.now().toString(36);

mkdirSync(SHOTS, { recursive: true });

const checks: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

const admin = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

/** The owner tests on the same dev project: a live voice session there means «not now». */
async function guardActivity() {
  if (!admin || process.env.FORCE === "1") return;
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const voice = await admin.from("ai_logs").select("id").eq("source", "voice").gt("created_at", since).limit(1);
  if ((voice.data?.length ?? 0) > 0) {
    console.error("somebody is dictating on dev in the last 30 min; set FORCE=1 to run anyway");
    process.exit(2);
  }
}

async function login(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Почта").fill("test@demo.local");
  await page.getByLabel("Пароль").fill("1");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `notes-${name}.png`) });

async function main() {
  await guardActivity();
  const created = new Set<string>();

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: FAKE_MIC_WAV
      ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`]
      : [],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ru-RU",
    permissions: ["microphone", "clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 300)}`);
  });

  try {
    await login(page);
    await page.goto(`${APP_URL}/notes`, { waitUntil: "networkidle" });
    await page.getByTestId("notes-lcd").waitFor({ timeout: 20_000 });
    await shot(page, "01-open");
    record("the device head renders", await page.getByTestId("dictation-key").isVisible());

    // ---- typed note -----------------------------------------------------------
    const typed = `Smoke notes ${STAMP}: склад у ворот\nвторая строка про запчасти`;
    await page.getByTestId("note-draft").fill(typed);
    record("the round key turns into «записать»", (await page.getByTestId("dictation-key").getAttribute("data-mode")) === "send");
    await page.getByTestId("dictation-key").click();
    const typedCard = page.locator('[data-testid="note-card"]', { hasText: `Smoke notes ${STAMP}` }).first();
    await typedCard.waitFor({ timeout: 10_000 });
    const typedId = await typedCard.getAttribute("data-note-id");
    if (typedId) created.add(typedId);
    record("a typed note is on the feed at once", Boolean(typedId));
    record("the display says «Записал»", (await page.getByTestId("notes-lcd").innerText()).toLowerCase().includes("записал"));
    await shot(page, "02-typed");

    // ---- dictation ------------------------------------------------------------
    if (FAKE_MIC_WAV) {
      const key = page.getByTestId("dictation-key");
      const box = await key.boundingBox();
      if (!box) throw new Error("no dictation key");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(1500);
      await shot(page, "03-recording");
      record("the display listens while the key is held", (await page.getByTestId("notes-lcd").innerText()).toLowerCase().includes("запись"));
      await page.waitForTimeout(3500);
      await page.mouse.up();
      const pending = page.getByTestId("note-transcribing").first();
      const sawPending = await pending.waitFor({ timeout: 8_000 }).then(
        () => true,
        () => false,
      );
      if (sawPending) await shot(page, "04-transcribing");
      record("the dictated note is a row before it is words", sawPending);
      const started = Date.now();
      await page.getByTestId("note-transcribing").first().waitFor({ state: "detached", timeout: 30_000 });
      const voiced = page.locator('[data-testid="note-card"]').filter({ hasText: "голос" }).first();
      const voicedId = await voiced.getAttribute("data-note-id");
      if (voicedId) created.add(voicedId);
      const words = (await voiced.innerText()).split("\n")[0];
      record("the words arrive on the card", words.length > 5 && !words.includes("Голосовая заметка"), `${Date.now() - started} ms · «${words}»`);
      await shot(page, "05-dictated");
    } else {
      console.log("skip  dictation (set FAKE_MIC_WAV to a WAV to run it)");
    }

    // ---- open, edit, autosave, pin ------------------------------------------
    await typedCard.click();
    const editor = page.getByTestId("note-editor");
    await editor.waitFor();
    await editor.fill(`Smoke notes ${STAMP}: склад у ворот\nвторая строка про запчасти\nтретья — дописал`);
    await page.getByTestId("note-saved").waitFor({ timeout: 10_000 });
    record("the open card autosaves with a receipt", true);
    await shot(page, "06-open-card");
    await page.getByTestId("note-pin").click();
    await page.locator('[data-group="pinned"]').waitFor({ timeout: 5_000 }).catch(() => undefined);
    const pinnedGroup = await page.locator('[data-group="pinned"]').count();
    record("pinning files the note under «Закреплённые»", pinnedGroup > 0);
    await shot(page, "07-pinned");

    // ---- search ---------------------------------------------------------------
    await page.getByRole("button", { name: "Свернуть" }).click();
    await page.getByLabel("Поиск по заметкам").fill(STAMP);
    const marks = await page.locator("mark").count();
    record("the search marks the hit", marks > 0, `${marks} marks`);
    await shot(page, "08-search");
    await page.getByLabel("Поиск по заметкам").fill("");

    // ---- delete → bin → restore → purge ---------------------------------------
    await typedCard.click();
    await page.getByTestId("note-delete").click();
    await page.getByTestId("notes-filter-trash").click();
    const trashed = page.locator('[data-testid="note-trashed"]', { hasText: STAMP }).first();
    await trashed.waitFor({ timeout: 5_000 });
    record("a deleted note waits in the bin", true);
    await shot(page, "09-trash");
    await trashed.getByTestId("note-restore").click();
    await page.getByTestId("notes-filter-active").click();
    await page.locator('[data-testid="note-card"]', { hasText: STAMP }).first().waitFor({ timeout: 5_000 });
    record("«Вернуть» brings it back to the feed", true);

    // and out for good: only from the bin, through the confirmation sheet
    await page.locator('[data-testid="note-card"]', { hasText: STAMP }).first().click();
    await page.getByTestId("note-delete").click();
    await page.getByTestId("notes-filter-trash").click();
    await page.locator('[data-testid="note-trashed"]', { hasText: STAMP }).first().getByRole("button", { name: "Удалить навсегда" }).click();
    await page.getByTestId("notes-purge-confirm").click();
    await page.locator('[data-testid="note-trashed"]', { hasText: STAMP }).first().waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(1_000);
    if (admin && typedId) {
      const left = await admin.from("notes").select("id").eq("id", typedId);
      record("«Удалить навсегда» removes the row", (left.data?.length ?? 1) === 0);
    }

    await page.getByTestId("notes-filter-converted").click();
    await shot(page, "10-converted");
    await page.getByTestId("notes-filter-active").click();

    // the SE width: nothing scrolls sideways
    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    record("no horizontal scroll at 320 px", !overflow);
    await shot(page, "11-320");
  } finally {
    record("no page errors", errors.length === 0, errors.join(" | "));
    if (admin && created.size > 0) {
      const { error } = await admin.from("notes").delete().in("id", [...created]);
      console.log(error ? `cleanup failed: ${error.message}` : `cleaned up ${created.size} notes`);
    }
    await browser.close();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed · shots in ${SHOTS}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
