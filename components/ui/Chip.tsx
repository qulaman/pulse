"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ChipTone = "neutral" | "warn" | "danger" | "muted" | "accent" | "ok" | "gold";

/** Status chips are tinted; the accent chip (an active filter) is filled — it reads as pressed. */
const TONES: Record<ChipTone, string> = {
  neutral: "border-border bg-surface-2 text-text",
  warn: "border-warn/40 bg-warn/12 text-warn",
  danger: "border-danger/40 bg-danger/12 text-danger",
  ok: "border-ok/40 bg-ok/12 text-ok",
  gold: "border-gold/40 bg-gold/12 text-gold",
  muted: "border-border bg-transparent text-muted",
  accent: "border-accent bg-accent text-bg font-semibold",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ChipTone;
  children: ReactNode;
  /** A chip that does nothing renders as text, not as a dead button. */
  interactive?: boolean;
};

/** Pill: label typography, full radius, colour only via status tokens (DESIGN §1.3). */
export function Chip({ tone = "neutral", interactive = true, className = "", children, ...rest }: Props) {
  const base = [
    "inline-flex items-center gap-1 rounded-full border px-3 py-1",
    "font-display text-[13px] font-semibold leading-4 whitespace-nowrap tracking-[-0.01em]",
    TONES[tone],
    className,
  ].join(" ");

  if (!interactive) return <span className={base}>{children}</span>;

  return (
    <button
      type="button"
      className={`${base} min-h-[34px] transition-[transform,background-color,color] duration-[120ms] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35`}
      {...rest}
    >
      {children}
    </button>
  );
}
