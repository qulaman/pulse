"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { calendarKeys, type CalendarEvent } from "./queries";

/**
 * What a meeting can be told (D-78). The two RPCs are absolute commands — the answer of
 * one person, the guest list of one meeting — so they carry no `client_request_id`: a
 * repeat writes the same state (the same exception as D-76 §3). Moving and cancelling are
 * plain updates under the director's RLS.
 */

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

type Cache = CalendarEvent[] | undefined;

function patchEvent(
  queryClient: QueryClient,
  id: string,
  change: (event: CalendarEvent) => CalendarEvent,
): Cache {
  const key = calendarKeys.list();
  const before = queryClient.getQueryData<CalendarEvent[]>(key);
  queryClient.setQueryData<CalendarEvent[]>(key, (rows) =>
    (rows ?? []).map((event) => (event.id === id ? change(event) : event)),
  );
  return before;
}

function restore(queryClient: QueryClient, snapshot: Cache) {
  if (snapshot) queryClient.setQueryData<CalendarEvent[]>(calendarKeys.list(), snapshot);
}

function fail(queryClient: QueryClient, snapshot: Cache) {
  restore(queryClient, snapshot);
  toast(GENERIC_ERROR);
}

/** «Буду» / «Не смогу» — the two buttons of a participant. */
export function useRespondEvent(meId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      status,
      reason,
    }: {
      eventId: string;
      status: "going" | "declined";
      reason?: string | null;
    }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("respond_event", {
        p_event: eventId,
        p_status: status,
        p_reason: reason ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: ({ eventId, status, reason }) => {
      const snapshot = patchEvent(queryClient, eventId, (event) => ({
        ...event,
        participants: event.participants.map((person) =>
          person.user_id === meId
            ? { ...person, status, reason: status === "declined" ? (reason ?? null) : null }
            : person,
        ),
      }));
      return { snapshot };
    },
    onError: (_error, _vars, context) => fail(queryClient, context?.snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}

/** The guest list, rewritten by the director: the difference, not the whole list. */
export function useSetParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, add, remove }: { eventId: string; add: string[]; remove: string[] }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("set_event_participants", {
        p_event: eventId,
        p_add: add,
        p_remove: remove,
      });
      if (error) throw new Error(error.message);
    },
    onError: () => toast(GENERIC_ERROR),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}

type EventFields = Partial<
  Pick<CalendarEvent, "title" | "starts_at" | "location" | "body" | "remind_before_min">
>;

/** Moving a meeting, renaming it, changing the place — the director's own row (RLS). */
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, fields }: { eventId: string; fields: EventFields }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("events").update(fields).eq("id", eventId);
      if (error) throw new Error(error.message);
    },
    onMutate: ({ eventId, fields }) => ({
      snapshot: patchEvent(queryClient, eventId, (event) => ({ ...event, ...fields })),
    }),
    onError: (_error, _vars, context) => fail(queryClient, context?.snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}

/** Calling it off: the row leaves the calendar at once, and the notices are already out. */
export function useCancelEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase
        .from("events")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", eventId);
      if (error) throw new Error(error.message);
    },
    onMutate: ({ eventId }) => {
      const key = calendarKeys.list();
      const before = queryClient.getQueryData<CalendarEvent[]>(key);
      queryClient.setQueryData<CalendarEvent[]>(key, (rows) => (rows ?? []).filter((e) => e.id !== eventId));
      return { snapshot: before };
    },
    // no «Отменить» on this toast: the notices have already gone out to everybody
    onSuccess: () => toast("Отменил мероприятие"),
    onError: (_error, _vars, context) => fail(queryClient, context?.snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}
