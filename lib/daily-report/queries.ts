"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { toast } from "@/components/ui/Toast";
import { addDays, type Ymd } from "@/lib/datetime/calendar";
import { ApiError, postJson } from "@/lib/api/client";
import { isNetworkError } from "@/lib/net";
import { outboxSize, subscribeOutbox } from "@/lib/outbox";
import type { ReportPerson, ReportRules } from "@/lib/people/stats";
import { useRealtimeListener, useRealtimeQuery, type RealtimeEvent } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { rpcJson } from "@/lib/supabase/rpc";
import { useMe } from "@/lib/tasks/queries";

import { readDraft } from "./draft";
import { askFromOf, ASK_FROM_DEFAULT, reportDue, type ReportDue } from "./due";
// a cycle (review.ts takes DailyReportFailure from here): both are used inside functions only
import { patchIfReviewOnly } from "./review";
import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "./format";
import { reportRulesOf } from "./rules";
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
  /** «Прошлые отчёты» a page at a time (D-198 «Показать ещё»), under `history()`. */
  historyPages: () => ["daily-report", "history", "pages"] as const,
  /** The person's rows of one calendar month — the «Табель» of /report (D-219), under `history()`. */
  historyMonths: () => ["daily-report", "history", "month"] as const,
  historyMonth: (from: Ymd) => ["daily-report", "history", "month", from] as const,
  /** The company's report rules and the person's own profile — what a day's state is read with (D-219). */
  tabelContext: () => ["daily-report", "tabel-context"] as const,
  team: ["daily-report", "team"] as const,
  teamDay: (date: Ymd) => ["daily-report", "team", "day", date] as const,
  teamPeriod: (from: Ymd, to: Ymd) => ["daily-report", "team", "period", from, to] as const,
  /** What Лента needs beside the day: `ask_from` and whether the person is away (D-167). */
  feed: () => ["daily-report", "feed"] as const,
};

/** The route that carries the submit (and the outbox's replay of it) to `submit_daily_report`. */
export const SUBMIT_PATH = "/api/daily-report";
const SUBMIT_KEY = ["daily-report", "submit"] as const;
/** Past days a page; a shorter page is the last one. */
export const HISTORY_PAGE = 30;

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

/** One read RPC of the module; its jsonb comes back in the contract's shape (lib/daily-report/types.ts). */
async function read<T>(call: Parameters<typeof rpcJson>[0]): Promise<T> {
  const { data, error } = await rpcJson<T>(call);
  if (error) {
    const code = errorCodeOf(error.message);
    throw new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : error.message);
  }
  return data;
}

type HistoryPages = InfiniteData<DailyReportHistoryItem[], string | null>;

/** The review fields of a report (D-198) — what a director's look or check changes. */
const MARK_FIELDS = ["seen_at", "checked_at", "checked_by", "changed_after_check_at"] as const;

type ReportRow = Partial<Pick<DailyReport, "id" | "updated_at" | (typeof MARK_FIELDS)[number]>>;

/** Two instants are the same moment — the socket's row and the RPC's jsonb write them differently. */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = Date.parse(a ?? "");
  return Number.isFinite(x) && x === Date.parse(b ?? "");
}

/**
 * A row of the person's own reports changed. A director's «Просмотрено» / «Проверено» moves only
 * the marks (`updated_at` stays — D-198): they are written into the cached day and past days as
 * they come, no read. Anything else — a submit from another phone, the morning's missed row — reads
 * the day and the past days again.
 */
