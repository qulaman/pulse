"use client";

import { useEffect } from "react";

import { canVibrate, tapHaptic } from "@/lib/haptics";

/**
 * What a tap lands on: anything pressable. Fields are not — typing is not a press — and a
 * control that lives by a gesture of its own (the mascot lever) opts out with
 * `data-haptic="off"` around it.
 */
const PRESSABLE = [
  "button",
  "a[href]",
  "summary",
  "label",
  "select",
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="option"]',
  "[data-haptic]",
].join(", ");

/**
 * The tap's tick for the whole app (D-147, lib/haptics.ts): one listener, so no button codes
 * it. On the click — a tap the finger finished, not a scroll that began on a button — and
 * after the tap's own handlers: a pattern of their own wins. iOS has no Vibration API: there
 * the tick is the switch under the finger (`HapticSwitch`), and this listener is not set.
 */
export function TapHaptics() {
  useEffect(() => {
    if (!canVibrate()) return;
    const onClick = (event: MouseEvent) => {
      // a label passing the click to its control, a script's click — not a finger
      if (!event.isTrusted) return;
      const target = event.target instanceof Element ? event.target.closest(PRESSABLE) : null;
      if (!target || target.closest('[data-haptic="off"]')) return;
      if (target.matches(':disabled, [aria-disabled="true"]')) return;
      const clickedAt = Date.now();
      setTimeout(() => tapHaptic(clickedAt), 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
