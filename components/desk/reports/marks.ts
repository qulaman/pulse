"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { dailyReportKeys } from "@/lib/daily-report/queries";
import type { DailyReportStatus } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { createBrowserSupabase } from "@/lib/supabase/client";

import type { DayMark } from "./parts";

/** person → day → what the report of that day says. */
export type PeriodMarks = ReadonlyMap<string, ReadonlyMap<string, DayMark>>;

/** PostgREST hands out at most this many rows an answer: a long period is read page by page. */
const PAGE = 1000;

async function readMarks(from: Ymd, to: Ymd): Promise<PeriodMarks> {
  const supabase = createBrowserSupabase();
  const marks = new Map<string, Map<string, DayMark>>();
  for (let start = 0; ; start += PAGE) {
    // the director reads the company's reports under RLS (daily_reports_select); nobody else's
    const { data, error } = await supabase
      .from("daily_reports")
      .select("user_id, report_date, status, arrived_at, left_at")
      .gte("report_date", from)
      .lte("report_date", to)
      .order("report_date")
      .order("user_id")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      let days = marks.get(row.user_id);
      if (!days) marks.set(row.user_id, (days = new Map()));
      days.set(row.report_date, { status: row.status as DailyReportStatus, arrived_at: row.arrived_at, left_at: row.left_at });
    }
    if ((data?.length ?? 0) < PAGE) return marks;
  }
}

/**
 * The period's reports day by day for every person (D-174) — what the period RPC sums up: the rows
 * of «Период» draw them as a line of cells, the panel as a calendar. Under the module's team key,
 * so a report coming in (the day's realtime) reads it again.
 */
export function usePeriodMarks(from: Ymd, to: Ymd, enabled: boolean) {
  return useQuery({
    queryKey: [...dailyReportKeys.team, "marks", from, to] as const,
    enabled: enabled && Boolean(from && to) && from <= to,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: () => readMarks(from, to),
  });
}
