"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { toast } from "@/components/ui/Toast";
import type { Ymd } from "@/lib/datetime/calendar";
import { isNetworkError, NetworkError } from "@/lib/net";
import { dequeue, enqueue, outboxSize, subscribeOutbox } from "@/lib/outbox";
import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "./format";
import {
  DAILY_REPORT_RPC,
  type DailyReport,
  type DailyReportError,
  type DailyReportHistoryItem,
  type MyDailyReportDay,
  type SubmitDailyReportInput,
  type SubmitDailyReportResult,
  type TeamDay,
  type TeamPeriod,
} from "./types";

/**
 * The daily report's data (D-152, tasks/021): the employee's day and past days, the director's
 * day and period — reads straight through the module's RPCs under RLS, the submit through a
 * POST route so a tap made without network waits in the persisted outbox (lib/outbox.ts) and
 * goes out exactly once (client_request_id, принцип 7).
 */

export const dailyReportKeys = {
  root: ["daily-report"] as const,
  myDay: () => ["daily-report", "my-day"] as const,
  history: () => ["daily-report", "history"] as const,
  team: ["daily-report", "team"] as const,
  teamDay: (date: Ymd) => ["daily-report", "team", "day", date] as const,
  teamPeriod: (from: Ymd, to: Ymd) => ["daily-report", "team", "period", from, to] as const,
};

/** The route that carries the submit (and the outbox's replay of it) to `submit_daily_report`. */
export const SUBMIT_PATH = "/api/daily-report";
const SUBMIT_KEY = ["daily-report", "submit"] as const;
const HISTORY_LIMIT = 30;

const WAITING = "Нет связи. Сдам отчёт, как появится";
const SUBMIT_FAILED = "Не получилось сдать отчёт. Попробуйте ещё раз";

/** A refusal with the module's code, said in the screen's words. */
export class DailyReportFailure extends Error {
  constructor(
    readonly code: DailyReportError | "forbidden" | null,
    message: string,
  ) {
    super(message);
    this.name = "DailyReportFailure";
  }
}

type RpcName = (typeof DAILY_REPORT_RPC)[keyof Omit<typeof DAILY_REPORT_RPC, "submit">];

/** One read RPC of the module; its jsonb comes back in the contract's shape (lib/daily-report/types.ts). */
async function read<T>(name: RpcName, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = createBrowserSupabase();
  // the generated Args differ per function; the contract types the answer, the database checks the args
  const { data, error } = await supabase.rpc(name as "my_daily_report", args as never);
  if (error) {
    const code = errorCodeOf(error.message);
    throw new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : error.message);
  }
  return data as unknown as T;
}

/** The employee's today: the form's prefill, the live tasks of the day, the report if any. */
export function useMyDailyReport() {
  return useQuery({
    queryKey: dailyReportKeys.myDay(),
    queryFn: () => read<MyDailyReportDay>(DAILY_REPORT_RPC.my),
  });
}

/** «Прошлые отчёты»: submitted and missed days, newest first. */
export function useMyDailyReportHistory(enabled = true) {
  return useQuery({
    queryKey: dailyReportKeys.history(),
    enabled,
    queryFn: async () => (await read<DailyReportHistoryItem[] | null>(DAILY_REPORT_RPC.history, { p_limit: HISTORY_LIMIT })) ?? [],
  });
}

/**
 * POST the submit. A dead network keeps it in the outbox under its idempotency key and throws
 * NetworkError: the mutation pauses and resumes in this session (QueryProvider, offlineFirst),
 * OutboxReplay sends it after a closed app. A refusal comes back with the module's code.
 */
async function postSubmit(input: SubmitDailyReportInput): Promise<SubmitDailyReportResult> {
  let res: Response;
  try {
    res = await fetch(SUBMIT_PATH, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    enqueue({ id: input.client_request_id, path: SUBMIT_PATH, payload: input });
    throw new NetworkError(WAITING);
  }
  dequeue(input.client_request_id);
  const body = (await res.json().catch(() => null)) as
    | (SubmitDailyReportResult & { error?: { code?: string; message_ru?: string } })
    | null;
  if (res.status === 401) throw new DailyReportFailure(null, "Сессия истекла. Войдите заново — текст отчёта остался на экране");
  if (!res.ok || !body?.report) {
    const code = errorCodeOf(body?.error?.code);
    throw new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : (body?.error?.message_ru ?? SUBMIT_FAILED));
  }
  return body;
}

