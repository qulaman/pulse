"use client";

import { useEffect } from "react";

import { tapSound } from "@/lib/sound";

/** What clicks on the computer: anything a person presses, not the text around it. */
const PRESSED = [
  "button",
  "a[href]",
  "summary",
  "input[type='checkbox']",
  "input[type='radio']",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='menuitemradio']",
  "[role='menuitemcheckbox']",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
].join(", ");

/**
 * The computer clicks on every button (D-204): one listener for the whole desk, no button codes
 * it. A press with a meaning plays its own cue in its handler, and then this click stays silent
 * (`tapSound`). A disabled button does not click. The phone has no such listener: there a press
 * is felt, not heard (D-147).
 */
export function DeskTapSound() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const pressed = event.target instanceof Element ? event.target.closest(PRESSED) : null;
      if (!pressed || pressed.matches(":disabled, [aria-disabled='true']")) return;
      tapSound(Date.now());
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
