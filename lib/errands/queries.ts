"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { appendPage, foldFirstPage, ilikeAny, phrasePattern, rangeBounds, searchWords, type DayRange } from "@/lib/desk/archive";
import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import type { CompanySettings, SecretaryAction } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { useDebounced } from "@/lib/useDebounced";

export type ErrandRow = Database["public"]["Tables"]["errands"]["Row"];
export type ErrandStatus = Database["public"]["Enums"]["errand_status"];
export type DeliveryRow = Database["public"]["Tables"]["notification_deliveries"]["Row"];

export type Errand = ErrandRow & {
  claimed: { full_name: string } | null;
  author: { full_name: string } | null;
};

export const errandKeys = {
  root: ["errands"] as const,
  list: () => ["errands", "list"] as const,
  history: (days: number) => ["errands", "history", days] as const,
  // plain lists under the root: «Отменить» paints them and a change invalidates them with the others
  archive: (scope: string) => ["errands", "archive", scope] as const,
  one: (id: string) => ["errands", "one", id] as const,
};

const SELECT =
  "*, claimed:profiles!errands_claimed_by_fkey(full_name), author:profiles!errands_author_id_fkey(full_name)";

/** Живая заявка: ещё не закрыта и не отозвана. */
export const ACTIVE: ErrandStatus[] = ["sent", "accepted"];

export function isActive(errand: Pick<Errand, "status">): boolean {
  return errand.status === "sent" || errand.status === "accepted";
}

/**
 * Заявка живёт минуты (D-79): сутки назад — уже история, её показывает /secretary.
 * Одно окно и у директора, и у секретаря — счётчик шарика и панель считают по нему.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function fetchErrands(sinceMs: number): Promise<Errand[]> {
  const supabase = createBrowserSupabase();
  // no user filter: RLS already leaves the author, the secretaries and the director
  const { data, error } = await supabase
    .from("errands")
    .select(SELECT)
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Errand[];
}

/** Последние сутки заявок, живьём: карточка у секретаря гаснет по Realtime. */
export function useErrands(enabled = true) {
  return useRealtimeQuery<Errand[], ErrandRow>({
    queryKey: errandKeys.list(),
    queryFn: () => fetchErrands(WINDOW_MS),
    channel: { table: "errands" },
    enabled,
  });
}

/** История для /secretary у директора: тридцать дней, без сокета. */
export function useErrandHistory(days = 30, enabled = true) {
  return useRealtimeQuery<Errand[], ErrandRow>({
    queryKey: errandKeys.history(days),
    queryFn: () => fetchErrands(days * WINDOW_MS),
    channel: { table: "errands" },
    enabled,
  });
}

/* -------------------------------------------------------------------------- */
/* The desk's history: closed requests from the server, a page at a time        */
/* -------------------------------------------------------------------------- */

export const ERRAND_PAGE = 50;

const SEARCH_PAUSE_MS = 250;

/** The request's own words: what was asked, what was noted, what came back, why not. */
const WORD_COLUMNS = ["label", "note", "result", "decline_reason"] as const;

export type ClosedErrandStatus = Extract<ErrandStatus, "done" | "declined" | "cancelled">;

export const CLOSED_ERRANDS: readonly ClosedErrandStatus[] = ["done", "declined", "cancelled"];

/** `claimed`: a person's id, «nobody» — what nobody took, null — everybody's. */
export type ErrandFilter = { range: DayRange | null; claimed: string | "nobody" | null; text: string };

const NO_ERRANDS: Errand[] = [];

/** How many rows each history has on the server, by its key: the list itself stays a plain array. */
const useTotals = create<Record<string, number>>(() => ({}));

/** What the filters need of a request: a list and a count narrow the same way. */
type Narrowable<T> = {
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  eq(column: string, value: string): T;
  is(column: string, value: null): T;
  or(filters: string): T;
};

function narrowed<T extends Narrowable<T>>(request: T, filter: ErrandFilter, text: string): T {
  const { gte, lt } = rangeBounds(filter.range);
  let next = request;
  if (gte) next = next.gte("created_at", gte);
  if (lt) next = next.lt("created_at", lt);
  if (filter.claimed === "nobody") next = next.is("claimed_by", null);
  else if (filter.claimed) next = next.eq("claimed_by", filter.claimed);
  if (text) next = next.or(ilikeAny(WORD_COLUMNS, phrasePattern(text)));
  return next;
}

