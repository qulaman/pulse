import { stepLabel } from "@/lib/mindboard/tree";

import { mapFits } from "./board";
import { tvTime } from "./clock";
import type { TvState } from "./queries";
import {
  boardPointOf,
  boardViewOf,
  calendarViewOf,
  carouselOn,
  effectiveMode,
  focusRemainingMs,
  guestOf,
  ratingViewOf,
  sceneOf,
  wallAsleep,
  type CalendarView,
  type ClockStyle,
  type RatingView,
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
  rating: "Рейтинг",
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

/** Период рейтинга на стене (D-123) — те же слова, что у экрана «Рейтинг». */
export const RATING_LABEL: Record<RatingView, string> = {
  week: "Неделя",
  month: "Месяц",
};

const SCENE_NOW: Record<TvScene, string> = {
  face: "Эфир · лицо",
  clock: "Эфир · часы",
  team: "Эфир · команда",
  calendar: "Эфир · календарь",
  board: "Эфир · доска",
  rating: "Эфир · рейтинг недели",
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

/** Название доски на дисплее: длинное режется, чтобы «пункт 3 из 7 · до 21:00» не ушло за край. */
const TITLE_MAX = 24;

function clip(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1).trimEnd()}…` : flat;
}

/**
 * Что показывается прямо сейчас: «Эфир · часы», «Марат Ахметов · ещё 7 мин»,
 * «Дело «Замер окон» · ещё 7 мин» (D-123), «Доска «Планёрка» · пункт 3 из 7 · до 21:00»
 * (D-102, D-121) — названия досок и пункты доски на стене пульт отдаёт сам — или
 * «Ночь · тусклые часы», пока стена спит (D-105): иначе пульт ночью обещал бы лицо. Круг
 * заставок — «· по кругу» после сцены (D-123).
 *
 * Про доску дисплей говорит то, что видно на стене, а не то, что просили: карта — только
 * когда она влезает (`mapFits`), иначе стена рисует список; при госте без «Показать гостю»
 * на стене часы и «Доска скрыта» (D-102 §7).
 */
export function wallNow(
  state: TvState | null,
  people: { id: string; full_name: string }[],
  now: Date,
  boards: { id: string; title: string }[] = [],
  extra: {
    points?: boolean;
    guest?: boolean;
    taskTitle?: string | null;
    /** Пункты доски на стене (верхнего уровня, со словами) по порядку — для «пункт 3 из 7» (D-121). */
    boardPoints?: readonly string[];
  } = {},
): string {
  const mode = effectiveMode(state, now);
  const minutes = Math.ceil(focusRemainingMs(state, now) / 60_000);
  if (mode === "employee" && state?.employee_id) {
    const person = people.find((p) => p.id === state.employee_id);
    return `${person?.full_name ?? "Сотрудник"} · ещё ${minutes} мин`;
  }
  if (mode === "task") {
    const title = extra.taskTitle?.trim();
    return `${title ? `Дело «${title}»` : "Одно дело"} · ещё ${minutes} мин`;
  }
  if (wallAsleep(state, now)) return "Ночь · тусклые часы";
  const scene = sceneOf(state, now, extra.points ?? true, extra.guest ?? false);
  const round = carouselOn(state) ? " · по кругу" : "";
  if (scene === "calendar" && calendarViewOf(state) === "month") return `Эфир · календарь · месяц${round}`;
  if (scene === "rating") return `${ratingViewOf(state) === "month" ? "Эфир · рейтинг месяца" : SCENE_NOW.rating}${round}`;
  if (scene === "board" && state?.board_until) {
    const title = boards.find((board) => board.id === state.board_id)?.title;
    const boardPoints = extra.boardPoints ?? [];
    const name = title ? `Доска «${clip(title)}»` : "Доска";
    if (guestOf(state, false, now) && !state.board_guest) return `${name} · скрыта от гостя`;
    const parts = [name];
    if (boardViewOf(state) === "map" && mapFits(boardPoints.length)) parts.push("карта");
    const step = stepLabel(boardPoints, boardPointOf(state, now));
    if (step) parts.push(`пункт ${step}`);
    parts.push(`до ${tvTime(new Date(state.board_until))}`);
    return parts.join(" · ");
  }
  return `${SCENE_NOW[scene]}${round}`;
}

export { keyLabels } from "@/lib/people/labels";
