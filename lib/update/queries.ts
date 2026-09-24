"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchServerVersion } from "@/lib/update/client";

export const versionKey = ["app-version"] as const;

/** A PWA sits open for hours: while the screen is on, the server is asked this often anyway. */
const EVERY_MS = 10 * 60_000;

/**
 * The server's build (D-115). Asked on start, on every return from the background (the
 * focus manager listens to visibilitychange), when the network comes back and every ten
 * minutes on screen — only online, never more than once a minute. A failed ask keeps the
 * last answer: no network is not «up to date».
 */
export function useServerVersion() {
  return useQuery({
    queryKey: versionKey,
    queryFn: fetchServerVersion,
    staleTime: 60_000,
    gcTime: Infinity,
    refetchInterval: EVERY_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    networkMode: "online",
  });
}
