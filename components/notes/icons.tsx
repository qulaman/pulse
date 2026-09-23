import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/* Icons of «Заметки»: the stroke family of the desk (components/tasks/desk)    */
/* -------------------------------------------------------------------------- */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type NoteIconName =
  | "mic"
  | "stop"
  | "up"
  | "x"
  | "retry"
  | "pin"
  | "task"
  | "megaphone"
  | "copy"
  | "share"
  | "trash"
  | "restore"
  | "search"
  | "wave"
  | "lock"
  | "note";

const PATHS: Record<NoteIconName, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  up: <path d="M12 19V5.5M6 11l6-6 6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  retry: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" />,
  pin: (
    <>
      <path d="M9 3.5h6l-1 6 3.5 3.5H6.5L10 9.5z" />
      <path d="M12 13v7.5" />
    </>
  ),
  task: <path d="M4.5 12 19.5 5l-4 14-3.5-5.5L4.5 12zM12 13.5l3.5-4" />,
  megaphone: (
    <>
      <path d="M4 10v4h3l7 4.5v-13L7 10z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  share: <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" />,
  restore: <path d="M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  wave: <path d="M4 12h1.5M8 8v8M11.5 5v14M15 9v6M18.5 11v2" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  note: <path d="M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 12.5h6M9 16h4" />,
};

export function NoteIcon({ name, size = 16, className = "" }: { name: NoteIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className={`shrink-0 ${className}`}>
      {PATHS[name]}
    </svg>
  );
}
