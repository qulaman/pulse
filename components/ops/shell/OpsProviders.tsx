"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useState, type ReactNode } from "react";

/**
 * The console's own cache, nested under the product's (D-157): nothing here reaches the IndexedDB
 * snapshot, and nothing repeats by itself — an operator's write happens once, on the click. The
 * desk's look sits on `html[data-surface="desk"]` (globals.css), so the attribute goes on <html>
 * the way DeskShell puts it there, and comes off with the console.
 */
export function OpsProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 0 },
          mutations: { networkMode: "online", retry: 0 },
        },
      }),
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = "desk";
    return () => {
      delete root.dataset.surface;
    };
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
