"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

/** Bottom sheet: overlay token, 20px top corners, safe-area padding (docs/DESIGN.md §2). */
export function Sheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 h-full w-full"
        style={{ background: "var(--overlay)", animation: "overlay-in var(--t-instant) var(--ease-out) both" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg rounded-t-[20px] border-t border-border bg-surface px-4 pt-4"
        style={{
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          boxShadow: "var(--shadow-raised)",
          animation: "sheet-up 180ms var(--ease-out) both",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        {title ? <h2 className="mb-3 text-[19px] font-semibold leading-6">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
