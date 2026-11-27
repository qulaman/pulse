"use client";

import { useSyncExternalStore } from "react";

/**
 * What the director has already been told and cannot change from here (D-216): the orders lying
 * with somebody whose pushes do not reach them. The mark is watchful until it has said so once —
 * the director wakes it, the line names the person — and after that it rests: the fact is still in
 * the words, on the ball and on the person's circle, but it is no longer news. Kept on this phone,
 * per person signed in; an order that is closed, accepted or gone is forgotten at the next mark.
 */

const KEY = "pulse.heard.v1.";
const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
/** One Set per stored value: the snapshot must be the same object while nothing changed. */
const cache = new Map<string, { raw: string | null; ids: ReadonlySet<string> }>();

function read(userId: string): ReadonlySet<string> {
  if (!userId) return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY + userId);
  } catch {
    return EMPTY;
  }
  const kept = cache.get(userId);
  if (kept && kept.raw === raw) return kept.ids;
  let ids: ReadonlySet<string> = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    // a value somebody else wrote: nothing heard
  }
  cache.set(userId, { raw, ids });
  return ids;
}

/**
 * The director has just been told about these orders. `open` — every order on the board right now:
 * what is no longer there is dropped, so the list never grows past the board.
 */
export function markHeard(userId: string, ids: readonly string[], open: readonly string[]): void {
  if (!userId || ids.length === 0) return;
  const now = read(userId);
  if (ids.every((id) => now.has(id))) return;
  const onBoard = new Set(open);
  const next = [...new Set([...now, ...ids])].filter((id) => onBoard.has(id));
  try {
    window.localStorage.setItem(KEY + userId, JSON.stringify(next));
  } catch {
    // a phone that keeps nothing: the mark stays watchful, as it was
    return;
  }
  for (const listener of listeners) listener();
}

/** The orders this director has been told about on this phone; empty on the server and before the name is known. */
export function useHeard(userId: string): ReadonlySet<string> {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => read(userId),
    () => EMPTY,
  );
}
