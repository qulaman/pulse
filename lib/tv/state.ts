import {
  baseRound,
  DEFAULT_PROGRAM_WINDOW,
  manualHolds,
  nightIn,
  programScene,
  segmentOf,
  welcomeOn,
  type ProgramWindow,
  type WallScene,
} from "./program";
import type { TvState } from "./queries";

export type { WallScene } from "./program";

/**
 * Что киоск делает со строкой `tv_state` — чистыми функциями, без React.
 *
 * Правило всей пачки: строки может не быть вовсе (пульт ещё ни разу не командовал),
 * значение в ней может быть незнакомым (клиент старше базы после деплоя), а фокус —
 * уже истёкшим. Ни один из трёх случаев не имеет права погасить стену: во всех
 * ответ — эфир и сцена «лицо» (D-76).
 */

export type TvMode = "ether" | "employee" | "task";
export type TvScene = "face" | "clock" | "team" | "calendar" | "board" | "rating";
export type ClockStyle = "digital" | "analog";
/** Заставка «Календарь»: «Сегодня» крупно и неделя под ним — или месяц сеткой (D-98). */
export type CalendarView = "week" | "month";
/** Доска на стене: крупный список для чтения издалека — или карта мыслей вокруг названия (D-121). */
export type BoardView = "list" | "map";

/**
 * The scene keys of the remote; the board comes on the wall only with a board (D-102), the
 * rating only while points are on (D-48, D-123).
 */
export const TV_SCENES: readonly TvScene[] = ["face", "clock", "team", "calendar", "rating"];
/** Every scene the wall can show. */
export const WALL_SCENES: readonly TvScene[] = [...TV_SCENES, "board"];
export const CLOCK_STYLES: readonly ClockStyle[] = ["digital", "analog"];
export const CALENDAR_VIEWS: readonly CalendarView[] = ["week", "month"];
export const BOARD_VIEWS: readonly BoardView[] = ["list", "map"];
/** Заставка «Рейтинг»: последние 7 суток или последний месяц — как экран «Рейтинг» (D-123). */
export type RatingView = "week" | "month";
export const RATING_VIEWS: readonly RatingView[] = ["week", "month"];

/** Фокус на сотруднике живёт 10 минут — то же число, что в `tv_control` (D-76 §5). */
export const FOCUS_MS = 10 * 60_000;

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Режим по часам киоска: фокус — человек (D-76) или одно дело (D-123) — живёт до
 * `expires_at` и гаснет сам, без cron и без таймера на пульте (D-76 §5).
 */
export function effectiveMode(state: TvState | null, now: Date): TvMode {
  if (!state?.expires_at) return "ether";
  if (new Date(state.expires_at).getTime() <= now.getTime()) return "ether";
  if (state.mode === "employee" && state.employee_id) return "employee";
  if (state.mode === "task" && state.task_id) return "task";
  return "ether";
}

/**
 * «Гость в кабинете»: до прихода строки действует стартовый `?guest=1` из адреса киоска,
 * после — то, что сказал пульт. Гость, включённый визитом («Пусть заходит», D-96), живёт
 * до `guest_until` и гаснет по часам киоска, как фокус; ручной — не истекает.
 */
export function guestOf(state: TvState | null, initial: boolean, now: Date = new Date()): boolean {
  if (!state) return initial;
  if (!state.guest) return false;
  return !state.guest_until || new Date(state.guest_until).getTime() > now.getTime();
}

/** Когда гость, включённый визитом, выключится сам; ручной и выключенный — null. */
export function guestEndsAt(state: TvState | null, now: Date): Date | null {
  if (!state?.guest || !state.guest_until) return null;
  const at = new Date(state.guest_until);
  return at.getTime() > now.getTime() ? at : null;
}

/** Заставки по кругу меняются раз в три минуты: успеть прочесть и не устать (D-123). */
export const CAROUSEL_MS = 3 * 60_000;

/**
 * Круг заставок (D-123): лицо, рейтинг (только с очками), календарь, команда. Часы — тихий
 * экран для совещаний: в круг не входят. Доска совещания — тоже; доска недели (`week`, D-144) —
 * последней в круге.
 */
export function carouselScenes(points: boolean, week = false): TvScene[] {
  return baseRound(points, week);
}

/**
 * Какая заставка сейчас в круге — по часам, без таймера и без обмена с пультом: киоск и
 * пульт считают одно и то же число и сходятся. Граница — ровные три минуты от эпохи.
 *
 * @deprecated The wall turns by the day's program (D-182): `programScene` / `programNext` in
 * `lib/tv/program.ts`. Kept for the remote until it moves over.
 */
