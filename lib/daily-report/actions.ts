"use client";

/**
 * The director's moves on the daily reports (D-183): «Напомнить» the ones who have not handed in
 * today's report, «Уважительная причина» on a missed day, and one person's reports for the «Дневник».
 * «Напомнить» goes through a route (it kicks the delivery queue and waits in the outbox without
 * network); the other two call their RPCs under RLS. Every write carries a client_request_id tied
 * to the tap, so a retry after a dead network is the same call (принцип 7).
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { postJson } from "@/lib/api/client";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { isNetworkError, NetworkError } from "@/lib/net";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { rpcJson } from "@/lib/supabase/rpc";
import { pluralRu } from "@/lib/tasks/status-text";

import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "./format";
import { DailyReportFailure, dailyReportKeys } from "./queries";
import {
  DAILY_REPORT_RPC,
  type DailyReport,
  type ExcuseDailyReportResult,
  type PersonDailyReport,
  type RemindDailyReportResult,
  type TeamDay,
} from "./types";

/** The route that carries «Напомнить» to `remind_daily_report` and kicks the delivery queue. */
export const REMIND_PATH = "/api/reports/remind";

const REMIND_FAILED = "Не получилось напомнить. Попробуйте ещё раз";
const EXCUSE_FAILED = "Не получилось записать причину. Попробуйте ещё раз";
const PERSON_FAILED = "Не получилось загрузить отчёты";

/**
 * One idempotency key per tap: TanStack retries a mutation after a dead network with the same
 * variables object, so the key follows the object — every retry and the outbox replay are one call.
 */
const requestIds = new WeakMap<object, string>();
function requestIdOf(variables: object): string {
  let id = requestIds.get(variables);
  if (!id) {
    id = crypto.randomUUID();
    requestIds.set(variables, id);
  }
  return id;
}

/** The Aqtobe day of the tap, kept with it like its key: a retry after midnight still says the tap's day. */
const tapDays = new WeakMap<object, string>();
function dayOf(variables: object): string {
  let day = tapDays.get(variables);
  if (!day) {
    day = todayYmd();
    tapDays.set(variables, day);
  }
  return day;
}

/** A refusal of the RPCs in the module's words; a dead network stays a NetworkError so it is retried. */
function failureOf(message: string, fallback: string): Error {
  if (isNetworkError(message)) return new NetworkError("Нет связи. Сделаю, как появится");
  const code = errorCodeOf(message);
  if (code) return new DailyReportFailure(code, DAILY_REPORT_ERROR_TEXT[code]);
  if (/\bnot_found\b/.test(message)) return new DailyReportFailure(null, "Этого отчёта уже нет");
  return new DailyReportFailure(null, fallback);
}

/* -------------------------------------------------------------------------- */
/* «Напомнить»                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the route answers beyond the contract: `late` — the window is closed until tomorrow, a push
 * then would be about a day that is over (the sweep does the same); `deliver_after` — before the
 * window the pushes wait for its start; `duplicate` — a replay of the same tap.
 */
type RemindAnswer = Omit<RemindDailyReportResult, "skipped"> & {
  skipped: { user_id: string; reason: RemindDailyReportResult["skipped"][number]["reason"] | "late" }[];
  deliver_after?: string | null;
  duplicate?: boolean;
};

const SKIPPED_WORDS: Record<RemindAnswer["skipped"][number]["reason"], string> = {
  already: "Уже напоминал сегодня — второй раз не шлю",
  submitted: "Отчёт уже сдан",
  away: "В отпуске или на больничном — не напоминаю",
  not_due: "Сегодня отчёт не нужен",
  late: "Уже тихие часы — напоминание дошло бы завтра, не шлю",
};

/** The toast after «Напомнить»: who was reminded and when it leaves, or why nobody was. */
function remindWords(answer: RemindAnswer, now: Date): string {
  const count = answer.reminded.length;
  if (count === 0) {
    const reasons = new Set(answer.skipped.map((item) => item.reason));
    const [only] = reasons;
    return reasons.size === 1 && only ? SKIPPED_WORDS[only] : "Напоминать некому — сдали или уже напоминал";
  }
  const base = count === 1 ? "Напомнил" : `Напомнил ${count} ${pluralRu(count, ["человеку", "людям", "людям"])}`;
  const when = answer.deliver_after ? ` — уйдёт ${humanAqtobe(new Date(answer.deliver_after), now)}, сейчас тихие часы` : "";
  const already = answer.skipped.filter((item) => item.reason === "already").length;
  return `${base}${when}${already ? ` · ${already} уже напоминал сегодня` : ""}`;
}

/**
 * POST «Напомнить». A dead network keeps it in the outbox under its idempotency key and throws
 * NetworkError: the mutation retries in this session, the outbox after a closed tab — the RPC
 * answers a replay with the first answer, and one push a person a day holds anyway.
 */
