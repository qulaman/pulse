"use client";

import { onlineManager } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/** While something waits on the phone, a quiet retry on this beat — `online` events lie on a captive network. */
export const REPLAY_BEAT_MS = 30_000;

export type ReplayRounds = {
  /** Whose rounds these are; falsy — nobody yet, no rounds. A new value starts over with a round at once. */
  on: unknown;
  beatMs?: number;
  /** More reasons for a round: subscribes `run` and returns the unsubscribe. Read when the rounds start. */
  extra?: (run: () => void) => () => void;
  /** A round asked for while one runs is skipped — for a round with no lock of its own. */
  exclusive?: boolean;
};

/**
 * The rhythm of every replay of what the phone keeps (D-130): a round at once, when the network
 * is back, when the app comes to the front, on a slow beat, and on `extra` — only while the
 * network is up. `alive()` turns false when the screen is gone: a round that ends after that
 * keeps quiet. The latest `round` is the one run.
 */
export function useReplayRounds(round: (alive: () => boolean) => unknown, options: ReplayRounds): void {
  const { on, beatMs = REPLAY_BEAT_MS, exclusive = false } = options;
  const latest = useRef({ round, extra: options.extra });
  useEffect(() => {
    latest.current = { round, extra: options.extra };
  });

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let running = false;
    const isAlive = () => alive;
    const run = async () => {
      if ((exclusive && running) || !onlineManager.isOnline()) return;
      running = true;
      try {
        await latest.current.round(isAlive);
      } finally {
        running = false;
      }
    };
    const kick = () => void run();
    kick();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) kick();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(kick, beatMs);
    const offExtra = latest.current.extra?.(kick);
    return () => {
      alive = false;
      offOnline();
      offExtra?.();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [on, beatMs, exclusive]);
}
