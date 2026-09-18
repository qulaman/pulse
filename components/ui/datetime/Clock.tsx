"use client";

import { hmOf, parseHm, type Hm } from "@/lib/datetime/calendar";

type Props = {
  value: Hm | null;
  onPick: (hm: Hm) => void;
  /** Minutes offered as chips; a value off the step keeps its own chip so nothing is lost. */
  step?: number;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Time in two taps: the hour from a grid, the minute from four chips. A working day is
 * spoken in whole and half hours — a spinning wheel of 1440 minutes is the system's idea
 * of a clock, not ours. Picking an hour alone is enough: the minute stays where it was.
 */
export function Clock({ value, onPick, step = 15 }: Props) {
  const current = parseHm(value);
  const hour = current?.hours ?? null;
  const minute = current?.minutes ?? 0;

  const minutes = Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);
  if (!minutes.includes(minute)) minutes.push(minute);
  minutes.sort((a, b) => a - b);

  return (
    <div>
      <div className="grid grid-cols-4 gap-1 @min-[280px]:grid-cols-6">
        {HOURS.map((h) => {
          const chosen = h === hour;
          return (
            <button
              key={h}
              type="button"
              aria-pressed={chosen}
              onClick={() => onPick(hmOf(h, minute))}
              className={[
                "nums flex h-9 items-center justify-center rounded-[10px] text-[14px] leading-5",
                "transition-[background-color,color,transform] duration-[120ms] active:scale-[0.94]",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35",
                chosen ? "bg-accent font-semibold text-bg" : "bg-surface-2 text-text",
              ].join(" ")}
            >
              {h}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1">
        {minutes.map((m) => {
          const chosen = m === minute;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={chosen}
              aria-label={`${m} минут`}
              disabled={hour === null}
              onClick={() => onPick(hmOf(hour ?? 0, m))}
              className={[
                "nums flex h-9 flex-1 items-center justify-center rounded-[10px] text-[14px] leading-5",
                "transition-[background-color,color,transform] duration-[120ms] active:scale-[0.94]",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35 disabled:opacity-40",
                chosen ? "bg-accent font-semibold text-bg" : "bg-surface-2 text-muted",
              ].join(" ")}
            >
              :{String(m).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
