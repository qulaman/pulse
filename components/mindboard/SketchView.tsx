"use client";

import { memo, useMemo } from "react";

import { INK_VAR, SKETCH_H, SKETCH_W, strokePath, WEIGHT_WIDTH, type Sketch } from "@/lib/mindboard/sketch";

/**
 * A drawing of a board point (D-141) as SVG: the same smoothed paths on the phone's card, in
 * the wall's list and over the whole wall when the presenter lights it. It fills its box and
 * keeps 16:9; the ink is the screen's own tokens. Nothing in it is pressed.
 */
export const SketchView = memo(function SketchView({ sketch, label = "Рисунок", className = "" }: { sketch: Sketch; label?: string; className?: string }) {
  const paths = useMemo(() => sketch.strokes.map((stroke) => ({ d: strokePath(stroke), color: INK_VAR[stroke.c], width: WEIGHT_WIDTH[stroke.w] })), [sketch]);
  return (
    <svg
      viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className={`block h-full w-full ${className}`}
      data-testid="sketch-view"
    >
      {paths.map((path, index) => (
        <path key={index} d={path.d} fill="none" stroke={path.color} strokeWidth={path.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
});
