"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { isIosWeb } from "@/lib/haptics";

type Tone = "accent" | "gold" | "danger" | "muted";

const TILE: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
  gold: { bg: "color-mix(in srgb, var(--gold) 15%, transparent)", fg: "var(--gold)" },
  danger: { bg: "color-mix(in srgb, var(--danger) 14%, transparent)", fg: "var(--danger)" },
  muted: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
};

/** One inset card holding a stack of rows; the hairline between them is the divider. */
export function RowGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70 ${className}`}>{children}</div>
  );
}

type Props = {
  icon: ReactNode;
  title: string;
  /** Right-hand state: «включены», «сменить», a count. Never a second sentence. */
  value?: ReactNode;
  valueColor?: string;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** An on/off row: the switch on the right, the whole row toggles it. */
  toggle?: { on: boolean; onChange: (on: boolean) => void };
};

const BASE =
  "flex min-h-[58px] w-full items-center gap-3 px-4 text-left transition-colors duration-[120ms] ease-out";

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="-mr-0.5 shrink-0 text-muted">
      <polyline
        points="6,3.5 10.5,8 6,12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Safari's own switch (17.4+): an iPhone draws it native and ticks when the finger flips it. */
const SWITCH = { switch: "" } as Record<string, string>;
const noStore = () => () => {};

/** The switch of an on/off row: Safari's native one on an iPhone, the app's own pill elsewhere. */
function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const ios = useSyncExternalStore(noStore, isIosWeb, () => false);
  return (
    <input
      type="checkbox"
      {...SWITCH}
      role="switch"
      checked={on}
      onChange={(event) => onChange(event.target.checked)}
      className={
        ios
          ? "shrink-0"
          : "relative h-[26px] w-[44px] shrink-0 cursor-pointer appearance-none rounded-full bg-surface-2 transition-colors duration-150 before:absolute before:left-[3px] before:top-[3px] before:h-5 before:w-5 before:rounded-full before:bg-text before:transition-transform before:duration-150 checked:bg-accent checked:before:translate-x-[18px]"
      }
    />
  );
}

/**
 * A list row (docs/DESIGN.md §2): a tinted 32px icon tile, the label in body size, the
 * current state on the right, a chevron only where a tap leads somewhere. Tap target
 * 58px, press = a surface tint, never a shadow. Used by Профиль and Настройки.
 */
export function Row({ icon, title, value, valueColor, tone = "accent", href, onClick, disabled, busy, toggle }: Props) {
  const tile = TILE[tone];
  if (toggle) {
    return (
      <label className={`${BASE} cursor-pointer active:bg-surface-2`}>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: tile.bg, color: tile.fg }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[16px] leading-[22px]">{title}</span>
        <Toggle on={toggle.on} onChange={toggle.onChange} />
      </label>
    );
  }
  const body = (
    <>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: tile.bg, color: tile.fg }}
      >
        {icon}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[16px] leading-[22px]"
        style={tone === "danger" ? { color: "var(--danger)" } : undefined}
      >
        {title}
      </span>
      {value !== undefined ? (
        <span
          className="max-w-[46%] shrink-0 truncate text-right text-[13px] leading-4 text-muted"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {busy ? "…" : value}
        </span>
      ) : null}
      {/* a destructive row never gets a chevron: it opens a question, it does not lead on */}
      {(href || (onClick && !disabled)) && tone !== "danger" ? <Chevron /> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${BASE} relative active:bg-surface-2`}>
        {body}
        <HapticSwitch />
      </Link>
    );
  }

  if (!onClick || disabled) {
    return <div className={BASE}>{body}</div>;
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${BASE} relative active:bg-surface-2`}>
      {body}
      {/* the iPhone's tick lies under the finger (D-147) */}
      {busy ? null : <HapticSwitch />}
    </button>
  );
}
