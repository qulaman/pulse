import { humanAqtobe } from "@/lib/ai/time";
import type { BoardTask } from "@/lib/pulse/board";
import type { Database } from "@/lib/supabase/types";

import { compareTasks, nearestDeadline, overdueCount, type Groupable } from "./grouping";
import { isOverdue, pluralRu, TEXT, type TaskStatus } from "./status-text";

/**
 * The desk of «Задачи»: the display at the head of the screen and the three keys under
 * it (D-80). Pure functions — the page only renders them. What the display says and which
 * keys it offers are the product, so they are tested, not eyeballed on a phone.
 *
 * The keys are exactly what the thread card allows the director (`DirectorActions` in
 * TaskCard.tsx), folded to three per state: принцип 2 holds for the director's hand too.
 */

/** Why a task waits for the director: «ваш ход». */
export type DeskReason = "review" | "question" | "declined" | "overdue";

/** The order of the queue: what only the director can move first. */
export const REASON_ORDER: readonly DeskReason[] = ["review", "question", "declined", "overdue"];

export type DeskItem = { task: BoardTask; reason: DeskReason };

/** Work in the employee's hands — the only states where a question or a deadline can burn. */
const WORKING: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

/**
 * The first reason that applies, in the card's priority: приёмка beats a question, a
 * question beats a missed deadline. A question on a closed or declined task is not the
 * director's move on the question — the task itself is.
 */
export function reasonOf(task: BoardTask, now: Date = new Date()): DeskReason | null {
  if (task.status === "pending_review") return "review";
  if (task.question && WORKING.includes(task.status)) return "question";
  if (task.status === "declined") return "declined";
  if (isOverdue(task, now)) return "overdue";
  return null;
}

/** «Ваш ход»: every task waiting for the director, once, grouped by reason, nearest deadline first. */
export function queueOf(tasks: readonly BoardTask[], now: Date = new Date()): DeskItem[] {
  const seen = new Set<string>();
  const items: DeskItem[] = [];
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    const reason = reasonOf(task, now);
    if (!reason) continue;
    seen.add(task.id);
    items.push({ task, reason });
  }
  return items.sort((a, b) => {
    const byReason = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
    return byReason !== 0 ? byReason : compareTasks(a.task, b.task);
  });
}

export type DeskAction =
  | "approve"
  | "rework"
  | "answer"
  | "insist"
  | "reassign"
  | "cancel"
  | "extend"
  | "revoke"
  | "open"
  | "remove";

/** A key is a command, so a verb — `BUTTON` in status-text.ts keeps the card's own words. */
export const KEY_LABEL: Record<DeskAction, string> = {
  approve: "Принять",
  rework: "Доработать",
  answer: "Ответить",
  insist: "Настоять",
  reassign: "Переназначить",
  cancel: "Отменить",
  extend: "Продлить",
  revoke: "Отозвать",
  open: "Открыть",
  remove: "Удалить",
};

/**
 * The keys under the display for one task, at most three. Rows of D-80 top to bottom —
 * the first that matches wins. «Продлить» and «Переназначить» on any open task (D-51 п.3).
 */
export function keysFor(
  task: { status: TaskStatus },
  { question = false, overdue = false }: { question?: boolean; overdue?: boolean } = {},
): DeskAction[] {
  const working = WORKING.includes(task.status);
  if (task.status === "pending_review") return ["approve", "rework", "open"];
  if (working && question) return ["answer", "extend", "open"];
  if (task.status === "declined") return ["insist", "reassign", "cancel"];
  if (working && overdue) return ["extend", "reassign", "open"];
  if (working) return ["extend", "reassign", "revoke"];
  if (task.status === "scheduled") return ["extend", "revoke", "open"];
  return ["open", "remove"];
}

/** Quick answers of the swipe table (FRONTEND «Вопросы»), as chips; anything longer — in the thread. */
export const QUICK_ANSWERS = ["Да", "Нет", "Позже", "Действуй сам"] as const;

export type DeskTone = "ok" | "warn" | "danger";

/**
 * The display with nothing picked — «стол»: whose move it is, then the deadlines of
 * everything handed out.
 */
export function deskSummary(
  tasks: readonly Groupable[],
  queue: readonly DeskItem[],
  now: Date = new Date(),
): { headline: string; line: string; tone: DeskTone } {
  const overdue = overdueCount([...tasks], now);
  const soonest = nearestDeadline([...tasks], now);
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} ${pluralRu(overdue, ["просрочена", "просрочены", "просрочено"])}`);
  if (soonest) parts.push(`ближайший срок ${humanAqtobe(new Date(soonest), now)}`);
  return {
    headline: queue.length > 0 ? `Ваш ход: ${queue.length}` : TEXT.emptyInbox,
    line: parts.length > 0 ? parts.join(" · ") : "сроков нет",
    tone: overdue > 0 ? "danger" : queue.length > 0 ? "warn" : "ok",
  };
}

type Delivery = Database["public"]["Tables"]["notification_deliveries"]["Row"];

export type ReceiptTone = "ok" | "warn" | "muted";

/**
 * «отправлено / увидел / принял» (D-32, принцип 8), in words. Honest: a push has no
 * delivery receipt, so the middle state says «не открывал», never «не получил».
 */
export function receiptText(
  delivery: Pick<Delivery, "acted_at" | "seen_at" | "status" | "sent_at" | "created_at" | "last_error">,
  status: string,
  now: Date = new Date(),
): { text: string; tone: ReceiptTone } {
  const d = delivery;
  if (d.acted_at || status === "accepted" || status === "pending_review" || status === "done") {
    return { text: `принял ${d.acted_at ? humanAqtobe(new Date(d.acted_at), now) : ""}`.trim(), tone: "ok" };
  }
  if (d.seen_at) return { text: `увидел ${humanAqtobe(new Date(d.seen_at), now)}`, tone: "muted" };
  if (d.status === "sent") {
    return { text: `отправлено ${humanAqtobe(new Date(d.sent_at ?? d.created_at), now)} · не открывал`, tone: "warn" };
  }
  if (d.status === "failed") {
    return {
      text: d.last_error === "no_subscription" ? "уведомления не включены у сотрудника" : "уведомление не ушло",
      tone: "warn",
    };
  }
  return { text: "отправляю уведомление…", tone: "muted" };
}

/**
 * Where the display goes when the queue changes under it. The picked task left the queue
 * (the director just moved it) — the next one takes its place, the last one when it was
 * the tail, nothing when the queue is empty. A task that was never in the queue (picked
 * from the list) stays picked while it exists.
 */
export function nextSelection(
  selectedId: string | null,
  prevQueue: readonly string[],
  queue: readonly string[],
  exists: (id: string) => boolean,
): string | null {
  if (selectedId === null) return null;
  if (queue.includes(selectedId)) return selectedId;
  const was = prevQueue.indexOf(selectedId);
  if (was >= 0) return queue.length > 0 ? queue[Math.min(was, queue.length - 1)] : null;
  return exists(selectedId) ? selectedId : (queue[0] ?? null);
}
