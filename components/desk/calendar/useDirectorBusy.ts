"use client";

import { DAY_FROM as WEEK_FROM, DAY_TO as WEEK_TO } from "./week";
import { useQueries, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { busyByDay, busyChunks, daysFromTo, mergeSpans, type BusyBlock, type BusySpan } from "@/lib/desk/busy";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** A meeting moved or added shows within this. */
const POLL_MS = 60_000;
/** A read that failed is asked again this seldom by itself; «Повторить» asks at once. */
const REFUSED_POLL_MS = 10 * 60_000;

const ROOT = "director-busy";

/** The hours his free windows are counted in: 08–20, as the week draws them (D-180). */
// the grid's own working day (week.ts, in hours) — in minutes here
const DAY_FROM = WEEK_FROM * 60;
const DAY_TO = WEEK_TO * 60;

/**
 * The working hours «Окна директора» and the month's busy strip are drawn in: 08:00–20:00, from
 * an earlier start of the company's working day (`settings.daily_report.work_start`) when it has
 * one — the hour a caller may be offered. Defaults until the settings come.
 */
export function useWorkHours(): { from: number; to: number } {
  const settings = useCompanySettings();
  const start = settings.data?.daily_report.work_start;
  return useMemo(() => {
    const h = start && /^\d{2}:\d{2}$/.test(start) ? Number(start.slice(0, 2)) : null;
    return { from: h === null ? DAY_FROM : Math.min(DAY_FROM, h * 60), to: DAY_TO };
  }, [start]);
}

/**
 * The director's busy time as the desk holds it: `loading` — no answer yet (nothing is drawn as
 * free), `error` — a read failed and has nothing to show (the screen says so and offers «Повторить»,
 * D-158), `ready` — `spans` merged and `blocks` cut to the days.
 */
export type DirectorBusy = {
  status: "loading" | "error" | "ready";
  spans: BusySpan[] | null;
  blocks: Map<Ymd, BusyBlock[]>;
  refetch: () => void;
};

type Combined = { failed: boolean; spans: BusySpan[] | null };

/**
 * The director's busy spans of the days `from` up to, not including, `to` (owner, 2026-11-04;
 * D-180). The RPC answers at most 31 days, so a month on screen is two reads, merged. A poll, not
 * Realtime: `events` reaches a socket only under RLS, and the secretary's RLS leaves her own
 * meetings, so a change of the director's calendar would never arrive. Never a wrong «свободен»:
 * while a read is out or failed there are no spans — `enabled` false is `loading` too.
 */
export function useDirectorBusy(from: Ymd, to: Ymd, enabled = true): DirectorBusy {
  const queryClient = useQueryClient();
  const chunks = useMemo(() => busyChunks(from, to), [from, to]);
  const combine = useCallback(
    (results: UseQueryResult<BusySpan[]>[]): Combined => ({
      // a failed refresh over an answer already here keeps the answer: a minute old, not a lie
      failed: results.some((result) => result.data === undefined && result.isError),
      spans: results.every((result) => result.data !== undefined) ? mergeSpans(results.flatMap((result) => result.data ?? [])) : null,
    }),
    [],
  );
  const combined = useQueries({
    queries: chunks.map(([a, b]) => ({
      queryKey: [ROOT, a, b],
      queryFn: async (): Promise<BusySpan[]> => {
        const { data, error } = await createBrowserSupabase().rpc("director_busy", {
          p_from: ymdHmToAqtobeIso(a, "00:00") as string,
          p_to: ymdHmToAqtobeIso(b, "00:00") as string,
        });
        if (error) throw new Error(error.message);
        return data ?? [];
      },
      enabled,
      retry: false,
      staleTime: POLL_MS / 2,
      // a poll sleeps in a hidden tab: back at the desk the answer is fresh at once
      refetchOnWindowFocus: true,
      refetchInterval: (query: { state: { status: string } }) => (query.state.status === "error" ? REFUSED_POLL_MS : POLL_MS),
    })),
    combine,
  });

  const spans = enabled ? combined.spans : null;
  const blocks = useMemo(() => (spans ? busyByDay(spans, daysFromTo(from, to)) : new Map<Ymd, BusyBlock[]>()), [spans, from, to]);
  const refetch = useCallback(() => {
    for (const [a, b] of chunks) void queryClient.refetchQueries({ queryKey: [ROOT, a, b], exact: true });
  }, [chunks, queryClient]);
  const status: DirectorBusy["status"] = !enabled ? "loading" : combined.failed ? "error" : spans ? "ready" : "loading";
  return { status, spans, blocks, refetch };
}
