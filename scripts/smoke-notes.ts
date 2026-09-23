/**
 * «Заметки» in a real browser (system Chrome via Playwright), as the director
 * test@demo.local: a typed note lands with a receipt on the display, the dictaphone
 * key records → the note appears as «Распознаю…» → the words arrive, a card opens and
 * autosaves, pins, the search marks hits, delete → the bin → «Вернуть», and the purge.
 * D-95: a reminder set on the card rings by the sweep's RPC and opens its note from the
 * push link; a thought typed or dictated without network waits on the phone and lands by
 * itself (even after the tab was closed); the bin shows when a note goes and hides what
 * is past three days; «Показать раньше» and the server search reach notes past the feed.
 *   pnpm smoke:notes                         — against http://localhost:3000 (APP_URL to override)
 *   FAKE_MIC_WAV=<wav> pnpm smoke:notes      — also dictates: Chrome plays the WAV as the microphone
 * Screenshots land in SHOTS_DIR (default ./.smoke-ui). Everything the run created is
 * hard-deleted at the end by id (service role) — the owner's notes are never touched.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

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

const errors: string[] = [];

async function openPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("console", (message) => {
    // a request that died with the network is the point of the offline checks, not a bug
    if (message.type() === "error" && !/ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_NETWORK_CHANGED/i.test(message.text())) {
      errors.push(`console: ${message.text().slice(0, 300)}`);
    }
  });
  return page;
}

async function holdKey(page: Page, ms: number) {
  const box = await page.getByTestId("dictation-key").boundingBox();
  if (!box) throw new Error("no dictation key");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Wait until the card of this note carries words, not «Распознаю…». */
async function waitForWords(page: Page, id: string, timeout = 30_000): Promise<string> {
  const card = page.locator(`[data-testid="note-card"][data-note-id="${id}"]`);
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if ((await card.count()) > 0) {
      const first = (await card.first().innerText()).split("\n")[0];
      if (first && !first.includes("Распознаю") && !first.includes("Голосовая заметка")) return first;
    }
    await page.waitForTimeout(500);
  }
  return "";
}

const settled = (promise: Promise<unknown>) =>
  promise.then(
    () => true,
    () => false,
  );

