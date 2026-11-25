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
  /** «420», «1680», «12 400» — see `formatPoints`. */
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
      /** «на 60 больше, чем неделю назад» for the leader, one unbreakable phrase. */
      leaderGrowth: string | null;
      /** Places 2–5. */
      rest: LeaderRow[];
      /** «За неделю команда закрыла 48 задач и заработала 1240 очков» — or null when there is nothing to praise. */
      team: string | null;
      /**
       * The same news as large figures, for a leader standing alone: the side column of places 2–5 would be empty,
       * so the team's week stands there instead of one small line under the scene (D-194). Positive only.
       */
      teamFigures: TeamFigure[];
      /** «Команда за неделю» — the head of those figures. */
      teamHead: string;
    };

export type TeamFigure = { key: "done" | "earned"; value: string; label: string; gold: boolean };

export const RATING_TITLE = { week: "Рейтинг недели", month: "Рейтинг месяца" } as const;
// `tv_rating` counts `interval '1 month'`: a calendar month back, not thirty days
// the comparison never breaks inside itself (non-breaking spaces): «на 60 больше, чем неделю назад»
const PREVIOUS = { week: "чем неделю назад", month: "чем месяц назад" } as const;
const TEAM = { week: "За неделю команда", month: "За месяц команда" } as const;
const TEAM_HEAD = { week: "Команда за неделю", month: "Команда за месяц" } as const;

const DAY_MS = 86_400_000;
const dayMonth = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric", month: "long" });
const dayOnly = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric" });

/**
 * The dates the rating counts, instead of «последние 7 дней» under «Рейтинг недели»: «17–23 ноября»,
 * «28 октября — 3 ноября»; a month — «24 октября — 23 ноября» (`tv_rating` counts a calendar month back).
 */
export function ratingSpan(period: "week" | "month", now: Date): string {
  // whole days, today included: seven of them for a week; for a month — from the day after «a month ago»
  const from = new Date(period === "week" ? now.getTime() - 6 * DAY_MS : monthBack(now).getTime() + DAY_MS);
  const sameMonth = dayMonth.format(from).split(" ")[1] === dayMonth.format(now).split(" ")[1];
  return sameMonth ? `${dayOnly.format(from)}–${dayMonth.format(now)}` : `${dayMonth.format(from)} — ${dayMonth.format(now)}`;
}

const AQTOBE_OFFSET_MS = 5 * 3_600_000;

/**
 * A month back as Postgres counts `interval '1 month'` on the Aqtobe calendar: the same day of the
 * previous month, or its last day when that month is shorter (31 March → 28 February).
 */
function monthBack(now: Date): Date {
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() - 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(local.getUTCDate(), lastDay);
  const back = Date.UTC(year, month, day, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds());
  return new Date(back - AQTOBE_OFFSET_MS);
}

/**
 * Points as Russian type sets them: «420», «1680» — four digits stay together, «1 680» on a wall
 * reads as «1-е место, 680»; from five digits a narrow no-break space: «12 400».
 */
export function formatPoints(value: number): string {
  const n = Math.round(value);
  return Math.abs(n) < 10_000 ? String(n) : n.toLocaleString("ru-RU").replace(/\s/g, "\u202f");
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

/** One sentence of the team's good news: what was done and what was earned, never «в срок» (D-185). */
function teamLine(data: TvRatingScene): string | null {
  const done = data.team.done > 0 ? `закрыла ${formatPoints(data.team.done)} ${pluralRu(data.team.done, ["задачу", "задачи", "задач"])}` : null;
  const earned = data.team.earned > 0 ? `заработала ${formatPoints(data.team.earned)} ${pluralRu(data.team.earned, ["очко", "очка", "очков"])}` : null;
  const parts = [done, earned].filter(Boolean);
  return parts.length > 0 ? `${TEAM[data.period]} ${parts.join(" и ")}` : null;
}

/** The team's week as figures: tasks closed, points earned — what is there is said, a zero is not. */
function teamFiguresOf(data: TvRatingScene): TeamFigure[] {
  const figures: TeamFigure[] = [];
  if (data.team.done > 0) {
    figures.push({ key: "done", value: formatPoints(data.team.done), label: pluralRu(data.team.done, ["задача закрыта", "задачи закрыты", "задач закрыто"]), gold: false });
  }
  if (data.team.earned > 0) {
    figures.push({ key: "earned", value: formatPoints(data.team.earned), label: pluralRu(data.team.earned, ["очко заработано", "очка заработано", "очков заработано"]), gold: true });
  }
  return figures;
}

export function leadersView(data: TvRatingScene | null, now: Date = new Date()): LeadersView {
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
    span: ratingSpan(data.period, now),
    leader,
    // one unbreakable phrase: it never splits into «на 60» and «больше, чем неделю назад» across two lines
    leaderGrowth: leader?.growth ? `на ${leader.growth.slice(1)} больше, ${PREVIOUS[data.period]}`.replace(/ /g, "\u00a0") : null,
    rest,
    team: teamLine(data),
    teamFigures: teamFiguresOf(data),
    teamHead: TEAM_HEAD[data.period],
  };
}
