"use client";

import { useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";

import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { Tooltip } from "@/components/desk/ui/Tooltip";

/**
 * The desk's square of an icon (D-177): 32×32, the icon 16, its words and key in a hover hint —
 * one button for the «⋯» of a row, the pin of a note, the bin of a card, instead of a hand-drawn
 * copy in every section. Muted at rest, the ink under the mouse, red under the mouse for «danger»;
 * `pressed` keeps it lit (a pin that is on). Pressing gives a small squeeze, off under reduced motion.
 */
const SQUARE =
  "desk-icon-button desk-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition-[background-color,color,scale] duration-[120ms] ease-linear hover:bg-surface-2 active:scale-[.92] active:duration-[70ms] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100";

function tint(tone: "default" | "danger", pressed: boolean) {
  if (pressed) return "bg-surface-2 text-accent";
  return tone === "danger" ? "text-muted hover:text-danger" : "text-muted hover:text-text";
}

export function IconButton({
  label,
  keys,
  icon,
  onClick,
  tone = "default",
  disabled = false,
  pressed,
  testId,
  side = "bottom",
  className = "",
}: {
  /** What it does — the hover hint and the name for a screen reader. */
  label: string;
  /** The keys that do the same outside the button, shown in the hint. */
  keys?: string[];
  /** A 16 px icon (lucide `size={16}`). */
  icon: ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** A toggle that is on (a pinned note): lit, and said as pressed. */
  pressed?: boolean;
  testId?: string;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <Tooltip label={label} keys={keys} side={side}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed === undefined ? undefined : pressed}
        disabled={disabled}
        data-testid={testId}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={`${SQUARE} ${tint(tone, Boolean(pressed))} ${className}`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

/**
 * «⋯» — every other action of a row, a card or a head, in a desk `Menu` under the button. The same
 * square as `IconButton`; the menu keeps one column of icons (`Menu`).
 */
export function MoreMenu({
  items,
  label = "Все действия",
  align = "end",
  testId,
  keys,
  width = 260,
  side = "bottom",
  className = "",
}: {
  items: MenuItem[];
  label?: string;
  align?: "start" | "end";
  testId?: string;
  /** The key that opens the same menu outside the button, if the screen has one. */
  keys?: string[];
  width?: number;
  side?: "top" | "bottom";
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  return (
    <>
      <Tooltip label={label} keys={keys} side={side} disabled={open}>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid={testId}
          disabled={items.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            setAnchor(anchor ? null : event.currentTarget);
          }}
          className={`${SQUARE} ${open ? "bg-surface-2 text-text" : "text-muted hover:text-text"} ${className}`}
        >
          <Ellipsis aria-hidden size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>
      <Menu open={open} onClose={() => setAnchor(null)} anchor={anchor} items={items} align={align} width={width} label={label} />
    </>
  );
}
