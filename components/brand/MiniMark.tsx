import type { CSSProperties } from "react";

/**
 * What the small mark is doing:
 *   still      nothing moves — the mark as a sign
 *   idle       the pulse: the dot beats, a wave leaves the ring
 *   busy       working on it: the ring opens into three arcs that step round, the dot ticks
 *   listening  the microphone is open: the arcs drift, the dot is three bars of the voice
 *   done       once: the dot pops, one wave — then it stands
 *   alert      something waits: the dot hops, quick waves
 */
export type MiniState = "still" | "idle" | "busy" | "listening" | "done" | "alert";

/**
 * The mascot's small self (D-209): the same dot in a ring, for a line of text, a button, a tab, a
 * tool bar — wherever the product is busy or alive outside Пульс, and on the computer. One inline
 * SVG of eight nodes, no script and no state of its own: a server component, the motion is plain
 * CSS on `transform` and `opacity` (components/brand/mini-mark.css). It takes the colour of the
 * text round it unless `tone` names one, and stands on the text's line like an icon.
 *
 * The big mark (`Mascot`) stays the character of Пульс: it has the look, the things and the acts.
 * This one only says «жив», «работаю», «слушаю», «готово», «ждёт».
 */
export function MiniMark({
  state = "idle",
  size = 16,
  tone,
  label,
  className = "",
  style,
}: {
  state?: MiniState;
  /** the side of its box, px; the wave of `idle` reaches a little beyond it */
  size?: number;
  /** a colour of its own; without it — the text's */
  tone?: string;
  /** read to a screen reader; without it the mark is decoration */
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`mini-mark ${className}`}
      data-state={state}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, color: tone, ...style }}
    >
      <svg viewBox="-12 -12 24 24" width={size} height={size}>
        <circle className="mm-wave" r="8.6" strokeWidth="1" />
        <circle className="mm-ring" r="8.6" strokeWidth="1.8" />
        <g className="mm-arcs">
          <circle r="8.6" strokeWidth="1.8" strokeDasharray="13.2 4.812" strokeLinecap="round" />
        </g>
        <circle className="mm-dot" r="2.9" />
        <g className="mm-bars">
          <path d="M-4.3 -2.4 V2.4" />
          <path d="M0 -4.2 V4.2" />
          <path d="M4.3 -2.4 V2.4" />
        </g>
      </svg>
    </span>
  );
}
