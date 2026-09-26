import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Icons of a task: stroke family, 16px, inherit colour — the card and the desk */
/* -------------------------------------------------------------------------- */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type IconName =
  | "clock"
  | "check"
  | "question"
  | "x"
  | "rotate"
  | "undo"
  | "flame"
  | "quote"
  | "hand"
  | "reply"
  | "send"
  | "swap"
  | "bell"
  | "open"
  | "left"
  | "right";

const PATHS: Record<IconName, ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  question: (
    <>
      <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  rotate: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" />,
  undo: <path d="M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />,
  flame: <path d="M12 3s5 4.5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3 1-5.5 1-8z" />,
  quote: <path d="M8 6h8M6 12h12M8 18h8" />,
  hand: <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-6a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.2-3L4.5 13a1.6 1.6 0 0 1 2.6-1.8L9 13" />,
  reply: <path d="M10 8 5 12.5l5 4.5M5 12.5h9a5 5 0 0 1 5 5V19" />,
  send: <path d="M4.5 12 19.5 5l-4 14-3.5-5.5L4.5 12zM12 13.5l3.5-4" />,
  swap: <path d="M7 5 4 8l3 3M4 8h12M17 13l3 3-3 3M20 16H8" />,
  open: <path d="M9 5.5 15.5 12 9 18.5" />,
  left: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="shrink-0">
      {PATHS[name]}
    </svg>
  );
}
