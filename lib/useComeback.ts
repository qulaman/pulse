"use client";

import { useEffect, useState } from "react";

import { wakeDeepRest } from "@/lib/useDeepRest";

/** Away at least this long, the person comes back to news; a short switch to another app is not a return. */
export const COMEBACK_AWAY_MS = 120_000;
/** The face reads the news at least this long — shorter, the comet is a flicker — and at most this long. */
const READ_MIN_MS = 600;
const READ_MAX_MS = 1_000;

/**
 * The page back on the screen after a long time away (2026-11-26): for 0.6–1 s the face reads the news
 * («processing») while the board fetches again, then plays what the news brought or goes back to its
 * rest. true while it reads; `fetching` — the board's own refetch, which may end it after the shortest
 * read. Whatever sleeps on the page (lib/useDeepRest.ts) wakes as it does. One listener on
 * `visibilitychange`, timers only around a return — nothing per frame.
 */
export function useComeback(fetching: boolean, away: number = COMEBACK_AWAY_MS): boolean {
  const [reading, setReading] = useState(false);
  const [readEnough, setReadEnough] = useState(false);
  useEffect(() => {
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const since = hiddenAt;
      hiddenAt = null;
      if (since === null || Date.now() - since < away) return;
      for (const timer of timers) clearTimeout(timer);
      setReading(true);
      setReadEnough(false);
      wakeDeepRest();
      timers = [setTimeout(() => setReadEnough(true), READ_MIN_MS), setTimeout(() => setReading(false), READ_MAX_MS)];
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [away]);
  // read enough and the board is in: over for good — a later refetch does not bring the comet back
  // (adjusted during render, not in an effect: the face changes in the same paint)
  if (reading && readEnough && !fetching) setReading(false);
  return reading && !(readEnough && !fetching);
}
