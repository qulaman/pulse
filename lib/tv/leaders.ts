import { pluralRu } from "@/lib/tasks/status-text";

import { initialsOfName, storyTime } from "./focus";
import type { TvRatingScene } from "./queries";

/**
 * Заставка «Рейтинг» (D-123) — что и как печатать. Чистые функции: правило «что можно на
 * стену» проверяется тестом, а не глазами на телевизоре.
 *
 * Главное правило то же, что у всей стены: плохое по имени не выносится (D-45). Поэтому
 * здесь только первая пятёрка (база шестого и не отдаёт), рост — только положительный,
 * награды — только награды, сданное — одним числом, без «в срок» и процента.
 */

export type LeaderCard = {
  id: string;
  name: string;
  initials: string;
  avatar: string | null;
  position: string | null;
  rank: number;
  points: number;
  pointsWord: string;
  /** Рост к прошлому периоду; падение не печатается. */
  delta: number | null;
  /** «сдано 9» (и «🔥 4 подряд»), если сдавал; иначе null. */
  done: string | null;
};

export type AwardLine = { key: string; name: string; amount: string; reason: string; time: string };

export type LeadersView =
  | { state: "hidden" }
  | { state: "off" }
  | {
      state: "ready";
      title: string;
      span: string;
      /** Пьедестал слева направо: второй, первый, третий — как у настоящего. */
      podium: LeaderCard[];
      /** Четвёртый и пятый. */
      rest: LeaderCard[];
      riser: { name: string; initials: string; avatar: string | null; delta: string } | null;
      awards: AwardLine[];
      team: string[];
      /** Никто не набрал очков за период. */
      empty: boolean;
    };

const TITLE = { week: "Рейтинг недели", month: "Рейтинг месяца" } as const;
const SPAN = { week: "последние 7 дней", month: "последний месяц" } as const;
const PREVIOUS = { week: "к прошлой неделе", month: "к прошлому месяцу" } as const;

/** «1 240» — с неразрывным пробелом тысяч, как в телефоне. */
export function formatPoints(value: number): string {
  return Math.round(value).toLocaleString("ru-RU").replace(/\s/g, " ");
}

/**
 * «сдано 5» — one number, and the run of handovers in time from two (И-69, D-133). «в срок 4»
 * beside «сдано 5» is gone: the pair gives away the one late handover by name (D-45, D-182).
 */
function doneLine(done: number, streak = 0): string | null {
  const run = streak >= 2 ? `🔥 ${streak} подряд` : null;
  if (done <= 0) return run;
  const base = `сдано ${done}`;
  return run ? `${base} · ${run}` : base;
}

/**
 * Who climbed since the last picture of the five (D-182): a place better than before, or a place
 * in the five out of nowhere. The wall slides them to their new place and flashes the step once.
 * The first picture (nothing before it) has no climbers — the scene's entrance is enough.
 */
export function risenIds(before: Readonly<Record<string, number>> | null, after: Readonly<Record<string, number>>): string[] {
  if (!before || Object.keys(before).length === 0) return [];
  return Object.entries(after)
    .filter(([id, rank]) => before[id] === undefined || rank < before[id])
    .map(([id]) => id);
}

/** The places of the five by person: the input of `risenIds`. */
export function ranksOf(view: LeadersView): Record<string, number> {
  if (view.state !== "ready") return {};
  const ranks: Record<string, number> = {};
  for (const card of [...view.podium, ...view.rest]) ranks[card.id] = card.rank;
  return ranks;
}

export function leadersView(data: TvRatingScene | null, now: Date): LeadersView {
  if (!data || data.hidden) return { state: "hidden" };
  if (!data.enabled) return { state: "off" };

  const cards: LeaderCard[] = data.top
    .filter((row) => row.points > 0 && row.rank >= 1 && row.rank <= 5)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      initials: initialsOfName(row.name),
      avatar: row.avatar_url ?? null,
      position: row.position ?? null,
      rank: row.rank,
      points: row.points,
      pointsWord: pluralRu(row.points, ["очко", "очка", "очков"]),
      delta: row.delta > 0 ? row.delta : null,
      done: doneLine(row.done, row.streak ?? 0),
    }));

  const [first, second, third] = cards;
  const podium = [second, first, third].filter((card): card is LeaderCard => Boolean(card));

  const riser =
    data.riser && data.riser.delta > 0
      ? {
          name: data.riser.name,
          initials: initialsOfName(data.riser.name),
          avatar: data.riser.avatar_url ?? null,
          delta: `▲ +${formatPoints(data.riser.delta)} ${PREVIOUS[data.period]}`,
        }
      : null;

  const awards: AwardLine[] = data.awards
    .filter((award) => award.amount > 0)
    .slice(0, 3)
    .map((award, index) => ({
      key: `${award.at}-${index}`,
      name: award.name,
      amount: `+${formatPoints(award.amount)}`,
      reason: award.reason?.trim() ?? "",
      time: storyTime(award.at, now),
    }));

  // one number of handovers, no «в срок» beside it (D-45, D-182)
  const team: string[] = [];
  if (data.team.done > 0) team.push(`сдано ${formatPoints(data.team.done)}`);
  if (data.team.earned > 0) {
    team.push(`${formatPoints(data.team.earned)} ${pluralRu(data.team.earned, ["очко", "очка", "очков"])} заработано`);
  }

  return {
    state: "ready",
    title: TITLE[data.period],
    span: SPAN[data.period],
    podium,
    rest: cards.slice(3),
    riser,
    awards,
    team,
    empty: cards.length === 0,
  };
}
