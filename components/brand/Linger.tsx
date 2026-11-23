"use client";

import { useState, type ReactNode } from "react";

/**
 * A held thing that is no longer held goes back the way it came: down into the hand, smaller. Quicker
 * than it came (0.45 s) and on `--ease-in`, so it starts going at once: a clipboard that stayed whole
 * for a beat hung by the side of a face already grown back after its card closed.
 */
export const PROP_OUT = "mascot-prop-out 0.2s cubic-bezier(0.4, 0, 1, 1) both";
/** A piece of a room or a scene that is no longer needed fades where it stands. */
export const FADE_OUT = "mascot-fade-out 0.26s ease-in both";
/** Amber and gold that are not held go by getting smaller where they are — never by a fade, half-clear they read brown (D-151). */
export const SHRINK_OUT = "mascot-shrink-out 0.2s cubic-bezier(0.4, 0, 1, 1) both";
/**
 * The hands of an act cut short (useMascotActs drops a called act when a job needs its hand): the
 * arm draws back into the body instead of vanishing in one frame. At an act's own end it is already gone.
 */
export const ACT_OUT = "mascot-shrink-out 0.16s cubic-bezier(0.4, 0, 1, 1) both";

/**
 * A prop of a face that leaves instead of blinking out (D-119): the clipboard when the ball
 * closes, the stack when the last order is handed in, the room when a request comes in. While
 * `show` it is drawn as it is; when `show` turns false, the last drawing stays for one exit (`out`)
 * and is dropped on that animation's own end — so a paused sheet (/dev/frames) can hold the exit
 * still, and nothing waits on a timer. The wrapper is the same element throughout, so whatever the
 * prop was doing when it was let go carries on while it leaves. Hidden and not leaving, it draws
 * nothing — an avatar pays for no wrappers.
 */
export function Linger({ show, out = PROP_OUT, origin = "50% 100%", children }: { show: boolean; out?: string; origin?: string; children: ReactNode }) {
  const [kept, setKept] = useState<ReactNode>(show ? children : null);
  const [leaving, setLeaving] = useState(false);
  const [was, setWas] = useState(show);
  // adjusted during render, not in an effect: the exit starts in the same paint as the change
  if (show !== was) {
    setWas(show);
    setLeaving(!show && kept !== null);
  }
  if (show && children !== kept) setKept(children);
  if (!show && !leaving) return null;
  return (
    <g
      style={show ? undefined : { transformBox: "fill-box", transformOrigin: origin, animation: out }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !show) setLeaving(false);
      }}
    >
      {show ? children : kept}
    </g>
  );
}
