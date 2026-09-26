"use client";

import { Reorder, useDragControls } from "framer-motion";
import { useState, type ReactNode } from "react";

import { NoteIcon } from "@/components/notes/icons";
import { CARD_SPRING } from "@/components/tasks/list/TaskList";
import { haptic } from "@/lib/haptics";
import { positionBetween } from "@/lib/mindboard/list";

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * The order of one list of a board while a finger moves it (points, or the sub-points of one
 * point): the board's order, or the one under the finger until the cache agrees. On the drop
 * one row is written — the moved one, between its new neighbours (`positionBetween`).
 */
export function useReorder(natural: readonly string[], placeOf: (id: string) => number, onMove: (id: string, position: number) => void) {
  const [held, setHeld] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  // the cache caught up (or the list changed under the finger): the board's order again
  if (held && !dragging && (!sameSet(held, natural) || held.join() === natural.join())) setHeld(null);
  const order = held && sameSet(held, natural) ? held : [...natural];

  return {
    order,
    dragging,
    onReorder: (next: string[]) => setHeld(next),
    start: () => {
      setDragging(true);
      haptic(6);
    },
    drop: (movedId: string) => {
      setDragging(false);
      const current = held ?? [...natural];
      const at = current.indexOf(movedId);
      if (at < 0 || current.join() === natural.join()) return;
      const before = at > 0 ? placeOf(current[at - 1]) : null;
      const after = at < current.length - 1 ? placeOf(current[at + 1]) : null;
      const position = positionBetween(before, after);
      if (position !== placeOf(movedId)) {
        haptic(10);
        onMove(movedId, position);
      }
    },
  };
}

/**
 * A row that moves by its handle only (Framer `Reorder`, transform only): the row itself
 * scrolls and opens as any card, the six dots move it. Lifted a little while it travels.
 */
export function DragRow({
  id,
  movable,
  label,
  onStart,
  onEnd,
  className,
  testId = "point-grip",
  layout = true,
  children,
}: {
  id: string;
  movable: boolean;
  /** What the handle says to a screen reader: «Перетащить пункт 3». */
  label: string;
  onStart: () => void;
  onEnd: () => void;
  className?: string;
  testId?: string;
  /** "position" — a row that grows in place (a sub-point opening) moves, never stretches its text. */
  layout?: true | "position";
  children: (grip: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const grip = movable ? (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onPointerDown={(event) => {
        event.preventDefault();
        controls.start(event);
      }}
      style={{ touchAction: "none" }}
      className="flex h-11 w-10 cursor-grab items-center justify-center rounded-[12px] text-muted/70 transition-colors duration-[120ms] active:cursor-grabbing active:bg-white/[0.06] active:text-text"
    >
      <NoteIcon name="grip" size={16} />
    </button>
  ) : null;

  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      layout={layout}
      onDragStart={onStart}
      onDragEnd={onEnd}
      whileDrag={{ scale: 1.02, zIndex: 5 }}
      // a row that comes while the list is on screen fades in (the list's AnimatePresence
      // keeps the first paint still)
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
      transition={CARD_SPRING}
      className={`relative ${className ?? ""}`}
    >
      {children(grip)}
    </Reorder.Item>
  );
}
