"use client";

/**
 * D-198: the director's reading of the daily reports — the feed of all reports (days in a row,
 * filters), «Просмотрено» set by what stayed on screen, «Проверено» on / off, the count of
 * unchecked reports. One module for the computer (/desk/reports) and the phone (/reports).
 * The marks are written into every cached copy by the pure patchers of ./review-marks.ts.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { toast } from "@/components/ui/Toast";
import { ApiError, postJson } from "@/lib/api/client";
import { addDays, todayYmd } from "@/lib/datetime/calendar";
import { isNetworkError } from "@/lib/net";
import { useRealtimeInvalidate, useRealtimeListener, type RealtimeEvent } from "@/lib/realtime/useRealtimeQuery";
import { sound } from "@/lib/sound";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { rpcJson } from "@/lib/supabase/rpc";

import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "./format";
import { DailyReportFailure } from "./queries";
import {
  checkMark,
  indexMarks,
  isReviewOnly,
  markFeedPages,
  markList,
  markOfRow,
  marksOf,
  markTeamDay,
  reportInFeed,
  reportInTeamDay,
} from "./review-marks";
import {
  DAILY_REPORT_RPC,
  type CheckDailyReportsInput,
  type CheckDailyReportsResult,
  type DailyReport,
  type FeedDay,
  type PersonDailyReport,
  type ReportsFeedFilter,
  type ReportsFeedPage,
  type ReviewMark,
  type TeamDay,
} from "./types";

export const reviewKeys = {
  feed: (filter: ReportsFeedFilter) => ["daily-report", "team", "feed", filter.who ?? "", filter.q, filter.unchecked] as const,
  feedRoot: ["daily-report", "team", "feed"] as const,
  unchecked: ["daily-report", "team", "unchecked"] as const,
};

/** Unchecked reports are counted over the last days only — older ones go quiet, they do not pile up. */
export const UNCHECKED_DAYS = 7;

/** The route that carries «Проверено» to `check_daily_reports` (and the outbox's replay of it). */
export const CHECK_PATH = "/api/reports/check";

/** A page of the feed: a week; under a filter the matches are sparse — a month. */
const PAGE_DAYS = 7;
const FILTERED_PAGE_DAYS = 31;

/** «Просмотрено»: this long on screen, whole, with the window in front. */
const SEEN_AFTER_MS = 2_000;
/** How often the sighting is looked at, and how often the marks go out in one call. */
const SEEN_TICK_MS = 400;
const SEEN_FLUSH_MS = 2_000;

const CHECK_KEY = ["daily-report", "check"] as const;
const CHECK_FAILED = "Не получилось отметить. Попробуйте ещё раз";
const FEED_FAILED = "Не получилось загрузить отчёты";

// spelled out, not built from dailyReportKeys at load: queries.ts may import this module back
// (its day listener calls patchIfReviewOnly), and a cycle must not read a key before it exists
const teamDayPrefix = ["daily-report", "team", "day"] as const;
const personPrefix = ["daily-report", "team", "person"] as const;

type FeedData = InfiniteData<ReportsFeedPage, string | null>;

export type ReportsFeed = {
  /** All loaded pages' days, newest first; undefined — the first page is loading. */
  days: FeedDay[] | undefined;
  /** There are days before the loaded ones. */
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  /** The first page failed (the screen says so and offers a retry). */
  error: boolean;
  retry: () => void;
  /** `days` are still the feed under the filter before this one — its own answer is on the way. */
  placeholder: boolean;
};

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

/** Writes review marks into every cached copy of those reports (feed, team day, person, Дневник). */
export function patchReviewMarks(client: QueryClient, marks: readonly ReviewMark[]): void {
  if (marks.length === 0) return;
  const index = indexMarks(marks);
  client.setQueriesData<FeedData>({ queryKey: reviewKeys.feedRoot }, (data) => markFeedPages(data, index));
  client.setQueriesData<TeamDay>({ queryKey: teamDayPrefix }, (day) => markTeamDay(day, index));
  client.setQueriesData<PersonDailyReport[]>({ queryKey: personPrefix }, (list) => markList(list, index));
}

