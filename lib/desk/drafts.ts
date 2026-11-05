"use client";

import { useSyncExternalStore } from "react";

/**
 * What the director has typed into a task's answer field and not sent yet. Kept by the task, so
 * moving to another row, closing the panel or reloading the page takes no words away. sessionStorage
 * holds it for this tab, every access in try/catch: a private window or blocked site data simply
 * forgets at reload, the page's own memory still holds it until then. Keyed by the person as well —
 * the same tab may sign in as somebody else.
 */

const PREFIX = "pulse.desk.draft.";

const NONE: ReadonlySet<string> = new Set();

const storageKey = (userId: string, taskId: string) => `${PREFIX}${userId}.${taskId}`;

/** This page's copy of every draft, by storage key. */
let memory: Map<string, string> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function drafts(): Map<string, string> {
  if (memory) return memory;
  memory = new Map();
  try {
    const box = storage();
    for (let index = 0; box && index < box.length; index += 1) {
      const key = box.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const text = box.getItem(key);
      if (text) memory.set(key, text);
    }
  } catch {
    // nothing kept can be read: the page starts with none
  }
  return memory;
}

/** The words kept for this task; "" — none. */
export function readDraft(userId: string, taskId: string): string {
  return drafts().get(storageKey(userId, taskId)) ?? "";
}

/**
 * Keeps the words, or lets them go when nothing but spaces is left. Whoever draws the marks hears
 * only when a task gains or loses its draft, not on every letter.
 */
export function writeDraft(userId: string, taskId: string, text: string): void {
  const key = storageKey(userId, taskId);
  const map = drafts();
  const had = map.has(key);
  const has = text.trim().length > 0;
  if (has) map.set(key, text);
  else map.delete(key);
  try {
    if (has) storage()?.setItem(key, text);
    else storage()?.removeItem(key);
  } catch {
    // storage is full or blocked: the page's memory still has the words
  }
  if (had !== has) {
    version += 1;
    for (const listener of listeners) listener();
  }
}

/** The words have gone out: the draft is over. */
export function clearDraft(userId: string, taskId: string): void {
  writeDraft(userId, taskId, "");
}

let cached: { userId: string; version: number; tasks: ReadonlySet<string> } | null = null;

/** The tasks this person has words waiting on — the same set until one is gained or lost. */
export function draftTasks(userId: string): ReadonlySet<string> {
  if (cached && cached.userId === userId && cached.version === version) return cached.tasks;
  const head = `${PREFIX}${userId}.`;
  const tasks = new Set<string>();
  for (const key of drafts().keys()) if (key.startsWith(head)) tasks.add(key.slice(head.length));
  cached = { userId, version, tasks };
  return tasks;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The rows' quiet «черновик»: nothing on the server's HTML, the tab's own drafts once hydrated. */
export function useDraftTasks(userId: string): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => draftTasks(userId),
    () => NONE,
  );
}
