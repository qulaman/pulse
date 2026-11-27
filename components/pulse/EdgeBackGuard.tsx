"use client";

import { useEffect } from "react";

import { isIosWeb } from "@/lib/haptics";

/** The strip at the left edge where an iPhone starts its «Назад» swipe. */
const EDGE_PX = 24;
/** A finger that stayed within this of where it came down was a tap. */
const TAP_SLOP_PX = 10;

/**
 * Takes the «Назад» swipe of an iPhone off the screen it is mounted on (D-212): a pull of the mark to
 * the right must never turn the page. Safari starts that swipe only from a touch at the very left
 * edge, and a touch whose `touchstart` was cancelled never becomes one — so touches that begin in
 * the strip are cancelled. A cancelled touch makes no click either: a tap in the strip is clicked
 * here by hand, so what stands at the edge is still pressed. Pointer events go on as always.
 *
 * iPhone only: on Android the edge swipe belongs to the system and a page cannot refuse it.
 * Not promised by Safari anywhere — a behaviour, checked on a real phone.
 */
export function EdgeBackGuard() {
  useEffect(() => {
    if (!isIosWeb()) return;
    let tap: { x: number; y: number; target: EventTarget | null } | null = null;
    const onStart = (event: TouchEvent) => {
      tap = null;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch || touch.clientX > EDGE_PX || !event.cancelable) return;
      event.preventDefault();
      tap = { x: touch.clientX, y: touch.clientY, target: event.target };
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (tap && touch && Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_SLOP_PX) tap = null;
    };
    const onEnd = (event: TouchEvent) => {
      const done = tap;
      tap = null;
      // whoever cancels its own touchend wants no click (the mark does)
      // an icon under the finger is an SVG element, not an HTML one: any element takes the click
      if (!done || event.defaultPrevented || !(done.target instanceof Element)) return;
      if (done.target instanceof HTMLInputElement || done.target instanceof HTMLTextAreaElement) done.target.focus();
      done.target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 1, clientX: done.x, clientY: done.y }));
    };
    const onCancel = () => {
      tap = null;
    };
    document.addEventListener("touchstart", onStart, { capture: true, passive: false });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true });
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, []);
  return null;
}