async function fetchErrandPage(
  filter: ErrandFilter,
  status: ClosedErrandStatus | null,
  text: string,
  offset: number,
  signal?: AbortSignal,
): Promise<{ rows: Errand[]; total: number }> {
  const supabase = createBrowserSupabase();
  const asked = supabase
    .from("errands")
    .select(SELECT, { count: "exact" })
    .in("status", status ? [status] : [...CLOSED_ERRANDS]);
  let ordered = narrowed(asked, filter, text)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + ERRAND_PAGE - 1);
  if (signal) ordered = ordered.abortSignal(signal);
  const { data, count, error } = await ordered;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as Errand[], total: count ?? 0 };
}

/**
 * Closed requests by the server: a range of days, the words of the request, a state, who took it —
 * all of it, not the thirty days `useErrandHistory` holds for the hero and the numbers. RLS is
 * `errands_select`: the company's, and within it the author, the director and every secretary.
 * The list stays a plain array under the root, so «Отменить» and every invalidate reach it;
 * «Показать ещё» asks for the next page alone, an event for the first page alone.
 */
export function useErrandArchive(filter: ErrandFilter, status: ClosedErrandStatus | null, enabled = true) {
  const queryClient = useQueryClient();
  const settled = useDebounced(filter.text, SEARCH_PAUSE_MS);
  const text = searchWords(settled).length > 0 ? settled : "";
  const name = JSON.stringify([filter.range, filter.claimed, status, text]);
  const queryKey = errandKeys.archive(name);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey,
    enabled,
    meta: { keep: false },
    placeholderData: keepPreviousData,
    refetchOnReconnect: false,
    queryFn: async ({ signal }): Promise<Errand[]> => {
      const { rows, total } = await fetchErrandPage(filter, status, text, 0, signal);
      useTotals.setState({ [name]: total });
      return foldFirstPage(rows, queryClient.getQueryData<Errand[]>(queryKey) ?? NO_ERRANDS, ERRAND_PAGE, (row) => row.created_at);
    },
  });
  useRealtimeInvalidate({ table: "errands" }, queryKey, enabled);
  const total = useTotals((state) => state[name]);

  const more = async () => {
    const held = queryClient.getQueryData<Errand[]>(queryKey) ?? NO_ERRANDS;
    setLoadingMore(true);
    try {
      const page = await fetchErrandPage(filter, status, text, held.length);
      useTotals.setState({ [name]: page.total });
      queryClient.setQueryData<Errand[]>(queryKey, (now) => appendPage(now ?? held, page.rows));
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    query,
    rows: query.data ?? NO_ERRANDS,
    total: query.isPlaceholderData ? null : (total ?? null),
    /** The answer for these filters is still on its way: an empty list says nothing yet. */
    busy: enabled && (settled !== filter.text || (query.isFetching && (query.isPending || query.isPlaceholderData))),
    more,
    loadingMore,
  };
}

