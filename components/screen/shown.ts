"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Whom this phone has seen on the wall today (D-182, «Вероятно сейчас»): a per-device convenience
 * in localStorage — the director's habit, not a record. The day is Aqtobe's; the list starts empty
 * every morning. Without storage (a private window) the list lives as long as the page.
 */

const KEY = "pulse.screen.shown";
const LIMIT = 8;
const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const EMPTY: readonly string[] = [];

type Stored = { day: string; ids: string[] };

let memory: Stored | null = null;
const listeners = new Set<() => void>();

function dayOf(now: Date): string {
  return new Date(now.getTime() + AQTOBE_OFFSET_MS).toISOString().slice(0, 10);
}

function readStorage(day: string): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as Partial<Stored>;
    return stored.day === day && Array.isArray(stored.ids) ? stored.ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** The day's list, read from storage once per day; the same array until it changes. */
function load(day: string): Stored {
  if (!memory || memory.day !== day) memory = { day, ids: readStorage(day) };
  return memory;
}

function remember(id: string, day: string): void {
  const current = load(day);
  if (current.ids[0] === id) return;
  memory = { day, ids: [id, ...current.ids.filter((other) => other !== id)].slice(0, LIMIT) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // no storage: the list lives as long as the page
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The people seen today, the latest first; `onWall` — the person on the wall now joins the list. */
export function useShownToday(onWall: string | null, now: Date): readonly string[] {
  const day = dayOf(now);
  const ids = useSyncExternalStore(subscribe, () => load(day).ids, () => EMPTY);
  useEffect(() => {
    if (onWall) remember(onWall, day);
  }, [onWall, day]);
  return ids;
}
