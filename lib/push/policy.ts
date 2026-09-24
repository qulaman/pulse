/**
 * How a push travels (D-114): the fixed transport policy per event kind — how long the push
 * service keeps it for a phone that is off, how hard it wakes the phone, whether it plays a
 * sound. This is the employee's whole "settings screen": the system decides, nobody tunes
 * it. The director's own layer (mode / quiet / digest) is applied by the database when the
 * row is queued; the only traces of it here are `silent` and `private` on the row.
 *
 * Pure: the worker passes the row in, the vitest suite pins the matrix.
 */

export type Urgency = "very-low" | "low" | "normal" | "high";

export type Transport = {
  /** Seconds the push service keeps the message for a phone that is offline. */
  ttl: number;
  urgency: Urgency;
  /** No sound, no vibration (Android and desktop; iPhone plays what the phone decides). */
  silent: boolean;
};

const MIN = 60;
const HOUR = 60 * MIN;

type Rule = { ttl: number; urgency: Urgency; silent?: boolean };

/**
 * The matrix of docs/BACKEND.md §4. «Сразу» kinds wake the phone (`high`); good news that
 * changes nothing in the person's day travels quietly; a push that makes no sense later
 * dies with its moment (a request to the secretary, a visitor, «скоро»).
 */
const RULES: Record<string, Rule> = {
  // tasks: the assignee's work
  task_sent: { ttl: 24 * HOUR, urgency: "high" },
  rework: { ttl: 24 * HOUR, urgency: "high" },
  revoked: { ttl: 24 * HOUR, urgency: "high" },
  message: { ttl: 24 * HOUR, urgency: "high" },
  done: { ttl: 24 * HOUR, urgency: "normal", silent: true },
  deadline_extended: { ttl: 24 * HOUR, urgency: "normal", silent: true },
  // the director's side of a task
  pending_review: { ttl: 24 * HOUR, urgency: "high" },
  declined: { ttl: 24 * HOUR, urgency: "high" },
  task_unseen: { ttl: 4 * HOUR, urgency: "high" },
  task_overdue: { ttl: 12 * HOUR, urgency: "normal" },
  digest: { ttl: 6 * HOUR, urgency: "normal" },
  day_summary: { ttl: 6 * HOUR, urgency: "normal" },
  // everybody
  announcement: { ttl: 24 * HOUR, urgency: "normal" },
  event_invite: { ttl: 24 * HOUR, urgency: "normal" },
  event_moved: { ttl: 24 * HOUR, urgency: "normal" },
  event_cancelled: { ttl: 24 * HOUR, urgency: "normal" },
  event_declined: { ttl: 12 * HOUR, urgency: "normal" },
  event_reminder: { ttl: 1 * HOUR, urgency: "high" },
  note_reminder: { ttl: 12 * HOUR, urgency: "high" },
  shop_order: { ttl: 48 * HOUR, urgency: "normal" },
  shop_approved: { ttl: 48 * HOUR, urgency: "normal", silent: true },
  shop_ready: { ttl: 48 * HOUR, urgency: "normal", silent: true },
  shop_cancelled: { ttl: 48 * HOUR, urgency: "normal", silent: true },
  // the secretary's desk lives in minutes
  errand_sent: { ttl: 30 * MIN, urgency: "high" },
  errand_accepted: { ttl: 30 * MIN, urgency: "high" },
  errand_done: { ttl: 30 * MIN, urgency: "high" },
  errand_declined: { ttl: 30 * MIN, urgency: "high" },
  errand_question: { ttl: 30 * MIN, urgency: "high" },
  errand_answer: { ttl: 30 * MIN, urgency: "high" },
  visit_arrived: { ttl: 20 * MIN, urgency: "high" },
  visit_message: { ttl: 30 * MIN, urgency: "high" },
  visit_answered: { ttl: 20 * MIN, urgency: "high" },
  test: { ttl: 10 * MIN, urgency: "high" },
};

const DEFAULT_RULE: Rule = { ttl: 12 * HOUR, urgency: "high" };

/** The alarm («вызови охрану!») repeats every minute: an old copy is noise, never a quiet one. */
const ALARM_RULE: Rule = { ttl: 5 * MIN, urgency: "high" };

export type PolicyRow = {
  event_kind: string;
  meta: unknown;
  /** The director's «Тихо» (set by the routing trigger). */
  silent?: boolean | null;
};

function metaFlag(meta: unknown, key: string): boolean {
  return typeof meta === "object" && meta !== null && (meta as Record<string, unknown>)[key] === true;
}

export function transportFor(row: PolicyRow): Transport {
  const urgent = metaFlag(row.meta, "urgent");
  const rule = urgent ? ALARM_RULE : (RULES[row.event_kind] ?? DEFAULT_RULE);
  // the director's «Тихо» quiets anything but the alarm; a quiet push never jumps the doze queue
  const silent = !urgent && (Boolean(row.silent) || Boolean(rule.silent));
  return { ttl: rule.ttl, urgency: silent && rule.urgency === "high" ? "normal" : rule.urgency, silent };
}

/**
 * «Текст на блокировке: только что случилось» (the director's `private` rows): the kind of
 * news without its words — no task title, no name, no message. The alarm keeps its words.
 */
const PRIVATE_TITLE: Record<string, string> = {
  review: "Задача на приёмке",
  declined: "Отказ по задаче",
  questions: "Вопрос по задаче",
  messages: "Новое сообщение",
  unseen: "Задачу не открыли",
  overdue: "Просрочка",
  secretary: "От секретаря",
  calendar: "Календарь",
  shop: "Магазин",
  reminders: "Напоминание",
  tasks: "Задачи",
  system: "Pulse",
};

export type PushText = { title: string; body: string };

export function lockScreenText(
  row: { category?: string | null; private?: boolean | null },
  text: PushText,
): PushText {
  if (!row.private || row.category === "alarm") return text;
  return { title: PRIVATE_TITLE[row.category ?? ""] ?? "Pulse", body: "" };
}

/** One bubble per task in the shade: a later word about the same task replaces the earlier one. */
export function pushTag(meta: unknown, taskId: string | null): string | null {
  const tag = typeof meta === "object" && meta !== null ? (meta as Record<string, unknown>).tag : null;
  if (typeof tag === "string" && tag) return tag;
  return taskId ? `task:${taskId}` : null;
}
