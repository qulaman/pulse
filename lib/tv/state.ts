import type { TvState } from "./queries";

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

/**
 * The scene keys of the remote; the board comes on the wall only with a board (D-102), the
 * rating only while points are on (D-48, D-123).
 */
export const TV_SCENES: readonly TvScene[] = ["face", "clock", "team", "calendar", "rating"];
/** Every scene the wall can show. */
export const WALL_SCENES: readonly TvScene[] = [...TV_SCENES, "board"];
export const CLOCK_STYLES: readonly ClockStyle[] = ["digital", "analog"];
export const CALENDAR_VIEWS: readonly CalendarView[] = ["week", "month"];
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
 * экран для совещаний, доска — выбор директора: в круг не входят.
 */
export function carouselScenes(points: boolean): TvScene[] {
  return points ? ["face", "rating", "calendar", "team"] : ["face", "calendar", "team"];
}

/**
 * Какая заставка сейчас в круге — по часам, без таймера и без обмена с пультом: киоск и
 * пульт считают одно и то же число и сходятся. Граница — ровные три минуты от эпохи.
 */
export function carouselScene(now: Date, points: boolean): TvScene {
  const list = carouselScenes(points);
  return list[Math.floor(now.getTime() / CAROUSEL_MS) % list.length];
}

/** Когда круг сменит заставку и на какую — для пульта: «дальше — календарь в 14:03». */
export function carouselNext(now: Date, points: boolean): { scene: TvScene; at: Date } {
  const list = carouselScenes(points);
  const step = Math.floor(now.getTime() / CAROUSEL_MS);
  return { scene: list[(step + 1) % list.length], at: new Date((step + 1) * CAROUSEL_MS) };
}

/** Стена листает заставки сама (D-123). */
export function carouselOn(state: TvState | null): boolean {
  return state?.carousel === true;
}

/**
 * Заставка эфира. Незнакомая сцена — лицо: экран старше базы не должен чернеть. Доска —
 * только пока она жива: истёк её срок или её нет — лицо (D-102 §6). Круг — по часам
 * (D-123). Рейтинг без очков — лицо: `points` передаёт тот, кто знает флаг (`false` —
 * очки выключены; не знает — считаем, что включены, и решает база). Гость в кабинете
 * убирает рейтинг из круга — три минуты «Рейтинг скрыт» круг не крутит; поставленный
 * руками рейтинг при госте честно говорит, что скрыт (D-33).
 */
export function sceneOf(state: TvState | null, now: Date = new Date(), points = true, guest = false): TvScene {
  if (carouselOn(state)) return carouselScene(now, points && !guest);
  const scene = state?.scene;
  if (scene === "board") return boardLive(state, now) ? "board" : "face";
  if (scene === "rating" && !points) return "face";
  return WALL_SCENES.includes(scene as TvScene) ? (scene as TvScene) : "face";
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

/** Цифры или стрелки — везде, где стена рисует часы (D-96). Незнакомое — цифры. */
export function clockStyleOf(state: TvState | null): ClockStyle {
  return state?.clock_style === "analog" ? "analog" : "digital";
}

/** Вид календаря на стене. Незнакомое — неделя: она показывает и «Сегодня». */
export function calendarViewOf(state: TvState | null): CalendarView {
  return state?.calendar_view === "month" ? "month" : "week";
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
 */
export function isNight(now: Date): boolean {
  const hour = aqtobeHour(now);
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR;
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
export function wallAsleep(state: TvState | null, now: Date): boolean {
  if (!isNight(now) || awakeUntil(state, now)) return false;
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
