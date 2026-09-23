import { tvTime } from "./clock";
import type { TvState } from "./queries";
import {
  calendarViewOf,
  effectiveMode,
  focusRemainingMs,
  sceneOf,
  wallAsleep,
  type CalendarView,
  type ClockStyle,
  type TvScene,
} from "./state";

/**
 * Что пульт говорит директору о стене. Чистые функции: формулировки — часть продукта,
 * и проверяются тестом, а не глазами на телефоне.
 *
 * Квитанция экрана — принцип 8 CLAUDE.md в приложении к ТВ (D-76 §9). Разница между
 * «отправлено» и «на стене» здесь настоящая: директор в кабинете не видит телевизор
 * в коридоре и обязан узнать от пульта, дошла команда или экран висит со вчера.
 * Формулировка та же, что у доставки людям: не «экран не получил», а «не отвечает
 * с 9:14» — пульт сообщает факт, а не ставит диагноз.
 */

export type ReceiptTone = "ok" | "warn" | "muted";
export type WallReceipt = { tone: ReceiptTone; text: string };

/** Киоск отмечается раз в минуту; три пропуска подряд — экран уже не отвечает. */
const STALE_MS = 3 * 60_000;

export const SCENE_LABEL: Record<TvScene, string> = {
  face: "Лицо",
  clock: "Часы",
  team: "Команда",
  calendar: "Календарь",
  board: "Доска",
};

/** Переключатель часов на пульте (D-96): как на стене, так и на клавише. */
export const CLOCK_LABEL: Record<ClockStyle, string> = {
  digital: "Цифры",
  analog: "Стрелки",
};

/** Переключатель вида календаря на пульте (D-98). */
export const CALENDAR_LABEL: Record<CalendarView, string> = {
  week: "Неделя",
  month: "Месяц",
};

const SCENE_NOW: Record<TvScene, string> = {
  face: "Эфир · лицо",
  clock: "Эфир · часы",
  team: "Эфир · команда",
  calendar: "Эфир · календарь",
  board: "Эфир · доска",
};

export function wallReceipt(state: TvState | null, now: Date): WallReceipt {
  if (!state) return { tone: "muted", text: "Экран ещё не подключался" };

  if (!state.seen_at || now.getTime() - new Date(state.seen_at).getTime() > STALE_MS) {
    return state.seen_at
      ? { tone: "warn", text: `Экран не отвечает с ${tvTime(new Date(state.seen_at))}` }
      : { tone: "muted", text: "Экран ещё не подключался" };
  }

  if ((state.applied_version ?? -1) < state.version) {
    return { tone: "muted", text: "Отправлено, экран ещё не показал" };
  }

  return { tone: "ok", text: "На стене" };
}

/**
 * Что показывается прямо сейчас: «Эфир · часы», «Марат Ахметов · ещё 7 мин»,
 * «Доска «Планёрка» · до 21:00» (D-102) — названия досок пульт отдаёт списком — или
 * «Ночь · тусклые часы», пока стена спит (D-105): иначе пульт ночью обещал бы лицо.
 */
export function wallNow(
  state: TvState | null,
  people: { id: string; full_name: string }[],
  now: Date,
  boards: { id: string; title: string }[] = [],
): string {
  if (effectiveMode(state, now) === "employee" && state?.employee_id) {
    const person = people.find((p) => p.id === state.employee_id);
    const minutes = Math.ceil(focusRemainingMs(state, now) / 60_000);
    return `${person?.full_name ?? "Сотрудник"} · ещё ${minutes} мин`;
  }
  if (wallAsleep(state, now)) return "Ночь · тусклые часы";
  const scene = sceneOf(state, now);
  if (scene === "calendar" && calendarViewOf(state) === "month") return "Эфир · календарь · месяц";
  if (scene === "board" && state?.board_until) {
    const title = boards.find((board) => board.id === state.board_id)?.title;
    return `${title ? `Доска «${title}»` : "Доска"} · до ${tvTime(new Date(state.board_until))}`;
  }
  return SCENE_NOW[scene];
}

export { keyLabels } from "@/lib/people/labels";