function patchMine(client: QueryClient, payload: RealtimeEvent<ReportRow>): void {
  const row = payload.eventType === "DELETE" ? null : payload.new;
  if (!row?.id) return refreshMine(client, false);
  let known = false;
  let content = false;
  const patch = (report: DailyReport): DailyReport => {
    if (report.id !== row.id) return report;
    known = true;
    if (!sameInstant(report.updated_at, row.updated_at)) {
      content = true;
      return report;
    }
    const next: DailyReport = { ...report };
    for (const field of MARK_FIELDS) if (field in row) next[field] = row[field] ?? null;
    return next;
  };
  client.setQueryData<MyDailyReportDay>(dailyReportKeys.myDay(), (day) => (day?.report ? { ...day, report: patch(day.report) } : day));
  client.setQueryData<HistoryPages>(dailyReportKeys.historyPages(), (data) =>
    data ? { ...data, pages: data.pages.map((page) => page.map(patch)) } : data,
  );
  // the months of the «Табель» hold the same reports (D-219)
  client.setQueriesData<DailyReportHistoryItem[]>({ queryKey: dailyReportKeys.historyMonths() }, (rows) => rows?.map(patch));
  if (!known || content) refreshMine(client, false);
}

let refreshQueued: { join: boolean } | null = null;

/**
 * The day and the past days read again. Every mounted reader of the day listens on the same socket,
 * so one change comes to each of them: gathered into one read. A submit on its way is left alone —
 * a read would overwrite its provisional report, and it reads both itself when it lands.
 */
function refreshMine(client: QueryClient, join: boolean): void {
  if (refreshQueued) {
    refreshQueued.join &&= join;
    return;
  }
  refreshQueued = { join };
  queueMicrotask(() => {
    const options = { cancelRefetch: !refreshQueued?.join };
    refreshQueued = null;
    if (client.isMutating({ mutationKey: SUBMIT_KEY }) > 0) return;
    void client.invalidateQueries({ queryKey: dailyReportKeys.myDay() }, options);
    void client.invalidateQueries({ queryKey: dailyReportKeys.history() }, options);
    // the morning's missed row comes with a new `checked_on`: the «Табель» reads its rules again (D-219)
    void client.invalidateQueries({ queryKey: dailyReportKeys.tabelContext() }, options);
  });
}

/**
 * The person's own reports, live (D-198): a director's «Просмотрено» / «Проверено» reaches the
 * screen without a reload — the socket on `daily_reports` narrowed to the person (RLS narrows it
 * again). Waits for who the person is (`/api/me`, cached app-wide).
 */
function useMyReportsLive(): void {
  const me = useMe();
  const userId = me.data?.userId;
  const client = useQueryClient();
  useRealtimeListener<ReportRow>(
    { table: "daily_reports", filter: userId ? `user_id=eq.${userId}` : undefined },
    (payload) => patchMine(client, payload),
    // after a (re)subscribe: whatever the socket missed is in a fresh read
    () => refreshMine(client, true),
    "my-daily-reports",
    Boolean(userId),
  );
}

/** The employee's today: the live tasks of the day, the report if any with the director's marks. */
export function useMyDailyReport() {
  useMyReportsLive();
  return useQuery({
    queryKey: dailyReportKeys.myDay(),
    queryFn: () => read<MyDailyReportDay>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.my)),
  });
}

export type MyReportHistory = {
  /** Loaded past days, newest first; undefined while the first page loads. */
  items: DailyReportHistoryItem[] | undefined;
  isError: boolean;
  /** The last page came full: there may be days before it. */
  hasMore: boolean;
  /** «Показать ещё» — the page of days before the oldest loaded one. */
  loadMore: () => void;
  loadingMore: boolean;
  /** The last «Показать ещё» failed: the button says so and tries again. */
  moreFailed: boolean;
};

/**
 * «Прошлые отчёты»: submitted and missed days, newest first, `HISTORY_PAGE` days a page; the next
 * page — the days strictly before the oldest loaded one (`p_before`, D-198). The first page asks
 * without `p_before`, as before the D-198 migration.
 */
