"use client";

import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { initialsOf } from "@/lib/idle/people";

/*
 * The right column of «Сегодня» made legible at a glance (D-169): every block wears an icon in its
 * own ink, live things breathe (a meeting on now, a visitor at the door, a request nobody took),
 * shares are drawn as meters that fill, a new row rises into its place. The inks are the sheet's
 * own (journal.css): only the pen, the pencil, green, blue, violet and orange — bright and flat.
 * Everything moves by transform and opacity and stands still under «уменьшить движение».
 */

export type Ink = "pen" | "pencil" | "ok" | "sky" | "violet" | "gold" | "muted";

/** The ink as a CSS colour; outside the desk's sheet the app's own tokens stand in. */
export const INK: Record<Ink, string> = {
  pen: "var(--pen, var(--accent))",
  pencil: "var(--danger)",
  ok: "var(--ok)",
  sky: "var(--sky, var(--accent))",
  violet: "var(--violet, var(--accent))",
  gold: "var(--gold)",
  muted: "var(--text-muted)",
};

const tone = (ink: Ink): CSSProperties => ({ "--tone": INK[ink] }) as CSSProperties;

/**
 * A block's head: its icon on a tile of its ink, then the words. `live` — the block holds something
 * happening right now: a dot breathes on the tile's corner.
 */
export function Titled({ icon: Glyph, ink, live = false, children }: { icon: LucideIcon; ink: Ink; live?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="desk-tile" style={tone(ink)} data-live={live ? "" : undefined}>
        <Glyph size={14} strokeWidth={2.25} />
      </span>
      {children}
    </span>
  );
}

/** A small icon in a row, in an ink: what kind of thing the row is, before any word is read. */
export function Mark({ icon: Glyph, ink, size = 14, title }: { icon: LucideIcon; ink: Ink; size?: number; title?: string }) {
  return (
    <span aria-hidden={title ? undefined : true} title={title} className="inline-flex shrink-0 items-center justify-center" style={{ color: INK[ink] }}>
      <Glyph size={size} strokeWidth={2.25} />
    </span>
  );
}

/** Something happening right now: a dot of its ink with a ring breathing out of it. */
export function Live({ ink = "ok", title }: { ink?: Ink; title?: string }) {
  return <span aria-hidden={title ? undefined : true} title={title} className="desk-live" style={tone(ink)} />;
}

/** A word on a plate of its ink: «идёт», «через 10 мин», «+200». */
export function Pill({ ink, children, icon: Glyph, testId }: { ink: Ink; children: ReactNode; icon?: LucideIcon; testId?: string }) {
  return (
    <span className="desk-pill" style={tone(ink)} data-testid={testId}>
      {Glyph ? <Glyph size={12} strokeWidth={2.5} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** A share as a bar: the filled part in the ink, the rest a pale track of it; fills in on arrival. */
export function Meter({ value, of, ink, label, className = "" }: { value: number; of: number; ink: Ink; label?: string; className?: string }) {
  const fill = of > 0 ? Math.max(0, Math.min(1, value / of)) : 0;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`desk-meter ${className}`}
      style={{ ...tone(ink), "--fill": fill } as CSSProperties}
    >
      <i />
    </span>
  );
}

/**
 * A person as a small circle with the initials — the circles of «Люди» (D-168) in the column's size,
 * the place a photo is to take.
 */
export function Face({ name, size = 20, ink }: { name: string; size?: number; ink?: Ink }) {
  return (
    <span
      aria-hidden
      className="desk-face"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), ...(ink ? { boxShadow: `0 0 0 1.5px ${INK[ink]}` } : null) }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A row arriving: it rises into its place; `index` staggers a list that arrives at once. */
export function rise(index: number): { className: string; style: CSSProperties } {
  return { className: "desk-rise", style: { animationDelay: `${Math.min(index, 8) * 40}ms` } };
}

/** The block's good news instead of a grey line: an icon in its ink, the words, the quiet hint. */
export function AllClear({ icon: Glyph, ink, children, hint, testId }: { icon: LucideIcon; ink: Ink; children: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <p className="desk-rise flex items-start gap-2.5 py-2" data-testid={testId}>
      <span aria-hidden className="mt-px inline-flex shrink-0" style={{ color: INK[ink] }}>
        <Glyph size={16} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 text-[13px] leading-5">
        <span className="font-medium text-text">{children}</span>
        {hint ? <span className="block text-[12px] leading-4 text-muted">{hint}</span> : null}
      </span>
    </p>
  );
}
