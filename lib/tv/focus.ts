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

/* -------------------------------------------------------------------------- */
/* Карточка v2 (D-96): три колонки по стадиям и числа над ними                */
/* -------------------------------------------------------------------------- */

export type LaneKey = "new" | "work" | "review";

export type FocusLaneRow = FocusRow & {
  /** Срок сегодня и ещё впереди — подсвечен акцентом. Прошедший не подсвечивается (D-45). */
  soon: boolean;
};

export type FocusLane = {
  key: LaneKey;
  label: string;
  tone: FocusTone;
  /** По всем открытым делам, а не по показанным. */
  count: number;
  rows: FocusLaneRow[];
  /** Сколько не влезло в колонку: «+ ещё 2». */
  more: number;
};

export type FocusCard = {
  lanes: FocusLane[];
  total: number;
  done: { count: number; titles: string[] };
};

/** Больше трёх карточек в колонке на стене не помещаются вместе с человеком и числами. */
export const PER_LANE = 3;

const LANE_OF: Record<string, LaneKey> = {
  sent: "new",
  accepted: "work",
  in_progress: "work",
  // доработка — это тоже работа (D-45)
  rework: "work",
  pending_review: "review",
};

const LANE_LABEL: Record<LaneKey, string> = { new: "Новые", work: "В работе", review: "На проверке" };
const LANE_TONE: Record<LaneKey, FocusTone> = { new: "accent", work: "ok", review: "muted" };

function soonOf(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return dayIndex(date) === dayIndex(now) && date.getTime() > now.getTime();
}

/**
 * Сотрудник на стене колонками «Новые → В работе → На проверке» (D-96). Числа приходят
 * из `tv_focus().counts` — по всем открытым делам; старая база без них — считаем по
 * показанным. Сданное сегодня — отдельно: хорошее по имени на стену можно.
 */
export function focusCard(focus: TvFocusEmployee, now: Date): FocusCard {
  const rows = focusRows(focus, now);
  const lanes = (["new", "work", "review"] as const).map((key): FocusLane => {
    const inLane = focus.tasks
      .map((task, i) => ({ task, row: rows[i] }))
      .filter(({ task }) => (LANE_OF[task.status] ?? "work") === key);
    const shown = inLane.slice(0, PER_LANE).map(({ task, row }) => ({ ...row, soon: soonOf(task.deadline, now) }));
    const count = Math.max(focus.counts?.[key] ?? inLane.length, inLane.length);
    return { key, label: LANE_LABEL[key], tone: LANE_TONE[key], count, rows: shown, more: Math.max(0, count - shown.length) };
  });
  const titles = (focus.done_today?.titles ?? []).map((title) => title?.trim() || UNTITLED);
  return {
    lanes,
    total: lanes.reduce((sum, lane) => sum + lane.count, 0),
    done: { count: focus.done_today?.count ?? 0, titles },
  };
}

/** «МА» — две буквы для кружка вместо фото. */
export function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}
