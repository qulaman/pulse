"use client";

import { useEffect, useRef, type PointerEvent } from "react";

/**
 * Hold-or-tap on one target with pointer events: a press longer than `delay` is a hold (with
 * the finger's travel upwards reported for «swipe up — cancel»), a shorter one is a tap.
 */
export function useHold({
  delay = 160,
  onTap,
  onHoldStart,
  onHoldMove,
  onHoldEnd,
  onHoldCancel,
}: {
  delay?: number;
  onTap?: () => void;
  onHoldStart: () => void;
  onHoldMove?: (dyUp: number) => void;
  onHoldEnd: () => void;
  onHoldCancel?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const down = useRef(false);
  const startY = useRef(0);
  const moved = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      down.current = true;
      moved.current = false;
      startY.current = e.clientY;
      timer.current = setTimeout(() => {
        if (!down.current) return;
        holding.current = true;
        onHoldStart();
      }, delay);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!down.current) return;
      const dy = startY.current - e.clientY;
      if (Math.abs(dy) > 12) moved.current = true;
      if (holding.current) onHoldMove?.(dy);
    },
    onPointerUp: () => {
      if (!down.current) return;
      down.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (holding.current) {
        holding.current = false;
        onHoldEnd();
      } else if (!moved.current) onTap?.();
    },
    onPointerCancel: () => {
      down.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (holding.current) {
        holding.current = false;
        (onHoldCancel ?? onHoldEnd)();
      }
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}
