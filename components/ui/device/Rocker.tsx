"use client";

import type { ReactNode } from "react";

import r from "./rocker.module.css";

/**
 * The rocker: ◀ ▶ at the two ends of one pill and an OK key between them, in one bezel —
 * the D-pad a hand finds without looking, the way a presenter clicks through slides. The
 * caller puts the kit's `Key`s in it with `rockerKey.back / ok / next`; the rocker only
 * gives them their shape and their place, so every key keeps its sink, tick and light.
 */
export function Rocker({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={r.bezel}>
      {children}
    </div>
  );
}

export const rockerKey = { back: r.back, ok: r.ok, next: r.next } as const;

/** The label under a rocker glyph. */
export function RockerWord({ children }: { children: ReactNode }) {
  return <span className={r.word}>{children}</span>;
}

/** A moulded arrow: a filled, rounded triangle pointing to its end of the rocker. */
export function RockerArrow({ to }: { to: "back" | "next" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path
        d={to === "next" ? "M7.6 4.6c0-.9 1-1.4 1.7-.9l7.4 5.9c.6.5.6 1.4 0 1.9l-7.4 5.9c-.7.5-1.7 0-1.7-.9z" : "M14.4 4.6c0-.9-1-1.4-1.7-.9L5.3 9.6c-.6.5-.6 1.4 0 1.9l7.4 5.9c.7.5 1.7 0 1.7-.9z"}
        fill="currentColor"
      />
    </svg>
  );
}
