"use client";

import { memo } from "react";

import type { WeekBar } from "@/lib/tv/week";

/**
 * The week on «Сегодня» (owner's answer 2026-11-25): seven columns — the tasks the director accepted each day, the
 * number over its bar, the day's short name under it; today framed. A day with none is its base line alone: no «0»,
 * no grey stub (D-45 — good news only). Bars in the wall's quiet tone, today's in white: green is «now» on the wall
 * and gold is points (D-185). Static: a new count simply redraws.
 */

/** The tallest bar, a share of the wall's height. */
const BAR_VH = 8;

export const WeekStrip = memo(function WeekStrip({ bars }: { bars: readonly WeekBar[] }) {
  if (bars.length === 0) return null;
  return (
    <div className="grid w-full max-w-[66vh] grid-cols-7 gap-x-[1.2vh]" data-testid="tv-week" aria-label="Неделя: задачи, принятые по дням">
      {bars.map((bar) => (
        <div
          key={bar.key}
          className="flex min-w-0 flex-col items-center rounded-[1.2vh] px-[0.6vh] pb-[0.8vh] pt-[0.6vh]"
          // today framed inside its column: nothing moves when the day turns
          style={bar.today ? { boxShadow: "inset 0 0 0 0.3vh color-mix(in srgb, var(--tv-text) 55%, transparent)" } : undefined}
          data-today={bar.today || undefined}
        >
          {/* the count over its bar; a day with none keeps the line's height, unseen */}
          <span className="tv-small tv-num leading-none" style={{ color: "var(--tv-text)", visibility: bar.done > 0 ? undefined : "hidden" }}>
            {bar.done > 0 ? bar.done : "0"}
          </span>
          <div className="mt-[1vh] flex w-full items-end justify-center" style={{ height: `${BAR_VH}vh`, boxShadow: "inset 0 -0.4vh 0 var(--surface-2)" }}>
            {bar.share > 0 ? (
              <span
                className="w-[3.6vh] rounded-t-[0.6vh]"
                style={{
                  height: `${Math.max(1.2, bar.share * BAR_VH)}vh`,
                  background: bar.today ? "var(--tv-text)" : "color-mix(in srgb, var(--text-muted) 42%, var(--bg))",
                }}
              />
            ) : null}
          </div>
          <span
            className={`tv-small mt-[0.8vh] whitespace-nowrap leading-none ${bar.today ? "font-semibold" : "text-muted"}`}
            style={bar.today ? { color: "var(--tv-text)" } : undefined}
          >
            {bar.label}
          </span>
        </div>
      ))}
    </div>
  );
});
