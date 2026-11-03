"use client";

import { useEffect, type ComponentProps } from "react";

import { SketchPad } from "@/components/mindboard/SketchPad";

/**
 * The phone's drawing pad (D-141) over the desk (wave 3): the whole window, as on the phone
 * (globals.css leaves the pad out of the desk's sheet-as-dialog rule). Esc is its «Отмена» (a
 * drawing with changes asks once more, as the pad's own button does). A mouse draws like a
 * finger: the pad works on pointer events.
 */
export function DeskSketch(props: ComponentProps<typeof SketchPad>) {
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
