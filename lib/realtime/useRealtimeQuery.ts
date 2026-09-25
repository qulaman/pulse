"use client";

import { useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
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
  /**
   * Which changes to take (default all). Realtime never delivers DELETE to a filtered channel —
   * the old row carries its primary key alone, there is nothing to filter by — so a list that
   * listens with a filter needs a second, unfiltered channel for DELETE only.
   */
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
};

type Listener<TRow extends Record<string, unknown>> = {
  onEvent: (payload: RealtimeEvent<TRow>) => void;
  onResync: () => void;
};

type Entry = {
  listeners: Set<Listener<Record<string, unknown>>>;
  teardown: () => void;
};

/**
 * One Supabase channel per topic, shared by every mounted hook that asks for it: the
 * screen and the tab bar reading the same key cost one socket join, one settle snapshot
 * and one resubscribe on foreground. The first mount creates the channel, later mounts
 * attach a listener, the last unmount removes it (supabase-js refuses new callbacks on a
 * channel that has already subscribed, so sharing has to happen here, not per hook).
 */
const registry = new Map<string, Entry>();

function acquire<TRow extends Record<string, unknown>>(
  topic: string,
  { table, filter, event = "*" }: ChannelSpec,
  listener: Listener<TRow>,
): () => void {
  let entry = registry.get(topic);
  if (!entry) {
    const supabase = createBrowserSupabase();
    const listeners = new Set<Listener<Record<string, unknown>>>();
    let active: RealtimeChannel | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    let generation = 0;
    let torn = false;

    const subscribe = () => {
      const mine = ++generation;
      // The join must carry the user's token: on a hard load the session is still being
      // read from the cookie when the first hook mounts, the channel joined as anon, RLS
      // let nothing through, and the board only ever learned of changes from snapshots
      // (found by scripts/smoke-board.ts). Read the session first, hand the token to the
      // socket, then join — a resubscribe does the same, so a refreshed token is used too.
      void supabase.auth.getSession().then(async ({ data }) => {
        if (torn || mine !== generation) return;
        await supabase.realtime.setAuth(data.session?.access_token);
        if (torn || mine !== generation) return;
        active = supabase
          .channel(topic)
          .on(
            "postgres_changes",
            // the overloads of `.on` want a literal event; the value is one of the four they take
            { event: event as "*", schema: "public", table, ...(filter ? { filter } : {}) },
            (payload) => {
              for (const l of listeners) l.onEvent(payload as RealtimeEvent<Record<string, unknown>>);
            },
          )
          .subscribe((status) => {
            // SUBSCRIBED confirms the channel join, not the WAL listener: a change made
            // in the next ~1–2 s is never delivered (measured by scripts/smoke-realtime.ts).
            // One late snapshot closes that gap after every (re)subscribe.
            if (status !== "SUBSCRIBED") return;
            if (settleTimer !== null) clearTimeout(settleTimer);
            settleTimer = setTimeout(() => {
              for (const l of listeners) l.onResync();
            }, SETTLE_MS);
          });
      });
    };

    const resync = () => {
      if (active) void supabase.removeChannel(active);
      active = null;
      subscribe();
      for (const l of listeners) l.onResync();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") resync();
    };

    subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", resync);

    entry = {
      listeners,
      teardown: () => {
        torn = true;
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("online", resync);
        if (settleTimer !== null) clearTimeout(settleTimer);
        if (active) void supabase.removeChannel(active);
      },
    };
    registry.set(topic, entry);
  }

  const shared = listener as unknown as Listener<Record<string, unknown>>;
  entry.listeners.add(shared);
  return () => {
    const current = registry.get(topic);
    if (!current) return;
    current.listeners.delete(shared);
    if (current.listeners.size === 0) {
      current.teardown();
      registry.delete(topic);
    }
  };
}

/**
 * Subscription lifecycle for one hook: attach to the shared channel of the topic,
 * detach on unmount. `onResync` runs after every resubscribe — that is where the
 * snapshot refetch belongs.
 */
function useRealtimeChannel<TRow extends Record<string, unknown>>(
  spec: ChannelSpec,
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

  const { table, filter, event } = spec;
  useEffect(() => {
    if (!enabled) return;
    const topic = `rtq:${table}:${filter ?? "all"}:${event ?? "*"}:${channelKey}`;
    return acquire<TRow>(
      topic,
      { table, filter, event },
      { onEvent: (payload) => onEventRef.current(payload), onResync: () => onResyncRef.current() },
    );
  }, [enabled, table, filter, event, channelKey]);
}

export type UseRealtimeQueryOptions<TData, TRow extends Record<string, unknown>> = {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  channel: ChannelSpec;
  /** Default without a handler: invalidate the query. */
  onEvent?: (payload: RealtimeEvent<TRow>, queryClient: QueryClient) => void;
  enabled?: boolean;
  /** Shown until the first fetch lands (never cached) — e.g. a row already known from a list. */
  placeholderData?: UseQueryOptions<TData, Error, TData, QueryKey>["placeholderData"];
};

export function useRealtimeQuery<
  TData,
  TRow extends Record<string, unknown> = Record<string, unknown>,
>(options: UseRealtimeQueryOptions<TData, TRow>) {
  const { queryKey, queryFn, channel, onEvent, enabled = true, placeholderData } = options;
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey, queryFn, enabled, placeholderData });
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
 * A channel without a query of its own, with the payload in hand: a table whose rows
 * patch someone else's cache. The live board needs it — an employee's question is a
 * `task_messages` insert that lands on a `tasks` row.
 */
export function useRealtimeListener<TRow extends Record<string, unknown>>(
  channel: ChannelSpec,
  onEvent: (payload: RealtimeEvent<TRow>) => void,
  onResync: () => void,
  key: string,
  enabled = true,
) {
  useRealtimeChannel<TRow>(channel, onEvent, onResync, enabled, `listen:${key}`);
}

/**
 * A channel without a query of its own: a table whose changes invalidate someone
 * else's data.
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
