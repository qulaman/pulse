"use client";

import { useEffect, useMemo, useState } from "react";

import { useOnline } from "@/lib/useOnline";

import { overlayPending, waitingOf, type Overlaid, type Owed, type OverlayScope } from "./overlay";
import type { Note } from "./queries";

/** How often «stuck» is judged while something waits on this device. */
export const STUCK_TICK_MS = 5_000;

/**
 * The clock «ждёт связи» is judged on: refreshed every few seconds while something is owed — a
 * write stuck for 20 s says so within 25 s, not when the minute turns — and still when nothing is.
 */
export function useStuckClock(owing: boolean): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!owing) return;
    const timer = setInterval(() => setTick(Date.now()), STUCK_TICK_MS);
    return () => clearInterval(timer);
  }, [owing]);
  return tick;
}

export type PendingOverlay = Overlaid & {
  /** «ждёт связи»: owed with no network, or stuck for a while (`waitingOf`). */
  waiting: ReadonlySet<string>;
  online: boolean;
};

/**
 * The notes of a screen with what waits on this device (`usePendingNotes`) laid over them
 * (`overlayPending`) — the notes list and a board, phone and desk alike. `cached` and
 * `scope.extra` must keep their identity between renders (a constant for «nothing»): the overlay
 * is redone when they change, «ждёт связи» on its own clock.
 */
export function usePendingOverlay(pending: Owed, cached: readonly Note[], scope: OverlayScope = {}): PendingOverlay {
  const online = useOnline();
  const { extra, board } = scope;
  const overlay = useMemo(() => overlayPending(cached, pending, { extra, board }), [cached, pending, extra, board]);
  const now = useStuckClock(pending.creates.length + pending.edits.length > 0);
  const waiting = useMemo(() => waitingOf(pending, { online, now, board }), [pending, online, now, board]);
  return { ...overlay, waiting, online };
}