export function carouselScene(now: Date, points: boolean, week = false): TvScene {
  const list = carouselScenes(points, week);
  return list[Math.floor(now.getTime() / CAROUSEL_MS) % list.length];
}

/**
 * Когда круг сменит заставку и на какую — для пульта: «дальше — календарь в 14:03».
 *
 * @deprecated `programNext` in `lib/tv/program.ts` (D-182).
 */
export function carouselNext(now: Date, points: boolean, week = false): { scene: TvScene; at: Date } {
  const list = carouselScenes(points, week);
  const step = Math.floor(now.getTime() / CAROUSEL_MS);
  return { scene: list[(step + 1) % list.length], at: new Date((step + 1) * CAROUSEL_MS) };
}

/** Стена листает заставки сама (D-123). */
export function carouselOn(state: TvState | null): boolean {
  return state?.carousel === true;
}

/**
 * What the middle of the wall shows when nobody's orders cover it (D-182), by priority: a live board
 * (D-102), the greeting of a guest just let in, a screensaver picked by hand while its segment of the
 * day lasts, else the day's program. A person, an order and the night stand above this (TvFrame).
 *
 * Незнакомая сцена — лицо: экран старше базы не должен чернеть. Рейтинг без очков — лицо:
 * `points` передаёт тот, кто знает флаг (не знает — считаем, что включены, и решает база).
 * Поставленный руками рейтинг при госте честно говорит, что скрыт (D-33); программа при госте
 * рейтинга не крутит.
 */
export function wallSceneOf(
  state: TvState | null,
  now: Date,
  o: { points: boolean; guest: boolean; announcement?: boolean; weekBoard?: boolean },
  w: ProgramWindow = DEFAULT_PROGRAM_WINDOW,
): WallScene {
  if (boardLive(state, now)) return "board";
  if (welcomeOn(state, now)) return "welcome";
  if (manualHolds(state, now, w)) {
    const scene = state?.scene;
    if (scene === "rating" && !o.points) return "face";
    return TV_SCENES.includes(scene as TvScene) ? (scene as TvScene) : "face";
  }
  return programScene(now, w, {
    points: o.points,
    guest: o.guest,
    announcement: o.announcement ?? false,
    weekBoard: o.weekBoard ?? weekInRound(state, now, o.guest, w),
  });
}

/** A scene the remote can name (`TvScene`), not one of the program's own. */
export function isTvScene(scene: WallScene): scene is TvScene {
  return (WALL_SCENES as readonly string[]).includes(scene);
}

/**
 * Заставка эфира словами пульта (D-76, D-123): то же, что `wallSceneOf`, только сцены программы
 * («Итог дня», «Итог недели», «Объявление», «Приветствие») пульт пока называет лицом. Подпись
 * старая — её зовут пульт, календарь и доски.
 */
export function sceneOf(
  state: TvState | null,
  now: Date = new Date(),
  points = true,
  guest = false,
  w: ProgramWindow = DEFAULT_PROGRAM_WINDOW,
  announcement = false,
): TvScene {
  const scene = wallSceneOf(state, now, { points, guest, announcement }, w);
  return isTvScene(scene) ? scene : "face";
}

/** The program has the wall (D-182): no live board, no screensaver held by hand. */
export function programOn(state: TvState | null, now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  return !boardLive(state, now) && !manualHolds(state, now, w);
}

/**
 * The calendar the wall draws: in the morning the program shows «Сегодня» (the week view); a calendar
 * picked by hand keeps the remote's view (D-98).
 */
export function wallCalendarView(state: TvState | null, now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): CalendarView {
  return programOn(state, now, w) && segmentOf(now, w) === "morning" ? "week" : calendarViewOf(state);
}

/** The week board (D-144) is alive: chosen, and its week has not ended. */
export function weekBoardLive(state: Pick<TvState, "week_board_id" | "week_board_until"> | null, now: Date): boolean {
  if (!state?.week_board_id || !state.week_board_until) return false;
  return new Date(state.week_board_until).getTime() > now.getTime();
}

/**
 * The week board takes its turn in the round (D-144): by day only — at night the wall sleeps
 * (D-105) — and never with a guest in the office: «Показать гостю» opens the meeting's board,
 * not the director's week (D-33); three minutes of «Доска скрыта» the round does not show.
 */
export function weekInRound(state: TvState | null, now: Date, guest: boolean, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  return weekBoardLive(state, now) && !isNight(now, w) && !guest;
}

/**
 * The wall goes round (D-123, D-144): the round is switched on — or a meeting's board ran out on
 * the wall while a week board waits: then the round takes the wall with the week board in it, as
 * `tv_board()` does, until a scene is picked by hand. The kiosk, the remote and its display use
 * this one rule, so the remote never shows the round off while the wall turns.
 */