/** The director's cached copy of a report, wherever a screen holds it; undefined — none here. */
export function cachedReport(client: QueryClient, id: string): DailyReport | undefined {
  for (const [, data] of client.getQueriesData<FeedData>({ queryKey: reviewKeys.feedRoot })) {
    const found = reportInFeed(data, id);
    if (found) return found;
  }
  for (const [, day] of client.getQueriesData<TeamDay>({ queryKey: teamDayPrefix })) {
    const found = reportInTeamDay(day, id);
    if (found) return found;
  }
  for (const [, list] of client.getQueriesData<PersonDailyReport[]>({ queryKey: personPrefix })) {
    const found = list?.find((report) => report.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Ids with a «Проверено» tap still on its way: the screen shows the tap, and an older answer or a
 * Realtime echo of the step before must not flip it back meanwhile.
 */
const checking = new Map<string, number>();

function holdChecking(ids: readonly string[], delta: 1 | -1): void {
  for (const id of ids) {
    const next = (checking.get(id) ?? 0) + delta;
    if (next > 0) checking.set(id, next);
    else checking.delete(id);
  }
}

/**
 * A `daily_reports` change for the director's screens: the review fields alone (`updated_at` as
 * cached) are patched in place — `true`; anything else is for the caller to reload — `false`.
 * The queries.ts day listener can call this first to keep a mark from reloading the day.
 */
export function patchIfReviewOnly(client: QueryClient, payload: RealtimeEvent<Record<string, unknown>>): boolean {
  if (payload.eventType !== "UPDATE") return false;
  const row = payload.new as Partial<Record<string, unknown>>;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return false;
  if (!isReviewOnly(row, cachedReport(client, id))) return false;
  const mark = markOfRow(row);
  if (mark && !checking.has(id)) patchReviewMarks(client, [mark]);
  return true;
}

/* -------------------------------------------------------------------------- */
/* The feed                                                                    */
/* -------------------------------------------------------------------------- */

function feedFailure(message: string): Error {
  const code = errorCodeOf(message);
  return new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : FEED_FAILED);
}

/** The filter as the RPC takes it: words trimmed, "" — none; any filter widens the page to a month. */
export function feedArgs(filter: ReportsFeedFilter, before: string | null) {
  const query = filter.q.trim();
  const filtered = Boolean(filter.who) || query !== "" || filter.unchecked;
  return {
    ...(before ? { p_before: before } : {}),
    // «Не проверены» lists what the count counts: the last UNCHECKED_DAYS days, older ones are quiet
    p_days: filter.unchecked ? UNCHECKED_DAYS : filtered ? FILTERED_PAGE_DAYS : PAGE_DAYS,
    ...(filter.who ? { p_user: filter.who } : {}),
    ...(query ? { p_query: query } : {}),
    ...(filter.unchecked ? { p_unchecked: true } : {}),
  };
}

/**
 * The feed under the filters, a page at a time (7 days; 31 under any filter), live: a report handed
 * in, changed, seen or checked elsewhere lands without a reload; a change of the review fields alone
 * patches the cache instead of reloading the pages.
 */
export function useReportsFeed(filter: ReportsFeedFilter, companyId: string | undefined, enabled = true): ReportsFeed {
  const queryClient = useQueryClient();
  const on = enabled && Boolean(companyId);
  const who = filter.who ?? "";

  const query = useInfiniteQuery({
    queryKey: reviewKeys.feed(filter),
    enabled: on,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await rpcJson<ReportsFeedPage | null>(
        createBrowserSupabase().rpc(DAILY_REPORT_RPC.feed, feedArgs(filter, pageParam)),
      );
      if (error) throw feedFailure(error.message);
      return data ?? { days: [], from: "", next_before: null };
    },
    getNextPageParam: (last) => (filter.unchecked ? null : (last.next_before ?? null)),
    // the same person's feed under other words or «не проверены» stays until the new one comes;
    // another person starts clean — never somebody else's reports under a new name
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === who ? previous : undefined),
  });

  useRealtimeListener<Record<string, unknown>>(
    { table: "daily_reports", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    (payload) => {
      if (patchIfReviewOnly(queryClient, payload)) return;
      void queryClient.invalidateQueries({ queryKey: reviewKeys.feedRoot });
    },
    () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.feedRoot }, { cancelRefetch: false });
    },
    "daily-report-feed",
    on,
  );

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage, isError, isPlaceholderData, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // one array per answer, not per render: the screens' memos key on it
  const days = useMemo(() => data?.pages.flatMap((page) => page.days), [data]);

  return {
    days,
    hasMore: Boolean(hasNextPage),
    loadMore,
    loadingMore: isFetchingNextPage,
    error: isError && !data,
    retry,
    placeholder: isPlaceholderData,
  };
}

