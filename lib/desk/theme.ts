"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

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

/**
 * The other sheet spreads from `at` (the button pressed) over the whole page as a circle (D-184):
 * one view transition of the page's own picture — the old sheet stays under, the new one grows
 * over it (app/desk/transitions.css, `html.desk-theme-turn`). Without View Transitions or without
 * a point the sheet changes at once.
 */
let turns = 0;

export function switchDeskTheme(value: DeskTheme, at?: { x: number; y: number }): void {
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
  if (!at || !doc.startViewTransition) {
    writeDeskTheme(value);
    return;
  }
  const root = document.documentElement;
  const reach = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
  root.style.setProperty("--vt-theme-x", `${Math.round(at.x)}px`);
  root.style.setProperty("--vt-theme-y", `${Math.round(at.y)}px`);
  root.style.setProperty("--vt-theme-r", `${Math.ceil(reach)}px`);
  root.classList.add("desk-theme-turn");
  // the sheet is the shell's attribute, set in its layout effect: drawn before the new picture is taken
  const turn = doc.startViewTransition(() => flushSync(() => writeDeskTheme(value)));
  // a second press cuts this turn short: only the latest one takes the circle's class off
  turns += 1;
  const mine = turns;
  void turn.finished.finally(() => {
    if (mine === turns) root.classList.remove("desk-theme-turn");
  });
}

/** The centre of an element on screen — where the other sheet starts from. */
export function centreOf(element: Element | null): { x: number; y: number } | undefined {
  if (!element) return undefined;
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function useDeskTheme(): DeskTheme {
  return useSyncExternalStore(theme.subscribe, theme.read, () => "dark");
}

/** @deprecated the desk has one look, «Графит»: DeskShell still reads it to set `data-graphite`. */
export function useDeskLook(): DeskLook {
  return "graphite";
}
