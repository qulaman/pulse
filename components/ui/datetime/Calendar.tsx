"use client";

import { useState } from "react";

import {
  addMonths,
  compareYmd,
  isWithin,
  monthMatrix,
  monthOf,
  monthTitleRu,
  parseYmd,
  todayYmd,
  WEEKDAYS_SHORT_RU,
  type Ymd,
} from "@/lib/datetime/calendar";

type Props = {
  value: Ymd | null;
  onPick: (ymd: Ymd) => void;
  /** Days outside the window are dimmed and do not answer a tap. */
  min?: Ymd | null;
  max?: Ymd | null;
  now?: Date;
};

const ARROW = "flex h-9 w-9 items-center justify-center rounded-full text-muted transition-transform duration-[120ms] active:scale-[0.94] disabled:opacity-30";

/**
 * A month, drawn the way the rest of the app is drawn: Monday first, six rows so the
 * panel never changes height, today marked by a dot and the chosen day filled with the
 * accent. Nothing here knows about time zones — the day strings arrive already on the
 * Aqtobe clock (lib/datetime/calendar.ts).
 */
export function Calendar({ value, onPick, min, max, now }: Props) {
  const [month, setMonth] = useState(() => monthOf(value, now));
  const today = todayYmd(now);
  const grid = monthMatrix(month);

  // a month with nothing pickable in it is a dead end: the arrow to it goes quiet
  const monthHasAny = (delta: number) => {
    const next = addMonths(month, delta);
    return monthMatrix(next).flat().some((day) => day && isWithin(day, min, max));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" className={ARROW} aria-label="Предыдущий месяц" disabled={!monthHasAny(-1)} onClick={() => setMonth(addMonths(month, -1))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <span className="font-display text-[15px] font-semibold leading-5 first-letter:uppercase">{monthTitleRu(month)}</span>
        <button type="button" className={ARROW} aria-label="Следующий месяц" disabled={!monthHasAny(1)} onClick={() => setMonth(addMonths(month, 1))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">
        {WEEKDAYS_SHORT_RU.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.flat().map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="h-10" />;
          const allowed = isWithin(day, min, max);
          const chosen = value ? compareYmd(day, value) === 0 : false;
          const isToday = compareYmd(day, today) === 0;
          return (
            <button
              key={day}
              type="button"
              disabled={!allowed}
              aria-pressed={chosen}
              onClick={() => onPick(day)}
              className={[
                "nums relative flex h-10 items-center justify-center rounded-[10px] text-[15px] leading-5",
                "transition-[background-color,color,transform] duration-[120ms] active:scale-[0.94]",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35",
                chosen ? "bg-accent font-semibold text-bg" : "text-text",
                !chosen && isToday ? "font-semibold text-accent" : "",
                allowed ? "" : "pointer-events-none opacity-25",
              ].join(" ")}
            >
              {parseYmd(day)!.day}
              {isToday && !chosen ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
