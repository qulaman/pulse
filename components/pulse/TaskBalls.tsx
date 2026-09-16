"use client";

import { motion } from "framer-motion";

import type { Lane } from "@/lib/pulse/board";

export type Ball =
  | { kind: "task"; id: string; lane: Lane; initials: string; name: string }
  | { kind: "work"; id: "work"; count: number }
  | { kind: "more"; id: "more"; count: number };

/** How many task balls fit around the face; the rest fold into one «+N» ball. */
const MAX_BALLS = 9;

const TONE: Record<Lane, string> = {
  overdue: "var(--danger)",
  declined: "var(--danger)",
  question: "var(--warn)",
  review: "var(--ok)",
  work: "var(--accent)",
};

const BALL = 48;

/**
 * The tasks as balls the face lets out on a tap (D-60): one ball per task that needs
 * the director, coloured by its lane, with the person's initials; one accent ball for
 * everything in work; «+N» when there are more than fit. In `ring` mode the balls sit
 * around the face; in `row` mode (a card is open) they line up above the card — the
 * same elements, framer-motion `layout` carries them between the two.
 */
export function TaskBalls({
  balls,
  mode,
  activeId,
  radius,
  onPick,
}: {
  balls: Ball[];
  mode: "ring" | "row";
  activeId: string | null;
  /** Distance from the face's centre to the balls' centres in ring mode. */
  radius: number;
  onPick: (ball: Ball) => void;
}) {
  const shown = balls.length > MAX_BALLS + 1 ? [...balls.slice(0, MAX_BALLS), { kind: "more", id: "more", count: balls.length - MAX_BALLS } as Ball] : balls;
  const n = shown.length;
  if (n === 0) return null;

  return (
    <motion.div
      layout
      className={mode === "ring" ? "pointer-events-none absolute inset-0" : "flex flex-wrap justify-center gap-2"}
      data-testid="balls"
      data-mode={mode}
    >
      {shown.map((ball, i) => {
        // ring: evenly around the face, the first ball at the top, clockwise
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const ringStyle =
          mode === "ring"
            ? { position: "absolute" as const, left: `calc(50% - ${BALL / 2}px)`, top: `calc(50% - ${BALL / 2}px)`, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
            : { position: "relative" as const, x: 0, y: 0 };
        const tone = ball.kind === "task" ? TONE[ball.lane] : ball.kind === "work" ? "var(--accent)" : "var(--text-muted)";
        const active = activeId === ball.id;
        return (
          <motion.button
            key={ball.id}
            type="button"
            layout
            initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
            animate={{ scale: active ? 1.18 : 1, opacity: 1, ...ringStyle }}
            exit={{ scale: 0, opacity: 0, x: 0, y: 0, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: mode === "ring" ? i * 0.04 : 0 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => onPick(ball)}
            aria-label={ball.kind === "task" ? `${ball.name}: ${ball.lane}` : ball.kind === "work" ? `В работе: ${ball.count}` : `Ещё ${ball.count}`}
            aria-pressed={active}
            data-testid="ball"
            data-ball={ball.id}
            className="pointer-events-auto flex shrink-0 items-center justify-center rounded-full font-display text-[15px] font-semibold"
            style={{
              width: BALL,
              height: BALL,
              color: tone,
              background: `color-mix(in srgb, ${tone} ${active ? 30 : 16}%, var(--surface))`,
              border: `2px solid ${active ? tone : `color-mix(in srgb, ${tone} 60%, transparent)`}`,
              boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${tone} 22%, transparent)` : "var(--shadow-raised)",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {ball.kind === "task" ? ball.initials : ball.kind === "work" ? <span className="nums">{ball.count}</span> : <span className="nums">+{ball.count}</span>}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
