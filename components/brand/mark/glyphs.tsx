import type { ReactNode } from "react";

/**
 * What the dot of the mark turns into (D-205): the things of the product, drawn in the mark's own
 * hand — one solid shape in the mark's colour, rounded like the dot, details cut out in the dark of
 * the page (`--bk-ink`). A glyph is drawn round (0, 0) in a 64-box and stays inside the iris of the
 * ring. What moves inside a glyph (ticks, steam, the hands of a clock) is a class from `mark.css`.
 */
export type GlyphId =
  | "card"
  | "card-bang"
  | "card-bang2"
  | "card-x"
  | "check"
  | "question"
  | "envelope"
  | "lines"
  | "stack"
  | "hourglass"
  | "clock"
  | "calendar"
  | "cup"
  | "megaphone"
  | "bubble"
  | "bubble-lines"
  | "list"
  | "note"
  | "send"
  | "star"
  | "medal"
  | "coin"
  | "heart"
  | "thumb"
  | "mic-off"
  | "signal-off"
  | "smile"
  | "shut"
  | "sound"
  | "quiet";

const INK = "var(--bk-ink)";
const cut = { fill: "none", stroke: INK, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const line = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The card of a task: the thing most of the product is about. */
function Card({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect x="-19" y="-14" width="38" height="28" rx="7" fill="currentColor" />
      {children}
    </>
  );
}

/** A slash through a thing that is not there: the dark gap first, the stroke in it. */
function Slash() {
  return (
    <>
      <path d="M-17 17 L17 -17" {...cut} strokeWidth="9" />
      <path d="M-17 17 L17 -17" {...line} strokeWidth="4" />
    </>
  );
}

const STAR = "M0 -19 L5.3 -6.6 L18.6 -5.6 L8.4 3.1 L11.6 16.2 L0 9.2 L-11.6 16.2 L-8.4 3.1 L-18.6 -5.6 L-5.3 -6.6 Z";

function draw(id: GlyphId, count: number, hot: boolean): ReactNode {
  switch (id) {
    case "card":
      return (
        <Card>
          <path d="M-11 -4 H6 M-11 4 H-1" {...cut} strokeWidth="3.4" />
        </Card>
      );
    case "card-bang":
      return (
        <Card>
          <path d="M0 -7 V1.5" {...cut} strokeWidth="4.2" />
          <circle cx="0" cy="8" r="2.4" fill={INK} />
        </Card>
      );
    case "card-bang2":
      return (
        <Card>
          <path d="M-5.5 -7 V1.5 M5.5 -7 V1.5" {...cut} strokeWidth="4.2" />
          <circle cx="-5.5" cy="8" r="2.4" fill={INK} />
          <circle cx="5.5" cy="8" r="2.4" fill={INK} />
        </Card>
      );
    case "card-x":
      return (
        <Card>
          <path d="M-6 -6 L6 6 M6 -6 L-6 6" {...cut} strokeWidth="4" />
        </Card>
      );
    case "check":
      return <path d="M-16 1 L-5.5 11.5 L16 -11" {...line} strokeWidth="8.5" />;
    case "question":
      return (
        <>
          <path d="M-9.5 -9.5 A9.8 9.8 0 1 1 4 -0.5 Q0 2 0 7" {...line} strokeWidth="7.5" />
          <circle cx="0" cy="17" r="4.4" fill="currentColor" />
        </>
      );
    case "envelope":
      return (
        <>
          <rect x="-20" y="-14" width="40" height="28" rx="7" fill="currentColor" />
          <path d="M-14 -8 L0 3.5 L14 -8" {...cut} strokeWidth="3.4" />
        </>
      );
    case "lines":
      return (
        <g className="bk-g-lines">
          <path d="M-17 -12 H17" {...line} strokeWidth="7" />
          <path d="M-17 0 H17" {...line} strokeWidth="7" />
          <path d="M-17 12 H3" {...line} strokeWidth="7" />
        </g>
      );
    case "stack": {
      const layers = Math.max(1, Math.min(3, count));
      return (
        <>
          {layers > 2 ? <rect x="-13" y="-19" width="34" height="24" rx="6.5" fill="currentColor" opacity="0.4" /> : null}
          {layers > 1 ? <rect x="-17" y="-14.5" width="35" height="25" rx="6.5" fill="currentColor" opacity="0.66" /> : null}
          <g className="bk-g-top">
            <rect x="-21" y="-9" width="36" height="26" rx="6.5" fill="currentColor" />
            <path d="M-14 0.5 H3 M-14 8 H-5" {...cut} strokeWidth="3.2" />
          </g>
          {/* a card of the stack is due within the hour */}
          {hot ? <circle cx="16" cy="-12" r="5.2" fill="var(--danger)" stroke={INK} strokeWidth="2" className="bk-g-hot" /> : null}
        </>
      );
    }
    case "hourglass":
      return (
        <g className="bk-g-flip">
          <path d="M-12.5 -18 H12.5 L2.6 0 L12.5 18 H-12.5 L-2.6 0 Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
          <path d="M-6 13.5 H6 L0 6 Z" fill={INK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M0 -6 V2" {...cut} strokeWidth="2" className="bk-g-sand" />
        </g>
      );
    case "clock":
      return (
        <>
          <circle r="20" fill="currentColor" />
          <path d="M0 0 V-11" {...cut} strokeWidth="3.6" className="bk-g-hand-min" />
          <path d="M0 0 H7.5" {...cut} strokeWidth="3.6" className="bk-g-hand-hour" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="-18" y="-15" width="36" height="33" rx="7.5" fill="currentColor" />
          <path d="M-9 -20 V-13 M9 -20 V-13" {...line} strokeWidth="4.4" />
          <path d="M-12 -5 H12" {...cut} strokeWidth="3" />
          <rect x="-11" y="1.5" width="8.6" height="8.6" rx="2.4" fill={INK} />
          {/* the day torn off: it falls and is gone */}
          <rect x="-7" y="-2" width="15" height="13" rx="3.4" fill="currentColor" stroke={INK} strokeWidth="1.6" className="bk-g-page" />
        </>
      );
    case "cup":
      return (
        <>
          <path d="M-8 -17 q-4 -4 0 -8 M3 -17 q-4 -4 0 -8" {...line} strokeWidth="2.8" className="bk-g-steam" />
          <path d="M9 -5 h3.5 a6.5 6.5 0 0 1 0 13 h-4" {...line} strokeWidth="4.2" />
          <path d="M-17 -9 H10 V3 A12 12 0 0 1 -2 15 H-5 A12 12 0 0 1 -17 3 Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M-19 20 H12" {...line} strokeWidth="3.4" />
        </>
      );
    case "megaphone":
      return (
        <>
          <path d="M-19 -5 L1 -15 V15 L-19 5 Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
          <path d="M-13 8 V15" {...line} strokeWidth="6" />
          <path d="M8 -7 A9 9 0 0 1 8 7" {...line} strokeWidth="3.6" className="bk-g-arc bk-g-arc-1" />
          <path d="M14 -13 A17 17 0 0 1 14 13" {...line} strokeWidth="3.6" className="bk-g-arc bk-g-arc-2" />
        </>
      );
    case "bubble":
      return (
        <>
          <path d="M-12 -16 H12 A8 8 0 0 1 20 -8 V4 A8 8 0 0 1 12 12 H-4 L-13 19 V12 A8 8 0 0 1 -20 4 V-8 A8 8 0 0 1 -12 -16 Z" fill="currentColor" />
          <circle cx="-9" cy="-2" r="2.9" fill={INK} className="bk-g-dot bk-g-dot-1" />
          <circle cx="0" cy="-2" r="2.9" fill={INK} className="bk-g-dot bk-g-dot-2" />
          <circle cx="9" cy="-2" r="2.9" fill={INK} className="bk-g-dot bk-g-dot-3" />
        </>
      );
    case "bubble-lines":
      return (
        <>
          <path d="M-12 -16 H12 A8 8 0 0 1 20 -8 V4 A8 8 0 0 1 12 12 H-4 L-13 19 V12 A8 8 0 0 1 -20 4 V-8 A8 8 0 0 1 -12 -16 Z" fill="currentColor" />
          <path d="M-11 -6 H11" {...cut} strokeWidth="3.2" className="bk-g-write bk-g-write-1" />
          <path d="M-11 2 H3" {...cut} strokeWidth="3.2" className="bk-g-write bk-g-write-2" />
        </>
      );
    case "list":
      return (
        <>
          {[-13, 0, 13].map((y, row) => (
            <g key={y}>
              <path d={`M-19 ${y} l3.6 3.6 l6.6 -7.4`} {...line} strokeWidth="3.6" className={`bk-g-tick bk-g-tick-${row + 1}`} />
              <path d={`M-2 ${y} H${row === 2 ? 10 : 19}`} {...line} strokeWidth="5.6" opacity={0.9} />
            </g>
          ))}
        </>
      );
    case "note":
      return (
        <g className="bk-g-sink">
          <rect x="-15" y="-18" width="30" height="36" rx="7" fill="currentColor" />
          <path d="M-8 -4 V4 M-3 -9 V9 M2 -5 V5 M7 -2 V2" {...cut} strokeWidth="3" />
        </g>
      );
    case "send":
      return (
        <g className="bk-g-up">
          <path d="M0 -17 L14.5 -1 H6.5 V15 H-6.5 V-1 H-14.5 Z" fill="currentColor" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
        </g>
      );
    case "star":
      return <path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" className="bk-g-twirl" />;
    case "medal":
      return (
        <>
          <path d="M-12 -22 L-4 -6 M12 -22 L4 -6" {...line} strokeWidth="6.5" />
          <circle cx="0" cy="6" r="14.5" fill="currentColor" />
          <path d={STAR} transform="translate(0 6.4) scale(0.42)" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </>
      );
    case "coin":
      return (
        <>
          <circle r="19.5" fill="currentColor" />
          <circle r="13" {...cut} strokeWidth="2.6" />
          <path d={STAR} transform="scale(0.36)" fill={INK} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </>
      );
    case "heart":
      return <path d="M0 17 C-22 3 -19 -16 -7.5 -16 C-3 -16 0 -12.5 0 -9.5 C0 -12.5 3 -16 7.5 -16 C19 -16 22 3 0 17 Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />;
    case "thumb":
      return (
        <>
          <rect x="-19" y="-3" width="9" height="20" rx="3.6" fill="currentColor" />
          <path d="M-6 -3 L1 -18 Q7.5 -19 7.5 -11 V-5 H15 A4.4 4.4 0 0 1 19 0.5 L16.6 13 A4.6 4.6 0 0 1 12 17 H-6 Z" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        </>
      );
    case "mic-off":
      return (
        <>
          <rect x="-7.5" y="-20" width="15" height="24" rx="7.5" fill="currentColor" />
          <path d="M-13 -3 A13 13 0 0 0 13 -3 M0 10 V18 M-7 18.5 H7" {...line} strokeWidth="4" />
          <Slash />
        </>
      );
    case "signal-off":
      return (
        <>
          <circle cx="0" cy="13" r="4.4" fill="currentColor" />
          <path d="M-9 3 A12.5 12.5 0 0 1 9 3 M-17 -5.5 A24 24 0 0 1 17 -5.5" {...line} strokeWidth="4.6" />
          <Slash />
        </>
      );
    // glad: in a ring an arc is read as a mouth, so the glad one curves up at its ends
    case "smile":
      return <path d="M-15 -5 Q0 13 15 -5" {...line} strokeWidth="9" />;
    // an eye shut: a level line — not an arc, an arc would smile
    case "shut":
      return <path d="M-14 0 H14" {...line} strokeWidth="8" />;
    case "sound":
      return (
        <>
          {[-14, -7, 0, 7, 14].map((x, i) => (
            <path key={x} d={`M${x} -13 V13`} {...line} strokeWidth="5" className={`bk-g-bar bk-g-bar-${i + 1}`} />
          ))}
        </>
      );
    // nothing came through: a level that lies flat
    case "quiet":
      return <path d="M-17 0 H-10 M-3.5 0 H3.5 M10 0 H17" {...line} strokeWidth="6.5" className="bk-g-flat" />;
  }
}

export function Glyph({ id, count = 1, hot = false }: { id: GlyphId; count?: number; hot?: boolean }) {
  return (
    <svg viewBox="-32 -32 64 64" width="64" height="64" aria-hidden data-glyph={id}>
      {draw(id, count, hot)}
    </svg>
  );
}

/** A sleeper's «z», a spark, a note of a tune, a drop off the brow: the small things round the ring. */
export function Bit({ id }: { id: "z" | "spark" | "tune" | "drop" }) {
  if (id === "z") {
    return (
      <svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden>
        <path d="M-4.5 -5 H4.5 L-4.5 5 H4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "spark") {
    return (
      <svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden>
        <path d="M0 -7.5 Q1 -1 7.5 0 Q1 1 0 7.5 Q-1 1 -7.5 0 Q-1 -1 0 -7.5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (id === "tune") {
    return (
      <svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden>
        <ellipse cx="-2.6" cy="4.4" rx="3.3" ry="2.6" fill="currentColor" />
        <path d="M0.4 4.4 V-6 L5.6 -4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden>
      <path d="M0 -6.5 C4 -1 5 1.6 5 3 A5 5 0 0 1 -5 3 C-5 1.6 -4 -1 0 -6.5 Z" fill="currentColor" />
    </svg>
  );
}
