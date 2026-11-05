"use client";

import { useSyncExternalStore } from "react";

/**
 * The desk's two sheets (D-159): dark with bright inks by default, light on request. Kept per
 * browser: the head script reads the same key before the first paint (DESK_SHEET_SCRIPT), every
 * access is guarded, and without storage the choice lives until the page goes.
 */
export type DeskTheme = "dark" | "light";

export const DESK_THEME_KEY = "pulse.desk.theme";

/** Anything but an explicit «light» is dark: a new browser and a broken value alike. */
export function parseDeskTheme(value: string | null | undefined): DeskTheme {
  return value === "light" ? "light" : "dark";
}

export function otherDeskTheme(theme: DeskTheme): DeskTheme {
  return theme === "dark" ? "light" : "dark";
}

const listeners = new Set<() => void>();
let memory: DeskTheme | null = null;

function readDeskTheme(): DeskTheme {
  if (memory) return memory;
  try {
    return parseDeskTheme(window.localStorage.getItem(DESK_THEME_KEY));
  } catch {
    return "dark";
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // another tab of the same browser switched: this one follows
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DESK_THEME_KEY) return;
    memory = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeDeskTheme(theme: DeskTheme): void {
  memory = theme;
  try {
    window.localStorage.setItem(DESK_THEME_KEY, theme);
  } catch {
    // private window: the choice stays in `memory` for this page
  }
  for (const listener of listeners) listener();
}

export function useDeskTheme(): DeskTheme {
  return useSyncExternalStore(subscribe, readDeskTheme, () => "dark");
}
