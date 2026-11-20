"use client";

import { useSyncExternalStore } from "react";

/**
 * The desk's two sheets (D-159): dark by default, light on request, kept per browser — the head
 * script reads the same key before the first paint (DESK_SHEET_SCRIPT), every access is guarded,
 * and without storage the choice lives until the page goes. The look is «Графит» (D-171) alone.
 */
export type DeskTheme = "dark" | "light";
export type DeskLook = "graphite";

export const DESK_THEME_KEY = "pulse.desk.theme";

/** Anything but an explicit «light» is dark: a new browser and a broken value alike. */
export function parseDeskTheme(value: string | null | undefined): DeskTheme {
  return value === "light" ? "light" : "dark";
}

export function otherDeskTheme(theme: DeskTheme): DeskTheme {
  return theme === "dark" ? "light" : "dark";
}

/** One choice kept in the browser: read through `useSyncExternalStore`, followed across tabs. */
function storedChoice<T extends string>(key: string, parse: (value: string | null) => T, fallback: T) {
  const listeners = new Set<() => void>();
  let memory: T | null = null;
  const read = (): T => {
    if (memory) return memory;
    try {
      return parse(window.localStorage.getItem(key));
    } catch {
      return fallback;
    }
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    // another tab of the same browser switched: this one follows
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      memory = null;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  const write = (value: T): void => {
    memory = value;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // private window: the choice stays in `memory` for this page
    }
    for (const listener of listeners) listener();
  };
  return { read, subscribe, write };
}

const theme = storedChoice<DeskTheme>(DESK_THEME_KEY, parseDeskTheme, "dark");

export function writeDeskTheme(value: DeskTheme): void {
  theme.write(value);
}

export function useDeskTheme(): DeskTheme {
  return useSyncExternalStore(theme.subscribe, theme.read, () => "dark");
}

/** @deprecated the desk has one look, «Графит»: DeskShell still reads it to set `data-graphite`. */
export function useDeskLook(): DeskLook {
  return "graphite";
}
