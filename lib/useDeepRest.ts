"use client";

import { useEffect, useState } from "react";

/**
 * After this long without a touch, a home screen left open stops its decoration: the team's rings
 * and shiver (D-118), the dreams of the sleeping face, the secretary's desk and the secretary's
 * own typing (D-119). Three minutes — longer than any pause of someone actually using the screen.
 */
export const DEEP_REST_MS = 180_000;

/**
 * true once nobody has touched the screen for `ms`; the next touch anywhere wakes it. Nothing runs
 * per frame: one timer, reset by a passive `pointerdown` listener.
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
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", poke);
    };
  }, [ms]);
  return deep;
}
