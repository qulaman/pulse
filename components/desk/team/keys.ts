"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { isTypingTarget } from "@/lib/desk/keys";

/** Something else holds the keys now: a dialog, a phone sheet drawn as a dialog, an open menu or popover. */
export function keysTaken(): boolean {
  if (typeof document === "undefined") return true;
  const body = document.body;
  return body.hasAttribute("data-dialog-open") || body.hasAttribute("data-sheet-open") || document.querySelector(".desk-pop") !== null;
}

/** The key went to a control of its own: its Enter and Space are the control's, not the screen's. */
export function onControl(target: EventTarget | null): boolean {
  return Boolean((target as Element | null)?.closest?.("button, a, [role=button], [role=menuitem], [role=tab], [role=switch], select"));
}

/**
 * A screen's own letters and arrows on the desk (D-154 wave 3): matched by `event.code`, so a
 * Russian layout presses the same «E»; never while a field, a dialog, a sheet or a menu has the
 * keys, never with Ctrl, Cmd or Alt (those are the browser's and the order line's). A focused
 * table that already took the key (its ↑/↓ and Enter) has prevented the default — skipped too.
 * The handler returns true when it used the key.
 */
export function useScreenKeys(handler: (event: KeyboardEvent) => boolean | void, enabled = true) {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || keysTaken()) return;
      if (latest.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** ↑/↓ over a list of keys: the next one from `current`, clamped; the first when nothing is chosen. */
export function stepKey(keys: readonly string[], current: string | null, down: boolean): string | null {
  if (keys.length === 0) return null;
  const at = current ? keys.indexOf(current) : -1;
  if (at < 0) return keys[down ? 0 : keys.length - 1];
  return keys[Math.max(0, Math.min(keys.length - 1, at + (down ? 1 : -1)))];
}

/** The arrow keys of a list, by the physical key. */
export function arrowOf(event: KeyboardEvent): "up" | "down" | null {
  return event.code === "ArrowDown" ? "down" : event.code === "ArrowUp" ? "up" : null;
}