export function roundOn(state: TvState | null, now: Date): boolean {
  if (carouselOn(state)) return true;
  return state?.scene === "board" && !boardLive(state, now) && weekBoardLive(state, now);
}

/**
 * The end of a week board's week, as `tv_week_end()` has it: the coming Sunday 21:00 Aqtobe;
 * on Sunday after 21:00 — the next one. For the remote's optimistic row and its words.
 */
export function weekEndFrom(now: Date): Date {
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Monday 0 … Sunday 6
  const weekday = (local.getUTCDay() + 6) % 7;
  const sunday = day + (6 - weekday) * DAY_MS + NIGHT_FROM_HOUR * HOUR_MS - AQTOBE_OFFSET_MS;
  return new Date(sunday > now.getTime() ? sunday : sunday + 7 * DAY_MS);
}

/** Taking a meeting's board down (D-144): to the round while a week board waits in it, else to the face. */
export function afterBoard(state: TvState | null, now: Date): { carousel: true } | { scene: "face" } {
  return weekBoardLive(state, now) ? { carousel: true } : { scene: "face" };
}

/** Доска на стене жива: сцена доски, доска есть, её время не вышло (D-102 §6). */
export function boardLive(state: TvState | null, now: Date): boolean {
  if (!state || state.scene !== "board" || !state.board_id || !state.board_until) return false;
  return new Date(state.board_until).getTime() > now.getTime();
}

/**
 * До какого времени доска стоит на стене — то же правило, что в `tv_control`: до сегодняшних
 * 21:00 по Актобе; поставленная после 21:00 — на два часа (D-102 §6).
 */
export function boardUntilFrom(now: Date): Date {
  if (aqtobeHour(now) < NIGHT_FROM_HOUR) {
    const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
    const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return new Date(day + NIGHT_FROM_HOUR * HOUR_MS - AQTOBE_OFFSET_MS);
  }
  return new Date(now.getTime() + 2 * HOUR_MS);
}

/**
 * The latest a board may stay on the wall (D-140 keeps D-102 §6): today's 21:00 Aqtobe, or two
 * hours from now when that is later — «на час» at 20:30 runs to 21:30, but no choice of time
 * and no «+30 мин» lets a board forgotten in the evening light up before the team next morning.
 * The same cap as `tv_control` / `tv_board_control`.
 */
export function boardCapFrom(now: Date): Date {
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  const dayEnd = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + NIGHT_FROM_HOUR * HOUR_MS - AQTOBE_OFFSET_MS;
  return new Date(Math.max(dayEnd, now.getTime() + 2 * HOUR_MS));
}

/**
 * «+30 мин» (D-140) as the new end, not as a step: the end it shows now (or now, if it is about
 * to run out) plus the minutes, under the cap. Sent as a time, a repeat lands on the same row.
 */
export function boardExtendTo(state: Pick<TvState, "board_until"> | null, minutes: number, now: Date): Date {
  const from = Math.max(state?.board_until ? new Date(state.board_until).getTime() : 0, now.getTime());
  return new Date(Math.min(from + minutes * 60_000, boardCapFrom(now).getTime()));
}

/** Цифры или стрелки — везде, где стена рисует часы (D-96). Незнакомое — цифры. */
export function clockStyleOf(state: TvState | null): ClockStyle {
  return state?.clock_style === "analog" ? "analog" : "digital";
}

/** Вид календаря на стене. Незнакомое — неделя: она показывает и «Сегодня». */
export function calendarViewOf(state: TvState | null): CalendarView {
  return state?.calendar_view === "month" ? "month" : "week";
}

/** Вид доски на стене. Незнакомое — список: он читается при любом числе пунктов (D-121). */
export function boardViewOf(state: TvState | null): BoardView {
  return state?.board_view === "map" ? "map" : "list";
}

/**
 * Обсуждаемый пункт доски — только пока доска на стене жива (D-121). Что пункт ещё жив и с
 * текстом, проверяет `tv_board()`; пульт сверяет с пунктами доски сам.
 */
export function boardPointOf(state: TvState | null, now: Date): string | null {
  return boardLive(state, now) ? (state?.board_point ?? null) : null;
}

/** Период заставки «Рейтинг». Незнакомое — неделя (D-123). */
export function ratingViewOf(state: TvState | null): RatingView {
  return state?.rating_view === "month" ? "month" : "week";
}

/**
 * Перезапуск с пульта. Считается от времени загрузки страницы, а не от флага в базе:
 * иначе киоск, поднявшийся после перезапуска, увидел бы ту же отметку и ушёл в петлю.
 */
