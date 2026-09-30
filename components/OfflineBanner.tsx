"use client";

import { onlineManager, useMutationState, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { humanAqtobe } from "@/lib/ai/time";
import { isNetworkError } from "@/lib/net";
import { latestFetch } from "@/lib/offline/persist";
import { outboxSize, subscribeOutbox } from "@/lib/outbox";
import { countMedia, subscribeMedia } from "@/lib/media/pending";
import { countOnTheirWay, subscribeKept } from "@/lib/voice/kept";

// the same switch that pauses and resumes mutations — the line never disagrees with the queue
const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const online = () => onlineManager.isOnline();

/** Only the network, as the mutation queue sees it. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, online, () => true);
}

/** When the data on the screens was last fetched — live: the phone's copy comes back after the first paint (D-127). */
function useLatestFetch(): number | null {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onChange) => queryClient.getQueryCache().subscribe(onChange),
    () => latestFetch(queryClient),
    () => null,
  );
}

/**
 * What waits for the network outside the mutation cache (D-130): the outbox a closed session
 * left, the director's phrases the phone keeps, and the files of threads.
 */
function useWaitingOnPhone(): { outbox: number; phrases: number } {
  const [counts, setCounts] = useState({ outbox: 0, phrases: 0 });
  useEffect(() => {
    let alive = true;
    const read = async () => {
      // the director's phrases and the files of threads (voice, photos, a report with a photo)
      const [phrases, media] = await Promise.all([countOnTheirWay(), countMedia()]);
      if (alive) setCounts({ outbox: outboxSize(), phrases: phrases + media });
    };
    void read();
    const offOutbox = subscribeOutbox(() => void read());
    const offKept = subscribeKept(() => void read());
    const offMedia = subscribeMedia(() => void read());
    return () => {
      alive = false;
      offOutbox();
      offKept();
      offMedia();
    };
  }, []);
  return counts;
}

/** The network and the taps waiting for it; while `shown`, the top line belongs to this banner. */
export function useSendQueue(): { isOnline: boolean; paused: number; shown: boolean } {
  const isOnline = useOnline();
  // taps made without network wait in the mutation cache (QueryProvider, networkMode offlineFirst)
  const inMemory = useMutationState({
    filters: { status: "pending" },
    select: (m) => m.state.isPaused || (m.state.failureCount > 0 && isNetworkError(m.state.failureReason)),
  }).filter(Boolean).length;
  // a paused tap is in the outbox too: the larger of the two, not their sum
  const onPhone = useWaitingOnPhone();
  const paused = Math.max(inMemory, onPhone.outbox) + onPhone.phrases;
  return { isOnline, paused, shown: !isOnline || paused > 0 };
}

/**
 * A thin line at the top while the phone has no network: the assistant's own words
 * (docs/DESIGN.md §4 «Оффлайн»), no red, no exclamation. Layout stays put — the line
 * overlays the header instead of pushing it.
 */
export function OfflineBanner() {
  const { isOnline, paused, shown } = useSendQueue();
  const fetchedAt = useLatestFetch();
  if (!shown) return null;
  const queue = paused > 0 ? ` (${paused} в очереди)` : "";
  // nothing to send: say how old the screen is — without network it is the phone's copy (D-127)
  const at = !isOnline && paused === 0 ? fetchedAt : null;
  const text = isOnline
    ? `Отправляю${queue}`
    : at
      ? `Нет связи · данные на ${humanAqtobe(new Date(at)).replace(/^сегодня /, "")}`
      : `Нет связи. Отправлю, как появится${queue}`;
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
