/**
 * The order line's voice and its panel (D-164), on answers given in this browser — nothing is
 * parsed, recorded to Storage or sent: the parse and the confirm are answered here, the
 * microphone is an oscillator, every recording is dropped before it is uploaded.
 */
import type { Page } from "playwright";

import { injected, open, record, type Ctx } from "./shared";

const ONE = { user_id: "00000000-0000-4000-8000-000000000001", full_name: "Смоук Первый", score: 0.95 };
const TASK_ID = "00000000-0000-4000-8000-0000000000aa";

function oneTask() {
  return [
    {
      kind: "task",
      group_id: null,
      body: null,
      scheduled_send_at: null,
      title: "Проверить смету по объекту",
      source_span: "смета",
      assignee_queries: ["Смоук"],
      assignee_id: ONE.user_id,
      assignee_name: ONE.full_name,
      assignee_confidence: 0.95,
      deadline_iso: null,
      deadline_confidence: null,
      deadline_source_text: null,
      priority: "normal",
      assignee: { status: "matched", user_id: ONE.user_id, candidates: [ONE], flag: "ok" },
    },
  ];
}

/** The microphone of this page: a quiet tone, or a refusal of the kind asked for. */
async function fakeMic(page: Page, mode: "tone" | "blocked") {
  await page.evaluate((how) => {
    const media = navigator.mediaDevices as MediaDevices & { __real?: MediaDevices["getUserMedia"] };
    media.__real ??= media.getUserMedia.bind(media);
    media.getUserMedia = async () => {
      if (how === "blocked") throw new DOMException("Permission denied", "NotAllowedError");
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      gain.gain.value = 0.2;
      const out = audio.createMediaStreamDestination();
      tone.connect(gain).connect(out);
      tone.start();
      return out.stream;
    };
  }, mode);
}

const blur = (page: Page) => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));

