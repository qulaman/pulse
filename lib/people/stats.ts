"use client";

import { useQuery } from "@tanstack/react-query";

import { addDaysYmd, isoWeekday } from "@/lib/daily-report/format";
import { useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import type { DailyReportStatus, TeamPeriodRow } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm, todayYmd, ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useTeamLoads, type Load } from "@/lib/people/loads";
import { periodWindows, tallyTasks, type PeriodTask, type TaskTally, type Window } from "@/lib/people/period";
import { isTeamMember, peopleKeys, type Person } from "@/lib/people/queries";
import { useRating, useTeamBalances, type RatingRow } from "@/lib/points/queries";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import type { DailyReportSettings } from "@/lib/settings";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * A person's dashboard on the desk (D-172, components/desk/team/PersonStats.tsx): the director's
 * view of one employee — what they finished, how much by the deadline, what they hold now, how fast
 * they hand in, their points and their daily reports. Pure helpers first (tested in stats.test.ts),
 * the one hook last. The 30-day windows, the hand-in tally and «в срок» are lib/people/period.ts's
 * — the card's numbers and the right-hand panel's line never disagree. Days are the company's
 * calendar days (Asia/Aqtobe).
 */

/** The sparkline's length: weeks of seven days, the last one ending today. */
export const STATS_WEEKS = 12;
/** The reports' calendar: weeks Monday to Sunday, the current one last. */
export const HEATMAP_WEEKS = 5;

const DAY_MS = 86_400_000;

export type StatsTask = PeriodTask & { created_at: string; scheduled_send_at: string | null };

/** Handed in and standing so — the set `tallyTasks` counts as «сдано». */
function handedIn(task: PeriodTask): boolean {
  return (task.status === "pending_review" || task.status === "done") && task.completed_at !== null;
}

const dayOf = (iso: string | null): Ymd | null => aqtobeIsoToYmdHm(iso)?.ymd ?? null;

export type WeekPoint = { from: Ymd; to: Ymd; count: number };

/**
 * Tasks handed in, week by week: `weeks` windows of seven days, oldest first, the last one ending
 * today — every point a whole week, so the line does not dip at the end because the week has just
 * begun.
 */
export function weekSeries(tasks: readonly PeriodTask[], today: Ymd, weeks = STATS_WEEKS): WeekPoint[] {
  const series: WeekPoint[] = Array.from({ length: weeks }, (_, index) => {
    const to = addDaysYmd(today, -7 * (weeks - 1 - index));
    return { from: addDaysYmd(to, -6), to, count: 0 };
  });
  for (const task of tasks) {
    if (!handedIn(task)) continue;
    const day = dayOf(task.completed_at);
    if (!day) continue;
    const point = series.find((week) => day >= week.from && day <= week.to);
    if (point) point.count += 1;
  }
  return series;
}

/** When the task reached the person: a scheduled one at its sending, the rest at their making. */
export function givenAt(task: Pick<StatsTask, "created_at" | "scheduled_send_at">): number {
  const made = new Date(task.created_at).getTime();
  const sent = task.scheduled_send_at ? new Date(task.scheduled_send_at).getTime() : Number.NaN;
  return Number.isNaN(sent) ? made : Math.max(made, sent);
}

/** From given to handed in, in ms, for every task handed in inside the window; oldest hand-in first. */
export function handSpans(tasks: readonly StatsTask[], window: Window): number[] {
  return tasks
    .filter((task) => {
      const day = dayOf(task.completed_at);
      return handedIn(task) && day !== null && day >= window.from && day <= window.to;
    })
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))
    .map((task) => new Date(task.completed_at as string).getTime() - givenAt(task))
    .filter((span) => Number.isFinite(span) && span >= 0);
}

/** The middle value — what is typical; one task stuck for a month does not move it. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** «1 д 4 ч», «3 ч 20 мин», «40 мин», «12 д» — a span said short, for a figure. */
export function spanShort(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return hours < 6 && rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return days < 7 && rest > 0 ? `${days} д ${rest} ч` : `${days} д`;
}

