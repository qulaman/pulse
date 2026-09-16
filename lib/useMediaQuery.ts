"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches — the phone gets the deck, a wide screen the board.
 * Server and first client render answer `false`, so the phone layout is the default
 * and nothing shifts on hydration for the device that matters.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