export function useMyDailyReportHistory(enabled = true): MyReportHistory {
  const query = useInfiniteQuery({
    queryKey: dailyReportKeys.historyPages(),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const args = pageParam ? { p_limit: HISTORY_PAGE, p_before: pageParam } : { p_limit: HISTORY_PAGE };
      return (await read<DailyReportHistoryItem[] | null>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.history, args))) ?? [];
    },
    getNextPageParam: (last) => (last.length < HISTORY_PAGE ? null : (last.at(-1)?.report_date ?? null)),
  });
  const { data, fetchNextPage } = query;
  const items = useMemo(() => {
    if (!data) return undefined;
    // a day is listed once, whatever pages a refetch brought it on
    const seen = new Set<string>();
    return data.pages.flat().filter((item) => !seen.has(item.report_date) && Boolean(seen.add(item.report_date)));
  }, [data]);
  const loadMore = useCallback(() => void fetchNextPage({ cancelRefetch: false }), [fetchNextPage]);
  return {
    items,
    // the first page failed; a failed «Показать ещё» keeps what is loaded (`moreFailed`)
    isError: query.isError && !data,
    hasMore: query.hasNextPage,
    loadMore,
    loadingMore: query.isFetchingNextPage,
    moreFailed: query.isFetchNextPageError,
  };
}

/** A calendar month holds at most this many days — one row a day. */
const MONTH_ROWS = 31;

/**
 * The person's reports of one calendar month, for the «Табель» of /report (D-219): the same RPC as
 * «Прошлые отчёты» — the rows strictly before the day after `to`, cut to the month — so a day says
 * the same in both. Under `history()`: a submit, the morning's missed row and a director's mark
 * reach it as they reach the past days. No last month kept on screen while the next one comes —
 * its rows under another month's dates would read as a month of misses.
 */
export function useMyReportMonth(from: Ymd, to: Ymd, enabled = true) {
  return useQuery({
    queryKey: dailyReportKeys.historyMonth(from),
    enabled: enabled && Boolean(from && to) && from <= to,
    queryFn: async () => {
      const rows = await read<DailyReportHistoryItem[] | null>(
        createBrowserSupabase().rpc(DAILY_REPORT_RPC.history, { p_limit: MONTH_ROWS, p_before: addDays(to, 1) }),
      );
      return (rows ?? []).filter((row) => row.report_date >= from);
    },
  });
}

export type TabelContext = { rules: ReportRules; person: ReportPerson };

/**
 * What a day's state is read with (lib/daily-report/tabel.ts): the company's report rules —
 * weekdays, holidays, when the reports started, the last day the morning tick closed — and the
 * person's own joining day, role and availability. Straight under RLS, as `readFeedContext`:
 * /api/settings is the director's and the secretary's only.
 */
async function readTabelContext(): Promise<TabelContext> {
  const supabase = createBrowserSupabase();
  const [company, session] = await Promise.all([
    supabase.from("companies").select("daily_report:settings->daily_report").limit(1).maybeSingle(),
    supabase.auth.getSession(),
  ]);
  if (company.error) throw new Error(company.error.message);
  const userId = session.data.session?.user.id;
  if (!userId) throw new Error("no session");
  const profile = await supabase.from("profiles").select("is_active, role, availability, created_at").eq("id", userId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data) throw new Error("no profile");
  const rules = reportRulesOf((company.data as { daily_report?: unknown } | null)?.daily_report);
  return { rules, person: profile.data as ReportPerson };
}

/** The rules and the person for the «Табель» (D-219); a settings save reads them again (the module's key). */
export function useTabelContext(enabled = true) {
  return useQuery({ queryKey: dailyReportKeys.tabelContext(), enabled, staleTime: 60_000, queryFn: readTabelContext });
}

/**
 * POST the submit. A dead network keeps it in the outbox under its idempotency key and throws
 * NetworkError: the mutation pauses and resumes in this session (QueryProvider, offlineFirst),
 * OutboxReplay sends it after a closed app. A refusal comes back with the module's code.
 */
