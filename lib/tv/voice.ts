import type { TvLine } from "./feed";
import { DEFAULT_PROGRAM_WINDOW, nightIn, type ProgramWindow } from "./program";

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
    case "event":
      // гостю названия не досталось уже в данных (D-33) — лицо говорит обезличенно
      return title ? `Скоро — «${title}»` : "Скоро — мероприятие";
  }
}

/**
 * Фраза и состояние лица на текущий момент. `lines` — лента, новое первым.
 *
 * Без свежей новости лицо молчит (D-182): «Сегодня принято: 9» повторяло первую строку бегущей
 * строки — под лицом в это время темп дня (`TvPace`). Ночь — то же окно, что у стены
 * (`tv_summary.program`, `isNight` в `state.ts`).
 */
export function speechOf(
  lines: readonly TvLine[],
  // the day's numbers once made the idle phrase; the face no longer repeats the ticker (D-182)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _today: { sent: number; done: number; in_work: number } | null = null,
  now: Date = new Date(),
  w: ProgramWindow = DEFAULT_PROGRAM_WINDOW,
): TvSpeech {
  const newest = lines[0];
  const since = newest ? now.getTime() - newest.at.getTime() : Infinity;

  if (since > SLEEP_AFTER_MS && nightIn(now, w)) return { text: null, mood: "sleeping" };
  if (!newest || since > FRESH_MS) return { text: null, mood: "calm" };

  // новость лицо именно проговаривает; за хорошую — радуется
  return { text: phraseOf(newest), mood: GLAD.has(newest.kind) ? "happy" : "speaking" };
}
