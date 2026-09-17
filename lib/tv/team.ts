import { between, rng } from "@/lib/idle/random";
import { initialsOf } from "@/lib/idle/people";

/**
 * Команда на стене: полоса кружков под лентой. У кого есть работа — кружок живёт
 * (пульсирует в цвете бренда), у кого нет — спокойно дрейфует серым.
 *
 * Это тот же жест, что на экране ожидания у директора (D-69/D-71), но без поимки и без
 * звёздного поля: киоск не трогают руками. И без красного — перегруз и просрочка по
 * именам на стену не выносятся (D-45), в кружке живёт только «сколько сейчас несёт».
 *
 * Место человека — хэш его имени, а не позиция в списке: сосед пришёл или ушёл, а он
 * стоит там же. Раскладка чистая, поэтому её проверяет тест, а не глаз на стене.
 */

/** Строка из `tv_summary.load` — всё, что киоску известно о человеке. */
export type TvTeamRow = { name: string; active: number };

export type TvOrb = {
  key: string;
  initials: string;
  /** Подпись под кружком: имя (у гостя оно и так без фамилии). */
  label: string;
  active: number;
  busy: boolean;
  /** Проценты полосы: 0..100 по горизонтали; по вертикали — центр кружка. */
  x: number;
  y: number;
  /** Диаметр в vh. */
  size: number;
  /** Дрейф бездельника и ритм занятого. */
  dx: number;
  dy: number;
  driftMs: number;
  beatMs: number;
  delayMs: number;
};

/** Больше десяти кружков на полосе — уже толпа, в которой не видно никого. */
export const MAX_ORBS = 10;

const BUSY_SIZE = [7, 10.5] as const;
const IDLE_SIZE = 6.4;

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Полоса команды. Занятые — первыми (они и есть новость дня), но треть мест всегда
 * остаётся за свободными: «кому можно дать» — половина смысла этой полосы.
 */
export function teamField(rows: readonly TvTeamRow[], max: number = MAX_ORBS): TvOrb[] {
  const busy = rows.filter((row) => row.active > 0).sort((a, b) => b.active - a.active);
  const idle = rows.filter((row) => row.active === 0);
  const idleQuota = Math.min(idle.length, Math.max(1, Math.floor(max / 3)));
  const chosen = [...busy.slice(0, max - idleQuota), ...idle.slice(0, idleQuota)];

  // на полосе люди стоят в том же порядке, что и в сводке: список алфавитный, и глаз
  // находит человека там, где привык
  const shown = rows.filter((row) => chosen.includes(row));
  // у гостя имена без фамилий, и двух «Ерланов» легко спутать одним ключом: второму
  // достаётся свой суффикс — и место у него тоже своё
  const seen = new Map<string, number>();
  const loudest = Math.max(1, ...shown.map((row) => row.active));
  const step = 100 / Math.max(1, shown.length);

  return shown.map((row, index) => {
    const twin = (seen.get(row.name) ?? 0) + 1;
    seen.set(row.name, twin);
    const key = twin === 1 ? row.name : `${row.name}#${twin}`;
    const random = rng(hashOf(key));
    const busyOne = row.active > 0;
    const weight = busyOne ? row.active / loudest : 0;
    return {
      key,
      initials: initialsOf(row.name),
      label: row.name.split(/\s+/)[0] ?? row.name,
      active: row.active,
      busy: busyOne,
      // свой слот плюс небольшой сдвиг внутри него — строй живой, но не рваный
      x: step * index + step / 2 + between(random, -step * 0.18, step * 0.18),
      // центр кружка: выше не пускает заголовок полосы, ниже — подпись под кружком
      y: between(random, 48, 60),
      size: busyOne ? BUSY_SIZE[0] + (BUSY_SIZE[1] - BUSY_SIZE[0]) * weight : IDLE_SIZE,
      dx: between(random, -2.2, 2.2),
      dy: between(random, -1.6, 1.6),
      driftMs: Math.round(between(random, 9_000, 16_000)),
      // чем больше несёт, тем чаще бьётся
      beatMs: Math.round(between(random, 2_600, 3_600) - weight * 900),
      delayMs: Math.round(between(random, 0, 1_800)),
    };
  });
}
