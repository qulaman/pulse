"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

const OPEN_MS = 180;
const CLOSE_MS = 150;

/**
 * Bottom sheet: overlay token, 20px top corners, safe-area padding (docs/DESIGN.md §2).
 * Nothing behind it moves: the page is locked while the sheet is up, the sheet slides
 * out instead of vanishing, and the first `data-autofocus` field gets focus only after
 * the slide — a keyboard that pops mid-animation drags the whole viewport.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  // stays mounted through the closing slide, then unmounts
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const phase: "closed" | "open" | "closing" = !mounted ? "closed" : open ? "open" : "closing";
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (phase !== "open") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  // scroll lock: an attribute, so two sheets in a row never fight over inline styles
  useEffect(() => {
    if (phase === "closed") return;
    document.body.setAttribute("data-sheet-open", "");
    return () => document.body.removeAttribute("data-sheet-open");
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const timer = setTimeout(() => {
      const field = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      field?.focus({ preventScroll: true });
    }, OPEN_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "closed") return null;
  const closing = phase === "closing";

  // Portal to <body>: an animated <main> is a stacking context, and a sheet inside it
  // would sit under the FAB no matter its z-index.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ touchAction: "none", pointerEvents: closing ? "none" : "auto" }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 h-full w-full"
        style={{
          background: "var(--overlay)",
          animation: closing
            ? `overlay-out ${CLOSE_MS}ms var(--ease-out) both`
            : `overlay-in ${OPEN_MS}ms var(--ease-out) both`,
        }}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="no-bar relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[20px] border-t border-border bg-surface px-4 pt-4"
        style={{
          maxHeight: "88dvh",
          touchAction: "pan-y",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          boxShadow: "var(--shadow-raised)",
          animation: closing
            ? `sheet-down ${CLOSE_MS}ms var(--ease-out) both`
            : `sheet-up ${OPEN_MS}ms var(--ease-out) both`,
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {title ? <h2 className="mb-3 text-[19px] font-semibold leading-6">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
