"use client";

import { onlineManager, useMutationState } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { isNetworkError } from "@/lib/net";

// the same switch that pauses and resumes mutations — the line never disagrees with the queue
const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const online = () => onlineManager.isOnline();

/** Only the network, as the mutation queue sees it. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, online, () => true);
}

/** The network and the taps waiting for it; while `shown`, the top line belongs to this banner. */
export function useSendQueue(): { isOnline: boolean; paused: number; shown: boolean } {
  const isOnline = useOnline();
  // taps made without network wait in the mutation cache (QueryProvider, networkMode offlineFirst)
  const paused = useMutationState({
    filters: { status: "pending" },
    select: (m) => m.state.isPaused || (m.state.failureCount > 0 && isNetworkError(m.state.failureReason)),
  }).filter(Boolean).length;
  return { isOnline, paused, shown: !isOnline || paused > 0 };
}

/**
 * A thin line at the top while the phone has no network: the assistant's own words
 * (docs/DESIGN.md §4 «Оффлайн»), no red, no exclamation. Layout stays put — the line
 * overlays the header instead of pushing it.
 */
export function OfflineBanner() {
  const { isOnline, paused, shown } = useSendQueue();
  if (!shown) return null;
  const queue = paused > 0 ? ` (${paused} в очереди)` : "";
  const text = isOnline ? `Отправляю${queue}` : `Нет связи. Отправлю, как появится${queue}`;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: "calc(6px + env(safe-area-inset-top))" }}
    >
      <p className="card-in rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] leading-4 text-muted" style={{ boxShadow: "var(--shadow-raised)" }}>
        {text}
      </p>
    </div>
  );
}
