"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { dropLayer, isTopLayer, pushLayer } from "@/components/desk/ui/layers";

const WIDTH = { sm: 420, md: 560, lg: 760 } as const;
const OUT_MS = 120;

/** Dialogs up right now: the desk's Esc closes the top one and leaves the panel alone. */
let openDialogs = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A desk dialog (D-153): in the middle of the window, fade and a 0.98 → 1 scale in 160 ms,
 * focus kept inside, Esc and a click outside close it. For new desktop dialogs; the phone's
 * sheets turn into the same look by themselves under `data-surface="desk"` (globals.css).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: keyof typeof WIDTH;
}) {
  // stays mounted through its way out
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // a parent's fresh arrow each render must not re-run the focus below
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), OUT_MS + 60);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    openDialogs += 1;
    const layer = pushLayer();
    document.body.setAttribute("data-dialog-open", "");
    const before = document.activeElement as HTMLElement | null;
    const node = card.current;
    // the first field marked for it, else the first control
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // a popover or a menu opened on top of this dialog takes its own Esc first
        if (!isTopLayer(layer)) return;
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      dropLayer(layer);
      openDialogs -= 1;
      if (openDialogs === 0) document.body.removeAttribute("data-dialog-open");
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ pointerEvents: closing ? "none" : "auto" }}
    >
      <button
        type="button"
        aria-label="Закрыть"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: "var(--overlay)", animation: `${closing ? "overlay-out" : "overlay-in"} ${closing ? OUT_MS : 160}ms var(--ease-out) both` }}
        onClick={onClose}
      />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="desk-dialog no-bar relative w-full overflow-y-auto rounded-[16px] border border-border bg-surface p-5 outline-none"
        style={{
          maxWidth: WIDTH[width],
          maxHeight: "min(86dvh, 900px)",
          boxShadow: "var(--shadow-raised)",
          animation: `${closing ? "desk-dialog-out" : "desk-dialog-in"} ${closing ? OUT_MS : 160}ms var(--ease-out) both`,
        }}
      >
        {title ? (
          <h2 id={titleId} className="mb-3 pr-8 font-display text-[17px] font-semibold leading-6">
            {title}
          </h2>
        ) : null}
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
        >
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
