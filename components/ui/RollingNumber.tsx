"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { useState, type CSSProperties } from "react";

/**
 * A number of points that rolls its digits like a scoreboard (D-165). The only file that knows
 * `@number-flow/react`: the package comes off by changing this one.
 *
 * Only a rise rolls. A fall changes at once, standing still: a penalty plays nothing, and someone
 * else's minus on the rating or the wall is not lit up (D-45). `rollDown` lets a fall roll too —
 * one's own balance in the shop after an order. The number is shown the moment it comes; the roll
 * plays over it (principle 1a). Under «уменьшить движение» the number just changes. The first
 * render is the same on the server and the client: the plain number, nothing rolling yet.
 */

const FORMAT: Format = { maximumFractionDigits: 0 };

/**
 * The element pads its digits above and below for the fade of a digit rolling out
 * (`--number-flow-mask-height`, 0.25em by default, twice over); taken back by the margin, so the
 * line keeps the height it had with plain text and nothing around it moves.
 */
const SNUG: CSSProperties = {
  marginBlock: "calc(-2 * round(nearest, calc(var(--number-flow-mask-height, 0.25em) / 2), 1px))",
  // digits of one width, as `.nums` gives the plain number
  fontVariantNumeric: "tabular-nums",
};

export function RollingNumber({
  value,
  rollDown = false,
  className,
  style,
}: {
  value: number;
  /** A fall rolls down instead of changing at once. */
  rollDown?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // whether the latest change rolls, decided as it comes (adjusted during render, not in an
  // effect): the new value and the way it is shown reach the screen in one commit
  const [last, setLast] = useState({ value, rolls: false });
  if (last.value !== value) setLast({ value, rolls: value > last.value || rollDown });
  return (
    <NumberFlow
      value={value}
      locales="ru-RU"
      format={FORMAT}
      animated={last.rolls}
      respectMotionPreference
      className={className}
      style={style ? { ...SNUG, ...style } : SNUG}
    />
  );
}
