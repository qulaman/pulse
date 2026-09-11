"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary text-bg font-semibold",
  secondary: "btn-secondary text-text font-semibold",
  ghost: "bg-transparent text-muted font-medium hover:text-text",
  danger: "bg-transparent text-danger font-semibold border border-danger/40 hover:bg-danger/10",
  gold: "btn-gold text-bg font-semibold",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-[36px] px-3 text-[13px] leading-4",
  md: "min-h-[44px] px-4 text-[15px] leading-5",
  lg: "min-h-[52px] px-6 text-[16px] leading-[22px]",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  /** Spinner in place of the label; the button stays the same width so nothing jumps. */
  loading?: boolean;
  icon?: ReactNode;
};

/**
 * Buttons (docs/DESIGN.md §2): radius 12, tap area ≥ 44, press = scale only.
 * Primary carries the accent gradient and a soft glow; secondary is a raised
 * surface with a light top edge; ghost is text; gold is the director's reward.
 */
export function Button({ variant = "primary", size = "md", block, loading, icon, className = "", children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "relative inline-flex select-none items-center justify-center gap-2 rounded-[12px] font-display tracking-[-0.01em]",
        "transition-[transform,background-color,box-shadow,color] duration-[120ms] ease-out",
        "active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35",
        VARIANTS[variant],
        SIZES[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80" />
        </span>
      ) : null}
      <span className={`inline-flex items-center gap-2 ${loading ? "invisible" : ""}`}>
        {icon ? <span className="-ml-0.5 inline-flex shrink-0">{icon}</span> : null}
        {children}
      </span>
    </button>
  );
}
