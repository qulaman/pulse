"use client";

import { useEffect, useState } from "react";

/** The value as it stood `ms` ago, once it stopped changing: a search asks the server once per pause, not per letter. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