/** The speed strip's scale: from a quarter of an hour to a month, logarithmic — 1 ч and 1 д both have room. */
export const SPAN_SCALE = { min: 15 * 60_000, max: 30 * DAY_MS } as const;

/** Where a span stands on the strip, 0..1. */
export function spanPosition(ms: number): number {
  const clamped = Math.min(SPAN_SCALE.max, Math.max(SPAN_SCALE.min, ms));
  return (Math.log(clamped) - Math.log(SPAN_SCALE.min)) / (Math.log(SPAN_SCALE.max) - Math.log(SPAN_SCALE.min));
}

/** A change against the window before, signed; null — nothing to compare with. */
export type Change = { diff: number; text: string } | null;

export function changeOf(now: number, before: number | null, unit = ""): Change {
  if (before === null) return null;
  const diff = now - before;
  return { diff, text: diff === 0 ? "как раньше" : `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)}${unit}` };
}

/** Whole percents, or null when nothing counted towards it. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/* ---- daily reports ------------------------------------------------------------------------------ */

export type ReportRow = {
  report_date: Ymd;
  status: DailyReportStatus;
  arrived_at: string | null;
  left_at: string | null;
  submitted_at: string | null;
};

/** A day of the reports' calendar, as `daily_report_state` sees it, plus the days still to come. */
export type ReportDayState = "submitted" | "missed" | "pending" | "away" | "off" | "future";

export type ReportPerson = Pick<Person, "is_active" | "role" | "availability" | "created_at">;

export type ReportRules = Pick<DailyReportSettings, "enabled" | "workdays" | "holidays" | "started_on" | "checked_on">;

/** A working day by the company's weekdays and not a holiday — `daily_report_workday`. */
export function isWorkday(rules: Pick<ReportRules, "workdays" | "holidays">, day: Ymd): boolean {
  return rules.workdays.includes(isoWeekday(day)) && !rules.holidays.includes(day);
}

/**
 * A day's state — the client's copy of `daily_report_state` (migration 20261028120000), so a square
 * of the calendar says what the «Отчёты» screen says of the same day: a row speaks for itself; no
 * row — not due (who left, the module off, a day off, before the fines started, before the person
 * came), away, closed by the morning tick (away then), missed, or today's still to come.
 */
export function reportDayState(day: Ymd, today: Ymd, row: Pick<ReportRow, "status"> | undefined, rules: ReportRules, person: ReportPerson): ReportDayState {
  if (row?.status === "submitted") return "submitted";
  if (row?.status === "missed") return "missed";
  if (day > today) return "future";
  const joinedAfter = new Date(person.created_at).getTime() >= new Date(ymdHmToAqtobeIso(addDaysYmd(day, 1), "00:00") ?? day).getTime();
  if (!isTeamMember(person) || !rules.enabled || !isWorkday(rules, day) || day < (rules.started_on ?? today) || joinedAfter) return "off";
  if (person.availability !== "active") return "away";
  if (rules.checked_on && day <= rules.checked_on) return "away";
  return day < today ? "missed" : "pending";
}

export type ReportCell = { day: Ymd; state: ReportDayState; today: boolean; row: ReportRow | undefined };

/** The calendar: `weeks` rows of Monday to Sunday, the current week last. */
export function reportCalendar(rows: readonly ReportRow[], today: Ymd, rules: ReportRules, person: ReportPerson, weeks = HEATMAP_WEEKS): ReportCell[][] {
  const byDay = new Map(rows.map((row) => [row.report_date, row]));
  const monday = addDaysYmd(today, 1 - isoWeekday(today));
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = addDaysYmd(monday, 7 * (week - (weeks - 1)) + weekday);
      const row = byDay.get(day);
      return { day, state: reportDayState(day, today, row, rules, person), today: day === today, row };
    }),
  );
}

/**
 * Reports handed in one after another, counted back from today: a day nothing was due neither
 * breaks the run nor adds to it, today's report not yet due waits, a miss ends it.
 */
