"use client";

import { useEffect, useState } from "react";

const LAST_VISIT_KEY = "pulse.brief.seen_at";
/** The «since» of the current tab session: coming back from another tab is the same visit. */
const SESSION_SINCE_KEY = "pulse.brief.since";
/** A PWA kept alive in the background for days: after this long the next opening is a new visit. */
const VISIT_MAX_AGE_MS = 8 * 3_600_000;
/** A first visit (or a wiped storage) marks the changes of the last day as new. */
const FIRST_VISIT_WINDOW_MS = 24 * 3_600_000;

/** A new person signs in on this tab: their first opening is a first visit. */
export function forgetVisit(): void {
  try {
    window.sessionStorage.removeItem(SESSION_SINCE_KEY);
    window.sessionStorage.removeItem(`${SESSION_SINCE_KEY}:at`);
  } catch {
    // nothing stored, nothing to forget
  }
}

/**
 * When the director last opened Пульс on this phone. Read once per mount, then the
 * stamp moves to now — so the next opening marks what changed in between as new,
 * while the current screen keeps its own «since» for the whole visit.
 */
export function useLastVisit(): string {
  const [since] = useState(() => {
    const now = Date.now();
    try {
      // the same tab session keeps its «since»: a trip to «Задачи» and back is not a new visit
      const session = window.sessionStorage.getItem(SESSION_SINCE_KEY);
      const raw = window.localStorage.getItem(LAST_VISIT_KEY);
      window.localStorage.setItem(LAST_VISIT_KEY, String(now));
      const sessionStarted = Number(window.sessionStorage.getItem(`${SESSION_SINCE_KEY}:at`) ?? "0");
      if (session && now - sessionStarted < VISIT_MAX_AGE_MS) return session;
      const previous = raw ? Number(raw) : null;
      const from = previous && Number.isFinite(previous) ? previous : now - FIRST_VISIT_WINDOW_MS;
      const iso = new Date(from).toISOString();
      window.sessionStorage.setItem(SESSION_SINCE_KEY, iso);
      window.sessionStorage.setItem(`${SESSION_SINCE_KEY}:at`, String(now));
      return iso;
    } catch {
      return new Date(now - FIRST_VISIT_WINDOW_MS).toISOString();
    }
  });
  return since;
}

/**
 * The clock of the board: read on mount, then once a minute — a deadline that passes
 * while the screen is open moves its tile into the overdue lane without a reload.
 */
export function useNow(tickMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  return now;
}
