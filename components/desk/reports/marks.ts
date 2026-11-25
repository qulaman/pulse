"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { dailyReportKeys } from "@/lib/daily-report/queries";
import type { TabelMark } from "@/lib/daily-report/tabel";
import type { DailyReportStatus } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** person → day → what the report of that day says. */
export type PeriodMarks = ReadonlyMap<string, ReadonlyMap<string, TabelMark>>;

/** PostgREST hands out at most this many rows an answer: a long period is read page by page. */
const PAGE = 1000;

async function readMarks(from: Ymd, to: Ymd): Promise<PeriodMarks> {
  const supabase = createBrowserSupabase();
  const marks = new Map<string, Map<string, TabelMark>>();
  for (let start = 0; ; start += PAGE) {
    // the director reads the company's reports under RLS (daily_reports_select); nobody else's;
    // `excused_*` — the director's excuse of a missed day (D-183). The form's «Пришёл / Ушёл» are
    // not read: no cell and no hint of the табель says arrival, leaving or hours (D-194, D-198)
    const { data, error } = await supabase
      .from("daily_reports")
      .select("user_id, report_date, status, excused_at, excused_reason")
      .gte("report_date", from)
      .lte("report_date", to)
      .order("report_date")
      .order("user_id")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      let days = marks.get(row.user_id);
      if (!days) marks.set(row.user_id, (days = new Map()));
      days.set(row.report_date, {
        status: row.status as DailyReportStatus,
        arrived_at: null,
        left_at: null,
        excused_at: row.excused_at,
        excused_reason: row.excused_reason,
      });
    }
    if (rows.length < PAGE) return marks;
  }
}

/**
 * The period's reports day by day for every person (D-174, D-183) — what the period RPC sums up:
 * the табель draws them as a row of cells. Under the module's team key, so a report coming in
 * reads it again; with `companyId` the табель listens itself (the socket on `daily_reports` of the
 * company, shared with «Сводка»'s), so a report handed in while the director reads lands in its cell.
 */
export function usePeriodMarks(from: Ymd, to: Ymd, enabled: boolean, companyId?: string) {
  const live = useRealtimeQuery<PeriodMarks>({
    queryKey: [...dailyReportKeys.team, "marks", from, to],
    queryFn: () => readMarks(from, to),
    channel: { table: "daily_reports", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    // a report changes its day's cell and every total around it
    onEvent: (_payload, queryClient) => {
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.team });
    },
    enabled: enabled && Boolean(companyId) && Boolean(from && to) && from <= to,
    placeholderData: keepPreviousData,
  });
  // without the company (the old «Период» view) the read stays as it was: no socket of its own
  const quiet = useQuery({
    queryKey: [...dailyReportKeys.team, "marks", from, to] as const,
    enabled: enabled && !companyId && Boolean(from && to) && from <= to,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: () => readMarks(from, to),
  });
  return companyId ? live : quiet;
}