/** The report as the screen shows it the moment «Сдать» is tapped — the server's answer replaces it. */
function provisional(day: MyDailyReportDay, input: SubmitDailyReportInput): DailyReport {
  const now = new Date().toISOString();
  const was = day.report?.status === "submitted" ? day.report : null;
  return {
    id: was?.id ?? `pending-${input.client_request_id}`,
    user_id: was?.user_id ?? day.report?.user_id ?? "",
    report_date: day.date,
    status: "submitted",
    arrived_at: input.arrived_at,
    left_at: input.left_at,
    summary: input.summary,
    tasks: day.tasks,
    submitted_at: was?.submitted_at ?? now,
    updated_at: now,
    // the points are the server's to say: a first submit shows them when it lands
    points: was?.points ?? 0,
  };
}

function upsertDay(list: DailyReportHistoryItem[] | undefined, report: DailyReport): DailyReportHistoryItem[] | undefined {
  if (!list) return list;
  const rest = list.filter((item) => item.report_date !== report.report_date);
  return [report, ...rest].sort((a, b) => (a.report_date < b.report_date ? 1 : a.report_date > b.report_date ? -1 : 0));
}

/**
 * «Сдать отчёт» / «Сохранить»: on the screen at once (принцип 1a), on the server when the
 * network lets it. A refusal puts the day back as it was and says why; the typed words stay in
 * the form, which owns them. No network — the provisional report stays, the outbox delivers.
 */
export function useSubmitDailyReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: SUBMIT_KEY,
    // an edit right after the submit must reach the server after it
    scope: { id: "daily-report-submit" },
    mutationFn: postSubmit,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: dailyReportKeys.myDay() });
      const previous = queryClient.getQueryData<MyDailyReportDay>(dailyReportKeys.myDay());
      if (previous) queryClient.setQueryData<MyDailyReportDay>(dailyReportKeys.myDay(), { ...previous, report: provisional(previous, input) });
      return { previous };
    },
    onSuccess: (result) => {
      // a submit that waited for the network past midnight lands on the day it was made, which is
      // no longer «today» on the screen: only the same day takes it as its report
      queryClient.setQueryData<MyDailyReportDay>(dailyReportKeys.myDay(), (day) =>
        day && day.date === result.report.report_date ? { ...day, report: result.report } : day,
      );
      queryClient.setQueryData<DailyReportHistoryItem[]>(dailyReportKeys.history(), (list) => upsertDay(list, result.report));
      // and both are read again — the server knows which day it took it for
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.myDay() });
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.history() });
      // +1 is a point_transactions row: the balances read it on their own
      if (result.points_awarded !== 0) void queryClient.invalidateQueries({ queryKey: ["points"] });
    },
    onError: (error, _input, context) => {
      // waiting for the network is not a failure: the provisional report stays, the outbox has it
      if (isNetworkError(error)) return;
      if (context?.previous) queryClient.setQueryData(dailyReportKeys.myDay(), context.previous);
      toast(error instanceof Error && error.message ? error.message : SUBMIT_FAILED);
    },
  });
}

/**
 * The outbox sent a submit this screen did not watch (a closed app's, replayed on start): the
 * day is read again. OutboxReplay refreshes the task lists only.
 */
export function useRefreshAfterReplay() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let size = outboxSize();
    return subscribeOutbox(() => {
      const next = outboxSize();
      const shrank = next < size;
      size = next;
      if (!shrank || queryClient.isMutating({ mutationKey: SUBMIT_KEY }) > 0) return;
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.myDay() });
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.history() });
    });
  }, [queryClient]);
}

/**
 * The director's day: everybody's state, report, tasks and activity — live, a report submitted
 * on another phone lands without a reload (the socket on `daily_reports` of the company; RLS
 * narrows it again). Another day keeps the last one on screen until it comes (D-122 §7).
 */
export function useTeamDailyReportDay(date: Ymd, companyId: string | undefined, enabled = true) {
  return useRealtimeQuery<TeamDay>({
    queryKey: dailyReportKeys.teamDay(date),
    queryFn: () => read<TeamDay>(DAILY_REPORT_RPC.teamDay, { p_date: date }),
    channel: { table: "daily_reports", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    // a report changes the day it belongs to and every period around it
    onEvent: (_payload, queryClient) => {
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.team });
    },
    enabled: enabled && Boolean(companyId),
    placeholderData: keepPreviousData,
  });
}

/** The director's period, both days inclusive — the database answers for at most 92 days. */
export function useTeamDailyReportPeriod(from: Ymd, to: Ymd, enabled = true) {
  return useQuery({
    queryKey: dailyReportKeys.teamPeriod(from, to),
    enabled: enabled && Boolean(from && to) && from <= to,
    placeholderData: keepPreviousData,
    queryFn: () => read<TeamPeriod>(DAILY_REPORT_RPC.teamPeriod, { p_from: from, p_to: to }),
  });
}
