"use client";

import { useSyncExternalStore } from "react";

import type { SetupMarks } from "@/lib/setup/steps";

/**
 * What the person said on this phone during «Подключение» (D-190): «пришло», «пропустить», when
 * the screen was first shown. Facts of one device for one person — localStorage, keyed by the
 * person (a shared phone keeps two people apart). What the server knows (the subscription, the
 * last push) is never kept here. Every access in try/catch: a private window simply forgets.
 */

const PREFIX = "pulse.setup.v1.";
const EMPTY: SetupMarks = Object.freeze({}) as SetupMarks;

const listeners = new Set<() => void>();
/** The parsed marks per person, so the snapshot keeps its identity between renders. */
const cache = new Map<string, { raw: string | null; marks: SetupMarks }>();

function read(userId: string): SetupMarks {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFIX + userId);
  } catch {
    raw = null;
  }
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.marks;
  let marks = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") marks = parsed as SetupMarks;
  } catch {
    marks = EMPTY;
  }
  cache.set(userId, { raw, marks });
  return marks;
}

export function readMarks(userId: string): SetupMarks {
  if (typeof window === "undefined" || !userId) return EMPTY;
  return read(userId);
}

export function writeMarks(userId: string, patch: Partial<SetupMarks>): void {
  if (typeof window === "undefined" || !userId) return;
  const next = { ...read(userId), ...patch };
  try {
    window.localStorage.setItem(PREFIX + userId, JSON.stringify(next));
  } catch {
    // private mode: the marks live as long as this page does
    cache.set(userId, { raw: null, marks: next });
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // another tab of the same phone said «пришло»
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The person's marks on this phone; null while hydrating — the server knows nothing of them. */
export function useSetupMarks(userId: string | undefined): SetupMarks | null {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId) : null),
    () => null,
  );
}
