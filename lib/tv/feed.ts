/**
 * Что ТВ говорит о событии. Чистая функция: экран берёт уже готовую строку, а правило
 * «какое слово над каким событием» проверяется юнит-тестом, а не глазами на стене.
 *
 * Verbs never agree with the person — a name gives no gender (same rule as lib/pulse/ether.ts),
 * поэтому все подписи — назывные: «Новое поручение», «В работе», «Принято».
 * Негатива на экране нет вовсе: отказ, доработка и просрочка по именам не проецируются
 * в tv_events (D-45) — просрочка живёт только числом в вердикте.
 */

export const TV_KINDS = [
  "task_sent",
  "task_accepted",
  "task_review",
  "task_done",
  "points",
  "announcement",
  "merch",
  "event",
] as const;

export type TvKind = (typeof TV_KINDS)[number];

/** Полезная часть события — та копия payload, которая положена текущему режиму. */
export type TvPayload = { name: string | null; title: string | null; amount: number | null };

export type TvEvent = {
  id: string;
  kind: TvKind;
  created_at: string;
  payload: TvPayload;
  payload_guest: TvPayload;
};

export type TvTone = "accent" | "ok" | "gold" | "muted";

export type TvLine = {
  id: string;
  kind: TvKind;
  /** О ком событие; в гостевом режиме — имя без фамилии. */
  name: string;
  /** Назывная подпись события. */
  label: string;
  /** Вторая строка: заголовок поручения, причина очков, текст объявления — или null. */
  detail: string | null;
  /** Очки события; у гостя всегда null — цифр он не видит. */
  amount: number | null;
  tone: TvTone;
  at: Date;
};

const LABEL: Record<TvKind, string> = {
  task_sent: "Новое поручение",
  task_accepted: "В работе",
  task_review: "На проверке",
  task_done: "Принято",
  points: "Очки",
  announcement: "Объявление",
  merch: "Награда",
  event: "Скоро",
};

const TONE: Record<TvKind, TvTone> = {
  task_sent: "accent",
  task_accepted: "accent",
  task_review: "muted",
  task_done: "ok",
  points: "gold",
  announcement: "accent",
  merch: "gold",
  event: "accent",
};

/** Длинный текст объявления на экране режется — читают его с двух метров. */
const DETAIL_MAX = 120;

function trim(text: string | null): string | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX - 1)}…` : clean;
}

/** Строка ленты для события в текущем режиме (guest = рендер из предмаскированной копии). */
export function lineOf(event: TvEvent, guest: boolean): TvLine {
  const payload = guest ? event.payload_guest : event.payload;
  const amount = guest ? null : payload.amount;
  const label = event.kind === "points" && amount ? `+${amount}` : LABEL[event.kind];
  return {
    id: event.id,
    kind: event.kind,
    // у мероприятия нет актора: оно не про человека, а про всех, кто придёт
    name: payload.name?.trim() || "Компания",
    label,
    detail: trim(payload.title),
    amount,
    tone: TONE[event.kind],
    at: new Date(event.created_at),
  };
}

export function isTvKind(value: string): value is TvKind {
  return (TV_KINDS as readonly string[]).includes(value);
}
