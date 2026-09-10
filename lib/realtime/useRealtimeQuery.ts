"use client";

import { useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import { createBrowserSupabase } from "@/lib/supabase/client";

export { lastSeqOf, mergeBySeq, type SeqRow } from "./mergeBySeq";

/**
 * The single way to subscribe to Realtime (docs/FRONTEND.md "State management").
 * Two jobs beyond useQuery:
 *   - postgres_changes events feed the Query cache through `onEvent`;
 *   - the WebSocket of a backgrounded PWA dies silently, so `visibilitychange`
 *     and `online` tear the channel down, resubscribe and take a fresh snapshot.
 * Whatever the socket missed during the gap is caught by that snapshot — for
 * seq-carrying tables the snapshot is a cursor read — see ./mergeBySeq.
 */

/** Delay of the post-subscribe snapshot; the WAL listener attaches within this window. */
const SETTLE_MS = 2500;

export type RealtimeEvent<TRow extends Record<string, unknown>> =
  RealtimePostgresChangesPayload<TRow>;

export type ChannelSpec = {
  table: string;
  /** PostgREST-style filter, e.g. `assignee_id=eq.<uuid>`. */
  filter?: string;
};

/**
 * Subscription lifecycle on its own: subscribe, resubscribe after a gap, tear
 * down on unmount. `onResync` runs after every resubscribe — that is where the
 * snapshot refetch belongs.
 */
function useRealtimeChannel<TRow extends Record<string, unknown>>(
  { table, filter }: ChannelSpec,
  onEvent: (payload: RealtimeEvent<TRow>) => void,
  onResync: () => void,
  enabled: boolean,
  channelKey: string,
) {
  // Latest-callback refs: the handlers are inline closures, and re-subscribing
  // on every render would drop events. Assigned in an effect, never in render.
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onEventRef.current = onEvent;
    onResyncRef.current = onResync;
  });

  useEffect(() => {
    if (!enabled) return;

    const supabase = createBrowserSupabase();
    let active: RealtimeChannel | null = null;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = () => {
      active = supabase
        .channel(`rtq:${table}:${filter ?? "all"}:${channelKey}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
          (payload) => onEventRef.current(payload as RealtimeEvent<TRow>),
        )
        .subscribe((status) => {
          // SUBSCRIBED confirms the channel join, not the WAL listener: a change made
          // in the next ~1–2 s is never delivered (measured by scripts/smoke-realtime.ts).
          // One late snapshot closes that gap after every (re)subscribe.
          if (status !== "SUBSCRIBED") return;
          if (settleTimer !== null) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => onResyncRef.current(), SETTLE_MS);
        });
    };

    const resync = () => {
      if (active) void supabase.removeChannel(active);
      subscribe();
      onResyncRef.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };

    subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", resync);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", resync);
      if (settleTimer !== null) clearTimeout(settleTimer);
      if (active) void supabase.removeChannel(active);
    };
  }, [enabled, table, filter, channelKey]);
}

export type UseRealtimeQueryOptions<TData, TRow extends Record<string, unknown>> = {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  channel: ChannelSpec;
  /** Default without a handler: invalidate the query. */
  onEvent?: (payload: RealtimeEvent<TRow>, queryClient: QueryClient) => void;
  enabled?: boolean;
};

export function useRealtimeQuery<
  TData,
  TRow extends Record<string, unknown> = Record<string, unknown>,
>(options: UseRealtimeQueryOptions<TData, TRow>) {
  const { queryKey, queryFn, channel, onEvent, enabled = true } = options;
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey, queryFn, enabled });
  const { refetch } = query;
  const channelKey = JSON.stringify(queryKey);

  useRealtimeChannel<TRow>(
    channel,
    (payload) => {
      if (onEvent) onEvent(payload, queryClient);
      else void queryClient.invalidateQueries({ queryKey });
    },
    () => {
      void refetch();
    },
    enabled,
    channelKey,
  );

  return query;
}

/**
 * A channel without a query of its own: a table whose changes invalidate someone
 * else's data. The director's inbox needs it — an open question is a
 * `task_messages` insert, invisible to the `tasks` channel.
 */
export function useRealtimeInvalidate(
  channel: ChannelSpec,
  queryKey: QueryKey,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  useRealtimeChannel(channel, invalidate, invalidate, enabled, `inv:${JSON.stringify(queryKey)}`);
}
