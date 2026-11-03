"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Kbd } from "@/components/desk/ui/Kbd";

const DELAY_MS = 450;

type Side = "top" | "bottom" | "right";

/**
 * A hover hint on the desk (D-154 wave 3): what a control does and the key that does it, after
 * a short rest of the mouse — «Принять · A». Wraps its child in an inline box (`className` makes
 * it a block — a navigation row); gone on a press, on leave and on scroll. A control reached by
 * the keyboard (Tab, focus-visible) shows its hint at once. `right` — beside a narrow column
 * (the folded navigation). Never the only way to learn something: «?» lists every key.
 */
export function Tooltip({
  label,
  keys,
  children,
  side = "top",
  className = "inline-flex",
  disabled = false,
}: {
  label: string;
  keys?: string[];
  children: ReactNode;
  side?: Side;
  className?: string;
  /** Says nothing for now (a label already on screen) — the child stays as it is. */
  disabled?: boolean;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAt(null);
  };
  const place = () => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    if (side === "right") setAt({ x: rect.right, y: rect.top + rect.height / 2 });
    else setAt({ x: rect.left + rect.width / 2, y: side === "top" ? rect.top : rect.bottom });
  };
  useEffect(() => {
    if (!at) return;
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [at]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const style =
    side === "right"
      ? { left: (at?.x ?? 0) + 10, top: at?.y ?? 0, transform: "translateY(-50%)" }
      : { left: at?.x ?? 0, top: side === "top" ? (at?.y ?? 0) - 6 : (at?.y ?? 0) + 6, transform: `translate(-50%, ${side === "top" ? "-100%" : "0"})` };

  return (
    <span
      ref={box}
      className={className}
      onMouseEnter={() => {
        if (disabled) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(place, DELAY_MS);
      }}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={(event) => {
        if (disabled) return;
        // only a keyboard's focus: a click focuses too, and the hint would jump up under the mouse
        if ((event.target as HTMLElement).matches?.(":focus-visible")) place();
      }}
      onBlur={hide}
    >
      {children}
      {at && !disabled
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[80] flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[12px] leading-4 text-text"
              style={{ ...style, boxShadow: "var(--shadow-raised)" }}
            >
              {label}
              {keys?.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