async function main() {
  await guardActivity();
  const created = new Set<string>();
  const deliveries = new Set<string>();

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
  let page = await openPage(context);

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
    const typedCard = () => page.locator('[data-testid="note-card"]', { hasText: `Smoke notes ${STAMP}: склад` }).first();
    await typedCard().waitFor({ timeout: 10_000 });
    const typedId = await typedCard().getAttribute("data-note-id");
    if (typedId) created.add(typedId);
    record("a typed note is on the feed at once", Boolean(typedId));
    record("the display says «Записал»", (await page.getByTestId("notes-lcd").innerText()).toLowerCase().includes("записал"));
    await shot(page, "02-typed");

    // the author of this run — for the rows the service role plants below
    const owner = admin && typedId ? (await admin.from("notes").select("user_id, company_id").eq("id", typedId).single()).data : null;

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
      const sawPending = await settled(page.getByTestId("note-transcribing").first().waitFor({ timeout: 8_000 }));
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
    await typedCard().click();
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

    // ---- reminder (D-95) --------------------------------------------------------
    await page.getByTestId("note-remind").click();
    await page.getByTestId("remind-presets").getByRole("button", { name: "Через час" }).click();
    await page.locator('[data-group="reminders"]').waitFor({ timeout: 5_000 }).catch(() => undefined);
    const remindLine = (await typedCard().innerText()).split("\n").find((line) => line.includes("напомню")) ?? "";
    record("«Напомнить» files the note under «Напоминания»", (await page.locator('[data-group="reminders"]').count()) > 0 && remindLine !== "", remindLine);
    await shot(page, "07b-reminder");
    if (admin && typedId) {
      await page.waitForTimeout(1_500);
      const row = (await admin.from("notes").select("remind_at, reminded_at").eq("id", typedId).single()).data;
      record("the reminder is on the row", Boolean(row?.remind_at) && row?.reminded_at === null, row?.remind_at ?? "");
      // the minute has come: move it into the past and run the sweep's tick
      await admin.from("notes").update({ remind_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", typedId);
      const tick = await admin.rpc("notes_due_reminders");
      const sent = await admin.from("notification_deliveries").select("id, meta").eq("event_kind", "note_reminder").like("meta->>url", `%${typedId}`);
      for (const delivery of sent.data ?? []) deliveries.add(delivery.id);
      const meta = (sent.data?.[0]?.meta ?? {}) as { title?: string; body?: string; url?: string };
      record("the tick queues one push to the author", !tick.error && (sent.data?.length ?? 0) === 1 && meta.url === `/notes?n=${typedId}`, `${meta.title} · ${meta.body}`);
      const again = await admin.rpc("notes_due_reminders");
      const twice = await admin.from("notification_deliveries").select("id").eq("event_kind", "note_reminder").like("meta->>url", `%${typedId}`);
      record("a second tick sends nothing", !again.error && (twice.data?.length ?? 0) === 1);
      // the open card's reminder button turns into «напомнил … · ещё раз»
      const rang = await settled(page.getByTestId("note-remind").getByText("напомнил", { exact: false }).waitFor({ timeout: 8_000 }));
      // the «Напоминания» heading leaves with its exit animation
      const left = await settled(page.locator('[data-group="reminders"]').waitFor({ state: "detached", timeout: 5_000 }));
      record("the card says «напомнил» once it rang", rang && left);
      await shot(page, "07c-rang");
    }

    // ---- search ---------------------------------------------------------------
    await page.getByRole("button", { name: "Свернуть" }).click();
    // search sits behind the magnifier in the title row (D-93)
    await page.getByTestId("notes-search-toggle").click();
    await page.getByLabel("Поиск по заметкам").fill(STAMP);
    const marks = await page.locator("mark").count();
    record("the search marks the hit", marks > 0, `${marks} marks`);
    await shot(page, "08-search");
    await page.getByLabel("Поиск по заметкам").fill("");

    // ---- the push link opens its note (D-95) ------------------------------------
    if (typedId) {
      await page.goto(`${APP_URL}/notes?n=${typedId}`, { waitUntil: "networkidle" });
      const opened = await settled(page.getByTestId("note-editor").waitFor({ timeout: 10_000 }));
      record("/notes?n=<id> opens that note", opened && (await page.getByTestId("note-editor").inputValue()).includes(STAMP));
      await page.getByRole("button", { name: "Свернуть" }).click();
    }

    // ---- delete → bin → restore → purge ---------------------------------------
    await typedCard().click();
    await page.getByTestId("note-delete").click();
    await page.getByTestId("notes-filter-trash").click();
    const trashed = page.locator('[data-testid="note-trashed"]', { hasText: `${STAMP}: склад` }).first();
    await trashed.waitFor({ timeout: 5_000 });
    record("a deleted note waits in the bin", true);
    const expires = await trashed.getByTestId("note-expires").innerText();
    record("the bin says when it goes", expires.startsWith("исчезнет"), expires);
    await page.waitForTimeout(450); // the tab's entrance, not a half-drawn frame
    await shot(page, "09-trash");
    await trashed.getByTestId("note-restore").click();
    await page.getByTestId("notes-filter-active").click();
    await typedCard().waitFor({ timeout: 5_000 });
    record("«Вернуть» brings it back to the feed", true);

    // and out for good: only from the bin, through the confirmation sheet
    await typedCard().click();
    await page.getByTestId("note-delete").click();
    await page.getByTestId("notes-filter-trash").click();
    await page.locator('[data-testid="note-trashed"]', { hasText: `${STAMP}: склад` }).first().getByRole("button", { name: "Удалить навсегда" }).click();
    await page.getByTestId("notes-purge-confirm").click();
    await page.locator('[data-testid="note-trashed"]', { hasText: `${STAMP}: склад` }).first().waitFor({ state: "detached", timeout: 5_000 });
    await page.waitForTimeout(1_000);
    if (admin && typedId) {
      const left = await admin.from("notes").select("id").eq("id", typedId);
      record("«Удалить навсегда» removes the row", (left.data?.length ?? 1) === 0);
    }

    // ---- the bin keeps three days (D-95) ----------------------------------------
    if (admin && owner) {
      const day = 86_400_000;
      const planted = await admin
        .from("notes")
        .insert([
          { ...owner, text: `Smoke notes ${STAMP}: корзина вчера`, deleted_at: new Date(Date.now() - day).toISOString() },
          { ...owner, text: `Smoke notes ${STAMP}: корзина давно`, deleted_at: new Date(Date.now() - 4 * day).toISOString() },
        ])
        .select("id, text");
      for (const row of planted.data ?? []) created.add(row.id);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("notes-filter-trash").click();
      await page.locator('[data-testid="note-trashed"]', { hasText: `${STAMP}: корзина вчера` }).first().waitFor({ timeout: 8_000 });
      const stale = await page.locator('[data-testid="note-trashed"]', { hasText: `${STAMP}: корзина давно` }).count();
      record("past three days a note is gone from the bin even before the sweep", stale === 0);
      const purged = await admin.rpc("notes_purge_trash");
      const leftRows = await admin.from("notes").select("text").in("id", (planted.data ?? []).map((row) => row.id));
      record(
        "the sweep's purge takes only what is past three days",
        !purged.error && (leftRows.data ?? []).map((row) => row.text).join() === `Smoke notes ${STAMP}: корзина вчера`,
        `purged ${purged.data ?? purged.error?.message}`,
      );
      await page.getByTestId("notes-filter-active").click();
    }

    // ---- a thought typed without network survives a closed tab (D-95) -------------
    const offlineText = `Smoke notes ${STAMP}: без связи`;
    await context.setOffline(true);
    await page.getByTestId("note-draft").fill(offlineText);
    await page.getByTestId("dictation-key").click();
    const offlineCard = page.locator('[data-testid="note-card"]', { hasText: offlineText }).first();
    await offlineCard.waitFor({ timeout: 5_000 });
    await settled(offlineCard.getByText("ждёт связи").waitFor({ timeout: 5_000 }));
    record("a thought typed without network says «ждёт связи»", (await offlineCard.innerText()).includes("ждёт связи"));
    await shot(page, "12-offline-typed");
    await page.close();
    await context.setOffline(false);
    page = await openPage(context);
    await page.goto(`${APP_URL}/notes`, { waitUntil: "networkidle" });
    const landed = await settled(page.locator('[data-testid="note-card"]', { hasText: offlineText }).first().waitFor({ timeout: 20_000 }));
    if (admin) {
      await page.waitForTimeout(1_000);
      const rows = await admin.from("notes").select("id").eq("text", offlineText);
      for (const row of rows.data ?? []) created.add(row.id);
      record("…and lands once after the tab was closed", landed && (rows.data?.length ?? 0) === 1, `${rows.data?.length ?? 0} rows`);
    }

    // ---- a thought dictated without network waits on the phone (D-95) ------------
    if (FAKE_MIC_WAV) {
      await context.setOffline(true);
      await holdKey(page, 3_500);
      const phone = page.getByTestId("note-pending").first();
      const kept = await settled(phone.waitFor({ timeout: 10_000 }));
      const display = (await page.getByTestId("notes-lcd").innerText()).toLowerCase();
      record("a thought dictated without network waits on the phone", kept && display.includes("на телефоне"), display.split("\n").slice(0, 2).join(" · "));
      await page.waitForTimeout(450); // the tab's entrance, not a half-drawn frame
      await shot(page, "13-offline-voice");
      const phoneId = kept ? await phone.getAttribute("data-note-id") : null;
      await context.setOffline(false);
      if (phoneId) {
        created.add(phoneId);
        const words = await waitForWords(page, phoneId, 45_000);
        record("…and lands with its words when the network is back", words.length > 5, `«${words}»`);
      }
      await shot(page, "14-offline-voice-landed");
    }

    // ---- older notes: «Показать раньше» and the server search (D-95) --------------
    if (admin && owner) {
      const base = Date.parse("2025-03-01T06:00:00Z");
      const deep = `глубоко${STAMP}`;
      const bulk = Array.from({ length: 305 }, (_, index) => ({
        ...owner,
        text: index === 0 ? `Smoke notes ${STAMP}: самая старая ${deep}` : `Smoke notes ${STAMP}: старая ${index}`,
        created_at: new Date(base + index * 60_000).toISOString(),
      }));
      const inserted = await admin.from("notes").insert(bulk).select("id");
      for (const row of inserted.data ?? []) created.add(row.id);
      await page.reload({ waitUntil: "networkidle" });
      await page.getByTestId("notes-lcd").waitFor();
      const older = page.getByTestId("notes-older");
      const offered = await settled(older.waitFor({ timeout: 10_000 }));
      const deepCard = () => page.locator('[data-testid="note-card"]', { hasText: deep });
      record("past 300 notes the feed offers «Показать раньше»", offered && (await deepCard().count()) === 0);
      const headline = await page.getByTestId("notes-headline").innerText();
      record("the status screen counts what the server holds", Number.parseInt(headline, 10) >= 305, headline.replace(/\s+/g, " "));
      await page.getByTestId("notes-search-toggle").click();
      await page.getByLabel("Поиск по заметкам").fill(deep);
      const found = await settled(deepCard().first().waitFor({ timeout: 10_000 }));
      record("the search finds a note past the loaded feed", found);
      await shot(page, "15-search-older");
      await page.getByLabel("Поиск по заметкам").fill("");
      await page.getByTestId("notes-search-toggle").click();
      if (offered) {
        await older.click();
        await settled(page.getByTestId("notes-older").waitFor({ state: "detached", timeout: 10_000 }));
        record("«Показать раньше» loads the rest", (await page.getByTestId("notes-older").count()) === 0);
      }
    }

    await page.getByTestId("notes-filter-converted").click();
    await page.waitForTimeout(450); // the tab's entrance, not a half-drawn frame
    await shot(page, "10-converted");
    await page.getByTestId("notes-filter-active").click();

    // the SE width: nothing scrolls sideways
    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    record("no horizontal scroll at 320 px", !overflow);
    await shot(page, "11-320");
  } catch (error) {
    // the screen at the moment of the failure says more than the locator log
    await shot(page, "zz-failure").catch(() => undefined);
    record("smoke:notes", false, error instanceof Error ? error.message.split(String.fromCharCode(10))[0] : String(error));
  } finally {
    record("no page errors", errors.length === 0, errors.join(" | "));
    if (admin && deliveries.size > 0) await admin.from("notification_deliveries").delete().in("id", [...deliveries]);
    if (admin) {
      // whatever this run left, by its stamp — the owner's notes carry none
      const stamped = await admin.from("notes").select("id").like("text", `Smoke notes ${STAMP}%`);
      for (const row of stamped.data ?? []) created.add(row.id);
    }
    if (admin && created.size > 0) {
      const ids = [...created];
      let failed = "";
      for (let at = 0; at < ids.length; at += 200) {
        const { error } = await admin.from("notes").delete().in("id", ids.slice(at, at + 200));
        if (error) failed = error.message;
      }
      console.log(failed ? `cleanup failed: ${failed}` : `cleaned up ${created.size} notes`);
    }
    await browser.close();
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed · shots in ${SHOTS}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