/** The same request in any list a screen holds: a row opened from a list paints at once. */
function findCachedErrand(client: QueryClient, id: string): Errand | undefined {
  for (const [, data] of client.getQueriesData<unknown>({ queryKey: errandKeys.root })) {
    if (!Array.isArray(data)) continue;
    const hit = (data as Errand[]).find((row) => row?.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** One request, whatever its age: the panel opened from history or from a push. Kept as a list, as `paint` expects. */
export function useErrand(id: string | null, enabled = true) {
  const client = useQueryClient();
  const live = enabled && Boolean(id);
  const query = useRealtimeQuery<Errand[], ErrandRow>({
    queryKey: errandKeys.one(id ?? ""),
    enabled: live,
    channel: { table: "errands", filter: id ? `id=eq.${id}` : undefined },
    placeholderData: () => {
      const hit = id ? findCachedErrand(client, id) : undefined;
      return hit ? [hit] : undefined;
    },
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("errands")
        .select(SELECT)
        .eq("id", id as string);
      if (error) throw new Error(error.message);
      return (data ?? []) as Errand[];
    },
  });
  return { errand: live ? query.data?.[0] : undefined, isLoading: live && query.isPending };
}

/**
 * Каталог кнопок компании (V-02: конфигурация, а не код). Спрашивают его только директор и
 * секретарь — им /api/settings отдаёт настройки уже разобранными.
 */
type SecretarySetup = { escalateAfterMin: number; window: { from: string; to: string }; securityPhone: string };

// One read of the company settings for the whole app, parsed on the server (/api/settings, the
// director and the secretary — the only ones who ask). Parsing here needed the zod schema, and
// zod reached the browser with all of its locales: ~84 KB gz on every director's Пульс (D-126).
const actionsOf = (settings: CompanySettings): SecretaryAction[] => settings.secretary.actions;
const setupOf = (settings: CompanySettings): SecretarySetup => ({
  escalateAfterMin: settings.secretary.escalate_after_min,
  window: settings.delivery_window,
  securityPhone: settings.secretary.security_phone,
});

export function useSecretaryActions(enabled = true) {
  return useQuery({ queryKey: settingsKey, queryFn: fetchSettings, enabled, select: actionsOf });
}

/**
 * Что нужно лицу секретаря кроме каталога (D-97): когда уходит повторный пуш — с этого
 * момента лицо бежит на месте, — и окно доставки компании: вне его за столом ночь.
 */
export function useSecretarySetup(enabled = true) {
  return useQuery({ queryKey: settingsKey, queryFn: fetchSettings, enabled, staleTime: 5 * 60_000, select: setupOf });
}

export type SecretaryPerson = { id: string; full_name: string; away_until: string | null };

export const secretaryKeys = { all: ["secretaries"] as const };

/**
 * Секретари компании и кто из них отошёл (D-99): стол директора показывает пустой стул,
 * карточка — кто на месте. Живьём: «не на месте» / «на месте» приходит по Realtime на
 * строки профилей секретарей (миграция 20260923235500), без перезагрузки экрана.
 */
export function useSecretaries(enabled = true) {
  return useRealtimeQuery<SecretaryPerson[], Database["public"]["Tables"]["profiles"]["Row"]>({
    queryKey: secretaryKeys.all,
    enabled,
    channel: { table: "profiles", filter: "role=eq.secretary" },
    queryFn: async (): Promise<SecretaryPerson[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, away_until")
        .eq("role", "secretary")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Состояние заявки одним словом — `/secretary` и десктоп (D-153) говорят одинаково. */
export const ERRAND_STATUS_WORD: Record<ErrandStatus, string> = {
  sent: "ждёт",
  accepted: "в работе",
  done: "готово",
  declined: "не смогли",
  cancelled: "отменена",
};

/** Сколько заявок ждут ответа: столько и стоит в шарике. */
export function activeCount(rows: readonly Errand[] | undefined): number {
  return (rows ?? []).filter(isActive).length;
}

/** Тон шарика: серый пока никто не взялся, «ок» — когда взялись (D-79). */
export function ballTone(rows: readonly Errand[] | undefined): string {
  const active = (rows ?? []).filter(isActive);
  if (active.length === 0) return "var(--text-muted)";
  return active.some((e) => e.status === "accepted") ? "var(--ok)" : "var(--text-muted)";
}

/**
 * Квитанция заявки (принцип 8, D-32): строка outbox, которую триггер поставил в
 * очередь секретарю. Фильтр по jsonb — только в запросе (фильтра по meta у Realtime нет);
 * сокет слушает только строки заявок, а не каждую доставку компании (D-126), и он один
 * на все открытые квитанции.
 */
export function useErrandReceipt(errandId: string | null, enabled = true) {
  return useRealtimeQuery<DeliveryRow | null, DeliveryRow>({
    queryKey: ["errand-receipt", errandId ?? ""],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select("*")
        .eq("event_kind", "errand_sent")
        .filter("meta->>errand_id", "eq", errandId as string)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return (data?.[0] ?? null) as DeliveryRow | null;
    },
    channel: { table: "notification_deliveries", filter: "event_kind=eq.errand_sent" },
    enabled: enabled && Boolean(errandId),
  });
}

/** «2 мин» — сколько заявка уже ждёт; секунды директору не нужны. */
export function waitedFor(errand: Pick<Errand, "created_at">, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(errand.created_at).getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч`;
}