export async function checkVoice(ctx: Ctx) {
  const { page } = ctx;
  await open(page, "/desk/tasks");
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/voice/upload-url")) uploads.push(request.url());
  });

  // the phrase never seems to vanish: the panel opens at Enter with the words and «Разбираю…»
  await page.route("**/api/voice/parse", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entities: oneTask(), inbox_id: null, suspicious: false }) });
  });
  await page.route("**/api/voice/confirm", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { task_ids: [TASK_ID], scheduled: false }, duplicate: false }) }),
  );
  try {
    await page.keyboard.press("Control+KeyK");
    await page.keyboard.type(`Смоук ${ctx.stamp}: проверить смету`);
    const t0 = Date.now();
    await page.keyboard.press("Enter");
    const flight = page.getByTestId("desk-ingest-flight");
    const opened = await flight.waitFor({ timeout: 1_000 }).then(() => Date.now() - t0, () => -1);
    const stage = opened >= 0 ? await flight.getAttribute("data-stage") : null;
    const words = opened >= 0 ? await page.getByTestId("desk-ingest-words").innerText().catch(() => "") : "";
    await ctx.shot("voice-parsing");
    const confirm = page.getByTestId("desk-confirm");
    const landed = await confirm.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    record(
      "строка поручения: панель открывается сразу — фраза и «Разбираю…», затем в ней же разбор",
      opened >= 0 && stage === "parsing" && words.includes(ctx.stamp) && landed,
      `панель за ${opened} мс, стадия ${stage}, разбор ${landed}`,
    );

    // «Срочно» is a switch with a box; «Убрать» says on the row what it will do
    const urgent = page.getByTestId("desk-entity-urgent").first();
    const before = await urgent.getAttribute("aria-checked");
    await urgent.click();
    const after = await urgent.getAttribute("aria-checked");
    await urgent.click();
    await page.getByTestId("desk-entity-remove").first().hover();
    const hint = await page.getByTestId("desk-entity-remove-hint").innerText().catch(() => "");
    await page.mouse.move(10, 400);
    record("подтверждение: «Срочно» — переключатель, «Убрать» — отдельная кнопка с подсказкой на строке", before === "false" && after === "true" && hint.includes("не уйдёт"), `срочно ${before} → ${after}; «${hint}»`);

    // after the send: whom and what, «Открыть» for ten seconds
    await page.keyboard.press("Control+Enter");
    const toasts = page.getByTestId("toasts-low");
    const shown = await toasts.waitFor({ timeout: 10_000 }).then(() => true, () => false);
    const text = shown ? await toasts.innerText() : "";
    await ctx.shot("voice-toast");
    await page.waitForTimeout(5_000);
    const lives = await toasts.isVisible().catch(() => false);
    // the faked answer named a task the base has not: its «not found» is this part's own doing
    injected.ids.push(TASK_ID);
    await toasts.getByRole("button", { name: "Открыть" }).click().catch(() => undefined);
    const went = await page.waitForURL((url) => url.searchParams.get("id") === TASK_ID, { timeout: 10_000 }).then(() => true, () => false);
    record(
      "после отправки: тост «кому — что» с «Открыть» живёт дольше прежних 3 с и ведёт к задаче",
      shown && /Отправил: .+ — «Проверить смету по объекту»/.test(text) && lives && went,
      `«${text.replace(/\n+/g, " | ")}», через 5 с ${lives ? "на месте" : "пропал"}, переход ${went}`,
    );
  } finally {
    await page.unroute("**/api/voice/parse");
    await page.unroute("**/api/voice/confirm");
  }

  // the microphone: «V» outside a field records into the panel; Esc drops it — nothing uploaded
  await open(page, "/desk/tasks");
  await fakeMic(page, "tone");
  await blur(page);
  await page.keyboard.press("KeyV");
  const flight = page.getByTestId("desk-ingest-flight");
  const listening = await flight.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  await page.waitForTimeout(1_300);
  const stage = listening ? await flight.getAttribute("data-stage") : null;
  const mic = await page.getByTestId("command-mic").getAttribute("data-recording");
  const elapsed = await page.getByTestId("voice-elapsed").first().innerText().catch(() => "");
  await ctx.shot("voice-recording");
  await page.keyboard.press("Escape");
  const dropped = await page.getByTestId("desk-panel").waitFor({ state: "detached", timeout: 3_000 }).then(() => true, () => false);
  await page.waitForTimeout(500);
  record(
    "голос: «V» — запись в панели со временем, Esc — отмена, ничего не загружено",
    listening && stage === "recording" && mic === "1" && /^0:0[1-9]$/.test(elapsed) && dropped && uploads.length === 0,
    `стадия ${stage}, кнопка ${mic}, время ${elapsed}, панель закрыта ${dropped}, загрузок ${uploads.length}`,
  );

  // a slip of the finger: said so, with «Сказать ещё раз»
  await blur(page);
  await page.keyboard.press("KeyV");
  await flight.waitFor({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  const short = await page.getByTestId("desk-confirm").waitFor({ timeout: 5_000 }).then(() => page.getByTestId("desk-confirm").getAttribute("data-code"), () => null);
  const again = await page.getByTestId("desk-confirm-speak").count();
  record("голос: слишком короткая запись — понятная строка и «Сказать ещё раз», ничего не загружено", short === "record_too_short" && again === 1 && uploads.length === 0, `код ${short}`);
  await page.getByTestId("desk-confirm-cancel").click();

  // the browser refuses the microphone: the panel says what to do
  await fakeMic(page, "blocked");
  await page.getByTestId("command-mic").click();
  const refused = await page.getByTestId("desk-confirm-error").innerText({ timeout: 5_000 }).catch(() => "");
  await ctx.shot("voice-refused");
  record("голос: микрофон не дан — строка, что сделать", /микрофон/i.test(refused), `«${refused}»`);
  await page.getByTestId("desk-confirm-cancel").click().catch(() => undefined);
}