export function reportStreak(rows: readonly ReportRow[], today: Ymd, rules: ReportRules, person: ReportPerson, days: number): number {
  const byDay = new Map(rows.map((row) => [row.report_date, row]));
  let streak = 0;
  for (let back = 0; back < days; back++) {
    const day = addDaysYmd(today, -back);
    const state = reportDayState(day, today, byDay.get(day), rules, person);
    if (state === "missed") break;
    if (state === "submitted") streak += 1;
  }
  return streak;
}

/* ---- points ----------------------------------------------------------------------------------- */

export type RatingSpot = { points: number; rank: number; of: number; delta: number };

/**
 * The person's line of a rating and how many people stand in it (ranks are dense: «5-е место из 12»
 * may be the last place of twelve, which «из 5» would hide); null — not in it.
 */
export function ratingSpot(rows: readonly RatingRow[] | undefined, personId: string): RatingSpot | null {
  const row = rows?.find((one) => one.user_id === personId);
  if (!rows || !row) return null;
  return { points: row.points, rank: row.rank, of: rows.length, delta: row.delta_vs_prev };
}

/** «3-е место» — the place as one says it. */
export function placeText(rank: number): string {
  return `${rank}-е место`;
}

/* ---- the sparkline's curve -------------------------------------------------------------------- */

/**
 * A smooth line through the points that never overshoots them (monotone cubic, Fritsch–Carlson): a
 * week with nothing stays on the floor, a peak is not drawn higher than it was.
 */
export function monotonePath(points: readonly { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${r(points[0].x)},${r(points[0].y)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    d += `C${r(points[i].x + third)},${r(points[i].y + tangent[i] * third)},${r(points[i + 1].x - third)},${r(points[i + 1].y - tangent[i + 1] * third)},${r(points[i + 1].x)},${r(points[i + 1].y)}`;
  }
  return d;
}

/* ---- the hook --------------------------------------------------------------------------------- */

/** What one read gives a tile: the data, or that it is coming, or that it failed and can be asked again. */
export type Source<T> = { data: T | null; loading: boolean; failed: boolean; retry: () => void };

export type TaskStats = {
  /** Accepted by the director, all time. */
  doneAll: number;
  series: WeekPoint[];
  current: TaskTally;
  previous: TaskTally;
  /** From given to handed in, the last 30 days. */
  spans: number[];
};

export type PointsStats = { balance: number; week: RatingSpot | null; month: RatingSpot | null; weekRows: RatingRow[] };

export type ReportStats = {
  /** The 30 days as the «Отчёты» screen counts them; null — the person has no line there. */
  period: TeamPeriodRow | null;
  calendar: ReportCell[][];
  streak: number;
};

type TasksRaw = { doneAll: number; tasks: StatsTask[]; returns: string[] };

async function fetchTasks(personId: string, since: string): Promise<TasksRaw> {
  const supabase = createBrowserSupabase();
  const [done, tasks, returns] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", personId).eq("status", "done"),
    supabase.from("tasks").select("status, deadline, completed_at, created_at, scheduled_send_at").eq("assignee_id", personId).gte("completed_at", since),
    // a return leaves no mark on the task: each one is a status row of its thread (as period.ts reads it)
    supabase
      .from("task_messages")
      .select("created_at, task:tasks!task_messages_task_id_fkey!inner(assignee_id)")
      .eq("type", "status_change")
      .eq("meta->>new_status", "rework")
      .eq("task.assignee_id", personId)
      .gte("created_at", since),
  ]);
  if (done.error) throw new Error(done.error.message);
  if (tasks.error) throw new Error(tasks.error.message);
  if (returns.error) throw new Error(returns.error.message);
  return { doneAll: done.count ?? 0, tasks: tasks.data ?? [], returns: (returns.data ?? []).map((row) => row.created_at) };
}

async function fetchReports(personId: string, from: Ymd): Promise<ReportRow[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("report_date, status, arrived_at, left_at, submitted_at")
    .eq("user_id", personId)
    .gte("report_date", from)
    .order("report_date");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, status: row.status as DailyReportStatus }));
}

const sourceOf = <T>(data: T | null, loading: boolean, failed: boolean, retry: () => void): Source<T> => ({ data, loading, failed, retry });

