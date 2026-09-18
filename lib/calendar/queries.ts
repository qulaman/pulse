"use client";

import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type ParticipantRow = Database["public"]["Tables"]["event_participants"]["Row"];

export type CalendarEvent = EventRow & {
  participants: (ParticipantRow & { person: { full_name: string } | null })[];
};

export const calendarKeys = {
  root: ["calendar"] as const,
  list: () => ["calendar", "list"] as const,
  one: (id: string) => ["calendar", "event", id] as const,
};

/** Что видит календарь: со вчерашнего дня и на месяц вперёд — v1 без месячной сетки (D-78 §10). */
const BACK_MS = 24 * 60 * 60 * 1000;
const AHEAD_MS = 30 * BACK_MS;

const SELECT =
  "*, participants:event_participants(*, person:profiles!event_participants_user_id_fkey(full_name))";

async function fetchCalendar(): Promise<CalendarEvent[]> {
  const supabase = createBrowserSupabase();
  const now = Date.now();
  // no user filter: RLS already leaves everyone only their own meetings (the director — all)
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .is("cancelled_at", null)
    .gte("starts_at", new Date(now - BACK_MS).toISOString())
    .lt("starts_at", new Date(now + AHEAD_MS).toISOString())
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

/**
 * The company calendar, live. Two channels, because a meeting changes in two tables: the
 * row itself (moved, cancelled, reminded) and the guest list (invited, «буду», «не смогу»).
 * Both fall back to the default handler — an invalidate — since a participant event
 * carries no event row to patch in.
 */
export function useCalendar(enabled = true) {
  // the guest list is a table of its own, and it carries no event row to patch in
  useRealtimeInvalidate({ table: "event_participants" }, calendarKeys.list(), enabled);
  return useRealtimeQuery<CalendarEvent[], EventRow>({
    queryKey: calendarKeys.list(),
    queryFn: fetchCalendar,
    channel: { table: "events" },
    enabled,
  });
}

/** One meeting by id — for a deep link from a push that points past the loaded window. */
export function useEvent(id: string | null) {
  useRealtimeInvalidate({ table: "event_participants" }, calendarKeys.one(id ?? ""), Boolean(id));
  return useRealtimeQuery<CalendarEvent | null, EventRow>({
    queryKey: calendarKeys.one(id ?? ""),
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("events").select(SELECT).eq("id", id as string).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as CalendarEvent | null;
    },
    channel: { table: "events", filter: id ? `id=eq.${id}` : undefined },
    enabled: Boolean(id),
  });
}