/* -------------------------------------------------------------------------- */
/* «Просмотрено»                                                               */
/* -------------------------------------------------------------------------- */

type Sighting = {
  id: string;
  /** Whole on screen (or at least half the viewport when taller) by the last observer entry. */
  inView: boolean;
  /** Since when it has stood in view with the window in front; null — not now. */
  since: number | null;
  /** Marked, or found seen already: nothing more to watch for on this element. */
  done: boolean;
};

/** Every report element watched now, by element; one observer for all of them. */
const sightings = new Map<Element, Sighting>();
/**
 * Ids queued or in a call now: one call per report. Afterwards the cache says «seen» — and once
 * the person changes the words the report comes back unseen and may be marked again.
 */
const seenSending = new Set<string>();
/** Ids to go in the next call. */
const seenQueue = new Set<string>();
let seenClient: QueryClient | null = null;
let observer: IntersectionObserver | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Whole»: a pixel clipped by a scroll box's edge still counts. */
const WHOLE = 0.98;
/** Thresholds fine enough to tell «whole» and «half the viewport» of a tall report. */
const THRESHOLDS = [...Array.from({ length: 20 }, (_, i) => i / 20), WHOLE, 1];

function inViewOf(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= WHOLE) return true;
  const viewport = entry.rootBounds?.height ?? window.innerHeight;
  // a report taller than the window counts once it fills at least half of it
  return entry.boundingClientRect.height > viewport && entry.intersectionRect.height >= viewport / 2;
}

function windowInFront(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** The most ids one call takes (`mark_daily_reports_seen`, `check_daily_reports`). */
const MAX_IDS = 200;

function flushSeen(): void {
  flushTimer = null;
  if (seenQueue.size === 0) return;
  const ids = [...seenQueue].slice(0, MAX_IDS);
  for (const id of ids) seenQueue.delete(id);
  // the rest goes in the next call
  if (seenQueue.size > 0) flushTimer = setTimeout(flushSeen, SEEN_FLUSH_MS);
  const client = seenClient;
  void rpcJson<{ reports?: ReviewMark[] } | null>(createBrowserSupabase().rpc(DAILY_REPORT_RPC.seen, { p_ids: ids }))
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      const marks = (data?.reports ?? []).filter((mark) => !checking.has(mark.id));
      if (client) patchReviewMarks(client, marks);
    })
    .catch(() => {
      // quiet: the dot faded already; the next read brings the report back unseen and a later
      // sighting sends it again
    })
    .finally(() => {
      for (const id of ids) seenSending.delete(id);
    });
}

function markSeen(id: string): void {
  if (seenSending.has(id)) return;
  // seen already (here, elsewhere, by another director) or not a report to mark: no call
  const cached = seenClient ? cachedReport(seenClient, id) : undefined;
  if (cached && (cached.seen_at || cached.status !== "submitted")) return;
  seenSending.add(id);
  seenQueue.add(id);
  // the «новый» dot fades now; the server's answer replaces the time
  if (seenClient) patchReviewMarks(seenClient, [{ id, seen_at: new Date().toISOString() }]);
  flushTimer ??= setTimeout(flushSeen, SEEN_FLUSH_MS);
}

