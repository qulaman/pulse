import { z } from "zod";

/**
 * The director's push rules (D-114). Stored per person in `notification_prefs` and applied by
 * the database when a row is queued (the routing trigger, migration 20260924150200) — so the
 * defaults live twice: here and in `notify_prefs_defaults()`. Keep both. The defaults are
 * today's behaviour (everything «сразу», no quiet hours); the two new signals are on:
 * «задачу не открыли» after 30 minutes, overdue in a digest.
 *
 * Nobody else has rules: employees, the secretary and the shopkeeper live by the fixed policy
 * of lib/push/policy.ts and the company delivery window.
 */

export const NOTIFY_CATEGORIES = [
  "review",
  "declined",
  "questions",
  "messages",
  "unseen",
  "overdue",
  "secretary",
  "calendar",
  "shop",
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const NOTIFY_MODES = ["now", "quiet", "digest", "off"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

export const DIGEST_EVERY = ["30min", "hour", "twice"] as const;
export type DigestEvery = (typeof DIGEST_EVERY)[number];

export const UNSEEN_AFTER = [15, 30, 60] as const;
export const DAY_SUMMARY_TIMES = ["18:00", "19:00", "20:00", "21:00"] as const;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const mode = (fallback: NotifyMode) => z.enum(NOTIFY_MODES).default(fallback);

export const NotifyPrefsSchema = z.object({
  modes: z
    .object({
      review: mode("now"),
      declined: mode("now"),
      questions: mode("now"),
      messages: mode("now"),
      unseen: mode("now"),
      overdue: mode("digest"),
      secretary: mode("now"),
      calendar: mode("now"),
      shop: mode("now"),
    })
    .prefault({}),
  /** «Задачу не открыли» after this many minutes in working hours. */
  unseen_after_min: z.number().int().min(5).max(240).default(30),
  digest_every: z.enum(DIGEST_EVERY).default("hour"),
  /** «Итог дня» at this Aqtobe time; null — off. */
  day_summary_at: HHMM.nullable().default(null),
  quiet: z
    .object({
      on: z.boolean().default(false),
      from: HHMM.default("21:00"),
      to: HHMM.default("08:00"),
      /** Saturday and Sunday are quiet all day. */
      weekends: z.boolean().default(false),
    })
    .prefault({}),
  /** What passes the quiet hours. The alarm always does. */
  pass: z
    .object({
      reminders: z.boolean().default(true),
      visitors: z.boolean().default(true),
      vip: z.boolean().default(false),
    })
    .prefault({}),
  /** During a calendar meeting only what cannot wait comes; the rest waits for its end. */
  meetings: z.boolean().default(false),
  /** Important people: their tasks' news always comes at once. */
  vip: z.array(z.guid()).max(50).default([]),
  /** «Текст на блокировке»: «full» — the words, «short» — only what happened. */
  lock_text: z.enum(["full", "short"]).default("full"),
});

export type NotifyPrefs = z.infer<typeof NotifyPrefsSchema>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = NotifyPrefsSchema.parse({});

/** Whatever the row holds, a whole valid object comes back; a broken section falls back to defaults. */
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  const result = NotifyPrefsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // keep what is readable section by section rather than dropping everything
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(NotifyPrefsSchema.shape) as (keyof NotifyPrefs)[]) {
    const one = NotifyPrefsSchema.shape[key].safeParse(source[key]);
    if (one.success) out[key] = one.data;
  }
  return NotifyPrefsSchema.parse(out);
}

export const CATEGORY_LABEL: Record<NotifyCategory, string> = {
  review: "Сдали на приёмку",
  declined: "Отказы «Не могу»",
  questions: "Вопросы по задачам",
  messages: "Сообщения в задачах",
  unseen: "Задачу не открыли",
  overdue: "Просрочки",
  secretary: "Секретарь и посетители",
  calendar: "Календарь",
  shop: "Магазин",
};

export const CATEGORY_HINT: Record<NotifyCategory, string> = {
  review: "Сотрудник сдал задачу — принять или вернуть",
  declined: "Сотрудник нажал «Не могу» и назвал причину",
  questions: "«Уточнить» в задаче — ждёт вашего ответа",
  messages: "Ответы, фото и голосовые в переписке задачи",
  unseen: "Задача ушла, а сотрудник её так и не открыл — только в рабочие часы",
  overdue: "Срок прошёл, а задача не сдана",
  secretary: "Готово с результатом, вопрос секретаря, «не выйдет», посетитель",
  calendar: "«Скоро» перед встречей, «не сможет», перенос и отмена",
  shop: "Сотрудник заказал награду",
};

export const MODE_LABEL: Record<NotifyMode, string> = {
  now: "Сразу",
  quiet: "Тихо",
  digest: "Сводкой",
  off: "Не присылать",
};

export const MODE_HINT: Record<NotifyMode, string> = {
  now: "Пуш со звуком, как только случилось",
  quiet: "Без звука и вибрации. На iPhone звук решает сам телефон",
  digest: "Копится и приходит одним пушем по расписанию сводки",
  off: "Только в приложении — на Пульсе и в «Задачах»",
};

export const DIGEST_LABEL: Record<DigestEvery, string> = {
  "30min": "каждые 30 минут",
  hour: "каждый час",
  twice: "в 12:00 и 17:00",
};

/** The right-hand word of a category row: «Сразу», «Сводкой»; «не открыли» — «30 мин» or «30 мин · тихо». */
export function categoryValue(prefs: NotifyPrefs, category: NotifyCategory): string {
  const mode = prefs.modes[category];
  const word = MODE_LABEL[mode];
  if (category === "unseen" && mode !== "off") {
    return mode === "now" ? `${prefs.unseen_after_min} мин` : `${prefs.unseen_after_min} мин · ${word.toLowerCase()}`;
  }
  return word;
}

/** «21:00–08:00, и выходные» / «выключено». */
export function quietValue(prefs: NotifyPrefs): string {
  if (!prefs.quiet.on) return "выключено";
  return `${prefs.quiet.from}–${prefs.quiet.to}${prefs.quiet.weekends ? ", сб–вс" : ""}`;
}
