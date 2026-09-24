import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * false while React hydrates the server's HTML, true from the next render on (and at once
 * on a client-side mount). For markup that must first read exactly as the server drew it,
 * even when the browser already knows better.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
