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
export type TvScene = "face" | "clock" | "team";

export const TV_SCENES: readonly TvScene[] = ["face", "clock", "team"];

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
 * «Посетитель»: до прихода строки действует стартовый `?guest=1` из адреса киоска,
 * после — то, что сказал пульт. Гость никогда не «включается сам».
 */
export function guestOf(state: TvState | null, initial: boolean): boolean {
  return state ? state.guest : initial;
}

/** Заставка эфира. Незнакомая сцена — лицо: экран старше базы не должен чернеть. */
export function sceneOf(state: TvState | null): TvScene {
  const scene = state?.scene;
  return TV_SCENES.includes(scene as TvScene) ? (scene as TvScene) : "face";
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
