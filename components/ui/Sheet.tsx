"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { fromNextFrame } from "@/components/ui/motion";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** `--t-sheet`: the whole sheet travels up from the bottom edge; it leaves in three quarters of that. */
const OPEN_MS = 280;
const CLOSE_MS = 210;
/** A sheet that follows another waits this long: the first one is gone before the next comes up. */
export const SHEET_CLOSE_MS = CLOSE_MS;
/** If the slide never reports its end (a hidden tab runs no animations), this is when it counts as done. */
const GRACE_MS = 600;

/** The first `data-autofocus` field, once per opening (the slide's end or the grace timer, whichever comes first). */
function focusFirstField(dialog: HTMLElement | null, done: { current: boolean }) {
  if (done.current) return;
  done.current = true;
  dialog?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
}

/**
 * Bottom sheet: overlay token, 20px top corners, safe-area padding (docs/DESIGN.md §2).
 * Nothing behind it moves: the page is locked while the sheet is up, the sheet slides in
 * from the bottom edge and back down instead of vanishing, and the first `data-autofocus`
 * field gets focus only after the slide — a keyboard that pops mid-animation drags the
 * whole viewport. Both ends of the slide are its own `animationend`, not a timer: on a
 * busy phone the closing render alone can outlast a timer, and the sheet would vanish
 * before its first frame down.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  // stays mounted through the closing slide, then unmounts
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const phase: "closed" | "open" | "closing" = !mounted ? "closed" : open ? "open" : "closing";
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);

  // the render that opens (or closes) a sheet is often the heaviest of the tap: the slide
  // starts from the first frame drawn after it, not from the frame clock it left behind
  useLayoutEffect(() => {
    if (phase === "closed") return;
    for (const node of [overlayRef.current, dialogRef.current]) node?.getAnimations().forEach(fromNextFrame);
  }, [phase]);

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), CLOSE_MS + GRACE_MS);
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
    focused.current = false;
    const timer = setTimeout(() => focusFirstField(dialogRef.current, focused), OPEN_MS + GRACE_MS);
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
        ref={overlayRef}
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 h-full w-full"
        style={{
          background: "var(--overlay)",
          animation: closing
            ? `overlay-out ${CLOSE_MS}ms var(--ease-in) both`
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
            ? `sheet-down ${CLOSE_MS}ms var(--ease-in) both`
            : `sheet-up ${OPEN_MS}ms var(--ease-out) both`,
        }}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName === "sheet-down") setMounted(false);
          else if (event.animationName === "sheet-up") focusFirstField(dialogRef.current, focused);
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
