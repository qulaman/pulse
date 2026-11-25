import { pluralRu } from "@/lib/tasks/status-text";

import type { TvLine } from "./feed";

/**
 * What the mascot says and feels on the wall. A pure function: the phrase and the face's state
 * come from the feed and the summary, not assembled in the component.
 *
 * Two rules stricter than usual, because this is the TV:
 *  - **no negativity** (D-45): on the office screen the face is calm, speaking or asleep — never
 *    displeased, alarmed or calling. Declines and overdue never reach it even as an event
 *    (see lib/tv/feed.ts);
 *  - **the name first, then a colon** (D-185): «Марат: в работе» — no verb has to agree with a
 *    name (a name gives no gender) and no case has to bend it.
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

/** A phrase of the band is read in passing: past this many letters the words are left out, not cut. */
export const PHRASE_MAX = 48;

/** The words fit the band whole, or the line goes without them — never «…» on the wall (D-185). */
function fits(text: string | null, room: number): text is string {
  return text !== null && text.length <= room;
}

/**
 * One short phrase per event — for the face and for the band, so they never disagree (D-185).
 * The name stands first with a colon: no verb has to agree with it (a name gives no gender) and no
 * case has to bend it. An order's title stays off the wall until the director has accepted the
 * work: a title is dictated for one person, not for the room (D-45).
 */
export function phraseOf(line: TvLine): string {
  const name = line.name;
  const title = line.detail;
  switch (line.kind) {
    case "task_sent":
      return `${name}: новая задача`;
    case "task_accepted":
      return `${name}: в работе`;
    case "task_review":
      return `${name}: на проверке`;
    case "task_done":
      return fits(title, PHRASE_MAX - name.length - 2) ? `${name}: ${title}` : `${name}: готово`;
    case "points":
      return line.amount ? `${name}: +${line.amount} ${pluralRu(line.amount, ["очко", "очка", "очков"])}` : `${name}: похвала`;
    case "announcement":
      return fits(title, PHRASE_MAX - 12) ? `Объявление: ${title}` : "Новое объявление";
    case "merch":
      return fits(title, PHRASE_MAX - name.length - 12) ? `${name}: награда «${title}»` : `${name}: новая награда`;
    case "event":
      // a guest gets no title from the base (D-33): the face names the meeting plainly
      return fits(title, PHRASE_MAX - 7) ? `Скоро: ${title}` : "Скоро встреча";
  }
}

/**
 * With no news the face greets the room by the Aqtobe clock (D-185). «Сегодня» shows the day's numbers
 * itself, large — the face does not repeat them. The same greeting is the home's headline
 * while the day has no number at all.
 */
export function greetingOf(now: Date, today: { done: number } = { done: 0 }): string {
  const hour = hourOf(now);
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 22) return today.done > 0 ? "Спасибо за день" : "Добрый вечер";
  return "Доброй ночи";
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
  if (!newest || since > FRESH_MS) return { text: greetingOf(now, today), mood: "calm" };

  // новость лицо именно проговаривает; за хорошую — радуется
  return { text: phraseOf(newest), mood: GLAD.has(newest.kind) ? "happy" : "speaking" };
}
