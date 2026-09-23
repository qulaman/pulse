"use client";

import { keepPreviousData } from "@tanstack/react-query";

import type { Month } from "@/lib/datetime/calendar";
import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

import { monthWindow } from "./agenda";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type ParticipantRow = Database["public"]["Tables"]["event_participants"]["Row"];

export type CalendarEvent = EventRow & {
  participants: (ParticipantRow & { person: { full_name: string } | null })[];
};

export const calendarKeys = {
  root: ["calendar"] as const,
  list: () => ["calendar", "list"] as const,
  month: ({ year, month }: Month) => ["calendar", "month", year, month] as const,
  one: (id: string) => ["calendar", "event", id] as const,
};

/** Что видят Пульс и Лента: со вчерашнего дня и на месяц вперёд (D-78). */
const BACK_MS = 24 * 60 * 60 * 1000;
const AHEAD_MS = 30 * BACK_MS;

const SELECT =
  "*, participants:event_participants(*, person:profiles!event_participants_user_id_fkey(full_name))";

async function fetchWindow(from: string, to: string): Promise<CalendarEvent[]> {
  const supabase = createBrowserSupabase();
  // no user filter: RLS already leaves everyone only their own meetings (the director — all)
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .is("cancelled_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarEvent[];
}

function fetchCalendar(): Promise<CalendarEvent[]> {
  const now = Date.now();
  return fetchWindow(new Date(now - BACK_MS).toISOString(), new Date(now + AHEAD_MS).toISOString());
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

/**
 * One month of /calendar (D-94) — the month and the one after it, for the ribbon under
 * the grid. The previous month stays on screen while the next one loads, so the grid
 * never blinks empty between two taps on an arrow.
 */
export function useCalendarMonth(month: Month) {
  const key = calendarKeys.month(month);
  useRealtimeInvalidate({ table: "event_participants" }, key);
  return useRealtimeQuery<CalendarEvent[], EventRow>({
    queryKey: key,
    queryFn: () => {
      const { from, to } = monthWindow(month);
      return fetchWindow(from, to);
    },
    channel: { table: "events" },
    placeholderData: keepPreviousData,
  });
}

/**
 * One meeting by id — for a deep link from a push that points past the loaded window, or
 * for a meeting an edit has just carried out of it. `known` stands in while it loads, so an
 * open card never blinks shut between the month and the single fetch.
 */
export function useEvent(id: string | null, known?: CalendarEvent | null) {
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
    placeholderData: known && known.id === id ? known : undefined,
  });
}
