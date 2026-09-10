"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-bg font-semibold",
  secondary: "bg-surface-2 text-text border border-border",
  ghost: "bg-transparent text-muted",
  danger: "bg-transparent text-danger border border-danger/40",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean };

/** Minimum tap area 44px, radius 12, instant feedback only (docs/DESIGN.md §2). */
export function Button({ variant = "primary", block, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-4",
        "text-[14px] leading-[18px] font-medium transition-transform duration-[120ms]",
        "active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        VARIANTS[variant],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    />
  );
}
