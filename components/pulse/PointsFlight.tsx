"use client";

import { useEffect, useRef } from "react";

import { flyInto } from "@/lib/ui/flyAway";

/** The pill fades in under the face first (`card-in`, 220 ms), holds a beat, then its copy lifts. */
const LIFT_AFTER_MS = 350;
/** The copy's way into the counter (D-165: about 0.6–0.7 s). */
const FLIGHT_MS = 650;

/**
 * «+N» into the counter (D-165): when points come in, a copy of the pill under the face
 * (`face-pill`) flies along an arc into the points under the name in the header
 * (`data-points-target`, `HeaderPoints`). The pill itself stays by the face; the counter rolls when
 * the balance comes, not when the copy lands (principle 1a). The flight is the app's one flight of
 * copies, `flyInto`: under «уменьшить движение», or with no counter on the screen (a secretary's
 * header), nothing flies. Renders nothing; `arrival` is the key of `usePointsArrival`, the one the
 * coin plays on.
 */
export function PointsFlight({ arrival }: { arrival: number }) {
  // a key seen at mount is not news: only a change after it flies
  const played = useRef(arrival);
  useEffect(() => {
    if (played.current === arrival) return;
    played.current = arrival;
    const timer = setTimeout(() => {
      const pill = document.querySelector<HTMLElement>('[data-testid="face-pill"] > span');
      const counter = document.querySelector<HTMLElement>("[data-points-target]");
      if (!pill || !counter) return;
      // «+N» arrives readable: its letters the size of the counter's digits
      const size = (node: HTMLElement) => parseFloat(getComputedStyle(node).fontSize) || 1;
      flyInto(pill, counter, { duration: FLIGHT_MS, lifted: false, arrivesAs: Math.min(1, size(counter) / size(pill)) });
    }, LIFT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [arrival]);
  return null;
}
