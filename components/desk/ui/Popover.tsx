"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { dropLayer, isTopLayer, pushLayer } from "@/components/desk/ui/layers";

/** Where a popover hangs: under an element, or at a point (a right click). */
export type Anchor = HTMLElement | { x: number; y: number } | null;

const GAP = 6;
const EDGE = 8;

/**
 * A floating panel on the desk (D-154 wave 3): under its anchor (above when there is no room
 * below), or at the cursor for a context menu; inside the window always. A mouse press outside or
 * Esc closes it — Esc stops there and does not reach the desk's own Esc (the panel, the field).
 * The base of `Menu`, filters, pickers. Not modal: the page behind stays live.
 *
 * Its own change of size (a list filtered as one types) always places it again; `[data-autofocus]`
 * inside takes the focus once it is visible. Esc closes only the top layer (`layers.ts`).
 *
 * `track` — a picker under a field that lives in a scrolling column (the right-hand panel): the
 * popover follows its anchor through scroll and resize instead of closing on a resize.
 * `matchAnchor` — at least as wide as the field it hangs under.
 */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = "start",
  width,
  className = "",
  label,
  track = false,
  role = "dialog",
  id,
  matchAnchor = false,
}: {
  open: boolean;
  onClose: () => void;
  anchor: Anchor;
  children: ReactNode;
  /** Which edge of the anchor the panel lines up with. */
  align?: "start" | "end";
  width?: number;
  className?: string;
  label?: string;
  track?: boolean;
  /** «dialog» by default; a list of choices under a field may say «listbox» on its own node instead. */
  role?: string;
  id?: string;
  matchAnchor?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; min?: number } | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  const measure = useCallback(() => {
    if (!anchor || !box.current) return;
    const panel = box.current.getBoundingClientRect();
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const below = rect.bottom + GAP;
    const top = below + panel.height > window.innerHeight - EDGE ? Math.max(EDGE, rect.top - GAP - panel.height) : below;
    const wanted = align === "end" ? rect.right - panel.width : rect.left;
    const left = Math.min(Math.max(EDGE, wanted), window.innerWidth - panel.width - EDGE);
    const min = matchAnchor && anchor instanceof HTMLElement ? Math.round(rect.right - rect.left) : undefined;
    setPlace((current) => (current && current.top === top && current.left === left && current.min === min ? current : { top, left, min }));
  }, [anchor, align, matchAnchor]);

  useLayoutEffect(() => {
    if (!open || !anchor || !box.current) {
      setPlace(null);
      return;
    }
    measure();
  }, [open, anchor, align, width, measure]);

  // a panel that grows or shrinks (a list filtered as one types, a second step) is placed again
  useEffect(() => {
    if (!open) return;
    const node = box.current;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    if (node) observer?.observe(node);
    return () => observer?.disconnect();
  }, [open, measure]);

  useEffect(() => {
    if (!open || !track) return;
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, track, measure]);

  // the field marked for it takes the focus once the panel is visible — a hidden one can't
  const placed = place !== null;
  useEffect(() => {
    if (!open || !placed) return;
    box.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const layer = pushLayer();
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target)) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return;
      closeRef.current();
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopLayer(layer)) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    const gone = () => closeRef.current();
    document.addEventListener("mousedown", away, true);
    window.addEventListener("keydown", esc, true);
    if (!track) window.addEventListener("resize", gone);
    return () => {
      dropLayer(layer);
      document.removeEventListener("mousedown", away, true);
      window.removeEventListener("keydown", esc, true);
      if (!track) window.removeEventListener("resize", gone);
    };
  }, [open, anchor, track]);

  if (!open) return null;
  return createPortal(
    <div
      ref={box}
      id={id}
      role={role}
      aria-label={label}
      className={`desk-pop fixed z-[70] overflow-hidden rounded-[12px] border border-border bg-surface ${className}`}
      style={{
        top: place?.top ?? -9999,
        left: place?.left ?? -9999,
        width,
        minWidth: place?.min,
        boxShadow: "var(--shadow-raised)",
        visibility: place ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