async function postRemind(userIds: string[], requestId: string, date: string): Promise<RemindAnswer> {
  // the tap's own day goes along: replayed tomorrow from the outbox, the route refuses it (stale_day)
  const payload = { user_ids: userIds, client_request_id: requestId, date };
  const body = (await postJson(REMIND_PATH, payload, {
    offline: "Нет связи. Напомню, как появится",
    fallback: REMIND_FAILED,
  })) as RemindAnswer | null;
  if (!body || !Array.isArray(body.reminded)) throw new Error(REMIND_FAILED);
  return body;
}

/** «Напомнить» one person or everyone waiting: one push a person a day, the sweep's own included. */
export function useRemindDailyReport() {
  const queryClient = useQueryClient();
  return useMutation<RemindAnswer, Error, { userIds: string[] }>({
    mutationFn: (input) => postRemind(input.userIds, requestIdOf(input), dayOf(input)),
    onSuccess: (answer) => {
      toast(remindWords(answer, new Date()));
    },
    onError: (error) => toast(error.message || REMIND_FAILED),
    // the day's rows carry `reminded` — the receipt shows up at once
    onSettled: () => queryClient.invalidateQueries({ queryKey: dailyReportKeys.team }),
  });
}

/* -------------------------------------------------------------------------- */
/* «Уважительная причина»                                                       */
/* -------------------------------------------------------------------------- */

const personPrefix = [...dailyReportKeys.team, "person"] as const;

/** The report wherever the director's screens hold it: one person's lists and the team's days. */
function patchReport(queryClient: QueryClient, reportId: string, patch: Partial<DailyReport>): void {
  queryClient.setQueriesData<PersonDailyReport[]>({ queryKey: personPrefix }, (list) =>
    list?.map((item) => (item.id === reportId ? { ...item, ...patch } : item)),
  );
  queryClient.setQueriesData<TeamDay>({ queryKey: [...dailyReportKeys.team, "day"] }, (day) =>
    day && day.rows.some((row) => row.report?.id === reportId)
      ? {
          ...day,
          rows: day.rows.map((row) => (row.report?.id === reportId ? { ...row, report: { ...row.report, ...patch } } : row)),
        }
      : day,
  );
}

type ExcuseContext = { snapshot: [readonly unknown[], unknown][] };

/** «Уважительная причина»: the missed day stays missed, the minus comes back, the reason is kept. */
export function useExcuseDailyReport() {
  const queryClient = useQueryClient();
  return useMutation<ExcuseDailyReportResult, Error, { reportId: string; reason: string }, ExcuseContext>({
    mutationFn: async (input) => {
      const { data, error } = await rpcJson<ExcuseDailyReportResult>(
        createBrowserSupabase().rpc(DAILY_REPORT_RPC.excuse, {
          p_report: input.reportId,
          p_reason: input.reason,
          client_request_id: requestIdOf(input),
        }),
      );
      if (error) throw failureOf(error.message, EXCUSE_FAILED);
      return data;
    },
    // on screen at once (принцип 1a): the reason and a minus gone; the answer replaces it
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: dailyReportKeys.team });
      const snapshot = queryClient.getQueriesData({ queryKey: dailyReportKeys.team });
      const reason = input.reason.trim();
      queryClient.setQueriesData<PersonDailyReport[]>({ queryKey: personPrefix }, (list) =>
        list?.map((item) =>
          item.id === input.reportId
            ? { ...item, excused_at: new Date().toISOString(), excused_reason: reason, points: Math.max(item.points, 0) }
            : item,
        ),
      );
      return { snapshot };
    },
    onSuccess: (result) => {
      patchReport(queryClient, result.report.id, result.report);
      toast(result.points_returned > 0 ? `Минус снят — +${result.points_returned} вернул` : "Причина записана");
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast(error.message || EXCUSE_FAILED);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dailyReportKeys.team });
      // the balance and the history: the minus came back
      void queryClient.invalidateQueries({ queryKey: ["points"] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* «Дневник»                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One person's reports from `from` to `to` (both inclusive, ≤ 92 days), newest first. The key sits
 * under `dailyReportKeys.team`, so a report arriving live (the day's socket) refreshes it too.
 * ‹ › to another month keeps this person's entries on screen until the next ones come; another
 * person starts clean — never somebody else's days under a new name.
 */
export function usePersonDailyReports(userId: string | null, from: Ymd, to: Ymd, enabled = true) {
  return useQuery<PersonDailyReport[]>({
    queryKey: ["daily-report", "team", "person", userId, from, to] as const,
    enabled: enabled && Boolean(userId) && Boolean(from && to) && from <= to,
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[3] === userId ? previous : undefined),
    queryFn: async () => {
      const { data, error } = await rpcJson<PersonDailyReport[] | null>(
        createBrowserSupabase().rpc(DAILY_REPORT_RPC.person, { p_user_id: userId as string, p_from: from, p_to: to }),
      );
      if (error) throw failureOf(error.message, PERSON_FAILED);
      return data ?? [];
    },
  });
}
