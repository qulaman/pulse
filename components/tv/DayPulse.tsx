"use client";

import { memo } from "react";

/**
 * The day's rhythm on «Сегодня» (D-185): how many company events fell on each working hour
 * (`tv_summary.pulse`), one bar per hour, labelled 9 · 12 · 15 · 18, with a «сейчас» mark. Past
 * hours in a muted accent, the current one in full, future ones as empty space: the strip shows where
 * the day is and whether it has been lively. Not an ornament and not a curve — a labelled scale.
 *
 * Static: nothing on it animates; a new hour or a new count simply redraws the bars.
 */

const HOURS = 24;
/** The working day drawn: the night's zeros would squeeze the day into a needle. */
const FROM_HOUR = 8;
const TO_HOUR = 20;
const LABELS: ReadonlySet<number> = new Set([9, 12, 15, 18]);
/** The tallest bar, a share of the wall's height. */
const BAR_VH = 11;

export const DayPulse = memo(function DayPulse({ pulse, hour }: { pulse: readonly number[]; hour: number }) {
  if (pulse.length !== HOURS) return null;
  const hours = Array.from({ length: TO_HOUR - FROM_HOUR + 1 }, (_, i) => FROM_HOUR + i);
  const max = Math.max(...hours.map((h) => pulse[h] ?? 0));
  if (max === 0) return null;
  const columns = { gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` };
  const nowIn = hour >= FROM_HOUR && hour <= TO_HOUR;

  return (
    <div className="w-full" aria-hidden data-testid="tv-day-pulse">
      <div className="grid items-end" style={{ ...columns, height: `${BAR_VH}vh` }}>
        {hours.map((h) => {
          const value = pulse[h] ?? 0;
          const future = nowIn ? h > hour : hour < FROM_HOUR;
          const current = h === hour;
          return (
            <span
              key={h}
              className="justify-self-center rounded-t-[0.6vh]"
              style={{
                width: "3vh",
                // a quiet hour keeps a sliver: the day's line stays whole
                height: future ? "0.5vh" : `${Math.max(0.5, (value / max) * BAR_VH)}vh`,
                background: future
                  ? "var(--surface-2)"
                  : current
                    ? "var(--accent)"
                    : "color-mix(in srgb, var(--accent) 45%, var(--bg))",
              }}
            />
          );
        })}
      </div>
      <div className="mt-[1.2vh] grid" style={columns}>
        {hours.map((h) => {
          const current = nowIn && h === hour;
          // an hour's number beside «сейчас» would run into it
          const label = current ? "сейчас" : LABELS.has(h) && !(nowIn && Math.abs(h - hour) <= 1) ? String(h) : null;
          return (
            <span
              key={h}
              className={`tv-fine tv-num justify-self-center whitespace-nowrap ${current ? "font-semibold" : "text-muted"}`}
              style={current ? { color: "var(--tv-text)" } : undefined}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
});
