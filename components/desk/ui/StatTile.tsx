"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";

/**
 * One number of a state line — «Ждут вас 7». The tone colours the number only while it says
 * something (zero stays neutral); `href` or `onClick` make it a filter.
 */
export function StatTile({
  label,
  value,
  tone,
  href,
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  /** The filter this tile sets is on. */
  active?: boolean;
}) {
  const quiet = value === 0 || value === "0";
  const body = (
    <>
      <span className="truncate text-[12px] font-medium leading-4 text-muted" title={label}>
        {label}
      </span>
      <span className="nums text-[24px] font-bold leading-7" style={{ color: tone && !quiet ? TONE_VAR[tone] : undefined }}>
        {value}
      </span>
    </>
  );
  const className = `card flex min-w-[132px] flex-1 flex-col gap-0.5 px-3.5 py-3 text-left transition-[border-color] duration-[120ms] ${
    active ? "border-accent/60" : href || onClick ? "hover:border-muted/50" : ""
  }`;
  if (href) {
    return (
      <Link href={href} className={className} data-testid="stat-tile">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={className} data-testid="stat-tile">
        {body}
      </button>
    );
  }
  return (
    <div className={className} data-testid="stat-tile">
      {body}
    </div>
  );
}
