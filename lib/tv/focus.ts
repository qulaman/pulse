import { SHORT_STATUS } from "@/lib/tasks/status-text";

import { tvTime } from "./clock";
import type { TvFocusEmployee } from "./queries";

/**
 * Дела сотрудника, стоящего на стене, — строками. Чистая функция: правило «какое
 * слово и какой цвет» проверяется тестом, а не глазами на телевизоре.
 *
 * Главное правило здесь — то же, что у ленты экрана: **негатив по именам на стену
 * не выносится** (D-45). Поэтому доработка печатается тем же «в работе», что и
 * принятая задача, слова «просрочено» нет ни при каком сроке, красного тона нет
 * вовсе — просроченный срок печатается нейтрально, датой. Кто виноват, знает
 * директор и знает адресат; коридор об этом не читает.
 */

export type FocusTone = "accent" | "ok" | "muted";

export type FocusRow = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  tone: FocusTone;
};

/** Гостю заголовка не отдают вовсе (D-33) — на стене просто «Поручение». */
const UNTITLED = "Поручение";

const STATUS_WORD: Record<string, string> = {
  sent: SHORT_STATUS.sent, // «новая»
  accepted: SHORT_STATUS.accepted, // «в работе»
  in_progress: SHORT_STATUS.in_progress, // «в работе»
  // доработка — это тоже работа: отдельного слова для неё на стене нет (D-45)
  rework: SHORT_STATUS.accepted,
  // слово ленты экрана («На проверке»), а не «на приёмке» из кабинета директора
  pending_review: "на проверке",
};

const STATUS_TONE: Record<string, FocusTone> = {
  sent: "accent",
  accepted: "ok",
  in_progress: "ok",
  rework: "ok",
  pending_review: "muted",
};

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Короткая дата «22 сен» для строки дела. `tvDate` из ./clock — длинная подпись для
 * футляра экрана («пятница, 18 сентября»), в строку дела она не влезает.
 */
const shortDateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Aqtobe",
  day: "numeric",
  month: "short",
});

/** Номер суток по часам Актобе — фиксированный +05:00 без перехода на летнее время. */
function dayIndex(date: Date): number {
  return Math.floor((date.getTime() + AQTOBE_OFFSET_MS) / DAY_MS);
}

/** `ru-RU` даёт «22 сент.»; на стене читают с двух метров — оставляем три буквы. */
function shortDate(date: Date): string {
  return shortDateFmt.format(date).replace(/(\p{L}{3})\p{L}*\.?$/u, "$1");
}

/**
 * Срок нейтрально: сегодня — со временем, завтра — словом, всё остальное — датой.
 * Прошедший срок попадает в ту же ветку «датой»: стена не обвиняет (D-45).
 */
function deadlineText(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diff = dayIndex(date) - dayIndex(now);
  if (diff === 0) return `сегодня ${tvTime(date)}`;
  if (diff === 1) return "завтра";
  return `до ${shortDate(date)}`;
}

export function focusRows(focus: TvFocusEmployee, now: Date): FocusRow[] {
  return focus.tasks.map((task) => ({
    id: task.id,
    title: task.title?.trim() || UNTITLED,
    status: STATUS_WORD[task.status] ?? SHORT_STATUS.accepted,
    deadline: deadlineText(task.deadline, now),
    tone: STATUS_TONE[task.status] ?? "ok",
  }));
}