function tick(): void {
  const now = Date.now();
  const front = windowInFront();
  let watching = false;
  for (const sighting of sightings.values()) {
    if (sighting.done || !sighting.inView || !front || seenSending.has(sighting.id)) {
      sighting.since = null;
      continue;
    }
    watching = true;
    sighting.since ??= now;
    if (now - sighting.since >= SEEN_AFTER_MS) {
      markSeen(sighting.id);
      sighting.done = true;
    }
  }
  if (!watching && tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTicking(): void {
  tickTimer ??= setInterval(tick, SEEN_TICK_MS);
}

function observerOf(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof IntersectionObserver === "undefined") return null;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const sighting = sightings.get(entry.target);
        if (!sighting) continue;
        sighting.inView = inViewOf(entry);
        if (!sighting.inView) sighting.since = null;
      }
      if ([...sightings.values()].some((sighting) => sighting.inView && !sighting.done)) startTicking();
    },
    { threshold: THRESHOLDS },
  );
  // back to the window: whatever is in view starts its two seconds again
  const wake = () => {
    if (windowInFront() && [...sightings.values()].some((sighting) => sighting.inView && !sighting.done)) startTicking();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  return observer;
}

function watch(element: Element, id: string): void {
  const io = observerOf();
  if (!io) return;
  const known = sightings.get(element);
  if (known) {
    // observing twice reports nothing new: keep what the observer said, under the new id
    if (known.id !== id) Object.assign(known, { id, since: null, done: false });
    return;
  }
  sightings.set(element, { id, inView: false, since: null, done: false });
  io.observe(element);
}

function unwatch(element: Element): void {
  if (!sightings.delete(element)) return;
  observer?.unobserve(element);
}

/**
 * «Просмотрено» by sight: returns a ref for the report's element. The report counts as seen when it
 * stayed on screen whole (or covers at least half the viewport, if taller) for 2 s while the window
 * is visible and focused. Marks are sent in batches (`mark_daily_reports_seen`) and patched into the
 * caches at once — the «новый» dot fades. No-op when `enabled` is false (not a director, already
 * seen, not submitted).
 */
export function useSeenOnScreen(reportId: string, enabled: boolean): (element: HTMLElement | null) => void {
  const queryClient = useQueryClient();
  const element = useRef<HTMLElement | null>(null);
  const live = enabled && UUID.test(reportId);

  useEffect(() => {
    seenClient = queryClient;
  }, [queryClient]);

  // a new callback when the report's state changes (seen elsewhere, now checked): React hands the
  // old one null and the new one the element — that stops or starts the watching
  return useCallback(
    (next: HTMLElement | null) => {
      const previous = element.current;
      if (previous === next) return;
      if (previous) unwatch(previous);
      element.current = next;
      if (next && live) watch(next, reportId);
    },
    [live, reportId],
  );
}

/* -------------------------------------------------------------------------- */
/* «Проверено»                                                                 */
/* -------------------------------------------------------------------------- */

type CheckVariables = CheckDailyReportsInput;
type CheckContext = { previous: ReviewMark[]; countDelta: number };

/**
 * POST the check. A dead network keeps it in the outbox under its idempotency key and throws
 * NetworkError: the mutation waits and resumes in this session, the outbox after a closed tab.
 */
async function postCheck(input: CheckVariables): Promise<CheckDailyReportsResult> {
  let body: CheckDailyReportsResult | null;
  try {
    body = (await postJson(CHECK_PATH, input, {
      offline: "Нет связи. Отмечу, как появится",
      fallback: CHECK_FAILED,
    })) as CheckDailyReportsResult | null;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const code = errorCodeOf(error.code);
    throw new DailyReportFailure(code, code ? DAILY_REPORT_ERROR_TEXT[code] : error.message || CHECK_FAILED);
  }
  if (!body || !Array.isArray(body.reports)) throw new DailyReportFailure(null, CHECK_FAILED);
  return body;
}

/** The first day the unchecked count looks at (Aqtobe): today and the days before it. */
function uncheckedFrom(): string {
  return addDays(todayYmd(), -(UNCHECKED_DAYS - 1));
}

