"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type OrbitId = "tasks" | "messages" | "ether" | "calendar" | "secretary";

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
  // a cup: the errands of D-79 are coffee, tea and a knock on the door
  secretary: (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5c0 1.2 1 1.6 1 2.8M12 3.5c0 1.2 1 1.6 1 2.8" />
    </svg>
  ),
};

/**
 * The three balls the face lets out on a tap (D-60): tasks that need the director,
 * open messages in tasks, the announcements of Эфир — each with its count. In `ring`
 * mode they orbit the face slowly (CSS only, the labels stay upright); in `row` mode
 * (a panel is open) they line up under the face. One tap on a ball opens its panel.
 */
export function OrbitBalls({
  balls,
  mode,
  activeId,
  radius,
  onPick,
}: {
  balls: OrbitBall[];
  mode: "ring" | "row";
  activeId: OrbitId | null;
  radius: number;
  onPick: (ball: OrbitBall) => void;
}) {
  const n = balls.length;
  if (n === 0) return null;
  const spinning = mode === "ring";

  return (
    // plain divs carry the ring: the CSS orbit owns their transforms, framer only enters and exits the buttons
    <div
      className={spinning ? "pointer-events-none absolute inset-0" : "flex justify-center gap-2"}
      style={spinning ? { animation: `orbit-spin ${ORBIT_S}s linear infinite` } : undefined}
      data-testid="orbit"
      data-mode={mode}
    >
      {balls.map((ball, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const active = activeId === ball.id;
        const quiet = ball.count === 0;
        return (
          <div
            key={ball.id}
            className={spinning ? "absolute" : "relative"}
            style={
              spinning
                ? { left: `calc(50% - ${BALL / 2}px)`, top: `calc(50% - ${BALL / 2}px)`, transform: `translate(${(Math.cos(angle) * radius).toFixed(1)}px, ${(Math.sin(angle) * radius).toFixed(1)}px)` }
                : undefined
            }
          >
            {/* counter-rotation keeps the icon and the label upright while the ring turns */}
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: active ? 1.12 : 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 300, damping: 22, delay: spinning ? i * 0.07 : 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onPick(ball)}
              aria-label={`${ball.label}: ${ball.count}`}
              aria-pressed={active}
              data-testid="orbit-ball"
              data-ball={ball.id}
              className="pointer-events-auto flex flex-col items-center gap-1"
              style={spinning ? { animation: `orbit-counter ${ORBIT_S}s linear infinite` } : undefined}
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
          </div>
        );
      })}
    </div>
  );
}
