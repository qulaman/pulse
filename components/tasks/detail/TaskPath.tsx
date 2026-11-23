"use client";

import { motion } from "motion/react";

import { stepTime } from "@/components/tasks/list/TaskList";
import type { Step } from "@/lib/tasks/overview";

const COLOR: Record<Step["state"], string> = {
  done: "var(--accent)",
  current: "var(--accent)",
  todo: "var(--border)",
  warn: "var(--warn)",
  bad: "var(--danger)",
};

const EASE = [0.2, 0, 0, 1] as const;
/** The path draws itself station by station when the screen opens — a breath, never a wait. */
const STAGGER = 0.09;

/** The ring round the station the task waits at: how much of the time to the deadline is gone. */
export type PathClock = { used: number; color: string };

const RING = 26;
const RING_STROKE = 2.5;
const RING_R = (RING - RING_STROKE) / 2;

/**
 * The life of the task on its own screen (D-187): the four stations of `stepsOf` as a line that
 * draws itself, the stations passed pop in with a tick, the one the task waits at breathes — and,
 * when there is a deadline, wears a ring that fills as its time runs out (amber in the last day,
 * full and red once it is behind). That ring is the «сколько осталось» the screen used to say in a
 * line of its own under the buttons; the date itself is the capsule's. A station that changes its
 * state while the screen is open plays its entrance again. Transform and opacity only, but the
 * ring's arc (one small path).
 */
export function TaskPath({ steps, now, clock }: { steps: readonly Step[]; now: Date; clock: PathClock | null }) {
  return (
    <ol className="grid grid-cols-4" data-testid="task-steps">
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const color = COLOR[step.state];
        const reached = step.state !== "todo";
        const waiting = step.state === "current" || step.state === "warn" || step.state === "bad";
        // the line runs lit only between two stations the task has passed
        const joined = Boolean(next) && step.state === "done" && next!.state !== "todo";
        const delay = index * STAGGER;
        return (
          <li key={step.key} className="relative flex min-w-0 flex-col items-center text-center">
            {next ? (
              <span aria-hidden className="absolute left-1/2 top-[12px] h-[2px] w-full overflow-hidden rounded-full bg-[var(--border)] opacity-80">
                {joined ? (
                  <motion.span
                    key={`${step.key}:${next.state}`}
                    className="block h-full w-full origin-left rounded-full"
                    style={{ background: COLOR.done }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.34, ease: EASE, delay: delay + 0.12 }}
                  />
                ) : null}
              </span>
            ) : null}

            <span aria-hidden className="relative flex h-[26px] w-[26px] items-center justify-center">
              {waiting ? (
                <>
                  {/* the breath of the station the task waits at */}
                  <motion.span
                    className="absolute inset-[5px] rounded-full"
                    style={{ background: color }}
                    initial={{ scale: 1, opacity: 0.35 }}
                    animate={{ scale: [1, 1.9], opacity: [0.35, 0] }}
                    transition={{ duration: 2.2, ease: "easeOut", repeat: Infinity, repeatDelay: 0.6, delay: delay + 0.5 }}
                  />
                  {clock ? <Ring clock={clock} delay={delay} /> : null}
                </>
              ) : null}
              <motion.span
                key={`${step.key}:${step.state}`}
                className="relative flex h-[14px] w-[14px] items-center justify-center rounded-full"
                style={{
                  background: reached && !waiting ? color : "var(--surface)",
                  border: `2px solid ${reached ? color : "var(--border)"}`,
                }}
                initial={reached ? { scale: 0.4, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 22, delay }}
              >
                {step.state === "done" ? (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : waiting ? (
                  <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
                ) : null}
              </motion.span>
            </span>

            <span
              className={`mt-1 max-w-full truncate px-0.5 text-[12px] leading-4 ${waiting ? "font-semibold" : ""}`}
              style={{ color: waiting ? color : reached ? "var(--text)" : "var(--text-muted)" }}
            >
              {step.label}
            </span>
            <span className="nums mt-0.5 h-[14px] max-w-full truncate px-0.5 text-[11px] leading-[14px] text-muted">{step.at ? stepTime(step.at, now) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Ring({ clock, delay }: { clock: PathClock; delay: number }) {
  const used = Math.max(0.04, Math.min(1, clock.used));
  return (
    <svg className="absolute inset-0 -rotate-90" width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} data-testid="task-clock" data-used={used.toFixed(2)}>
      <circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke="var(--border)" strokeWidth={RING_STROKE} opacity={0.55} />
      <motion.circle
        cx={RING / 2}
        cy={RING / 2}
        r={RING_R}
        fill="none"
        stroke={clock.color}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: used }}
        transition={{ duration: 0.7, ease: EASE, delay: delay + 0.15 }}
      />
    </svg>
  );
}
