import { pluralRu } from "@/lib/tasks/status-text";

import type { TvLeader, TvRatingScene } from "./queries";

/**
 * The «Рейтинг» scene (D-123, look D-185) — what to print and how. Pure functions: the "what may go on
 * the wall" rule is checked by a test, not by eye on the TV.
 *
 * The look is a broadcast's standings column: the leader large on the left, places 2–5 as lines on the right. The
 * main rule is the whole wall's: nothing bad goes up by name (D-45). So only the top five are here
 * (the base does not even hand out the sixth), growth is positive only, no «в срок», no fines, no awards
 * as lines: an award comes to the wall as a full-screen moment.
 */

export type LeaderRow = {
  id: string;
  name: string;
  /** A real photo only; without one the wall draws nothing in place of the face. */
  avatar: string | null;
  rank: number;
  /** «1 240» — with a non-breaking space between thousands. */
  points: string;
  pointsWord: string;
  /** «+60»; a drop and zero are not printed. */
  growth: string | null;
};

export type LeadersView =
  | { state: "hidden" }
  | { state: "off" }
  | {
      state: "ready";
      title: string;
      span: string;
      /** First place, large on the left; null if nobody scored points. */
      leader: LeaderRow | null;
      /** «+60 к прошлой неделе» for the leader. */
      leaderGrowth: string | null;
      /** Places 2–5. */
      rest: LeaderRow[];
      /** «Команда за неделю: сделано 48 · 1 240 очков» — or null when there is nothing to praise. */
      team: string | null;
    };

export const RATING_TITLE = { week: "Рейтинг недели", month: "Рейтинг месяца" } as const;
// `tv_rating` counts `interval '1 month'`: a calendar month back, not thirty days
const SPAN = { week: "последние 7 дней", month: "последний месяц" } as const;
// the comparison never breaks inside itself: «+240» may stand alone on a line, «к прошлому месяцу» does not
const PREVIOUS = { week: "к прошлой неделе", month: "к прошлому месяцу" } as const;
const TEAM = { week: "Команда за неделю", month: "Команда за месяц" } as const;

/** «1 240» — с неразрывным пробелом тысяч, как в телефоне. */
export function formatPoints(value: number): string {
  return Math.round(value).toLocaleString("ru-RU").replace(/\s/g, " ");
}

function rowOf(row: TvLeader): LeaderRow {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar_url || null,
    rank: row.rank,
    points: formatPoints(row.points),
    pointsWord: pluralRu(row.points, ["очко", "очка", "очков"]),
    growth: row.delta > 0 ? `+${formatPoints(row.delta)}` : null,
  };
}

/** One line of the team's good news: what was done and what was earned, never «в срок» (D-185). */
function teamLine(data: TvRatingScene): string | null {
  const parts: string[] = [];
  if (data.team.done > 0) parts.push(`сделано ${formatPoints(data.team.done)}`);
  if (data.team.earned > 0) parts.push(`${formatPoints(data.team.earned)} ${pluralRu(data.team.earned, ["очко", "очка", "очков"])}`);
  return parts.length > 0 ? `${TEAM[data.period]}: ${parts.join(" · ")}` : null;
}

export function leadersView(data: TvRatingScene | null): LeadersView {
  if (!data || data.hidden) return { state: "hidden" };
  if (!data.enabled) return { state: "off" };

  const rows = data.top
    .filter((row) => row.points > 0 && row.rank >= 1 && row.rank <= 5)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map(rowOf);
  const [leader = null, ...rest] = rows;

  return {
    state: "ready",
    title: RATING_TITLE[data.period],
    span: SPAN[data.period],
    leader,
    leaderGrowth: leader?.growth ? `${leader.growth} ${PREVIOUS[data.period]}` : null,
    rest,
    team: teamLine(data),
  };
}
