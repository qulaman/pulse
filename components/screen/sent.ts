"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { SHOWN_WITHIN_MS, type SentMark } from "@/lib/tv/remote";

/**
 * The last command this tab sent to the wall (D-182): the version `tv_control` returned and the
 * moment it came back. The receipt reads it to say «Экран не показал за 15 с» while the director
 * still holds the phone — the kiosk acks a live command within a second or two. A module store:
 * the phone's remote and the desk's «Экран» write it, the display reads it; the page reload
 * forgets it, and then the general «не отвечает с 9:14» is the receipt, as before.
 */

let mark: SentMark | null = null;
const listeners = new Set<() => void>();

export function markSent(version: number | null | undefined, at: number = Date.now()): void {
  if (typeof version !== "number") return;
  mark = { version, at };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The remote's clock and the sent mark. The clock ticks every ten seconds — «ещё N мин» melts by
 * itself — and once more right when a sent command turns fifteen seconds old, so the warning comes
 * on time. `frozen` (an ISO time) stops it for the sandbox.
 */
export function useRemoteClock(frozen?: string): { now: Date; sent: SentMark | null } {
  const sent = useSyncExternalStore(subscribe, () => mark, () => null);
  const [now, setNow] = useState(() => (frozen ? new Date(frozen) : new Date()));

  useEffect(() => {
    if (frozen) return;
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, [frozen]);

  useEffect(() => {
    if (frozen || !sent) return;
    const left = sent.at + SHOWN_WITHIN_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(new Date()), left + 50);
    return () => clearTimeout(timer);
  }, [frozen, sent]);

  return { now: frozen ? new Date(frozen) : now, sent };
}
