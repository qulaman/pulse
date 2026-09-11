"use client";

import { onlineManager, useMutationState } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// the same switch that pauses and resumes mutations — the line never disagrees with the queue
const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const online = () => onlineManager.isOnline();

/**
 * A thin line at the top while the phone has no network: the assistant's own words
 * (docs/DESIGN.md §4 «Оффлайн»), no red, no exclamation. Layout stays put — the line
 * overlays the header instead of pushing it.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, online, () => true);
  // taps made without network wait in the mutation cache (QueryProvider, networkMode offlineFirst)
  const paused = useMutationState({ filters: { status: "pending" }, select: (m) => m.state.isPaused }).filter(Boolean).length;
  if (isOnline && paused === 0) return null;
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
