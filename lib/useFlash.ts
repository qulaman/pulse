"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value shown for `ms` and then gone — a receipt over the screen. A new one replaces the one
 * still showing and gets its own full time.
 */
export function useFlash<T>(ms: number): [T | null, (next: T) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(
    (next: T) => {
      if (timer.current) clearTimeout(timer.current);
      setValue(next);
      timer.current = setTimeout(() => setValue(null), ms);
    },
    [ms],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [value, flash];
}
