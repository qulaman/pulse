"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type OrbitId = "tasks" | "messages" | "ether" | "calendar";

export type OrbitBall = {
  id: OrbitId;
  label: string;
  /** What the number in the ball counts; 0 leaves the ball quiet (icon only). */
  count: number;
  /** A CSS colour: the worst lane behind the tasks, warn for open questions, gold for Эфир. */
  tone: string;
};

const BALL = 60;
/** One turn of the orbit; slow enough to read, fast enough to feel alive. */
const ORBIT_S = 28;
/** The same spring the face and its box ride, so the ball lands with them (D-60). */
const SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ICON: Record<OrbitId, ReactNode> = {
  tasks: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <polyline points="4,7 6,9 9.5,5.5" />
      <line x1="12" y1="7" x2="20" y2="7" />
      <polyline points="4,13.5 6,15.5 9.5,12" />
      <line x1="12" y1="13.5" x2="20" y2="13.5" />
      <line x1="12" y1="19" x2="20" y2="19" />
      <circle cx="6.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  messages: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="11.5" x2="13" y2="11.5" />
    </svg>
  ),
  ether: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 10v4h3l6 4V6l-6 4z" />
      <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  ),
  calendar: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="14" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </svg>
  ),
};

/**
 * The balls the face lets out on a tap (D-60): tasks that need the director, open
 * messages in tasks, the announcements of Эфир, the meetings ahead — each with its count. In `ring`
 * mode they orbit the face slowly (CSS only, the labels stay upright); in `row` mode
 * (a panel is open) they line up under the face. One tap on a ball opens its panel.
 *
 * A ball is never thrown away and drawn anew: `layoutId` makes the ring ball and the row
 * ball the same thing in two places, so opening a panel walks each ball down from its
 * orbit into the line and closing it walks them back up. `hidden` (the face asleep) keeps
 * the ring mounted and shrinks the balls into the head instead of unmounting them — the
 * ball has to exist for the walk to have a starting point.
 */
export function OrbitBalls({
  balls,
  mode,
  activeId,
  radius,
  onPick,
  hidden = false,
}: {
  balls: OrbitBall[];
  mode: "ring" | "row";
  activeId: OrbitId | null;
  radius: number;
  onPick: (ball: OrbitBall) => void;
  /** ring only: the face is asleep — the balls are inside the head, ready to come out */
  hidden?: boolean;
}) {
  const n = balls.length;
  if (n === 0) return null;
  const ring = mode === "ring";
  const spinning = ring && !hidden;

  return (
    // plain divs carry the ring: the CSS orbit owns their transforms, framer only moves the balls
    <div
      className={ring ? "pointer-events-none absolute inset-0" : "flex justify-center gap-4"}
      style={spinning ? { animation: `orbit-spin ${ORBIT_S}s linear infinite` } : undefined}
      data-testid="orbit"
      data-mode={mode}
      data-hidden={hidden ? "1" : "0"}
    >
      {balls.map((ball, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const active = activeId === ball.id;
        const quiet = ball.count === 0;
        return (
          <div
            key={ball.id}
            className={ring ? "absolute" : "relative"}
            style={
              ring
                ? { left: `calc(50% - ${BALL / 2}px)`, top: `calc(50% - ${BALL / 2}px)`, transform: `translate(${(Math.cos(angle) * radius).toFixed(1)}px, ${(Math.sin(angle) * radius).toFixed(1)}px)` }
                : undefined
            }
          >
            {/* counter-rotation keeps the icon and the label upright while the ring turns; it
                wraps the travelling ball, so the ball itself is never turned and its box —
                the one the walk into the row is measured from — stays square to the screen */}
            <span className="block" style={spinning ? { animation: `orbit-counter ${ORBIT_S}s linear infinite` } : undefined}>
              <motion.div layoutId={`orbit-${ball.id}`} transition={SPRING} className="block">
                <motion.button
                  type="button"
                  initial={false}
                  animate={{ scale: hidden ? 0 : active ? 1.12 : 1, opacity: hidden ? 0 : 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22, delay: spinning ? i * 0.07 : 0 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onPick(ball)}
                  aria-label={`${ball.label}: ${ball.count}`}
                  aria-hidden={hidden}
                  tabIndex={hidden ? -1 : 0}
                  aria-pressed={active}
                  data-testid="orbit-ball"
                  data-ball={ball.id}
                  className="pointer-events-auto flex flex-col items-center gap-1"
                >
                  <span
                    className="relative flex items-center justify-center rounded-full"
                    style={{
                      width: BALL,
                      height: BALL,
                      color: quiet ? "var(--text-muted)" : ball.tone,
                      background: `color-mix(in srgb, ${quiet ? "var(--text-muted)" : ball.tone} ${active ? 30 : 14}%, var(--surface))`,
                      border: `2px solid ${quiet ? "var(--border)" : `color-mix(in srgb, ${ball.tone} ${active ? 100 : 60}%, transparent)`}`,
                      boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${ball.tone} 22%, transparent)` : "var(--shadow-raised)",
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {ICON[ball.id]}
                    {!quiet ? (
                      <span
                        className="nums absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-display text-[13px] font-bold leading-none text-bg"
                        style={{ background: ball.tone }}
                      >
                        {ball.count}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[12px] leading-4 text-muted">{ball.label}</span>
                </motion.button>
              </motion.div>
            </span>
          </div>
        );
      })}
    </div>
  );
}
