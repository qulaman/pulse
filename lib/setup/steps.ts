import type { Maker } from "@/lib/setup/device";

/**
 * «Подключение» (D-190): the steps that take a phone from «opened a link» to «Pulse on the home
 * screen, pushes arrive». Pure — what the device and the server say comes in as facts, what the
 * person said («пришло», «пропустить») as marks; vitest pins the verdicts and the words.
 */

export type StepId = "install" | "push" | "test" | "mic";
export const STEP_IDS: readonly StepId[] = ["install", "push", "test", "mic"];

/**
 * `blocked` — cannot be done here yet (an iPhone outside the home-screen app has no push);
 * `checking` — the server has not answered whether it knows this phone.
 */
export type StepState = "done" | "todo" | "skipped" | "blocked" | "checking";

/** Why a step is where it is — which words and which button the screen shows. */
export type StepWhy =
  | "ios-tab"
  | "android-offer"
  | "android-menu"
  | "desktop"
  | "off"
  | "denied"
  | "resubscribe"
  | "broken"
  | "device-off"
  | "unsupported"
  | "no-keys"
  | "need-push";

export type Step = { id: StepId; state: StepState; why?: StepWhy };

export type Platform = "ios" | "android" | "other";
export type PushPermission = "unsupported" | "no_keys" | "denied" | "granted" | "default";

/**
 * This phone on the server: `ok` — its subscription is known and the last push went through;
 * `missing` — the browser has none, or one the server never heard of; `broken` — the last push
 * to it failed; `off` — switched off in the director's device list (D-114).
 */
export type Channel = "checking" | "ok" | "missing" | "broken" | "off";
export type MicPermission = "granted" | "denied" | "prompt" | "unsupported" | "unknown";

/** This browser's own row of `push_subscriptions` (RLS lets a person read their own, D-114). */
export type ChannelRow = { enabled: boolean; last_ok_at: string | null; last_error_at: string | null };

/** What the server knows of this phone's subscription; `row` null — it knows nothing of it. */
export function channelOf(row: ChannelRow | null): Exclude<Channel, "checking"> {
  if (!row) return "missing";
  if (!row.enabled) return "off";
  const failed = row.last_error_at ? new Date(row.last_error_at).getTime() : 0;
  const ok = row.last_ok_at ? new Date(row.last_ok_at).getTime() : 0;
  return failed > ok ? "broken" : "ok";
}

export type SetupFacts = {
  platform: Platform;
  maker: Maker;
  /** the app that carries the pushes («Chrome», «Samsung Internet»…) */
  browser: string;
  standalone: boolean;
  /** a messenger's own browser — its name, `""` when it does not say; null in a real browser */
  inApp: string | null;
  /** Chrome on Android offers its install dialog right now */
  installOffer: boolean;
  push: PushPermission;
  channel: Channel;
  mic: MicPermission;
};

/** What the person said on this phone — kept per person and device (lib/setup/marks.ts). */
export type SetupMarks = {
  install?: "done" | "skipped";
  push?: "skipped";
  test?: "done" | "skipped";
  mic?: "done" | "skipped";
  /** when the screen was first shown here: the first sign-in opens it only once */
  seen?: string;
  /** «Не сейчас» on Лента's line: hidden for this day (YYYY-MM-DD, Asia/Aqtobe) */
  later?: string;
};

function installStep(f: SetupFacts, m: SetupMarks): Step {
  if (f.standalone) return { id: "install", state: "done" };
  // Android's Chrome and its installed app share one storage: «установлено» stays true in the tab
  if (f.platform === "android" && m.install === "done") return { id: "install", state: "done" };
  if (f.platform === "other") return { id: "install", state: "skipped", why: "desktop" };
  if (m.install === "skipped") return { id: "install", state: "skipped" };
  if (f.platform === "ios") return { id: "install", state: "todo", why: "ios-tab" };
  return { id: "install", state: "todo", why: f.installOffer ? "android-offer" : "android-menu" };
}