async function postSubmit(input: SubmitDailyReportInput): Promise<SubmitDailyReportResult> {
  let body: SubmitDailyReportResult | null;
  try {
    body = (await postJson(SUBMIT_PATH, input, { offline: WAITING, fallback: SUBMIT_FAILED })) as SubmitDailyReportResult | null;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // a dead session went to /login: the words stay in the draft (./draft)
    const code = errorCodeOf(error.code);
    throw new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : error.message);
  }
  if (!body?.report) throw new DailyReportFailure(null, SUBMIT_FAILED);
  return body;
}

/**
 * The report as the screen shows it the moment «Сдать» is tapped — the server's answer replaces it.
 * New words take the director's marks off as the server does (D-198): «просмотрен» goes, a check
 * comes off and the report says «изменён после проверки».
 */
function provisional(day: MyDailyReportDay, input: SubmitDailyReportInput): DailyReport {
  const now = new Date().toISOString();
  const was = day.report?.status === "submitted" ? day.report : null;
  return {
    seen_at: null,
    checked_at: null,
    checked_by: null,
    changed_after_check_at: was?.checked_at ? now : (was?.changed_after_check_at ?? null),
    id: was?.id ?? `pending-${input.client_request_id}`,
    user_id: was?.user_id ?? day.report?.user_id ?? "",
    report_date: day.date,
    status: "submitted",
    arrived_at: input.arrived_at ?? null,
    left_at: input.left_at ?? null,
    summary: input.summary,
    tasks: day.tasks,
    submitted_at: was?.submitted_at ?? now,
    updated_at: now,
    // the points are the server's to say: a first submit shows them when it lands
    points: was?.points ?? 0,
    excused_at: null,
    excused_reason: null,
  };
}

/** The submitted report into the loaded past days: out of whatever page had its day, into the first one. */
function upsertDay(data: HistoryPages | undefined, report: DailyReport): HistoryPages | undefined {
  if (!data || data.pages.length === 0) return data;
  const pages = data.pages.map((page) => page.filter((item) => item.report_date !== report.report_date));
  pages[0] = [report, ...pages[0]].sort((a, b) => (a.report_date < b.report_date ? 1 : a.report_date > b.report_date ? -1 : 0));
  return { ...data, pages };
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
      queryClient.setQueryData<HistoryPages>(dailyReportKeys.historyPages(), (data) => upsertDay(data, result.report));
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

type FeedContext = { askFrom: string; away: boolean };

/**
 * `settings.daily_report.ask_from` and the person's own `availability`, read straight under RLS:
 * the company row is visible to its members (`companies_select`, like `points_enabled`), one's own
 * profile always (`profiles_select`). /api/settings is the director's and the secretary's only.
 * Under the module's key: a settings save (`["daily-report"]`) reads it again.
 */
async function readFeedContext(): Promise<FeedContext> {
  const supabase = createBrowserSupabase();
  const [company, session] = await Promise.all([
    supabase.from("companies").select("ask_from:settings->daily_report->>ask_from").limit(1).maybeSingle(),
    supabase.auth.getSession(),
  ]);
  if (company.error) throw new Error(company.error.message);
  const askFrom = askFromOf((company.data as { ask_from?: unknown } | null)?.ask_from);
  const userId = session.data.session?.user.id;
  if (!userId) return { askFrom, away: false };
  const profile = await supabase.from("profiles").select("availability").eq("id", userId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  return { askFrom, away: profile.data?.availability === "vacation" || profile.data?.availability === "sick" };
}

/**
 * Where today's report stands for Лента (D-167, `reportDue`): the row in «Дела», the face's call
 * and the greeting's line read this one answer. `now` — the screen's clock. Until the settings
 * come, the evening starts at 17:00; a director or the kiosk get no day (`not_team_member`) and
 * so nothing to show.
 */
export function useReportDue(now: Date): ReportDue {
  const day = useMyDailyReport();
  // a minute, not five: «в отпуске» set by the director reaches the face soon enough (and on focus)
  const context = useQuery({ queryKey: dailyReportKeys.feed(), staleTime: 60_000, queryFn: readFeedContext });
  const askFrom = context.data?.askFrom ?? ASK_FROM_DEFAULT;
  const away = context.data?.away ?? false;
  // a submit waiting on the phone is handed in as far as the person is concerned: a read of the day
  // that comes back without it must not bring «не сдан», the calling face and «Сдать» back (D-130)
  const waiting = useSubmitWaiting();
  // the words typed on /report and not handed in: with them «Сдать» goes in one tap (D-183); read
  // every render (a small localStorage read), so the row follows the draft without waiting a minute
  const draft = day.data ? readDraft(day.data.date) : null;
  const draftKey = draft ? `${draft.date}|${draft.summary}` : "";
  return useMemo(() => {
    const due = reportDue(day.data, now, askFrom, away, draftKey ? draft : null);
    return waiting && due.show && !due.submitted ? { ...due, submitted: true, asking: false, oneTap: false } : due;
    // `draft` is a fresh object every render; `draftKey` is what it says
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.data, now, askFrom, away, waiting, draftKey]);
}

/**
 * Today's report may hold other tasks now (an order handed in or closed on this screen): read it
 * again — but never while a submit is on its way, whose provisional report a read would overwrite.
 */
export function useRefreshMyDay(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    if (queryClient.isMutating({ mutationKey: SUBMIT_KEY }) > 0) return;
    void queryClient.invalidateQueries({ queryKey: dailyReportKeys.myDay() });
  }, [queryClient]);
}

