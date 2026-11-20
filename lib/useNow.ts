"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed every `tickMs` (a minute by default) — the one clock hook of the app. */
export function useNow(tickMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return now;
}