/**
 * «Проверено» on / off for one report or a batch: patches every cache at once (optimistic), then
 * POST /api/reports/check — a tap without network waits in the outbox and goes out exactly once.
 * The 5-s «Отменить» of a batch is the screen's: it calls `check(ids, false)` with the same ids.
 */
export function useCheckReports(): { check: (ids: string[], on: boolean) => void } {
  const queryClient = useQueryClient();
  const mutation = useMutation<CheckDailyReportsResult, Error, CheckVariables, CheckContext>({
    mutationKey: CHECK_KEY,
    // «Проверить все» and its «Отменить» must reach the server in the order they were tapped
    scope: { id: "daily-report-check" },
    mutationFn: postCheck,
    onMutate: (input) => {
      holdChecking(input.ids, 1);
      const now = new Date().toISOString();
      const from = uncheckedFrom();
      const previous: ReviewMark[] = [];
      const marks: ReviewMark[] = [];
      let countDelta = 0;
      for (const id of input.ids) {
        const report = cachedReport(queryClient, id);
        if (!report) continue;
        const mark = checkMark(report, input.on, now);
        if (!mark) continue;
        previous.push(marksOf(report));
        marks.push(mark);
        if (report.report_date >= from) countDelta += input.on ? -1 : 1;
      }
      patchReviewMarks(queryClient, marks);
      if (countDelta !== 0) {
        queryClient.setQueryData<number>(reviewKeys.unchecked, (count) =>
          count === undefined ? count : Math.max(0, count + countDelta),
        );
      }
      return { previous, countDelta };
    },
    onSuccess: (result, input) => {
      holdChecking(input.ids, -1);
      // a later tap on the same reports is on its way: its answer is the one to show
      patchReviewMarks(
        queryClient,
        result.reports.filter((mark) => !checking.has(mark.id)),
      );
    },
    onError: (error, input, context) => {
      holdChecking(input.ids, -1);
      // waiting for the network is not a failure: the marks stay, the outbox has the tap
      if (isNetworkError(error)) return;
      if (context) {
        patchReviewMarks(
          queryClient,
          context.previous.filter((mark) => !checking.has(mark.id)),
        );
        if (context.countDelta !== 0) {
          queryClient.setQueryData<number>(reviewKeys.unchecked, (count) =>
            count === undefined ? count : Math.max(0, count - context.countDelta),
          );
        }
      }
      toast(error.message || CHECK_FAILED);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.unchecked });
    },
  });

  const { mutate } = mutation;
  const check = useCallback(
    (ids: string[], on: boolean) => {
      const unique = [...new Set(ids)].filter((id) => UUID.test(id));
      if (unique.length === 0) return;
      // the mark is heard at the tap (D-204); taking it off is a plain press
      if (on) sound("check");
      // one key per tap: every retry and the outbox replay are the same call (принцип 7)
      for (let at = 0; at < unique.length; at += MAX_IDS) {
        mutate({ ids: unique.slice(at, at + MAX_IDS), on, client_request_id: crypto.randomUUID() });
      }
    },
    [mutate],
  );
  return { check };
}

/* -------------------------------------------------------------------------- */
/* The count                                                                   */
/* -------------------------------------------------------------------------- */

/** Submitted reports of the last `UNCHECKED_DAYS` days without «Проверено»; undefined — unknown (not loaded, or no access). */
export function useUncheckedReportsCount(companyId: string | undefined, enabled = true): number | undefined {
  const on = enabled && Boolean(companyId);
  const query = useQuery({
    queryKey: reviewKeys.unchecked,
    enabled: on,
    // a base without the column answers 400: unknown, said by nothing — no retry, no toast
    retry: false,
    queryFn: async () => {
      const { count, error } = await createBrowserSupabase()
        .from("daily_reports")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId as string)
        .eq("status", "submitted")
        .is("checked_at", null)
        .gte("report_date", uncheckedFrom());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
  useRealtimeInvalidate(
    { table: "daily_reports", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    reviewKeys.unchecked,
    on,
  );
  return query.isError ? undefined : query.data;
}
