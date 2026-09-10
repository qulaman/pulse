import { humanAqtobe } from "@/lib/ai/time";
import type { Database } from "@/lib/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];

/**
 * Every user-facing string of the task card in one place — assistant voice,
 * first person, no exclamation marks in the negative (docs/DESIGN.md §4).
 */

export const STATUS_LABEL: Record<TaskStatus, string> = {
  scheduled: "Отправлю позже",
  sent: "Новая",
  accepted: "В работе",
  in_progress: "В работе", // not shown in v1 (D-04), kept so the map stays total
  pending_review: "На проверке у директора",
  done: "Готово",
  rework: "На доработке",
  declined: "Отказ",
  revoked: "Отозвано директором",
};

export const BUTTON = {
  accept: "Принял",
  ask: "Уточнить",
  cant: "Не могу",
  complete: "Выполнено",
  approve: "Принято",
  rework: "Доработка",
  insist: "Настоять",
  cancel: "Отменить",
  revoke: "Отозвать",
  send: "Отправить",
} as const;

export const TEXT = {
  emptyFeed: "Пока тихо. Появится задача — разбужу",
  emptyTasks: "Открытых дел нет. Новое покажу здесь",
  emptyInbox: "Всё спокойно",
  reworkBanner: "Директор вернул задачу. Комментарий внутри",
  underReview: "На проверке у директора",
  revoked: "Отозвано директором",
  transcriptSpoiler: "Что сказал директор",
  original: "Оригинал голосового",
  noDeadline: "без срока",
  urgent: "срочно",
  askedToast: "Спросил. Директор ответит в треде",
  askPlaceholder: "Что уточнить?",
  reportTitle: "Что сделано?",
  reportPlaceholder: "Можно без текста — просто отметить выполненным",
  photoPick: "Добавить фото",
  photoRemove: "Убрать фото",
  photoUploading: "Отправляю фото…",
  photoFailed: "Фото не отправилось. Проверь связь и попробуй ещё раз",
  declineTitle: "Почему не получится?",
  declinePlaceholder: "Добавить словами (необязательно)",
  reworkTitle: "Что доработать?",
  reworkPlaceholder: "Комментарий обязателен — сотрудник увидит его в треде",
  revokeConfirm: "Отозвать задачу? Сотрудник увидит пометку «отозвано директором»",
  composerPlaceholder: "Написать…",
  answered: "отвечено",
  question: "вопрос",
  audioFailed: "Не смог открыть аудио, попробуй ещё раз",
} as const;

/** «Не могу» is chips first — nobody types on a building site in the cold. */
export const DECLINE_REASONS = ["Это не ко мне", "Занят срочным", "Буду позже"] as const;

export type DeadlineLabel = { text: string; overdue: boolean; none: boolean };

const OPEN_STATUSES: readonly TaskStatus[] = ["sent", "accepted", "in_progress", "rework"];

/** Overdue is computed, never stored (docs/DATABASE.md comment on tasks). */
export function isOverdue(
  task: { deadline: string | null; status: TaskStatus },
  now: Date = new Date(),
): boolean {
  if (!task.deadline) return false;
  if (!OPEN_STATUSES.includes(task.status)) return false;
  return new Date(task.deadline).getTime() < now.getTime();
}

export function deadlineLabel(
  task: { deadline: string | null; status: TaskStatus },
  now: Date = new Date(),
): DeadlineLabel {
  if (!task.deadline) return { text: TEXT.noDeadline, overdue: false, none: true };
  const text = humanAqtobe(new Date(task.deadline), now);
  return { text, overdue: isOverdue(task, now), none: false };
}

/** «1 просрочка / 2 просрочки / 5 просрочек» — [one, few, many]. */
export function pluralRu(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export type VerdictTone = "ok" | "warn" | "danger";

export type InboxCounts = { overdue: number; questions: number; review: number };

/** Block 1 of Пульс: one line, one colour (docs/FRONTEND.md «Пульс»). */
export function verdict(counts: InboxCounts): { tone: VerdictTone; text: string } {
  const parts: string[] = [];
  if (counts.overdue > 0) {
    parts.push(`${counts.overdue} ${pluralRu(counts.overdue, ["просрочка", "просрочки", "просрочек"])}`);
  }
  if (counts.questions > 0) {
    parts.push(`${counts.questions} ${pluralRu(counts.questions, ["вопрос", "вопроса", "вопросов"])}`);
  }
  if (counts.review > 0) parts.push(`${counts.review} на приёмке`);

  if (parts.length === 0) return { tone: "ok", text: TEXT.emptyInbox };
  return { tone: counts.overdue > 0 ? "danger" : "warn", text: parts.join(", ") };
}

/** Русское имя перехода для системной строки треда. */
export function statusChangeLine(newStatus: string): string {
  const label = STATUS_LABEL[newStatus as TaskStatus];
  return label ? `Статус: ${label}` : `Статус: ${newStatus}`;
}
