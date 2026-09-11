"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isNetworkError } from "@/lib/net";

/** TanStack Query owns all server state (docs/FRONTEND.md "State management"). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
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

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
