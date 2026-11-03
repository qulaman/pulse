import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import type { BoardTask } from "@/lib/pulse/board";
import { receiptText, type DeskReason } from "@/lib/tasks/desk";
import { isWorking, untilWords } from "@/lib/tasks/lifecycle";
import { REASON_TONE, REASON_WORD, statusWord, type DirectorTab } from "@/lib/tasks/overview";
import { receiptLine, type DeliveryRow } from "@/lib/tasks/receipts";
import { isOverdue, STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";
import { toneOf, type Tone } from "@/lib/tasks/tone";

/**
 * What the desk's task table says about a row (D-153, tasks/022 A; moved to lib/desk so the suite runs its test): the filters of its tool
 * bar, the stage in a word, «доставка» and «последнее». Pure — the clock comes in — so the
 * words are tested here and the screen only renders them; every word itself comes from
 * lib/tasks (принцип 8 included: «не открывал с 9:14», never «не получил»).
 */

export const TABS: readonly DirectorTab[] = ["yours", "working", "closed"];

export function parseTab(value: string | null | undefined): DirectorTab | null {
  return TABS.includes(value as DirectorTab) ? (value as DirectorTab) : null;
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export type DueFilter = "today" | "tomorrow" | "week" | "overdue" | "none";

export const DUE_LABEL: Record<DueFilter, string> = {
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "На неделе",
  overdue: "Просрочено",
  none: "Без срока",
};

export const DUE_FILTERS: readonly DueFilter[] = ["today", "tomorrow", "week", "overdue", "none"];

type Dated = { status: TaskStatus; deadline: string | null };

/** The deadline filter: «сегодня» and the rest are what is still ahead — a late task is «просрочено» only. */
export function matchesDue(task: Dated, due: DueFilter | null, now: Date = new Date()): boolean {
  if (!due) return true;
  if (due === "none") return !task.deadline;
  if (!task.deadline) return false;
  if (due === "overdue") return isOverdue(task, now);
  if (isOverdue(task, now)) return false;
  // a handed-in or closed task is never late: its past days are not «сегодня» either
  const days = aqtobeDay(new Date(task.deadline)) - aqtobeDay(now);
  if (due === "today") return days === 0;
  if (due === "tomorrow") return days === 1;
  return days >= 0 && days <= 7;
}

/** «В работе» is one word for two statuses (D-04: `in_progress` is not shown), so it is one filter. */
export type StatusFilter = Exclude<TaskStatus, "in_progress">;

export const STATUS_FILTERS: readonly StatusFilter[] = ["sent", "accepted", "rework", "pending_review", "declined", "scheduled", "done", "revoked"];

export function statusFilterLabel(status: StatusFilter): string {
  return STATUS_LABEL[status];
}

export function parseStatus(value: string | null | undefined): StatusFilter | null {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : null;
}

export function parseDue(value: string | null | undefined): DueFilter | null {
  return DUE_FILTERS.includes(value as DueFilter) ? (value as DueFilter) : null;
}

export function matchesStatus(task: { status: TaskStatus }, status: StatusFilter | null): boolean {
  if (!status) return true;
  if (status === "accepted") return task.status === "accepted" || task.status === "in_progress";
  return task.status === status;
}

/* -------------------------------------------------------------------------- */
/* A row's words                                                               */
/* -------------------------------------------------------------------------- */

export type Line = { text: string; tone?: Tone };

/**
 * «Стадия» in one word and the colour of its dot: the director's move by its name (на приёмке,
 * отказ, просрочена — the card's own words), else the stage as the director reads it.
 */
export function stageOf(task: Dated & { scheduled_send_at?: string | null; passed_to?: string | null }, reason: DeskReason | null, now: Date = new Date()): Required<Line> {
  if (reason && reason !== "question") return { text: REASON_WORD[reason], tone: REASON_TONE[reason] };
  return { text: statusWord(task, "director", now), tone: toneOf(task.status, isOverdue(task, now)) };
}

/** «9:14» today, «вчера 18:02» further back — a receipt's time. */
function at(iso: string, now: Date): string {
  return humanAqtobe(new Date(iso), now).replace(/^сегодня /, "");
}

const TAKEN: readonly TaskStatus[] = ["accepted", "in_progress", "rework", "pending_review", "done"];

/**
 * «Доставка» (принцип 8): until the task is taken — the push receipt in the thread's words
 * («не открывал с 9:14», «увидел 9:20», «отправлю в 08:00»), else what the receipt cannot say
 * yet; once taken — «принял 9:22». Nothing to say honestly — null.
 */
export function deliveryLine(
  task: { status: TaskStatus; accepted_at: string | null },
  delivery: DeliveryRow | null | undefined,
  now: Date = new Date(),
): Line | null {
  if (task.status === "sent") {
    if (!delivery) return null;
    const line = receiptLine(delivery, now);
    if (line) return { text: line.text, tone: line.tone };
    const words = receiptText(delivery, task.status, now);
    return { text: words.text, tone: words.tone };
  }
  if (TAKEN.includes(task.status) && task.accepted_at) return { text: `принял ${at(task.accepted_at, now)}`, tone: "ok" };
  return null;
}

/** What the employee's newest word says, short: «фото · готово», «голосовое». */
export function lastWordText(last: BoardTask["last_message"]): string {
  if (!last) return "";
  if (last.type === "photo") return `фото${last.content ? ` · ${last.content}` : ""}`;
  if (last.type === "voice") return `голосовое${last.content ? ` · ${last.content}` : ""}`;
  return last.content ?? "";
}

/**
 * «Последнее» — what waits in the task's words: the open question, a request for time, the
 * refusal's reason, or the handed-in work («сдал с фото · не всё»). Null when none of that.
 */
export function latestLine(
  task: { status: TaskStatus; assignee_id: string },
  row: Pick<BoardTask, "question" | "time_request" | "decline_reason" | "partial" | "last_message"> | undefined,
  now: Date = new Date(),
): Line | null {
  if (!row) return null;
  if (row.question && isWorking(task.status)) return { text: `«${row.question}»`, tone: "warn" };
  if (row.time_request && isWorking(task.status)) return { text: `просит срок ${untilWords(row.time_request.proposed, now)}`, tone: "warn" };
  if (task.status === "declined") return { text: row.decline_reason ? `отказ: ${row.decline_reason}` : "отказ без причины", tone: "danger" };
  if (task.status === "pending_review") {
    const last = row.last_message && row.last_message.sender_id === task.assignee_id ? row.last_message : null;
    const photo = last?.type === "photo";
    const words = last?.content ? ` · «${last.content}»` : "";
    return { text: `сдал${photo ? " с фото" : ""}${row.partial ? " · не всё" : ""}${words}` };
  }
  return null;
}

/**
 * «Что»'s grey line: the newest word of the thread when «Последнее» does not already say it —
 * the director's own as «Вы: …», the employee's as it is (whose it is stands in «Кто»).
 */
export function underTitle(
  task: { status: TaskStatus; assignee_id: string },
  row: Pick<BoardTask, "question" | "time_request" | "decline_reason" | "partial" | "last_message"> | undefined,
  meId: string,
  now: Date = new Date(),
): string | null {
  if (!row?.last_message || latestLine(task, row, now)) return null;
  const text = lastWordText(row.last_message);
  if (!text) return null;
  return row.last_message.sender_id === meId ? `Вы: ${text}` : text;
}

/* -------------------------------------------------------------------------- */
/* Keeping one's place in a list that changes under the hand                    */
/* -------------------------------------------------------------------------- */

/**
 * The row that takes the place of one that has left the list: the one now standing where it
 * stood, else the last one; null — the list is empty.
 */
export function inPlaceOf(ids: readonly string[], index: number): string | null {
  if (ids.length === 0) return null;
  return ids[Math.min(Math.max(index, 0), ids.length - 1)] ?? null;
}

/** The queue of «Разобрать» with what the director skipped this session moved to its end, in the order skipped. */
export function withSkipped<T>(items: readonly T[], idOf: (item: T) => string, skipped: readonly string[]): T[] {
  if (skipped.length === 0) return [...items];
  const rest = items.filter((item) => !skipped.includes(idOf(item)));
  const later = skipped.map((id) => items.find((item) => idOf(item) === id)).filter((item): item is T => item !== undefined);
  return [...rest, ...later];
}

/* -------------------------------------------------------------------------- */
/* A row that changed under the director's eyes (Realtime)                       */
/* -------------------------------------------------------------------------- */

const CLOSED_FOR_GLOW: readonly TaskStatus[] = ["done", "revoked", "declined"];

/** What the table shows of a row, as one string: a change of any of it is a change worth a glow. */
export function rowSignature(
  task: { status: TaskStatus; updated_at: string },
  row: Pick<BoardTask, "question" | "time_request" | "last_message"> | undefined,
): string {
  return [task.status, task.updated_at, row?.last_message?.id ?? "", row?.question ?? "", row?.time_request?.id ?? ""].join("|");
}

/**
 * The first row whose signature moved since the last look, or a new open row (a new order). A
 * new closed row is a page of history coming in («Показать ещё»), not news. Null — nothing.
 */
export function firstChanged(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  statusOf: (id: string) => TaskStatus | undefined,
): string | null {
  if (before.size === 0) return null;
  for (const [id, signature] of after) {
    const was = before.get(id);
    if (was === undefined) {
      const status = statusOf(id);
      if (status && !CLOSED_FOR_GLOW.includes(status)) return id;
      continue;
    }
    if (was !== signature) return id;
  }
  return null;
}
