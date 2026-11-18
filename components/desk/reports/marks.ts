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

const COLUMNS = "user_id, report_date, status, arrived_at, left_at";
/** D-183's columns: the director's excuse of a missed day. */
const EXCUSE = "excused_at, excused_reason";

/**
 * The database said it has no excuse columns yet (D-183's migration waits for the owner's word):
 * the табель keeps reading without them for this session rather than failing whole.
 */
let excuseColumns = true;

type MarkRow = {
  user_id: string;
  report_date: string;
  status: string;
  arrived_at: string | null;
  left_at: string | null;
  excused_at?: string | null;
  excused_reason?: string | null;
};

const missingColumn = (error: { code?: string; message: string }) => error.code === "42703" || /excused_/.test(error.message);

async function readMarks(from: Ymd, to: Ymd): Promise<PeriodMarks> {
  const supabase = createBrowserSupabase();
  const marks = new Map<string, Map<string, TabelMark>>();
  for (let start = 0; ; start += PAGE) {
    const withExcuse = excuseColumns;
    // the director reads the company's reports under RLS (daily_reports_select); nobody else's
    const { data, error } = await supabase
      .from("daily_reports")
      .select(withExcuse ? `${COLUMNS}, ${EXCUSE}` : COLUMNS)
      .gte("report_date", from)
      .lte("report_date", to)
      .order("report_date")
      .order("user_id")
      .range(start, start + PAGE - 1);
    if (error) {
      if (withExcuse && missingColumn(error)) {
        excuseColumns = false;
        return readMarks(from, to);
      }
      throw new Error(error.message);
    }
    const rows = (data ?? []) as unknown as MarkRow[];
    for (const row of rows) {
      let days = marks.get(row.user_id);
      if (!days) marks.set(row.user_id, (days = new Map()));
      days.set(row.report_date, {
        status: row.status as DailyReportStatus,
        arrived_at: row.arrived_at,
        left_at: row.left_at,
        excused_at: row.excused_at ?? null,
        excused_reason: row.excused_reason ?? null,
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
