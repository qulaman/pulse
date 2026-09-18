import { tvTime } from "./clock";
import type { TvState } from "./queries";
import { effectiveMode, focusRemainingMs, sceneOf, type TvScene } from "./state";

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
};

const SCENE_NOW: Record<TvScene, string> = {
  face: "Эфир · лицо",
  clock: "Эфир · часы",
  team: "Эфир · команда",
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

/** Что показывается прямо сейчас: «Эфир · часы» или «Марат Ахметов · ещё 7 мин». */
export function wallNow(
  state: TvState | null,
  people: { id: string; full_name: string }[],
  now: Date,
): string {
  if (effectiveMode(state, now) === "employee" && state?.employee_id) {
    const person = people.find((p) => p.id === state.employee_id);
    const minutes = Math.ceil(focusRemainingMs(state, now) / 60_000);
    return `${person?.full_name ?? "Сотрудник"} · ещё ${minutes} мин`;
  }
  return SCENE_NOW[sceneOf(state)];
}

/**
 * Подпись клавиши сотрудника на пульте: имя, а при тёзках — имя и первая буква
 * фамилии («Ерлан Б.», «Ерлан Д.»). Порядок людей не меняется — клавиатура пульта
 * должна запоминаться пальцами, поэтому стоящий на стене не переезжает наверх.
 */
export function keyLabels(people: { id: string; full_name: string }[]): Map<string, string> {
  const parts = people.map((p) => {
    const [first = "", ...rest] = p.full_name.trim().split(/\s+/);
    return { id: p.id, first: first || p.full_name, surname: rest[0] ?? "" };
  });
  const seen = new Map<string, number>();
  for (const p of parts) seen.set(p.first, (seen.get(p.first) ?? 0) + 1);
  return new Map(
    parts.map((p) => [
      p.id,
      (seen.get(p.first) ?? 0) > 1 && p.surname ? `${p.first} ${p.surname[0]}.` : p.first,
    ]),
  );
}
