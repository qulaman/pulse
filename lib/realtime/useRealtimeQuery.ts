"use client";

import { useEffect, useRef } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type QueryMeta,
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
 *     and `online` tear the channel down, resubscribe and take a fresh snapshot
 *     (a return within QUICK_RETURN_MS to a still-joined socket keeps it as is).
 * Whatever the socket missed during the gap is caught by that snapshot — for
 * seq-carrying tables the snapshot is a cursor read — see ./mergeBySeq.
 * A channel the server drops (CHANNEL_ERROR, TIMED_OUT, CLOSED that we did not ask for) is
 * joined again after a growing pause (`retryDelayMs`): a screen that is never hidden and never
 * offline — the wall (D-182) — has no other moment to come back.
 */

/** Delay of the post-subscribe snapshot; the WAL listener attaches within this window. */
const SETTLE_MS = 2500;

/**
 * A channel outlives its last listener by this much (D-126): going from a list to a task and
 * back used to leave and rejoin every socket, each rejoin paying a settle snapshot.
 */
const LINGER_MS = 30_000;

/**
 * Back from the background sooner than this, with the socket still joined, nothing was missed:
 * no teardown, no snapshot (D-126). A longer stay may have killed the socket silently.
 */
const QUICK_RETURN_MS = 15_000;

/** The first pause before joining a dropped channel again; each next one doubles (D-182). */
const RETRY_FIRST_MS = 2_000;
/** The longest pause between two tries: a wall without a socket for a minute is caught by its snapshot. */
const RETRY_MAX_MS = 60_000;

/** Pause before the `attempt`-th rejoin (0-based): 2 s, 4 s, 8 s … never above a minute. */
export function retryDelayMs(attempt: number): number {
  const step = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  // 2^5 · 2 s already passes the ceiling: no larger powers, no overflow
  return Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** Math.min(step, 5));
}

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
  /** Pending teardown after the last listener left (LINGER_MS). */
  lingerTimer: ReturnType<typeof setTimeout> | null;
  /** Something arrived while nobody listened: the next listener must take a snapshot. */
  missed: boolean;
};