export function shouldReload(state: TvState | null, bootedAt: Date): boolean {
  if (!state?.reload_requested_at) return false;
  return new Date(state.reload_requested_at).getTime() > bootedAt.getTime();
}

/** Сколько фокусу осталось жить; вне фокуса — ноль. */
export function focusRemainingMs(state: TvState | null, now: Date): number {
  if (!state?.expires_at) return 0;
  return Math.max(0, new Date(state.expires_at).getTime() - now.getTime());
}

/** Ночь стены — те же тихие часы, что у доставки (CLAUDE.md принцип 8): 21:00–08:00. */
export const NIGHT_FROM_HOUR = 21;
export const NIGHT_TO_HOUR = 8;

/** Час по Актобе (фиксированный +05:00, без летнего времени). */
export function aqtobeHour(now: Date): number {
  return Math.floor(((now.getTime() + AQTOBE_OFFSET_MS) % DAY_MS) / HOUR_MS);
}

/**
 * Ночью в пустом кабинете стена гаснет до тусклых часов: статичная картинка часами
 * подряд выжигает матрицу, а смотреть на неё некому (D-96). Фокус, доска, надпись о
 * посетителе и разбудка с пульта ночь перебивают — их поставил человек, значит, в
 * кабинете кто-то есть. Это просто часы; спит ли стена — `wallAsleep`.
 *
 * Окно ночи — из программы компании (D-182, `tv_summary.program`); без окна — 21:00–08:00,
 * те же тихие часы, что у доставки (CLAUDE.md принцип 8). Одно правило и для лица (`voice.ts`).
 */
export function isNight(now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  return nightIn(now, w);
}

/** Разбудка с пульта живёт два часа — то же число, что в `tv_control(p_wake)` (D-105). */
export const WAKE_MS = 2 * HOUR_MS;

/**
 * До какого времени директор разбудил стену (D-105): ночь её не гасит, пока отметка
 * впереди. Гаснет по часам киоска сама, как фокус; истёкшая и снятая — null.
 */
export function awakeUntil(state: TvState | null, now: Date): Date | null {
  if (!state?.awake_until) return null;
  const at = new Date(state.awake_until);
  return at.getTime() > now.getTime() ? at : null;
}

/**
 * Стена сейчас спит — тусклые часы (D-96 §8): ночь, никто не будил, и на стене нет того,
 * что ночь перебивает, — фокуса на человеке или деле и доски. Надпись о посетителе тоже
 * будит стену, но ненадолго; о ней пульт говорит отдельной строкой.
 */
export function wallAsleep(state: TvState | null, now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  if (!isNight(now, w) || awakeUntil(state, now)) return false;
  return effectiveMode(state, now) === "ether" && sceneOf(state, now) !== "board";
}

/** Шаг сдвига против выгорания: раз в 10 минут. */
export const SHIFT_STEP_MS = 10 * 60_000;
const SHIFT: readonly (readonly [number, number])[] = [
  [0, 0],
  [4, -3],
  [-3, 4],
  [5, 3],
  [-4, -4],
  [2, 5],
  [-5, 1],
  [3, -5],
];

/**
 * Против выгорания: вся композиция раз в 10 минут встаёт на несколько пикселей в другое
 * место — подпись, бегущая строка и марка стоят на экране сутками. Глазом сдвиг не виден,
 * матрице хватает. Только transform (перф-контракт D-45).
 */
export function burnInShift(now: Date): { x: number; y: number } {
  const step = Math.floor(now.getTime() / SHIFT_STEP_MS) % SHIFT.length;
  const [x, y] = SHIFT[step];
  return { x, y };
}

/**
 * Where the night clock stands (D-182): the composition shift above is thinner than the stroke of the
 * clock's digits, so the dim digits of a whole night would still burn in place. The night clock moves
 * to another spot of the middle once in 10 minutes, the same spot for the same ten minutes on every
 * kiosk — shares of the middle area, −1…1 across and down, never the same spot twice in a row.
 */
const NIGHT_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.62, -0.5],
  [0.58, 0.46],
  [-0.4, 0.62],
  [0.66, -0.38],
  [-0.7, 0.12],
  [0.24, -0.64],
  [0.36, 0.7],
  [-0.2, -0.22],
];

export function nightSpot(now: Date): { x: number; y: number } {
  const step = Math.floor(now.getTime() / SHIFT_STEP_MS);
  // a stride coprime with the spot count walks every spot before it repeats one
  const [x, y] = NIGHT_SPOTS[(step * 4) % NIGHT_SPOTS.length]!;
  return { x, y };
}
