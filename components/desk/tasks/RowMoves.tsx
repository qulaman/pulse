"use client";

import { useState, type MouseEvent } from "react";

import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { KEY_CAP, type Move } from "@/lib/desk/tasks";

/**
 * A small button of the desk's lists (D-154), its letter inside — «Принять A». `main` — the
 * director's own move: tinted with the accent; `filled` — the one closing move of a raised card
 * (the panel, the stack), the screen's single filled button. The rest are quiet surfaces.
 */
export function MiniButton({
  label,
  main = false,
  filled = false,
  keyCap,
  title,
  onPress,
  disabled = false,
  size = "sm",
  testId,
}: {
  label: string;
  main?: boolean;
  filled?: boolean;
  keyCap?: string;
  title?: string;
  onPress: (target: HTMLElement) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  testId?: string;
}) {
  const height = size === "md" ? "h-9 px-3.5 text-[14px]" : "h-7 px-2.5 text-[13px]";
  const look = filled
    ? "btn-primary border-transparent text-bg"
    : main
      ? "border-accent/35 bg-accent/12 text-accent hover:bg-accent/20"
      : "border-border bg-surface-2 text-text hover:border-muted/50";
  const cap = filled ? "bg-black/15 text-bg/80" : main ? "bg-accent/15 text-accent/80" : "bg-bg/60 text-muted";
  return (
    <button
      type="button"
      title={title ?? (keyCap ? `${label} · ${keyCap}` : undefined)}
      data-testid={testId}
      disabled={disabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        // a row's click opens its panel; the button is the button only
        event.stopPropagation();
        onPress(event.currentTarget);
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border font-display font-semibold leading-4 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${height} ${look}`}
    >
      {label}
      {keyCap ? (
        <span aria-hidden className={`rounded-[4px] px-1 text-[10px] font-bold leading-[14px] ${cap}`}>
          {keyCap}
        </span>
      ) : null}
    </button>
  );
}

/**
 * One move of a row or a card: the phone's action under a short word with its letter. A reminder
 * sent within the half hour is said, not offered («Напомнили 11:50»). `showKey` — the letter is
 * shown (the row under the cursor); without it the hint keeps it.
 */
export function MoveButton({
  move,
  onPress,
  size = "sm",
  showKey = true,
  fill = false,
}: {
  move: Move;
  onPress: (move: Move, target: HTMLElement) => void;
  size?: "sm" | "md";
  showKey?: boolean;
  /** the main move is the card's one filled button (the stack of «Разобрать») */
  fill?: boolean;
}) {
  if (move.held) {
    const height = size === "md" ? "h-9 px-1 text-[14px]" : "h-7 px-1 text-[13px]";
    return (
      <span className={`inline-flex shrink-0 items-center whitespace-nowrap font-display font-semibold text-muted ${height}`} title={move.title} data-testid={`move-${move.action}`}>
        {move.label}
      </span>
    );
  }
  const cap = move.key ? KEY_CAP[move.key] : undefined;
  return (
    <MiniButton
      label={move.label}
      main={move.main}
      filled={fill && move.main}
      keyCap={showKey ? cap : undefined}
      title={move.title ?? (cap ? `${move.label} · ${cap}` : undefined)}
      onPress={(target) => onPress(move, target)}
      size={size}
      testId={`move-${move.action}`}
    />
  );
}

/** The moves of one task in a row, the reason's own first. */
export function MoveRow({
  moves,
  onPress,
  size = "sm",
  className = "",
  showKeys = true,
  fillMain = false,
}: {
  moves: readonly Move[];
  onPress: (move: Move, target: HTMLElement) => void;
  size?: "sm" | "md";
  className?: string;
  showKeys?: boolean;
  fillMain?: boolean;
}) {
  if (moves.length === 0) return null;
  return (
    <span className={`flex items-center gap-1.5 ${className}`} data-testid="desk-moves">
      {moves.map((move) => (
        <MoveButton key={move.action} move={move} onPress={onPress} size={size} showKey={showKeys} fill={fillMain} />
      ))}
    </span>
  );
}

/** «⋯» — every move the task allows, as the desk's menu under the button (the same list as a right click). */
export function MoreButton({ items, testId = "desk-row-more", label = "Все действия" }: { items: () => MenuItem[]; testId?: string; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={`${label} · правый клик по строке`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        data-testid={testId}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
      {anchor ? <Menu open onClose={() => setAnchor(null)} anchor={anchor} items={items()} align="end" width={280} label={label} /> : null}
    </>
  );
}
