"use client";

import { memo, useMemo } from "react";

import { INK_VAR, shownSize, strokePath, turnTransform, WEIGHT_WIDTH, type Sketch } from "@/lib/mindboard/sketch";

/**
 * A drawing of a board point (D-141) as SVG: the same smoothed paths on the phone's card, in
 * the wall's list and over the whole wall. It fills its box at the drawing's own shape — its
 * sheet, turned as the director chose for the wall (`turnTransform`); the ink is the screen's
 * own tokens. Nothing in it is pressed.
 */
export const SketchView = memo(function SketchView({ sketch, label = "Рисунок", className = "" }: { sketch: Sketch; label?: string; className?: string }) {
  const box = shownSize(sketch);
  const turn = turnTransform(sketch);
  const paths = useMemo(() => sketch.strokes.map((stroke) => ({ d: strokePath(stroke), color: INK_VAR[stroke.c], width: WEIGHT_WIDTH[stroke.w] })), [sketch]);
  return (
    <svg viewBox={`0 0 ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label} className={`block h-full w-full ${className}`} data-testid="sketch-view">
      <g transform={turn || undefined}>
        {paths.map((path, index) => (
          <path key={index} d={path.d} fill="none" stroke={path.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
    </svg>
  );
});

/** The drawing's shown shape as a CSS aspect ratio: «16 / 9», «9 / 16». */
export function sketchAspect(sketch: Sketch): string {
  const box = shownSize(sketch);
  return `${box.w} / ${box.h}`;
}
