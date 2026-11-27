import type { ReactNode } from "react";

/**
 * The desk's own signs (D-214): the sections of the navigation, the pages of «Настройки» and the
 * blocks of «Сегодня», drawn in the mark's language — a line 1.5 px thick at any size, round ends,
 * and exactly one dot: the mark's own dot, which every thing of the product is made of (D-205).
 * The dot is the part that answers: it takes the accent in the chosen section and beats once as
 * the section opens (app/desk/graphite.css, `.desk-ico`). Anything that is not a section keeps the
 * library's icon (`lucide-react`, D-165) in the same weight of line.
 */
export type DeskIconName =
  | "today"
  | "tasks"
  | "inbox"
  | "team"
  | "errands"
  | "ether"
  | "reports"
  | "calendar"
  | "notes"
  | "boards"
  | "screen"
  | "settings"
  | "profile"
  | "company"
  | "program"
  | "points"
  | "model"
  | "dictionary"
  | "lab"
  | "data"
  | "shop"
  | "messages"
  | "rating";

/** The dot — never stroked, always the last thing drawn, so it lies over the lines. */
function Dot({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle className="desk-ico-dot" cx={cx} cy={cy} r={r} />;
}

/** Each sign on a 20 × 20 field, 2.5 of air on every side. */
const SIGN: Record<DeskIconName, ReactNode> = {
  // the mark itself: the day is the product's home
  today: (
    <>
      <circle cx="10" cy="10" r="6.75" />
      <Dot cx={10} cy={10} r={2.25} />
    </>
  ),
  // two lines of a list: one done, one waiting
  tasks: (
    <>
      <path d="M9.25 6h7.25M9.25 14h7.25" />
      <circle cx="4.75" cy="14" r="1.75" />
      <Dot cx={4.75} cy={6} r={2} />
    </>
  ),
  // a tray with the thing that waits in it
  inbox: (
    <>
      <path d="M3 11.5 5.2 5.4a1.5 1.5 0 0 1 1.4-.9h6.8a1.5 1.5 0 0 1 1.4.9L17 11.5v3a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z" />
      <path d="M3 11.5h3.6l1 2h4.8l1-2H17" />
      <Dot cx={10} cy={8} r={1.5} />
    </>
  ),
  // two people: one a ring, one the dot
  team: (
    <>
      <circle cx="7.5" cy="7" r="2.75" />
      <path d="M2.5 16.5c.3-3 2.3-4.75 5-4.75s4.7 1.75 5 4.75" />
      <path d="M14.6 12.1c1.75.4 2.8 2 2.9 4.4" />
      <Dot cx={14.4} cy={7.6} r={2} />
    </>
  ),
  // the bell on the secretary's desk
  errands: (
    <>
      <path d="M4 13.5a6 6 0 0 1 12 0M2.75 16.25h14.5M10 6.6v.9" />
      <Dot cx={10} cy={4.75} r={1.6} />
    </>
  ),
  // the dot on air: two waves leave it
  ether: (
    <>
      <path d="M9.75 6.6a4.8 4.8 0 0 1 0 6.8M13 4a8.5 8.5 0 0 1 0 12" />
      <Dot cx={5.25} cy={10} r={2.1} />
    </>
  ),
  // a sheet with its lines and the mark of «сдан»
  reports: (
    <>
      <rect x="4" y="2.75" width="12" height="14.5" rx="2.5" />
      <path d="M7.25 6.9h5.5M7.25 10.2h5.5" />
      <Dot cx={8} cy={13.6} r={1.4} />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="14" height="13" rx="2.5" />
      <path d="M3 8.25h14M7 2.5v3M13 2.5v3" />
      <Dot cx={10} cy={12.6} r={1.7} />
    </>
  ),
  // a pencil and the full stop it has just put
  notes: (
    <>
      <path d="m4 16 .6-3.3 8.2-8.2a1.6 1.6 0 0 1 2.3 0l.4.4a1.6 1.6 0 0 1 0 2.3L7.3 15.4z" />
      <path d="m11.6 5.7 2.7 2.7" />
      <Dot cx={15.4} cy={15.6} r={1.5} />
    </>
  ),
  // a board's points: three laid out, the fourth is the dot
  boards: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.75" />
      <rect x="11" y="3" width="6" height="6" rx="1.75" />
      <rect x="3" y="11" width="6" height="6" rx="1.75" />
      <Dot cx={14} cy={14} r={2.4} />
    </>
  ),
  // the wall: a screen on its foot, lit
  screen: (
    <>
      <rect x="2.5" y="3.75" width="15" height="10.5" rx="2.25" />
      <path d="M7 17h6M10 14.25V17" />
      <Dot cx={10} cy={9} r={1.8} />
    </>
  ),
  // two sliders: one knob a ring, one the dot
  settings: (
    <>
      <path d="M3 6.5h3.25M10.75 6.5H17M3 13.5h7.25M14.75 13.5H17" />
      <circle cx="8.5" cy="6.5" r="2.25" />
      <Dot cx={12.5} cy={13.5} r={2.25} />
    </>
  ),
  profile: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M5.6 15.6c.8-2 2.4-3 4.4-3s3.6 1 4.4 3" />
      <Dot cx={10} cy={8} r={2.1} />
    </>
  ),
  company: (
    <>
      <rect x="4" y="3" width="12" height="14" rx="2" />
      <path d="M8.5 17v-3.25h3V17" />
      <Dot cx={10} cy={7.6} r={1.6} />
    </>
  ),
  program: (
    <>
      <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
      <path d="M2.5 8h15" />
      <Dot cx={10} cy={12} r={1.7} />
    </>
  ),
  // points: the dot shining, as the pleased mark does
  points: (
    <>
      <path d="M10 2.75v2.5M10 14.75v2.5M2.75 10h2.5M14.75 10h2.5M4.9 4.9l1.7 1.7M13.4 13.4l1.7 1.7M15.1 4.9l-1.7 1.7M6.6 13.4l-1.7 1.7" />
      <Dot cx={10} cy={10} r={2.2} />
    </>
  ),
  // the model at its work: the ring opened into arcs, as the mark parses
  model: (
    <>
      <path d="M10 3.25A6.75 6.75 0 0 1 16.75 10M10 16.75A6.75 6.75 0 0 1 3.25 10" />
      <Dot cx={10} cy={10} r={2.25} />
    </>
  ),
  dictionary: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v11.5H5.5A1.5 1.5 0 0 0 4 16zM4 16a1.5 1.5 0 0 0 1.5 1.5H16" />
      <Dot cx={10} cy={8.75} r={1.6} />
    </>
  ),
  lab: (
    <>
      <path d="M7.75 3h4.5M8.75 3v4.5l-4.1 7.1A1.6 1.6 0 0 0 6 17h8a1.6 1.6 0 0 0 1.4-2.4L11.25 7.5V3" />
      <Dot cx={9.7} cy={13.3} r={1.5} />
    </>
  ),
  data: (
    <>
      <ellipse cx="10" cy="5.25" rx="6" ry="2.25" />
      <path d="M4 5.25v9.5C4 16 6.7 17 10 17s6-1 6-2.25v-9.5" />
      <Dot cx={10} cy={11.6} r={1.6} />
    </>
  ),
  shop: (
    <>
      <path d="M4.5 7h11l-.8 8.6a1.5 1.5 0 0 1-1.5 1.4H6.8a1.5 1.5 0 0 1-1.5-1.4zM7.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
      <Dot cx={10} cy={11.6} r={1.6} />
    </>
  ),
  messages: (
    <>
      <path d="M4 4.5h12A1.5 1.5 0 0 1 17.5 6v6.5A1.5 1.5 0 0 1 16 14H9.25l-3.5 3v-3H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z" />
      <Dot cx={10} cy={9.25} r={1.6} />
    </>
  ),
  // three places, the dot over the first
  rating: (
    <>
      <path d="M4.5 16.75v-4.5M10 16.75V9.5M15.5 16.75v-6.25" />
      <Dot cx={10} cy={5} r={1.9} />
    </>
  ),
};

/**
 * One of the desk's own signs. `size` is the drawn size; the line stays 1.5 px whatever it is.
 * `lit` — the dot in the accent where nothing else says «chosen» (a block's head on «Сегодня»).
 */
export function DeskIcon({ name, size = 18, lit = false, className = "" }: { name: DeskIconName; size?: number; lit?: boolean; className?: string }) {
  return (
    <svg
      className={`desk-ico ${lit ? "desk-ico-lit" : ""} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-icon={name}
    >
      {SIGN[name]}
    </svg>
  );
}