function pushStep(f: SetupFacts, m: SetupMarks): Step {
  if (f.push === "granted" && f.channel === "ok") return { id: "push", state: "done" };
  if (m.push === "skipped") return { id: "push", state: "skipped" };
  switch (f.push) {
    case "granted":
      if (f.channel === "checking") return { id: "push", state: "checking" };
      return { id: "push", state: "todo", why: f.channel === "broken" ? "broken" : f.channel === "off" ? "device-off" : "resubscribe" };
    case "default":
      return { id: "push", state: "todo", why: "off" };
    case "denied":
      return { id: "push", state: "todo", why: "denied" };
    case "no_keys":
      return { id: "push", state: "blocked", why: "no-keys" };
    default:
      // iPhone gets Web Push only in the home-screen app (iOS 16.4+)
      return { id: "push", state: "blocked", why: f.platform === "ios" && !f.standalone ? "ios-tab" : "unsupported" };
  }
}

function testStep(push: Step, m: SetupMarks): Step {
  if (push.state !== "done") {
    if (m.test === "skipped") return { id: "test", state: "skipped" };
    return { id: "test", state: push.state === "checking" ? "checking" : "blocked", why: "need-push" };
  }
  if (m.test === "done") return { id: "test", state: "done" };
  if (m.test === "skipped") return { id: "test", state: "skipped" };
  return { id: "test", state: "todo" };
}

function micStep(f: SetupFacts, m: SetupMarks): Step {
  if (f.mic === "granted" || m.mic === "done") return { id: "mic", state: "done" };
  if (m.mic === "skipped") return { id: "mic", state: "skipped" };
  if (f.mic === "unsupported") return { id: "mic", state: "blocked", why: "unsupported" };
  if (f.mic === "denied") return { id: "mic", state: "todo", why: "denied" };
  return { id: "mic", state: "todo" };
}

/** The four steps in their order: the home screen first — on an iPhone push lives only there. */
export function setupSteps(f: SetupFacts, m: SetupMarks): Step[] {
  const push = pushStep(f, m);
  return [installStep(f, m), push, testStep(push, m), micStep(f, m)];
}

export const resolved = (step: Step): boolean => step.state === "done" || step.state === "skipped";

export type Progress = {
  /** steps done — the «2» of «2 из 4»; a skipped step is not done */
  done: number;
  total: number;
  /** every step done or skipped: the screen shows «Готово», the profile «Проверить телефон» */
  complete: boolean;
  /** the server has not answered yet: nothing is decided about this phone */
  checking: boolean;
};

export function setupProgress(steps: readonly Step[]): Progress {
  return {
    done: steps.filter((s) => s.state === "done").length,
    total: steps.length,
    complete: steps.every(resolved),
    checking: steps.some((s) => s.state === "checking"),
  };
}

/** The step the screen opens: the first one not done or skipped; null — all through. */
export function currentStep(steps: readonly Step[]): StepId | null {
  return steps.find((s) => !resolved(s))?.id ?? null;
}

/** «2 из 4» */
export function progressLabel(p: Progress): string {
  return `${p.done} из ${p.total}`;
}

/**
 * The first sign-in on a phone opens the screen once, by itself (D-190) — for the team, whose
 * work arrives by push; the director finds it in «Профиль», the wall never. Not before the server
 * has answered, not when everything is through, never twice on one phone for one person.
 */
export function shouldAutoOpen({ team, facts, marks, progress }: { team: boolean; facts: SetupFacts; marks: SetupMarks; progress: Progress }): boolean {
  if (!team || facts.platform === "other" || marks.seen) return false;
  return !progress.checking && !progress.complete;
}

/**
 * The home screens' one line about the phone (D-190) — «Настроить телефон · 2 из 4» and, under it,
 * what to do first, in these words. It replaces the separate push and install cards on Лента and
 * Пульс. Only while the push itself is not through: the home screen alone on Android and the
 * microphone are no reason to ask every day. Null — no line.
 */
