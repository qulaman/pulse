"use client";

import { useQuery } from "@tanstack/react-query";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { parseCompanySettings, type SecretaryAction } from "@/lib/settings";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

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

/**
 * Каталог кнопок компании. Читается из `companies.settings` напрямую: RLS отдаёт
 * настройки любому своему, а /api/settings — только директору (V-02: конфигурация,
 * а не код).
 */
export function useSecretaryActions(enabled = true) {
  return useQuery({
    queryKey: ["company", "secretary"],
    enabled,
    queryFn: async (): Promise<SecretaryAction[]> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return parseCompanySettings(data?.settings).secretary.actions;
    },
  });
}

/**
 * Что нужно лицу секретаря кроме каталога (D-97): когда уходит повторный пуш — с этого
 * момента лицо бежит на месте, — и окно доставки компании: вне его за столом ночь.
 */
export function useSecretarySetup(enabled = true) {
  return useQuery({
    queryKey: ["company", "secretary-setup"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ escalateAfterMin: number; window: { from: string; to: string }; securityPhone: string }> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("companies").select("settings").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      const settings = parseCompanySettings(data?.settings);
      return {
        escalateAfterMin: settings.secretary.escalate_after_min,
        window: settings.delivery_window,
        securityPhone: settings.secretary.security_phone,
      };
    },
  });
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
 * очередь секретарю. Фильтр по jsonb — только в запросе; сокет слушает таблицу целиком
 * (одна тема на приложение, фильтра по meta у Realtime нет).
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
    channel: { table: "notification_deliveries" },
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
