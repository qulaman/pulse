import type { TvLine } from "./feed";

/**
 * Что маскот говорит и чувствует на стене. Чистая функция: фраза и состояние лица
 * считаются из ленты и сводки, а не собираются по месту в компоненте.
 *
 * Два правила жёстче обычного, потому что это ТВ:
 *  - **никакого негатива** (D-45): на экране в кабинете лицо бывает спокойным, довольным
 *    или спящим — и никогда недовольным, встревоженным, зовущим. Отказы и просрочки сюда
 *    не доходят даже как событие (см. lib/tv/feed.ts);
 *  - **настоящее время вместо прошедшего**: «Марат берёт в работу», а не «взял» — имя не
 *    даёт рода, а настоящее время в русском по роду не согласуется (то же правило, что в
 *    lib/pulse/ether.ts, только здесь оно даёт живую речь, а не назывные подписи).
 */

/**
 * Состояния лица, разрешённые на стене: спокоен, говорит о новости, доволен, спит.
 * Ни тревоги, ни недовольства, ни зова — это всё личное и живёт в канале адресата (D-45).
 */
export type TvMood = "calm" | "speaking" | "happy" | "sleeping";

export type TvSpeech = { text: string | null; mood: TvMood };

/** Сколько событие остаётся «новостью», о которой лицо говорит. */
export const FRESH_MS = 90_000;
/** Тишина дольше этого ночью — экран засыпает. */
export const SLEEP_AFTER_MS = 30 * 60_000;

/** Добрые события: на них лицо теплеет. */
const GLAD = new Set(["task_done", "points", "merch"]);

const AQTOBE_OFFSET_MS = 5 * 3_600_000;

/** Час по стенным часам Актобе. */
function hourOf(date: Date): number {
  return Math.floor(((date.getTime() + AQTOBE_OFFSET_MS) % 86_400_000) / 3_600_000);
}

/** Ночь — с 22:00 до 06:00: в кабинете никого, экран может спать. */
function isNight(now: Date): boolean {
  const hour = hourOf(now);
  return hour >= 22 || hour < 6;
}

/** Одна фраза о событии — и лицу, и бегущей строке, чтобы они не разошлись в словах. */
export function phraseOf(line: TvLine): string {
  const name = line.name;
  const title = line.detail;
  switch (line.kind) {
    case "task_sent":
      return title ? `Новое поручение: ${title}` : `${name} — новое поручение`;
    case "task_accepted":
      return `${name} берёт в работу`;
    case "task_review":
      return `${name} сдаёт работу`;
    case "task_done":
      return `${name} — принято`;
    case "points":
      return line.amount ? `${name} получает ${line.amount}` : `${name} получает очки`;
    case "announcement":
      return title ? `Объявление: ${title}` : "Объявление для всех";
    case "merch":
      return title ? `${name} забирает награду: ${title}` : `${name} забирает награду`;
  }
}

/** Когда новостей нет — лицо говорит про день в целом, а не молчит впустую. */
function idlePhrase(today: { sent: number; done: number; in_work: number }): string {
  if (today.done > 0) return `Сегодня принято: ${today.done}`;
  if (today.in_work > 0) return `В работе: ${today.in_work}`;
  if (today.sent > 0) return `Сегодня роздано: ${today.sent}`;
  return "Пока тихо";
}

/**
 * Фраза и состояние лица на текущий момент. `lines` — лента, новое первым.
 */
export function speechOf(
  lines: readonly TvLine[],
  today: { sent: number; done: number; in_work: number },
  now: Date = new Date(),
): TvSpeech {
  const newest = lines[0];
  const since = newest ? now.getTime() - newest.at.getTime() : Infinity;

  if (since > SLEEP_AFTER_MS && isNight(now)) return { text: null, mood: "sleeping" };
  if (!newest || since > FRESH_MS) return { text: idlePhrase(today), mood: "calm" };

  // новость лицо именно проговаривает; за хорошую — радуется
  return { text: phraseOf(newest), mood: GLAD.has(newest.kind) ? "happy" : "speaking" };
}
