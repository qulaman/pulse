"use client";

import { useEffect, useState } from "react";

/**
 * After this long without a touch, a home screen left open stops its decoration: the team's rings
 * and shiver (D-118), the dreams of the sleeping face, the secretary's desk and the secretary's
 * own typing (D-119). Three minutes — longer than any pause of someone actually using the screen.
 */
export const DEEP_REST_MS = 180_000;

/** Every deep rest on the page, to be woken by news as by a touch. */
const wakers = new Set<() => void>();

/**
 * News has come to the screen — a change on the board, a word, the page back from the background:
 * whatever slept on it wakes as from a touch, and the three minutes start again (2026-11-26).
 */
export function wakeDeepRest(): void {
  for (const wake of wakers) wake();
}

/**
 * true once nobody has touched the screen for `ms`; the next touch anywhere wakes it, and so does
 * news (`wakeDeepRest`). Nothing runs per frame: one timer, reset by a passive `pointerdown` listener.
 */
export function useDeepRest(ms: number = DEEP_REST_MS): boolean {
  const [deep, setDeep] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setDeep(true), ms);
    const poke = () => {
      setDeep(false);
      clearTimeout(timer);
      timer = setTimeout(() => setDeep(true), ms);
    };
    window.addEventListener("pointerdown", poke, { passive: true });
    wakers.add(poke);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", poke);
      wakers.delete(poke);
    };
  }, [ms]);
  return deep;
}
