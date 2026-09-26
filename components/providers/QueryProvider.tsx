"use client";

import { useEffect, useState, type ReactNode } from "react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isNetworkError } from "@/lib/net";
import { keepQueries, restoreQueries } from "@/lib/offline/persist";
import { registerServiceWorker } from "@/lib/offline/worker";

/** A day: data brought back from the phone stays for the screens opened later (D-127). */
const KEEP_IN_MEMORY_MS = 86_400_000;

/** TanStack Query owns all server state (docs/FRONTEND.md "State management"). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: KEEP_IN_MEMORY_MS, retry: 1, refetchOnWindowFocus: false },
          // DoD «Оффлайн»: a tap without network waits, then lands once the phone is back —
          // only a dead network is retried, every other failure surfaces at once
          mutations: {
            networkMode: "offlineFirst",
            retry: (count, error) => isNetworkError(error) && count < 6,
            retryDelay: (count) => Math.min(15_000, 2_000 * (count + 1)),
          },
        },
      }),
  );

  // The phone keeps the last data it saw and the app itself (D-127): the kept data comes back
  // once the page has hydrated (restoreQueries), and every change is kept again.
  useEffect(() => {
    let stopKeeping: (() => void) | null = null;
    let gone = false;
    // TanStack takes the network as up until an «offline» event — and a start without network
    // has none: the queue and the offline line would think they were online
    if (typeof navigator !== "undefined" && navigator.onLine === false) onlineManager.setOnline(false);
    void registerServiceWorker();
    // kept only after the kept data is back — a save before it would drop other screens' data
    void restoreQueries(client).then(() => {
      if (!gone) stopKeeping = keepQueries(client);
    });
    return () => {
      gone = true;
      stopKeeping?.();
    };
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
