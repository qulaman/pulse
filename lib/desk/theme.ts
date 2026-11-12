"use client";

import { useSyncExternalStore } from "react";

/**
 * The desk's two sheets (D-159): dark by default, light on request — and its two looks (D-171):
 * «Графит», the modern one, by default, the ruled «Журнал» one click away to compare. Both kept per
 * browser: the head script reads the same keys before the first paint (DESK_SHEET_SCRIPT), every
 * access is guarded, and without storage the choice lives until the page goes.
 */
export type DeskTheme = "dark" | "light";
export type DeskLook = "graphite" | "journal";

export const DESK_THEME_KEY = "pulse.desk.theme";
export const DESK_LOOK_KEY = "pulse.desk.look";

/** Anything but an explicit «light» is dark: a new browser and a broken value alike. */
export function parseDeskTheme(value: string | null | undefined): DeskTheme {
  return value === "light" ? "light" : "dark";
}

export function otherDeskTheme(theme: DeskTheme): DeskTheme {
  return theme === "dark" ? "light" : "dark";
}

/** Anything but an explicit «journal» is «Графит»: the new look is the desk's own now. */
export function parseDeskLook(value: string | null | undefined): DeskLook {
  return value === "journal" ? "journal" : "graphite";
}

export function otherDeskLook(look: DeskLook): DeskLook {
  return look === "graphite" ? "journal" : "graphite";
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
const look = storedChoice<DeskLook>(DESK_LOOK_KEY, parseDeskLook, "graphite");

export function writeDeskTheme(value: DeskTheme): void {
  theme.write(value);
}

export function useDeskTheme(): DeskTheme {
  return useSyncExternalStore(theme.subscribe, theme.read, () => "dark");
}

export function writeDeskLook(value: DeskLook): void {
  look.write(value);
}

export function useDeskLook(): DeskLook {
  return useSyncExternalStore(look.subscribe, look.read, () => "graphite");
}