/**
 * One Supabase channel per table + filter + event, shared by every mounted hook that asks
 * for it, whatever its query: the board and the tab bar badge on the same rows, a feed and
 * its paired table — one socket join, one settle snapshot and one resubscribe on foreground
 * each (D-126; the topic used to carry the query key, so each query paid its own). The first
 * mount creates the channel, later mounts attach a listener, and the channel lingers a while
 * after the last one leaves (supabase-js refuses new callbacks on a channel that has already
 * subscribed, so sharing has to happen here, not per hook).
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
    let hiddenAt = 0;
    // rejoins in a row after the server dropped the channel; a join that holds resets it
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // listeners of the moment; with nobody there the change is remembered for the next one
    const deliver = (each: (l: Listener<Record<string, unknown>>) => void) => {
      if (listeners.size === 0) {
        created.missed = true;
        return;
      }
      for (const l of listeners) each(l);
    };

    // our own leave: the channel is forgotten first, so the CLOSED it answers with is not a drop
    const drop = () => {
      const channel = active;
      active = null;
      if (channel) void supabase.removeChannel(channel);
    };

    const subscribe = () => {
      const mine = ++generation;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      // The join must carry the user's token: on a hard load the session is still being
      // read from the cookie when the first hook mounts, the channel joined as anon, RLS
      // let nothing through, and the board only ever learned of changes from snapshots
      // (found by scripts/smoke-board.ts). Read the session first, hand the token to the
      // socket, then join — a resubscribe does the same, so a refreshed token is used too.
      void supabase.auth.getSession().then(async ({ data }) => {
        if (torn || mine !== generation) return;
        await supabase.realtime.setAuth(data.session?.access_token);
        if (torn || mine !== generation) return;
        // A name of its own per join: supabase-js hands back a channel of the same name that is
        // still leaving, and a subscribe on it never answers (D-182).
        const channel = supabase.channel(`${topic}:${mine}`);
        active = channel;
        channel
          .on(
            "postgres_changes",
            // the overloads of `.on` want a literal event; the value is one of the four they take
            { event: event as "*", schema: "public", table, ...(filter ? { filter } : {}) },
            (payload) => {
              deliver((l) => l.onEvent(payload as RealtimeEvent<Record<string, unknown>>));
            },
          )
          .subscribe((status) => {
            // a channel we left ourselves (resync, a rejoin, teardown) says nothing more
            if (torn || mine !== generation || channel !== active) return;
            if (status === "SUBSCRIBED") {
              attempt = 0;
              // supabase-js rejoined the errored channel by itself before our pause ran out
              if (retryTimer !== null) {
                clearTimeout(retryTimer);
                retryTimer = null;
              }
              // SUBSCRIBED confirms the channel join, not the WAL listener: a change made
              // in the next ~1–2 s is never delivered (measured by scripts/smoke-realtime.ts).
              // One late snapshot closes that gap after every (re)subscribe.
              if (settleTimer !== null) clearTimeout(settleTimer);
              settleTimer = setTimeout(() => {
                deliver((l) => l.onResync());
              }, SETTLE_MS);
              return;
            }
            // CHANNEL_ERROR, TIMED_OUT or CLOSED by the server: the screen stays put and never
            // fires visibilitychange or online, so the channel comes back by itself — after a
            // pause that grows, with a fresh token; the SUBSCRIBED of the new join takes the
            // snapshot of what was missed
            retryLater();
          });
      });
    };

    const retryLater = () => {
      if (retryTimer !== null) return;
      const delay = retryDelayMs(attempt);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (torn) return;
        drop();
        subscribe();
      }, delay);
    };

    const resync = () => {
      drop();
      subscribe();
      deliver((l) => l.onResync());
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        hiddenAt = Date.now();
        return;
      }
      // a glance at another app: the socket is still joined and nothing was lost (D-126)
      const quick = hiddenAt > 0 && Date.now() - hiddenAt < QUICK_RETURN_MS;
      if (quick && active?.state === "joined" && supabase.realtime.isConnected()) return;
      resync();
    };

    subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", resync);

    const created: Entry = {
      listeners,
      lingerTimer: null,
      missed: false,
      teardown: () => {
        torn = true;
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("online", resync);
        if (settleTimer !== null) clearTimeout(settleTimer);
        if (retryTimer !== null) clearTimeout(retryTimer);
        drop();
      },
    };
    entry = created;
    registry.set(topic, entry);
  }

  if (entry.lingerTimer !== null) {
    clearTimeout(entry.lingerTimer);
    entry.lingerTimer = null;
  }
  const shared = listener as unknown as Listener<Record<string, unknown>>;
  entry.listeners.add(shared);
  // the channel kept running while nobody listened and something came: this listener's
  // data may predate it
  if (entry.missed) {
    entry.missed = false;
    shared.onResync();
  }
  return () => {
    const current = registry.get(topic);
    if (!current) return;
    current.listeners.delete(shared);
    if (current.listeners.size > 0) return;
    current.lingerTimer = setTimeout(() => {
      if (current.listeners.size > 0) return;
      current.teardown();
      registry.delete(topic);
    }, LINGER_MS);
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
    const topic = `rtq:${table}:${filter ?? "all"}:${event ?? "*"}`;
    return acquire<TRow>(
      topic,
      { table, filter, event },
      { onEvent: (payload) => onEventRef.current(payload), onResync: () => onResyncRef.current() },
    );
  }, [enabled, table, filter, event]);
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
  /** A safety poll for a screen that must not trust the socket alone (the wall, D-182); off by default. */
  refetchInterval?: number;
  /** Passed to the query as is — e.g. `{ keep: false }` keeps it out of the offline snapshot (D-127). */
  meta?: QueryMeta;
};

export function useRealtimeQuery<
  TData,
  TRow extends Record<string, unknown> = Record<string, unknown>,
>(options: UseRealtimeQueryOptions<TData, TRow>) {
  const { queryKey, queryFn, channel, onEvent, enabled = true, placeholderData, refetchInterval, meta } = options;
  const queryClient = useQueryClient();

  // a reconnect is the channel's `online` resync below — TanStack's own would fetch again
  const query = useQuery({ queryKey, queryFn, enabled, placeholderData, refetchOnReconnect: false, refetchInterval, meta });
  const { refetch } = query;

  useRealtimeChannel<TRow>(
    channel,
    (payload) => {
      if (onEvent) onEvent(payload, queryClient);
      else void queryClient.invalidateQueries({ queryKey });
    },
    () => {
      // two channels of one query resync at the same moment (a feed and its paired table):
      // the second joins the fetch already on its way instead of cancelling it (D-126)
      void refetch({ cancelRefetch: false });
    },
    enabled,
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
  // names the listener at the call site; the socket is shared by table + filter + event
  _key: string,
  enabled = true,
) {
  useRealtimeChannel<TRow>(channel, onEvent, onResync, enabled);
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
  // a resync joins a fetch already on its way (D-126); a change always refetches anew
  const resync = () => {
    void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
  };

  useRealtimeChannel(channel, invalidate, resync, enabled);
}