/**
 * Everything the dashboard shows, one source per tile family, each failing on its own: the tasks
 * (done, on time, speed), the open load, the points (only where the game is on), the reports (only
 * where the module is on — null otherwise). The director reads all of it under RLS.
 */
export function usePersonStats(person: Person, now: Date, pointsOn: boolean) {
  const personId = person.id;
  const today = todayYmd(now);
  const windows = periodWindows(today);
  const seriesFrom = addDaysYmd(today, 1 - 7 * STATS_WEEKS);
  const since = ymdHmToAqtobeIso(seriesFrom < windows.previous.from ? seriesFrom : windows.previous.from, "00:00") ?? seriesFrom;

  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  // unknown yet — the tile waits in its bones rather than vanish and come back
  const reportsOn = rules ? rules.enabled : true;

  const tasks = useRealtimeQuery<TasksRaw>({
    queryKey: [...peopleKeys.one(personId), "stats", today],
    queryFn: () => fetchTasks(personId, since),
    // the channel «Команда» already holds; only this person's rows move these numbers
    channel: { table: "tasks" },
    onEvent: (payload, queryClient) => {
      const row = (payload.new ?? {}) as { assignee_id?: string };
      if (row.assignee_id === undefined || row.assignee_id === personId) void queryClient.invalidateQueries({ queryKey: [...peopleKeys.one(personId), "stats"] });
    },
  });
  const loads = useTeamLoads();
  const balances = useTeamBalances(pointsOn);
  const week = useRating("week", pointsOn);
  const month = useRating("month", pointsOn);
  // the reports' calendar reaches back as far as the sparkline: the run of reports is counted there too
  const reportRows = useQuery({
    queryKey: [...peopleKeys.one(personId), "stats-reports", today],
    queryFn: () => fetchReports(personId, seriesFrom),
    enabled: reportsOn,
  });
  const reportPeriod = useTeamDailyReportPeriod(windows.current.from, windows.current.to, reportsOn);

  const taskStats: TaskStats | null = tasks.data
    ? {
        doneAll: tasks.data.doneAll,
        series: weekSeries(tasks.data.tasks, today),
        current: tallyTasks(tasks.data.tasks, tasks.data.returns, windows.current),
        previous: tallyTasks(tasks.data.tasks, tasks.data.returns, windows.previous),
        spans: handSpans(tasks.data.tasks, windows.current),
      }
    : null;

  const pointsReady = balances.data !== undefined && week.data !== undefined && month.data !== undefined;
  const pointsStats: PointsStats | null = pointsReady
    ? { balance: balances.data?.[personId] ?? 0, week: ratingSpot(week.data, personId), month: ratingSpot(month.data, personId), weekRows: week.data ?? [] }
    : null;

  const reportStats: ReportStats | null =
    rules && reportRows.data && reportPeriod.data
      ? {
          period: reportPeriod.data.rows.find((row) => row.user_id === personId) ?? null,
          calendar: reportCalendar(reportRows.data, today, rules, person),
          streak: reportStreak(reportRows.data, today, rules, person, 7 * STATS_WEEKS),
        }
      : null;

  const load: Load = loads.data?.[personId] ?? { active: 0, overdue: 0, review: 0, nearest: null };

  return {
    tasks: sourceOf(taskStats, tasks.isLoading, tasks.isLoadingError, () => void tasks.refetch()),
    load: sourceOf(loads.data ? load : null, loads.isLoading, loads.isLoadingError, () => void loads.refetch()),
    points: pointsOn
      ? sourceOf(pointsStats, balances.isLoading || week.isLoading || month.isLoading, balances.isLoadingError || week.isLoadingError || month.isLoadingError, () => {
          void balances.refetch();
          void week.refetch();
          void month.refetch();
        })
      : null,
    reports: reportsOn
      ? sourceOf(reportStats, settings.isLoading || reportRows.isLoading || reportPeriod.isLoading, settings.isLoadingError || reportRows.isLoadingError || reportPeriod.isLoadingError, () => {
          void settings.refetch();
          void reportRows.refetch();
          void reportPeriod.refetch();
        })
      : null,
  };
}
