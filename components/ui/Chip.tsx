"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ChipTone = "neutral" | "warn" | "danger" | "muted" | "accent";

const TONES: Record<ChipTone, string> = {
  neutral: "border-border bg-surface-2 text-text",
  warn: "border-warn/50 bg-warn/10 text-warn",
  danger: "border-danger/50 bg-danger/10 text-danger",
  muted: "border-border bg-transparent text-muted",
  accent: "border-accent/50 bg-accent/10 text-accent",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ChipTone;
  children: ReactNode;
  /** A chip that does nothing renders as text, not as a dead button. */
  interactive?: boolean;
};

/** Status chip: label typography, radius 12, colour only via status tokens (DESIGN §1.3). */
export function Chip({ tone = "neutral", interactive = true, className = "", children, ...rest }: Props) {
  const base = [
    "inline-flex items-center gap-1 rounded-[12px] border px-2.5 py-1",
    "text-[13px] leading-4 whitespace-nowrap",
    TONES[tone],
    className,
  ].join(" ");

  if (!interactive) return <span className={base}>{children}</span>;

  return (
    <button
      type="button"
      className={`${base} min-h-[32px] transition-transform duration-[120ms] active:scale-[0.98]`}
      {...rest}
    >
      {children}
    </button>
  );
}
