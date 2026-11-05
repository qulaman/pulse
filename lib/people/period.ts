"use client";

import { addDaysYmd } from "@/lib/daily-report/format";
import { useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import type { TeamPeriodRow } from "@/lib/daily-report/types";
import { aqtobeIsoToYmdHm, todayYmd, ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";
import { formatNum } from "@/lib/desk/format";
import { handInVerdict } from "@/lib/desk/tasks";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { peopleKeys } from "@/lib/people/queries";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { TaskStatus } from "@/lib/tasks/status-text";

/**
 * «За 30 дней» on a person's card: what they handed in, how much of it by the deadline, what came
 * back, their reports — against the 30 days before. Days are the company's calendar days, the same
 * ones `team_daily_report_period` counts in. Only the director reads this: tasks under RLS, the
 * reports through the RPC that refuses anyone else.
 */

export const PERIOD_DAYS = 30;

export type Window = { from: Ymd; to: Ymd };

/** The last 30 days with today, and the 30 before them. */
export function periodWindows(today: Ymd): { current: Window; previous: Window } {
  return {
    current: { from: addDaysYmd(today, 1 - PERIOD_DAYS), to: today },
    previous: { from: addDaysYmd(today, 1 - 2 * PERIOD_DAYS), to: addDaysYmd(today, -PERIOD_DAYS) },
  };
}

export type PeriodTask = { status: TaskStatus; deadline: string | null; completed_at: string | null };

export type TaskTally = { handed: number; onTime: number; late: number; returned: number };

function within(iso: string | null, { from, to }: Window): boolean {
  const day = aqtobeIsoToYmdHm(iso)?.ymd;
  return day !== undefined && day >= from && day <= to;
}

/**
 * A window's tasks. Handed in — what stands handed in now: a task sent back keeps its old
 * `completed_at`, but it is not handed in until the next time. «В срок» is `handInVerdict`'s rule;
 * a task without a deadline is handed in and counts in neither. `returns` — the moments of «На
 * доработку», one task can come back twice.
 */
export function tallyTasks(tasks: readonly PeriodTask[], returns: readonly string[], window: Window): TaskTally {
  const tally: TaskTally = { handed: 0, onTime: 0, late: 0, returned: returns.filter((at) => within(at, window)).length };
  for (const task of tasks) {
    if ((task.status !== "pending_review" && task.status !== "done") || !within(task.completed_at, window)) continue;
    tally.handed += 1;
    const verdict = handInVerdict(task);
    if (verdict) tally[verdict.late ? "late" : "onTime"] += 1;
  }
  return tally;
}

export type ReportTally = Pick<TeamPeriodRow, "submitted" | "missed" | "points">;

export type PeriodLine = {
  key: "handed" | "onTime" | "returned" | "reports" | "points";
  label: string;
  value: string;
  /** «10 из 12» beside a share. */
  detail?: string;
  /** Against the 30 days before; null — nothing to compare with. */
  change: string | null;
};

export type PeriodInput = {
  tasks: { current: TaskTally; previous: TaskTally } | null;
  /** Null for the reports' side: the module is off, or the person has no row in it. */
  reports: { current: ReportTally | null; previous: ReportTally | null };
  pointsOn: boolean;
};

/** Nothing moved: said in words, and the panel's short line leaves it out. */
export const STEADY = "как раньше";

const changeWords = (difference: number, unit = "") => (difference === 0 ? STEADY : `${difference > 0 ? "↑" : "↓"} ${Math.abs(difference)}${unit}`);

/** A share, whole percents, or null when nothing could count towards it. */
function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Shares are compared as the screen shows them, in whole points: 83% and 78% differ by 5. */
function shareChange(now: number | null, before: number | null): string | null {
  return now === null || before === null ? null : changeWords(now - before, " п. п.");
}

const hasTasks = (tally: TaskTally) => tally.handed > 0 || tally.returned > 0;
const reportsDue = (tally: ReportTally | null) => (tally ? tally.submitted + tally.missed : 0);

/**
 * The block's lines. None — nothing happened in these 30 days, and the block says that in a phrase,
 * not in zeros. A side quiet now but not before still stands: «сдано 0, было 8» is the news.
 */
export function periodLines({ tasks, reports, pointsOn }: PeriodInput): PeriodLine[] {
  if (!(tasks && hasTasks(tasks.current)) && reportsDue(reports.current) === 0) return [];
  const lines: PeriodLine[] = [];
  if (tasks && (hasTasks(tasks.current) || hasTasks(tasks.previous))) {
    const { current, previous } = tasks;
    const compared = hasTasks(previous);
    const timed = current.onTime + current.late;
    const onTime = share(current.onTime, timed);
    lines.push({ key: "handed", label: "Сдано задач", value: formatNum(current.handed), change: compared ? changeWords(current.handed - previous.handed) : null });
    if (onTime !== null) {
      const before = compared ? share(previous.onTime, previous.onTime + previous.late) : null;
      lines.push({ key: "onTime", label: "В срок", value: `${onTime}%`, detail: `${current.onTime} из ${timed}`, change: shareChange(onTime, before) });
    }
    lines.push({ key: "returned", label: "Возвратов на доработку", value: formatNum(current.returned), change: compared ? changeWords(current.returned - previous.returned) : null });
  }
  const now = reports.current;
  const before = reports.previous;
  if (now && reportsDue(now) > 0) {
    const due = reportsDue(now);
    const compared = reportsDue(before) > 0;
    lines.push({
      key: "reports",
      label: "Отчётов сдано",
      value: `${now.submitted} из ${due}`,
      change: compared ? shareChange(share(now.submitted, due), share(before?.submitted ?? 0, reportsDue(before))) : null,
    });
    if (pointsOn) {
      lines.push({ key: "points", label: "Очки за отчёты", value: formatNum(now.points, { signed: true }), change: compared ? changeWords(now.points - (before?.points ?? 0)) : null });
    }
  }
  return lines;
}

/** The block's words, tighter: the right-hand panel says them in one line. */
export const SHORT_LABEL: Record<PeriodLine["key"], string> = { handed: "сдано", onTime: "в срок", returned: "возвратов", reports: "отчётов", points: "очков" };

type PeriodRaw = { tasks: PeriodTask[]; returns: string[] };

async function fetchPeriodTasks(personId: string, since: string): Promise<PeriodRaw> {
  const supabase = createBrowserSupabase();
  const [tasks, returns] = await Promise.all([
    supabase.from("tasks").select("status, deadline, completed_at").eq("assignee_id", personId).gte("completed_at", since),
    // a return leaves no mark on the task: each one is a status row of its thread
    supabase
      .from("task_messages")
      .select("created_at, task:tasks!task_messages_task_id_fkey!inner(assignee_id)")
      .eq("type", "status_change")
      .eq("meta->>new_status", "rework")
      .eq("task.assignee_id", personId)
      .gte("created_at", since),
  ]);
  if (tasks.error) throw new Error(tasks.error.message);
  if (returns.error) throw new Error(returns.error.message);
  return { tasks: tasks.data ?? [], returns: (returns.data ?? []).map((row) => row.created_at) };
}

/**
 * The block's data. Quiet by design: what failed is told per side, what came still shows; the
 * comparison is left out when the 30 days before cannot be read, never drawn from a zero.
 */
export function usePersonPeriod(personId: string, now: Date, pointsOn: boolean) {
  const today = todayYmd(now);
  const { current, previous } = periodWindows(today);
  const settings = useCompanySettings();
  const reportsOn = settings.data?.daily_report.enabled === true;
  const since = ymdHmToAqtobeIso(previous.from, "00:00") ?? previous.from;
  const raw = useRealtimeQuery<PeriodRaw>({
    queryKey: [...peopleKeys.one(personId), "period", today],
    queryFn: () => fetchPeriodTasks(personId, since),
    // the channel «Команда» already holds: a task handed in or sent back moves these numbers
    channel: { table: "tasks" },
  });
  const reportsNow = useTeamDailyReportPeriod(current.from, current.to, reportsOn);
  const reportsBefore = useTeamDailyReportPeriod(previous.from, previous.to, reportsOn);
  const rowOf = (rows: TeamPeriodRow[] | undefined) => rows?.find((row) => row.user_id === personId) ?? null;

  const lines = periodLines({
    tasks: raw.data ? { current: tallyTasks(raw.data.tasks, raw.data.returns, current), previous: tallyTasks(raw.data.tasks, raw.data.returns, previous) } : null,
    reports: { current: reportsOn ? rowOf(reportsNow.data?.rows) : null, previous: reportsOn ? rowOf(reportsBefore.data?.rows) : null },
    pointsOn,
  });
  return {
    lines,
    loading: raw.isLoading || settings.isLoading || (reportsOn && reportsNow.isLoading),
    failed: raw.isLoadingError || settings.isLoadingError || (reportsOn && reportsNow.isLoadingError),
    retry: () => {
      void raw.refetch();
      void settings.refetch();
      void reportsNow.refetch();
      void reportsBefore.refetch();
    },
  };
}