export function entryLine(facts: SetupFacts, steps: readonly Step[]): string | null {
  const push = steps.find((s) => s.id === "push");
  const test = steps.find((s) => s.id === "test");
  if (!push || !test || steps.some((s) => s.state === "checking")) return null;
  if (facts.platform === "other") return null;
  if (facts.inApp !== null) return `Откройте в ${facts.platform === "ios" ? "Safari" : "Chrome"} — ${facts.inApp ? `внутри ${facts.inApp}` : "здесь"} уведомлений нет`;
  if (!resolved(push)) {
    if (push.why === "ios-tab") return "Добавьте Pulse на экран «Домой»";
    if (push.why === "denied") return "Уведомления запрещены — разрешите их в настройках";
    if (push.why === "broken" || push.why === "resubscribe") return "Подключите уведомления заново";
    return "Включите уведомления";
  }
  if (!resolved(test)) return "Проверьте, что уведомления доходят";
  return null;
}

/** The day in Aqtobe for «Не сейчас — до завтра» (rule 8 of CLAUDE.md: shown in Asia/Aqtobe). */
export function aqtobeDay(now: Date): string {
  return new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}

export type Advice = { title: string; steps: string[] };

/**
 * «Не пришло» — what usually holds a push on this kind of phone (D-190, D-125). Honest: these are
 * the places to look, not a promise; a phone without Google's services cannot get a browser push
 * at all, and the words say so.
 */
export function pushAdvice(maker: Maker, browser: string): Advice {
  const app = browser || "Chrome";
  switch (maker) {
    case "iphone":
      return {
        title: "iPhone",
        steps: [
          "Проверьте «Фокусирование» в Пункте управления: в «Не беспокоить» и других режимах уведомления приходят без звука и баннера. Добавьте Pulse в разрешённые или выключите режим.",
          "«Настройки» → «Уведомления» → Pulse: включите «Допуск уведомлений», баннеры и звуки.",
          "Pulse открывайте с экрана «Домой»: из Safari уведомления не приходят.",
        ],
      };
    case "xiaomi":
      return {
        title: "Xiaomi, Redmi, POCO",
        steps: [
          `«Настройки» → «Приложения» → ${app} → «Автозапуск» — включите.`,
          "Там же «Контроль активности» или «Батарея» → «Нет ограничений».",
          `«Уведомления» ${app} — разрешите, вместе с «На экране блокировки».`,
        ],
      };
    case "samsung":
      return {
        title: "Samsung",
        steps: [
          `«Настройки» → «Аккумулятор» → «Ограничения в фоновом режиме»: уберите ${app} из «Спящих» и «Глубоко спящих приложений».`,
          `Там же добавьте ${app} в «Неспящие приложения».`,
          `«Приложения» → ${app} → «Аккумулятор» → «Без ограничений».`,
        ],
      };
    case "huawei":
      return {
        title: "Huawei, Honor",
        steps: [
          "Если на телефоне нет сервисов Google (нет Play Маркета), уведомления из браузера не доходят — так устроен телефон. О задачах вы узнаете, открыв Pulse.",
          `Если сервисы Google есть: «Настройки» → «Батарея» → «Запуск приложений» → ${app} → «Вручную», включите все три переключателя.`,
          `«Настройки» → «Уведомления» → ${app} — разрешите.`,
        ],
      };
    case "android":
      return {
        title: "Android",
        steps: [
          `«Настройки» → «Приложения» → ${app} → «Батарея» → «Без ограничений».`,
          `«Уведомления» ${app} — разрешены, и уведомления сайтов тоже.`,
          "Режим «Не беспокоить» выключен.",
        ],
      };
    default:
      return { title: "Браузер", steps: ["Разрешите уведомления для Pulse в настройках браузера и системы."] };
  }
}

/** The microphone was refused: where it is switched back on. */
export function micAdvice(platform: Platform, standalone: boolean, browser: string): string {
  if (platform === "ios") {
    return standalone
      ? "Микрофон запрещён: «Настройки» iPhone → Pulse → «Микрофон», или удалите Pulse с экрана «Домой» и добавьте заново."
      : "Микрофон запрещён: «аА» слева от адреса → «Настройки веб-сайта» → «Микрофон» → «Разрешить».";
  }
  if (platform === "android") return `Микрофон запрещён: нажмите на замок слева от адреса → «Разрешения» → «Микрофон» → «Разрешить». Или «Настройки» → «Приложения» → ${browser || "Chrome"} → «Разрешения».`;
  return "Микрофон запрещён в браузере: разрешите его в настройках сайта.";
}
