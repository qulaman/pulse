"use client";

import type { MouseEvent } from "react";

import { KEY_CAP, type Move } from "@/lib/desk/tasks";

/**
 * A small button of the desk's lists (D-154), its letter inside — «Принять A». `main` — the
 * director's own move: tinted with the accent, not filled (a screen keeps one filled button, its
 * hero's); the rest are quiet surfaces.
 */
export function MiniButton({
  label,
  main = false,
  keyCap,
  title,
  onPress,
  disabled = false,
  size = "sm",
  testId,
}: {
  label: string;
  main?: boolean;
  keyCap?: string;
  title?: string;
  onPress: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
  testId?: string;
}) {
  const height = size === "md" ? "h-9 px-3.5 text-[14px]" : "h-7 px-2.5 text-[13px]";
  return (
    <button
      type="button"
      title={title ?? (keyCap ? `${label} (${keyCap})` : undefined)}
      data-testid={testId}
      disabled={disabled}
      onClick={(event: MouseEvent) => {
        // a row's click opens its panel; the button is the button only
        event.stopPropagation();
        onPress();
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border font-display font-semibold leading-4 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${height} ${
        main ? "border-accent/35 bg-accent/12 text-accent hover:bg-accent/20" : "border-border bg-surface-2 text-text hover:border-muted/50"
      }`}
    >
      {label}
      {keyCap ? (
        <span aria-hidden className={`rounded-[4px] px-1 text-[10px] font-bold leading-[14px] ${main ? "bg-accent/15 text-accent/80" : "bg-bg/60 text-muted"}`}>
          {keyCap}
        </span>
      ) : null}
    </button>
  );
}

/**
 * One move of a row or a card: the phone's action under a short word with its letter. A reminder
 * sent within the half hour is said, not offered («Напомнили 11:50»).
 */
export function MoveButton({ move, onPress, size = "sm" }: { move: Move; onPress: (move: Move) => void; size?: "sm" | "md" }) {
  if (move.held) {
    const height = size === "md" ? "h-9 px-1 text-[14px]" : "h-7 px-1 text-[13px]";
    return (
      <span className={`inline-flex shrink-0 items-center whitespace-nowrap font-display font-semibold text-muted ${height}`} title={move.title} data-testid={`move-${move.action}`}>
        {move.label}
      </span>
    );
  }
  return (
    <MiniButton
      label={move.label}
      main={move.main}
      keyCap={move.key ? KEY_CAP[move.key] : undefined}
      title={move.title}
      onPress={() => onPress(move)}
      size={size}
      testId={`move-${move.action}`}
    />
  );
}

/** The moves of one task in a row, the reason's own first. */
export function MoveRow({ moves, onPress, size = "sm", className = "" }: { moves: readonly Move[]; onPress: (move: Move) => void; size?: "sm" | "md"; className?: string }) {
  if (moves.length === 0) return null;
  return (
    <span className={`flex items-center gap-1.5 ${className}`} data-testid="desk-moves">
      {moves.map((move) => (
        <MoveButton key={move.action} move={move} onPress={onPress} size={size} />
      ))}
    </span>
  );
}

/** «⋯» — every move the task allows, the phone's «Действия» as a dialog. */
export function MoreButton({ onPress, testId = "desk-row-more" }: { onPress: () => void; testId?: string }) {
  return (
    <button
      type="button"
      aria-label="Действия"
      title="Действия"
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5.5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="18.5" cy="12" r="1.7" />
      </svg>
    </button>
  );
}
