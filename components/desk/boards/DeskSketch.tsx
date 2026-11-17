"use client";

import { useEffect, useLayoutEffect, type ComponentProps } from "react";

import { SketchPad } from "@/components/mindboard/SketchPad";

/**
 * The phone's drawing pad (D-141) over the desk (wave 3): the whole window, as on the phone
 * (globals.css leaves the pad out of the desk's sheet-as-dialog rule). Esc is its «Отмена» (a
 * drawing with changes asks once more, as the pad's own button does). A mouse draws like a
 * finger: the pad works on pointer events.
 *
 * The drawing keeps its own dark paper (D-158): its inks are named «белый, бирюзовый, жёлтый», and on
 * the sheet they would turn black and two blues. `darkPaper` gives <html> the wall's tokens
 * (journal.css) for as long as the pad covers the window.
 */
export function DeskSketch(props: ComponentProps<typeof SketchPad>) {
  useDarkPaper();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const cancel = document.querySelector<HTMLButtonElement>('[data-testid="sketch-pad"] [data-testid="sketch-cancel"]');
      if (!cancel) return;
      event.preventDefault();
      event.stopPropagation();
      cancel.click();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return <SketchPad {...props} />;
}

/** For as long as the caller is on screen: the pad, or the phone's board screen that holds one. */
export function useDarkPaper() {
  useLayoutEffect(() => {
    darkPaper();
    return () => document.documentElement.removeAttribute("data-sketch");
  }, []);
}

/** The pad reads its inks from <html> as it mounts: the action that opens it calls this first. */
export function darkPaper() {
  document.documentElement.setAttribute("data-sketch", "");
}
