"use client";

import { memo } from "react";

/**
 * The day's rhythm on «Сегодня» (D-185): how many company events fell on each working hour
 * (`tv_summary.pulse`), one bar per hour from 8 to 20, standing on one scale line, with the hours
 * 9 · 12 · 15 · 18 under it and «сейчас» under the current hour. The hours gone by are muted, the
 * current one is the wall's «now» colour, the rest of the day is the bare scale — no dashes standing in
 * for bars. «Сегодня» shows it from noon only: a morning has two bars, and two bars are a placeholder.
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
      <div className="grid items-end" style={{ ...columns, height: `${BAR_VH}vh`, boxShadow: "inset 0 -0.4vh 0 var(--surface-2)" }}>
        {hours.map((h) => {
          const value = pulse[h] ?? 0;
          // the hours still ahead have no bar: the scale line under them is the rest of the day
          if ((nowIn && h > hour) || hour < FROM_HOUR || value === 0) return <span key={h} />;
          return (
            <span
              key={h}
              className="w-[3.2vh] justify-self-center rounded-t-[0.6vh]"
              style={{
                height: `${Math.max(1.2, (value / max) * BAR_VH)}vh`,
                background: h === hour ? "var(--tv-live)" : "color-mix(in srgb, var(--text-muted) 42%, var(--bg))",
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
              className={`tv-body tv-num justify-self-center whitespace-nowrap ${current ? "font-semibold" : "text-muted"}`}
              // «сейчас» on the scale is the wall's «now»: the colour of the current hour's bar
              style={current ? { color: "var(--tv-live)" } : undefined}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
});
