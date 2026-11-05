import { canDeletePerson, type Who } from "@/lib/people/access";

/**
 * What stands behind a card (the owner, 2026-11-04): a card with history is never deleted — only
 * fired; a duplicate or a typo may go. Every foreign key to `profiles` in supabase/migrations is
 * listed here, one way or the other; history.test.ts reads the migrations, so a new one that
 * lands in neither list fails the tests instead of being cascaded away in silence.
 */

/** Rows that say the person worked, or that other people's rows lean on. */
export type HistorySource = {
  table: string;
  column: string;
  /** How the rows are called to the director — sources with one label add up. */
  label: string;
  /** Leave out rows of this column equal to the person: their own row is not history. */
  notSelf?: string;
  /** Only rows with this value count: the rest are not the person's doing. */
  only?: { column: string; value: string };
};

const TASKS = "задачи";
const CHAT = "сообщения в задачах";
const POINTS = "очки";
const SHOP = "заказы в магазине";
const MEETINGS = "встречи";
const ERRANDS = "заявки секретарю";
const VISITS = "посетители";
const NOTES = "заметки и доски";
const REPORTS = "отчёты";
const ETHER = "объявления";
const WORK = "действия в Pulse";

export const HISTORY_SOURCES: readonly HistorySource[] = [
  // the work
  { table: "tasks", column: "assignee_id", label: TASKS },
  { table: "tasks", column: "author_id", label: TASKS },
  { table: "tasks", column: "passed_to", label: TASKS },
  { table: "recurrence_rules", column: "assignee_id", label: TASKS },
  { table: "recurrence_rules", column: "author_id", label: TASKS },
  { table: "reminders", column: "user_id", label: TASKS },
  { table: "task_messages", column: "sender_id", label: CHAT },
  { table: "task_reactions", column: "author_id", label: CHAT },
  // «не сдан» is written by the morning tick, not by the person: a card made by mistake collects
  // these by itself, and they go with the card (AUTO_ROWS)
  { table: "daily_reports", column: "user_id", label: REPORTS, only: { column: "status", value: "submitted" } },
  // points and disputes
  { table: "point_transactions", column: "user_id", label: POINTS },
  { table: "point_transactions", column: "actor_id", label: POINTS },
  { table: "point_disputes", column: "user_id", label: POINTS },
  { table: "point_disputes", column: "resolved_by", label: POINTS },
  { table: "ether_events", column: "user_id", label: POINTS },
  { table: "ether_events", column: "actor_id", label: POINTS },
  { table: "orders", column: "user_id", label: SHOP },
  // the day around the work
  { table: "events", column: "author_id", label: MEETINGS },
  { table: "event_participants", column: "user_id", label: MEETINGS }, // the key cascades: counted, or a delete would take it along
  { table: "errands", column: "author_id", label: ERRANDS },
  { table: "errands", column: "claimed_by", label: ERRANDS },
  { table: "visits", column: "author_id", label: VISITS },
  { table: "visits", column: "answered_by", label: VISITS },
  { table: "announcements", column: "author_id", label: ETHER },
  { table: "announcement_acks", column: "user_id", label: ETHER },
  { table: "notes", column: "user_id", label: NOTES },
  { table: "mind_boards", column: "user_id", label: NOTES },
  // the traces of using the product
  { table: "inbox_items", column: "user_id", label: WORK },
  { table: "ingest_batches", column: "user_id", label: WORK },
  { table: "ai_logs", column: "user_id", label: WORK },
  { table: "tv_events", column: "actor_id", label: WORK },
  { table: "tv_state", column: "updated_by", label: WORK },
  { table: "voice_kept", column: "kept_by", label: WORK },
  // other people's rows that would go with this card or stop it: their manager, the codes they got
  { table: "profiles", column: "manager_id", label: "подчинённые" },
  { table: "login_codes", column: "issued_by", label: "выданные коды входа", notSelf: "user_id" },
];

/** Rows that are the person's own housekeeping: nothing is lost when they go with the card. */
export const SERVICE_SOURCES: readonly { table: string; column: string; why: string }[] = [
  { table: "push_subscriptions", column: "user_id", why: "the devices of this login" },
  { table: "notification_prefs", column: "user_id", why: "settings" },
  { table: "notification_deliveries", column: "user_id", why: "the receipts of pushes: what they were about is counted on its own" },
  { table: "task_reads", column: "user_id", why: "read marks, derived from tasks" },
  { table: "login_codes", column: "user_id", why: "the person's own sign-in codes" },
  { table: "tv_state", column: "employee_id", why: "the wall's focus: set null, the wall simply lets go" },
  { table: "profile_phones", column: "user_id", why: "the card's own phone" },
];

/** Written about the person by the robot; the key does not cascade, so the delete clears them first. */
export const AUTO_ROWS = { table: "daily_reports", column: "user_id", status: "missed" } as const;

export const sourceKey = (source: Pick<HistorySource, "table" | "column">): string => `${source.table}.${source.column}`;

/** What the counts add up to, the fullest first; empty — the card has no history. */
export type HistoryLine = { label: string; count: number };

export function historyLines(counts: Readonly<Record<string, number>>): HistoryLine[] {
  const sums = new Map<string, number>();
  for (const source of HISTORY_SOURCES) {
    const count = counts[sourceKey(source)] ?? 0;
    if (count > 0) sums.set(source.label, (sums.get(source.label) ?? 0) + count);
  }
  return [...sums].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

/** «задачи — 12, очки — 3». */
export function historyWords(lines: readonly HistoryLine[]): string {
  return lines.map((line) => `${line.label} — ${line.count}`).join(", ");
}

export type Refusal = { status: number; code: string; message: string };

/**
 * Why a card may not be deleted; null — it may. `history` is `null` while it has not been counted
 * yet: the rights are asked first, the tables are not read for somebody who may not ask.
 */
export function deleteRefusal(editor: Who, target: Who, history: readonly HistoryLine[] | null): Refusal | null {
  if (editor.id === target.id) return { status: 403, code: "self", message: "Свою карточку удалить нельзя" };
  if (target.role === "director") return { status: 403, code: "director", message: "Карточку директора удалить нельзя" };
  if (!canDeletePerson(editor, target)) return { status: 403, code: "forbidden", message: "Эту карточку удалить нельзя" };
  if (history && history.length > 0) {
    return { status: 409, code: "has_history", message: `У карточки есть история (${historyWords(history)}) — её можно только уволить` };
  }
  return null;
}

/** The foreign key stopped the delete: a row the count did not see, or one that came after it. */
export const STILL_REFERENCED: Refusal = {
  status: 409,
  code: "has_history",
  message: "За этой карточкой остались записи — её можно только уволить",
};
