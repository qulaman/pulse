import { humanAqtobe } from "@/lib/ai/time";
import type { BoardTask } from "@/lib/pulse/board";
import type { Database } from "@/lib/supabase/types";

import { compareTasks } from "./grouping";
import { isOverdue, type TaskStatus } from "./status-text";

/**
 * The director's moves on a task (D-80, kept by D-83): why a task waits for the director
 * («ваш ход»), in what order, and which three buttons its open card offers. Pure
 * functions — the cards only render them; what is offered is the product, so it is tested.
 *
 * The keys are exactly what the thread card allows the director (`DirectorActions` in
 * TaskCard.tsx), folded to three per state: принцип 2 holds for the director's hand too.
 */

/** Why a task waits for the director: «ваш ход». `time` — the employee asks for another deadline (D-128). */
export type DeskReason = "review" | "time" | "question" | "declined" | "overdue";

/** The order of the queue: what only the director can move first. */
export const REASON_ORDER: readonly DeskReason[] = ["review", "time", "question", "declined", "overdue"];

export type DeskItem = { task: BoardTask; reason: DeskReason };

/** Work in the employee's hands — the only states where a question or a deadline can burn. */
const WORKING: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

/**
 * The first reason that applies, in the card's priority: приёмка beats a request for time,
 * a request beats a question, a question beats a missed deadline — a late task whose holder
 * asked for time waits for the answer, not for a scolding. A question on a closed or
 * declined task is not the director's move on the question — the task itself is.
 */
export function reasonOf(
  task: { status: TaskStatus; deadline: string | null; question?: string | null; request?: boolean },
  now: Date = new Date(),
): DeskReason | null {
  if (task.status === "pending_review") return "review";
  if (task.request && WORKING.includes(task.status)) return "time";
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
    const reason = reasonOf({ ...task, request: Boolean(task.time_request) }, now);
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
  | "sendNow"
  | "open"
  | "remove"
  // D-128: the employee's request for time, their suggested colleague, a reminder
  | "grant"
  | "retime"
  | "keep"
  | "handoff"
  | "nudge";

/** A key is a command, so a verb — `BUTTON` in status-text.ts keeps the card's own words. */
export const KEY_LABEL: Record<DeskAction, string> = {
  approve: "Принять",
  rework: "Доработать",
  answer: "Ответить",
  insist: "Настоять",
  reassign: "Переназначить",
  cancel: "Отменить",
  extend: "Срок",
  revoke: "Отозвать",
  sendNow: "Отправить сейчас",
  open: "Открыть",
  remove: "Удалить",
  grant: "Согласовать",
  retime: "Другой срок",
  keep: "Оставить прежний",
  handoff: "Передать",
  nudge: "Напомнить",
};

/** What the director's keys need to know besides the status (D-128). */
export type KeyFlags = {
  question?: boolean;
  overdue?: boolean;
  /** the employee asks for another deadline */
  request?: boolean;
  /** the refusal names a colleague */
  suggestion?: boolean;
  /** a new task nobody has taken for a while — «Напомнить» comes forward */
  waiting?: boolean;
};

/** A new task untouched this long earns «Напомнить» on its card. */
export const WAITING_AFTER_MS = 15 * 60_000;

/** A new task, not taken, handed out longer than WAITING_AFTER_MS ago. */
export function isWaiting(task: { status: TaskStatus; created_at: string; scheduled_send_at?: string | null }, now: Date = new Date()): boolean {
  if (task.status !== "sent") return false;
  const since = new Date(task.scheduled_send_at ?? task.created_at).getTime();
  return now.getTime() - since >= WAITING_AFTER_MS;
}

/**
 * The buttons of one task's open card, at most three. Rows of D-80 top to bottom —
 * the first that matches wins. «Срок» and «Переназначить» on any open task (D-51 п.3);
 * a request for time is answered in one tap, a suggested colleague takes it in one tap,
 * a late or untaken task offers «Напомнить» (D-128).
 */
export function keysFor(
  task: { status: TaskStatus },
  { question = false, overdue = false, request = false, suggestion = false, waiting = false }: KeyFlags = {},
): DeskAction[] {
  const working = WORKING.includes(task.status);
  if (task.status === "pending_review") return ["approve", "rework", "open"];
  if (working && request) return ["grant", "retime", "keep"];
  if (working && question) return ["answer", "extend", "open"];
  if (task.status === "declined" && suggestion) return ["handoff", "insist", "cancel"];
  if (task.status === "declined") return ["insist", "reassign", "cancel"];
  if (working && overdue) return ["extend", "nudge", "reassign"];
  if (working && waiting) return ["nudge", "extend", "reassign"];
  if (working) return ["extend", "reassign", "revoke"];
  // held for the morning (D-38): «Отправить сейчас» brings it forward (D-129)
  if (task.status === "scheduled") return ["sendNow", "extend", "revoke"];
  return ["open", "remove"];
}

/** Quick answers of the swipe table (FRONTEND «Вопросы»), as chips; anything longer — in the thread. */
export const QUICK_ANSWERS = ["Да", "Нет", "Позже", "Действуй сам"] as const;

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
