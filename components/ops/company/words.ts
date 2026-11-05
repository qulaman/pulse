import type { Footprint } from "@/lib/ops/contract";
import { secretaryActionCode } from "@/lib/settings-plain";

/**
 * The console's words for what the base calls by code: roles, tables, parser models. Pure, so the
 * screens stay free of a mapping each. The roles are spelled here, not imported from
 * lib/people/queries: that module brings the browser Supabase client the console must not have.
 */

const ROLE_TEXT: Record<string, string> = {
  director: "Директор",
  manager: "Руководитель",
  employee: "Сотрудник",
  shopkeeper: "Завхоз магазина",
  secretary: "Секретарь",
  tv: "ТВ-экран",
};

export const roleText = (role: string): string => ROLE_TEXT[role] ?? role;

export const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] || fullName;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailReady = (email: string): boolean => EMAIL.test(email.trim());

/* ---- the address ------------------------------------------------------------------------------ */

const SLUG = /^[a-z0-9-]{2,40}$/;

export const slugReady = (slug: string): boolean => SLUG.test(slug);

/** The address a company's name suggests, in latin letters; empty when the name gives none. */
export function suggestSlug(name: string): string {
  if (!/[a-zа-яёәғқңөұүһі0-9]/i.test(name)) return "";
  const slug = secretaryActionCode(name.replace(/[«»"'`’]/g, ""))
    .replace(/_+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slugReady(slug) ? slug : "";
}

/* ---- the parser ------------------------------------------------------------------------------- */

export type ParserProvider = "anthropic" | "deepseek";

/** The strong model goes with the main one: a mixed pair would need both keys on the server. */
export const PARSER_CHOICES: Record<ParserProvider, { title: string; hint: string; model: string; escalation_model: string }> = {
  anthropic: {
    title: "Claude",
    hint: "Умолчание для новых компаний. Обычные поручения разбирает Haiku, сложные перепроверяет Sonnet.",
    model: "claude-haiku-4-5",
    escalation_model: "claude-sonnet-5",
  },
  deepseek: {
    title: "DeepSeek",
    hint: "Дешевле, на нём работает пилот. Обычные поручения разбирает V3, сложные перепроверяет R1.",
    model: "deepseek-chat",
    escalation_model: "deepseek-reasoner",
  },
};

export const PARSER_ITEMS = (["anthropic", "deepseek"] as const).map((value) => ({ value, title: PARSER_CHOICES[value].title, hint: PARSER_CHOICES[value].hint }));

/** Said wherever the model is chosen: a wrong choice does not show until the first voice message. */
export const PARSER_NOTE =
  "От этого зависит голос: каждая запись и каждая строка директора разбираются выбранной моделью, туда же уходит их текст. Если на сервере нет рабочего ключа поставщика, разбор не сработает, записи при этом сохранятся.";

export function parserProvider(settings: { parser_provider: string | null; parser_model: string | null }): ParserProvider {
  // the model is what the parser really reads (lib/ai/parse.ts)
  if (settings.parser_model) return settings.parser_model.startsWith("deepseek-") ? "deepseek" : "anthropic";
  return settings.parser_provider === "deepseek" ? "deepseek" : "anthropic";
}

/* ---- the footprint ---------------------------------------------------------------------------- */

const TABLE_TEXT: Record<string, string> = {
  ai_logs: "Журнал разбора",
  announcement_acks: "Отметки об объявлениях",
  announcements: "Объявления",
  companies: "Карточка компании",
  daily_reports: "Отчёты за день",
  errands: "Заявки секретарю",
  ether_events: "Новости эфира",
  event_participants: "Участники встреч",
  events: "Встречи и мероприятия",
  inbox_items: "Записи директора",
  ingest_batches: "Принятые разборы",
  login_codes: "Коды входа",
  mind_boards: "Доски директора",
  notes: "Заметки",
  notification_deliveries: "Уведомления и квитанции",
  notification_prefs: "Настройки уведомлений",
  orders: "Заказы в магазине",
  point_disputes: "Споры по очкам",
  point_transactions: "Начисления очков",
  profiles: "Люди",
  push_subscriptions: "Телефоны с уведомлениями",
  recurrence_rules: "Повторяющиеся задачи",
  reminders: "Напоминания",
  shop_items: "Товары магазина",
  task_messages: "Сообщения в задачах",
  task_reactions: "Реакции на задачи",
  task_reads: "Отметки о прочтении задач",
  tasks: "Задачи",
  tv_events: "События стены",
  tv_state: "Состояние стены",
  visits: "Посетители",
  voice_kept: "Записи «в корпус»",
};

/** What `ops_wipe_activity` leaves in place (tasks/029 «Чистка активности»); anything else goes. */
const SURVIVES_WIPE = new Set(["companies", "profiles", "login_codes", "push_subscriptions", "notification_prefs", "voice_kept", "shop_items", "tv_state"]);

export type FootprintRow = { table: string; label: string; count: number; survivesWipe: boolean };

/** The biggest first; a table the words above do not know yet still shows, by its own name. */
export function footprintRows(footprint: Footprint): FootprintRow[] {
  return Object.entries(footprint.tables)
    .map(([table, count]) => ({ table, label: TABLE_TEXT[table] ?? table, count, survivesWipe: SURVIVES_WIPE.has(table) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
}

/**
 * The most files a wipe can take: voice and photos without the recordings kept «в корпус». A ceiling:
 * the wipe also spares the shop's photos, and the footprint does not count those apart.
 */
export function filesWiped(footprint: Footprint): number {
  return Math.max(0, footprint.files.voice.count + footprint.files.photos.count - footprint.kept_files);
}

export function filesTotal(footprint: Footprint): number {
  return footprint.files.voice.count + footprint.files.photos.count + footprint.files.brand.count;
}

export const BUCKET_TEXT: Record<keyof Footprint["files"], string> = {
  voice: "Голосовые записи",
  photos: "Фотографии",
  brand: "Логотип и оформление",
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The purge opens for 24 hours after a finished export; `at` is when the footprint was read. */
export function exportFresh(footprint: Footprint, at: number): boolean {
  return footprint.last_export !== null && at - Date.parse(footprint.last_export.at) < DAY_MS;
}

/** «820 Б», «14 КБ», «3,4 МБ»: the point moves, the words stay. */
export function bytesText(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

/* ---- a deadline on the company's clock (Asia/Aqtobe, UTC+5) ------------------------------------ */

const AQTOBE_MS = 5 * 60 * 60 * 1000;

/** ISO → the value of `<input type="datetime-local">` on the Aqtobe clock; empty for no deadline. */
export function deadlineToInput(iso: string | null): string {
  return iso ? new Date(Date.parse(iso) + AQTOBE_MS).toISOString().slice(0, 16) : "";
}

/** The input's value back to ISO with the offset; null when the field was emptied. */
export function deadlineFromInput(value: string): string | null {
  return value ? `${value}:00+05:00` : null;
}

/* ---- a task's id ------------------------------------------------------------------------------ */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The id out of what was pasted: the id itself or a link with it inside. */
export function taskIdIn(text: string): string | null {
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}
