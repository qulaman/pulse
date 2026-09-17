"use client";

import { useQuery } from "@tanstack/react-query";

import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";

import { isTvKind, type TvEvent, type TvPayload } from "./feed";

/**
 * Данные киоска. Роль `tv` не видит ни задач, ни людей, ни компании — только таблицу
 * событий и вызов `tv_summary()` (миграция 20260917190000, docs/DATABASE.md «tv_events»).
 * Поэтому здесь нет ни одного запроса к рабочим таблицам: то, что нельзя прочитать,
 * не запрашивается даже «на всякий случай».
 */

export const tvKeys = {
  feed: ["tv", "feed"] as const,
  summary: (guest: boolean) => ["tv", "summary", guest] as const,
};

/**
 * Лента на экране — последние события (CONCEPT §3.5: 8–10). Семь: первое идёт героем и
 * занимает место двух строк, а под лентой ещё стоит полоса команды.
 */
const FEED_LIMIT = 7;
/** Сводка живёт медленнее ленты: вердикт и карусель пересчитываются раз в минуту. */
const SUMMARY_REFRESH_MS = 60_000;

function payloadOf(value: Json): TvPayload {
  const record = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : null,
    title: typeof record.title === "string" ? record.title : null,
    amount: typeof record.amount === "number" ? record.amount : null,
  };
}

async function fetchFeed(): Promise<TvEvent[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("tv_events")
    .select("id, kind, created_at, payload, payload_guest")
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => isTvKind(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind as TvEvent["kind"],
      created_at: row.created_at,
      payload: payloadOf(row.payload),
      payload_guest: payloadOf(row.payload_guest),
    }));
}

export function useTvFeed() {
  return useRealtimeQuery<TvEvent[]>({
    queryKey: tvKeys.feed,
    queryFn: fetchFeed,
    channel: { table: "tv_events" },
  });
}

export type TvCounts = { overdue: number; declined: number; review: number; questions: number };
export type TvToday = { sent: number; done: number; in_work: number };
export type TvRatingRow = { name: string; points: number | null; rank: number };
export type TvLoadRow = { name: string; active: number; overdue: number };
export type TvWeekDay = { day: string; done: number };
export type TvMerchRow = { name: string; title: string; at: string };

export type TvSummary = {
  guest: boolean;
  points_enabled: boolean;
  now: string;
  /** События по часам суток компании — из них рисуется фон «пульс дня». */
  pulse: number[];
  counts: TvCounts;
  today: TvToday;
  rating: TvRatingRow[];
  load: TvLoadRow[];
  week: TvWeekDay[];
  merch: TvMerchRow[];
};

const EMPTY_SUMMARY: TvSummary = {
  guest: false,
  points_enabled: false,
  now: new Date(0).toISOString(),
  pulse: [],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 0, done: 0, in_work: 0 },
  rating: [],
  load: [],
  week: [],
  merch: [],
};

/**
 * Вердикт, три числа дня и карусель — одним вызовом. Маска гостя считается в БД:
 * в гостевом режиме сюда физически не приезжают ни фамилии, ни очки (D-33).
 */
export function useTvSummary(guest: boolean) {
  const query = useQuery({
    queryKey: tvKeys.summary(guest),
    refetchInterval: SUMMARY_REFRESH_MS,
    queryFn: async (): Promise<TvSummary> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_summary", { p_guest: guest });
      if (error) throw new Error(error.message);
      return { ...EMPTY_SUMMARY, ...((data ?? {}) as Partial<TvSummary>) } as TvSummary;
    },
  });
  // событие меняет и числа, и карусель — сводка обновляется вместе с лентой
  useRealtimeInvalidate({ table: "tv_events" }, tvKeys.summary(guest));
  return query;
}
