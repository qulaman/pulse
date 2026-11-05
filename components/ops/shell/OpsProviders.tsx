"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useState, type ReactNode } from "react";

import "@/app/ops/ops.css";

/**
 * The console's own cache, nested under the product's (D-157): nothing here reaches the IndexedDB
 * snapshot, and nothing repeats by itself — an operator's write happens once, on the click. The
 * desk's look sits on `html[data-surface="desk"]` (globals.css) and the console's own on
 * `html[data-ops]` (ops.css), so both attributes go on <html> the way DeskShell puts its own
 * there, and come off with the console.
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
    root.dataset.ops = "";
    return () => {
      delete root.dataset.surface;
      delete root.dataset.ops;
    };
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
