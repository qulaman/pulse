import type { NotifyPrefs } from "@/lib/push/prefs";

/**
 * The plain part of the director's push rules (D-114): the lists, the labels and the row
 * formatters, with no zod in them — the settings screen imports them from here, and
 * lib/push/prefs.ts (the schema) would bring all of zod into its bundle (D-126).
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
  "team",
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const NOTIFY_MODES = ["now", "quiet", "digest", "off"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

export const DIGEST_EVERY = ["30min", "hour", "twice"] as const;
export type DigestEvery = (typeof DIGEST_EVERY)[number];

export const UNSEEN_AFTER = [15, 30, 60] as const;
export const DAY_SUMMARY_TIMES = ["18:00", "19:00", "20:00", "21:00"] as const;

export const CATEGORY_LABEL: Record<NotifyCategory, string> = {
  review: "Сдали на приёмку",
  declined: "Отказы «Не могу»",
  questions: "Вопросы по задачам",
  messages: "Сообщения в задачах",
  unseen: "Задачу не приняли",
  overdue: "Просрочки",
  secretary: "Секретарь и посетители",
  calendar: "Календарь",
  shop: "Магазин",
  team: "Уведомления команды",
};

export const CATEGORY_HINT: Record<NotifyCategory, string> = {
  review: "Сотрудник сдал задачу — принять или вернуть",
  declined: "Сотрудник нажал «Не могу» и назвал причину",
  questions: "«Уточнить» в задаче — ждёт вашего ответа",
  messages: "Ответы, фото и голосовые в переписке задачи",
  unseen: "Задача ушла, а «Принял» так никто и не нажал. В пуше — увидел ли её сотрудник. Только в рабочие часы",
  overdue: "Срок прошёл, а задача не сдана",
  secretary: "Готово с результатом, вопрос секретаря, «не выйдет», посетитель, сообщение на экран",
  calendar: "«Скоро» перед встречей, «не сможет», перенос и отмена",
  shop: "Сотрудник заказал награду",
  team: "У человека перестали доходить уведомления — о задачах он узнает, только открыв Pulse. Раз в неделю на человека",
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

/** The right-hand word of a category row: «Сразу», «Сводкой»; «не приняли» — «30 мин» or «30 мин · тихо». */
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
