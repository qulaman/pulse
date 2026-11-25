/**
 * A measure on the desk only when enough lies under it (D-194). «В срок 100 %» with a big ring
 * over one task, a weekly line over four hand-ins, «обычно 18 мин» over one — each looks like a
 * verdict about a person and says nothing. Below the bar the same facts are said as plain numbers.
 * Pure: the person's dashboard (components/desk/team/PersonStats.tsx) asks here; the phone's person card
 * draws no percent, ring or line, so it has nothing to ask yet.
 */
import { spanShort } from "@/lib/people/stats";
import { pluralRu } from "@/lib/tasks/status-text";

export const ENOUGH = {
  /** «В срок» as a percent and a ring: tasks with a deadline handed in over the period. */
  onTime: 5,
  /** «Скорость» as a typical time and a strip of dots: tasks handed in over the period. */
  speed: 5,
  /** The weekly line of «Выполнено»: weeks that had a hand-in. */
  weeks: 3,
  /** A change against the period before: what the period before counted. */
  base: 3,
  /** The week's rating as a strip of places: people in it. */
  rank: 4,
} as const;

export type EnoughKind = keyof typeof ENOUGH;

export function enough(kind: EnoughKind, count: number): boolean {
  return count >= ENOUGH[kind];
}

const tasks = (n: number) => `${n} ${pluralRu(n, ["задача", "задачи", "задач"])}`;

/**
 * «В срок» in words while there is too little for a percent: «1 из 1 — в срок», «в срок 2 из 3,
 * 1 позже срока»; null when nothing with a deadline was handed in.
 */
export function onTimeWords(onTime: number, late: number): string | null {
  const total = onTime + late;
  if (total === 0) return null;
  if (late === 0) return total === 1 ? "1 задача со сроком — сдана в срок" : `${tasks(total)} со сроком — все в срок`;
  if (onTime === 0) return total === 1 ? "1 задача со сроком — сдана позже срока" : `${tasks(total)} со сроком — все позже срока`;
  return `в срок ${onTime} из ${total}, позже срока — ${late}`;
}

/** «Скорость» in words while there is too little for a typical time: «1 сдана — за 18 мин», «3 сданы — от 18 мин до 2 д». */
export function speedWords(spans: readonly number[]): string | null {
  if (spans.length === 0) return null;
  const handed = `${spans.length} ${pluralRu(spans.length, ["сдана", "сданы", "сданы"])}`;
  if (spans.length === 1) return `${handed} — за ${spanShort(spans[0])}`;
  const least = Math.min(...spans);
  const most = Math.max(...spans);
  return least === most ? `${handed} — каждая за ${spanShort(least)}` : `${handed} — от ${spanShort(least)} до ${spanShort(most)}`;
}

/** How many weeks of a series had anything in them. */
export function weeksWith(series: readonly { count: number }[]): number {
  return series.filter((week) => week.count > 0).length;
}
