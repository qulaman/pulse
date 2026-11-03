"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover, type Anchor } from "@/components/desk/ui/Popover";

export type MenuItem =
  | {
      key: string;
      label: ReactNode;
      icon?: ReactNode;
      /** The key that does the same outside the menu — shown on the right, a hint, not a binding. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | "separator";

/**
 * A desk menu (D-154 wave 3): a dropdown under a button or a context menu at the cursor — the same
 * list either way. ↑/↓ move, Enter picks, Esc closes; every item says the key that does the same
 * thing outside the menu, so the mouse teaches the keyboard.
 */
export function Menu({
  open,
  onClose,
  anchor,
  items,
  align,
  width = 240,
  label,
  header,
}: {
  open: boolean;
  onClose: () => void;
  anchor: Anchor;
  items: MenuItem[];
  align?: "start" | "end";
  width?: number;
  label?: string;
  /** Words over the items, not an item: who is signed in over «Профиль». */
  header?: ReactNode;
}) {
  const live = items.filter((item): item is Exclude<MenuItem, "separator"> => item !== "separator" && !item.disabled);
  const [at, setAt] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(open);
  if (open !== shown) {
    setShown(open);
    if (open) setAt(0);
  }

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.code === "ArrowDown" || event.code === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setAt((index) => (index + (event.code === "ArrowDown" ? 1 : live.length - 1)) % Math.max(1, live.length));
      } else if (event.code === "Enter" || event.code === "NumpadEnter") {
        const item = live[at];
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        item.onSelect();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, at, live, onClose]);

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} align={align} width={width} label={label}>
      {header ? <div className="border-b border-border/70 px-3 pb-2 pt-2.5">{header}</div> : null}
      <div ref={list} role="menu" className="py-1" data-testid="desk-menu">
        {items.map((item, index) =>
          item === "separator" ? (
            <div key={`sep-${index}`} role="separator" className="my-1 border-t border-border/70" />
          ) : (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseEnter={() => setAt(Math.max(0, live.indexOf(item)))}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={`flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] leading-4 disabled:opacity-40 ${
                live[at] === item ? "bg-surface-2" : ""
              } ${item.danger ? "text-danger" : "text-text"}`}
            >
              {item.icon ? <span className="flex w-4 shrink-0 justify-center text-muted">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint ? <Kbd>{item.hint}</Kbd> : null}
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}

/** A button that opens a menu under itself — «⋯» of a row, «Ещё» of a card. */
export function MenuButton({ items, children, label, className = "", align = "end", width }: { items: MenuItem[]; children: ReactNode; label: string; className?: string; align?: "start" | "end"; width?: number }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        className={className}
      >
        {children}
      </button>
      <Menu open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} items={items} align={align} width={width} label={label} />
    </>
  );
}

/**
 * A right click opens the given menu at the cursor: `const menu = useContextMenu();` then
 * `onContextMenu={(e) => menu.open(e, items)}` on a row and `{menu.node}` once on the screen.
 */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  return {
    open: (event: ReactMouseEvent, items: MenuItem[]) => {
      event.preventDefault();
      setState({ x: event.clientX, y: event.clientY, items });
    },
    node: <Menu open={Boolean(state)} onClose={() => setState(null)} anchor={state ? { x: state.x, y: state.y } : null} items={state?.items ?? []} />,
  };
}
