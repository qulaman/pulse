import type { TvState } from "./queries";

/**
 * Что киоск делает со строкой `tv_state` — чистыми функциями, без React.
 *
 * Правило всей пачки: строки может не быть вовсе (пульт ещё ни разу не командовал),
 * значение в ней может быть незнакомым (клиент старше базы после деплоя), а фокус —
 * уже истёкшим. Ни один из трёх случаев не имеет права погасить стену: во всех
 * ответ — эфир и сцена «лицо» (D-76).
 */

export type TvMode = "ether" | "employee";
export type TvScene = "face" | "clock" | "team" | "calendar";
export type ClockStyle = "digital" | "analog";

export const TV_SCENES: readonly TvScene[] = ["face", "clock", "team", "calendar"];
export const CLOCK_STYLES: readonly ClockStyle[] = ["digital", "analog"];

/** Фокус на сотруднике живёт 10 минут — то же число, что в `tv_control` (D-76 §5). */
export const FOCUS_MS = 10 * 60_000;

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Режим по часам киоска: фокус живёт до `expires_at` и гаснет сам, без cron и без
 * таймера на пульте (D-76 §5). Режим `task` схемой допущен заранее, но UI его пока
 * не строит — для стены это тот же эфир.
 */
export function effectiveMode(state: TvState | null, now: Date): TvMode {
  if (!state) return "ether";
  if (state.mode !== "employee") return "ether";
  if (!state.employee_id) return "ether";
  if (!state.expires_at) return "ether";
  return new Date(state.expires_at).getTime() > now.getTime() ? "employee" : "ether";
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

/** Заставка эфира. Незнакомая сцена — лицо: экран старше базы не должен чернеть. */
export function sceneOf(state: TvState | null): TvScene {
  const scene = state?.scene;
  return TV_SCENES.includes(scene as TvScene) ? (scene as TvScene) : "face";
}

/** Цифры или стрелки — везде, где стена рисует часы (D-96). Незнакомое — цифры. */
export function clockStyleOf(state: TvState | null): ClockStyle {
  return state?.clock_style === "analog" ? "analog" : "digital";
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
 * подряд выжигает матрицу, а смотреть на неё некому (D-96). Фокус и надпись о
 * посетителе ночь перебивают — их поставил человек, значит, в кабинете кто-то есть.
 */
export function isNight(now: Date): boolean {
  const hour = aqtobeHour(now);
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR;
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
