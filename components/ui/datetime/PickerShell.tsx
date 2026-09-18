"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * The parts a picker field is made of: a trigger that looks like a field and a panel
 * that opens under it. They are separate so a pair of triggers (a deadline: day and
 * time) can share one full-width panel instead of squeezing a calendar into half a row.
 */

/** Closes on a tap outside or Escape, the way every other surface here does. */
export function useDismiss(open: boolean, onClose: () => void): RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // capture: a sheet's own overlay would swallow the event on its way up
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onClose]);

  return box;
}

type TriggerProps = {
  open: boolean;
  onClick: () => void;
  label: string;
  placeholder: string;
  value: string | null;
  icon: ReactNode;
};

export function PickerTrigger({ open, onClick, label, placeholder, value, icon }: TriggerProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
      className={[
        "flex min-h-[44px] w-full items-center gap-2 field px-3 text-left text-[16px] leading-[22px]",
        "transition-[border-color,box-shadow] duration-[120ms]",
        open ? "border-accent" : "",
      ].join(" ")}
    >
      <span className="shrink-0 text-muted" aria-hidden>{icon}</span>
      <span className={`nums flex-1 truncate ${value ? "text-text" : "text-muted"}`}>{value ?? placeholder}</span>
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden
        className={`shrink-0 text-muted transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/**
 * `@container` so the grids inside can thin out when the panel is half a row wide, and a
 * nudge into view on open: the panel appears in flow, and near the bottom of a page it
 * would open under the tab bar and the microphone. The scroll margin is what keeps it
 * clear of both.
 */
export function PickerPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - BOTTOM_CHROME_PX) {
        el.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={panel}
      style={{ scrollMarginBottom: `${BOTTOM_CHROME_PX}px` }}
      className="@container mt-2 rounded-[12px] border border-border bg-surface p-2"
    >
      {children}
    </div>
  );
}

/** Tab bar plus the floating microphone above it (docs/DESIGN.md §5). */
const BOTTOM_CHROME_PX = 132;

export function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