/**
 * A submit is on the phone, not on the server yet — paused offline, retrying a dead network, or
 * given up on for this session while the outbox keeps it. Any screen's submit: the latest one
 * decides.
 */
export function useSubmitWaiting(): boolean {
  const states = useMutationState({ filters: { mutationKey: SUBMIT_KEY }, select: (mutation) => mutation.state });
  const last = states.at(-1);
  if (!last) return false;
  return (
    last.isPaused ||
    (last.status === "pending" && isNetworkError(last.failureReason)) ||
    (last.status === "error" && isNetworkError(last.error))
  );
}

/** The team's day loaded ahead (D-184): a step of days slides in with its reports already there. */
export function prefetchTeamDailyReportDay(client: QueryClient, date: Ymd): Promise<void> {
  return client.prefetchQuery({
    queryKey: dailyReportKeys.teamDay(date),
    queryFn: () => read<TeamDay>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.teamDay, { p_date: date })),
  });
}

/** Whether the team's day is already here — a step to it may slide, one still to load changes at once. */
export function hasTeamDailyReportDay(client: QueryClient, date: Ymd): boolean {
  return client.getQueryData(dailyReportKeys.teamDay(date)) !== undefined;
}

/**
 * The director's day: everybody's state, report, tasks and activity — live, a report submitted
 * on another phone lands without a reload (the socket on `daily_reports` of the company; RLS
 * narrows it again). Another day keeps the last one on screen until it comes (D-122 §7).
 */
export function useTeamDailyReportDay(date: Ymd, companyId: string | undefined, enabled = true) {
  return useRealtimeQuery<TeamDay>({
    queryKey: dailyReportKeys.teamDay(date),
    queryFn: () => read<TeamDay>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.teamDay, { p_date: date })),
    channel: { table: "daily_reports", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    // a report changes the day it belongs to and every period around it
    onEvent: (payload, queryClient) => {
      // D-198: a «Просмотрено» / «Проверено» alone is patched in place — reloading every team
      // query (the feed's pages with it) for each mark seen would be a storm
      if (patchIfReviewOnly(queryClient, payload)) return;
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
    queryFn: () => read<TeamPeriod>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.teamPeriod, { p_from: from, p_to: to })),
  });
}
