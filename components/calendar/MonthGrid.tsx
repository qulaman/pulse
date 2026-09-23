"use client";

import { useRef } from "react";

import {
  compareYmd,
  humanYmd,
  monthMatrix,
  monthTitleRu,
  parseYmd,
  WEEKDAYS_SHORT_RU,
  type Month,
  type Ymd,
} from "@/lib/datetime/calendar";

type Props = {
  month: Month;
  selected: Ymd;
  today: Ymd;
  /** Meetings per day — up to three dots under the number. */
  counts: Map<Ymd, number>;
  onPick: (ymd: Ymd) => void;
  onMonth: (delta: -1 | 1) => void;
  now: Date;
};

const ARROW =
  "flex h-11 w-11 items-center justify-center rounded-full text-muted transition-transform duration-[120ms] active:scale-[0.94]";

/** A sideways flick of this many pixels turns the month — less is a wobbly tap. */
const SWIPE_PX = 48;

/**
 * The month of /calendar (D-94): Monday first, as many weeks as the month has, a dot per
 * meeting (three at most — a count is the ribbon's job). The
 * arrows and a sideways swipe turn the month; a tap chooses the day the ribbon starts at.
 */
export function MonthGrid({ month, selected, today, counts, onPick, onMonth, now }: Props) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  // on a page an empty sixth row is a hole under the month; the ribbon below may move
  const grid = monthMatrix(month).filter((row) => row.some(Boolean));

  return (
    <section
      className="card mt-4 px-2 pb-2 pt-1"
      aria-label="Месяц"
      onTouchStart={(event) => {
        const t = event.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(event) => {
        const from = touch.current;
        touch.current = null;
        if (!from) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) onMonth(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between">
        <button type="button" className={ARROW} aria-label="Предыдущий месяц" onClick={() => onMonth(-1)}>
          <Chevron d="m15 6-6 6 6 6" />
        </button>
        <h2 className="font-display text-[17px] font-semibold leading-6 first-letter:uppercase" aria-live="polite">
          {monthTitleRu(month)}
        </h2>
        <button type="button" className={ARROW} aria-label="Следующий месяц" onClick={() => onMonth(1)}>
          <Chevron d="m9 6 6 6-6 6" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">
        {WEEKDAYS_SHORT_RU.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7">
        {grid.flat().map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="h-12" aria-hidden />;
          const count = counts.get(day) ?? 0;
          const chosen = day === selected;
          const isToday = day === today;
          const past = compareYmd(day, today) < 0;
          const dot = past && !chosen ? "var(--text-muted)" : "var(--accent)";
          return (
            <button
              key={day}
              type="button"
              aria-pressed={chosen}
              aria-label={count > 0 ? `${humanYmd(day, now)}, мероприятий: ${count}` : humanYmd(day, now)}
              onClick={() => onPick(day)}
              className="flex h-12 flex-col items-center justify-start gap-[3px] pt-1 transition-transform duration-[120ms] active:scale-[0.94] focus-visible:outline-none"
            >
              <span
                className={[
                  "nums flex h-8 w-8 items-center justify-center rounded-full text-[15px] leading-5 transition-colors duration-[120ms]",
                  chosen
                    ? "bg-accent font-semibold text-bg"
                    : isToday
                      ? "font-semibold text-accent ring-1 ring-inset ring-accent/60"
                      : past
                        ? "text-muted"
                        : "text-text",
                ].join(" ")}
              >
                {parseYmd(day)!.day}
              </span>
              <span className="flex h-1 gap-[3px]" aria-hidden>
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <span key={i} className="h-1 w-1 rounded-full" style={{ background: dot }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
