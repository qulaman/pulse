import { pluralRu } from "@/lib/tasks/status-text";

import { initialsOfName, storyTime } from "./focus";
import type { TvRatingScene } from "./queries";

/**
 * Заставка «Рейтинг» (D-123) — что и как печатать. Чистые функции: правило «что можно на
 * стену» проверяется тестом, а не глазами на телевизоре.
 *
 * Главное правило то же, что у всей стены: плохое по имени не выносится (D-45). Поэтому
 * здесь только первая пятёрка (база шестого и не отдаёт), рост — только положительный,
 * награды — только награды, «в срок» — числом хорошего, без процента.
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
  /** «сдано 9 · в срок 8», если сдавал; иначе null. */
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

function doneLine(done: number, onTime: number): string | null {
  if (done <= 0) return null;
  return onTime > 0 ? `сдано ${done} · в срок ${Math.min(onTime, done)}` : `сдано ${done}`;
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
      done: doneLine(row.done, row.on_time),
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

  const team: string[] = [];
  if (data.team.done > 0) {
    team.push(`сдано ${formatPoints(data.team.done)}`);
    if (data.team.on_time > 0) team.push(`в срок ${formatPoints(Math.min(data.team.on_time, data.team.done))}`);
  }
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
