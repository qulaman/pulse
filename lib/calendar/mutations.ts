"use client";

import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { voiceApi, VoiceApiError } from "@/lib/voice/api";
import { calendarKeys, type CalendarEvent } from "./queries";

/**
 * What a meeting can be told (D-78, D-94). Every command here is absolute — the answer of
 * one person, the whole form of one meeting, «its row is gone» — so a repeat writes the
 * same state and none carries a `client_request_id` (the exception of D-76 §3). Creation
 * is the one exception to the exception: it goes through the voice pipeline's own
 * `confirm_voice_batch`, which is idempotent by the id the form was opened with.
 */

const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

/** Every calendar the screen may hold — Пульс's ribbon, the months of /calendar, one event. */
type Snapshot = [QueryKey, unknown][];

function patchEverywhere(
  queryClient: QueryClient,
  id: string,
  change: (event: CalendarEvent) => CalendarEvent | null,
): Snapshot {
  const snapshot = queryClient.getQueriesData({ queryKey: calendarKeys.root });
  queryClient.setQueriesData<unknown>({ queryKey: calendarKeys.root }, (data: unknown) => {
    if (Array.isArray(data)) {
      return (data as CalendarEvent[]).flatMap((event) => {
        if (event.id !== id) return [event];
        const next = change(event);
        return next ? [next] : [];
      });
    }
    if (data && (data as CalendarEvent).id === id) return change(data as CalendarEvent);
    return data;
  });
  return snapshot;
}

function restore(queryClient: QueryClient, snapshot: Snapshot | undefined) {
  for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
}

function fail(queryClient: QueryClient, snapshot: Snapshot | undefined) {
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
      const snapshot = patchEverywhere(queryClient, eventId, (event) => ({
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

/** Everything the form holds: the meeting's own fields and who is invited. */
export type EventDraft = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  body: string | null;
  remind_before_min: number;
  everyone: boolean;
  /** Without the author — the author is always in, the server keeps them. */
  participant_ids: string[];
};

/** What the server says no to, in words — the form stays open with the text still in it. */
function editError(message: string): string {
  if (message.includes("event_end_before_start")) return "Конец раньше начала";
  if (message.includes("event_title_required")) return "Без названия не сохранить";
  if (message.includes("event_not_found")) return "Этого мероприятия уже нет";
  if (message.includes("forbidden")) return "Нет доступа";
  return GENERIC_ERROR;
}

/**
 * «Сохранить» in the form (D-94): one RPC for the fields and the guest list, so a lost
 * network never leaves a meeting half-edited. The card under the form changes at once;
 * the server's answer settles who got invited.
 */
export function useEditEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, draft }: { eventId: string; draft: EventDraft }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("edit_event", {
        p_event: eventId,
        p_title: draft.title,
        p_starts_at: draft.starts_at,
        p_ends_at: draft.ends_at ?? undefined,
        p_location: draft.location ?? undefined,
        p_body: draft.body ?? undefined,
        p_remind_before_min: draft.remind_before_min,
        p_everyone: draft.everyone,
        p_participant_ids: draft.participant_ids,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: ({ eventId, draft }) => ({
      snapshot: patchEverywhere(queryClient, eventId, (event) => ({
        ...event,
        title: draft.title,
        starts_at: draft.starts_at,
        ends_at: draft.ends_at,
        location: draft.location,
        body: draft.body,
        remind_before_min: draft.remind_before_min,
        everyone: draft.everyone,
      })),
    }),
    onSuccess: () => toast("Сохранил"),
    onError: (error, _vars, context) => {
      restore(queryClient, context?.snapshot);
      toast(editError(error.message));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}

/** «Удалить» (D-94): the row leaves every calendar at once; the server tells the invited. */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.rpc("delete_event", { p_event: eventId });
      if (error) throw new Error(error.message);
    },
    onMutate: ({ eventId }) => ({ snapshot: patchEverywhere(queryClient, eventId, () => null) }),
    // no «Вернуть» on this toast: the notices of the cancellation are already queued
    onSuccess: () => toast("Удалил мероприятие"),
    onError: (_error, _vars, context) => fail(queryClient, context?.snapshot),
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}

/**
 * «+» on /calendar (D-94): the form's meeting goes through the same confirm route as a
 * spoken one — one writer of `events`, the same invitations, the same idempotency by the
 * `requestId` the form was opened with, so a double tap or a retry creates one meeting.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, draft }: { requestId: string; draft: EventDraft }): Promise<string | null> => {
      const response = await voiceApi.confirm({
        client_request_id: requestId,
        source: "typed",
        audio_path: null,
        transcript: draft.title,
        // nothing was parsed: the director typed every field by hand
        parsed_entities: [],
        confirmed_entities: [
          {
            kind: "event",
            title: draft.title,
            body: draft.body,
            location: draft.location,
            starts_at_iso: draft.starts_at,
            ends_at_iso: draft.ends_at,
            time_confidence: 1,
            time_source_text: null,
            participant_queries: [],
            participant_names: [],
            participant_ids: draft.participant_ids,
            everyone: draft.everyone,
            remind_before_min: draft.remind_before_min,
            source_span: draft.title,
          },
        ],
      });
      // the new meeting's id, so the screen can open its card
      const ids = response.result.event_ids;
      return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
    },
    onSuccess: () => toast("Мероприятие в календаре"),
    onError: (error) => {
      const body = error instanceof VoiceApiError ? (error.body as { error?: { message_ru?: string } } | null) : null;
      toast(body?.error?.message_ru ?? GENERIC_ERROR);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: calendarKeys.root }),
  });
}
