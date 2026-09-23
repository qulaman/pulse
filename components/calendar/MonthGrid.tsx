"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";

import { shiftDay } from "@/lib/calendar/agenda";
import {
  compareYmd,
  humanYmd,
  monthMatrix,
  monthTitleRu,
  parseYmd,
  WEEKDAYS_SHORT_RU,
  ymdOf,
  type Month,
  type Ymd,
} from "@/lib/datetime/calendar";

import type { CalendarNav } from "./useCalendarNav";

/** What a day carries: how many meetings, and whether one of them waits for my answer. */
export type DayMark = { count: number; answer: boolean };

type Props = {
  nav: CalendarNav;
  today: Ymd;
  marks: Map<Ymd, DayMark>;
  now: Date;
};

type Cell = { ymd: Ymd; outside: boolean };

/** A sideways flick of this many pixels turns the page — less is a wobbly tap. */
const SWIPE_PX = 48;

const weekdayOf = (ymd: Ymd) => {
  const { year, month, day } = parseYmd(ymd)!;
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; // 0 = Monday
};

/** The weeks of a month, Monday first, the edges filled with the neighbours' days. */
function monthCells(month: Month): Cell[][] {
  const weeks = monthMatrix(month).filter((row) => row.some(Boolean)).length;
  const first = ymdOf(month.year, month.month, 1);
  const start = shiftDay(first, -weekdayOf(first));
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const ymd = shiftDay(start, week * 7 + day);
      const parts = parseYmd(ymd)!;
      return { ymd, outside: parts.year !== month.year || parts.month !== month.month };
    }),
  );
}

/** The week the chosen day lives in — the folded grid. */
function weekCells(selected: Ymd): Cell[][] {
  const start = shiftDay(selected, -weekdayOf(selected));
  return [Array.from({ length: 7 }, (_, day) => ({ ymd: shiftDay(start, day), outside: false }))];
}

/**
 * The month of /calendar (D-94, D-100): Monday first, the edges filled with the neighbouring
 * months (dimmed; a tap on one turns the page), a dot per meeting — amber where an
 * invitation waits for my answer — the chosen day lit, today ringed. The grabber under the
 * grid folds it to the chosen week and back (a swipe up or down does the same); arrows and
 * a sideways swipe step by what is shown. A new page slides in from the side it came from.
 */
export function MonthGrid({ nav, today, marks, now }: Props) {
  const reduce = useReducedMotion();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const folded = nav.mode === "week";
  const rows = folded ? weekCells(nav.selected) : monthCells(nav.month);
  const title = monthTitleRu(folded ? { year: parseYmd(nav.selected)!.year, month: parseYmd(nav.selected)!.month } : nav.month);
  const [name, year] = [title.slice(0, title.lastIndexOf(" ")), title.slice(title.lastIndexOf(" ") + 1)];
  const pageKey = folded ? `w-${rows[0][0].ymd}` : `m-${nav.month.year}-${nav.month.month}`;

  return (
    <section
      aria-label={folded ? "Неделя" : "Месяц"}
      data-testid="month-grid"
      data-mode={nav.mode}
      className="mt-3 overflow-hidden rounded-[22px] border px-2 pt-1.5"
      style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", background: "var(--surface)", touchAction: "pan-y" }}
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
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) nav.step(dx < 0 ? 1 : -1);
        // folding follows the finger: up folds to the week, down opens the month
        else if (Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx) * 1.5) nav.setMode(dy < 0 ? "week" : "month");
      }}
    >
      <div className="flex items-center justify-between pl-2.5">
        <h2 className="font-display text-[19px] font-semibold leading-6 tracking-[-0.02em]" aria-live="polite">
          <span className="first-letter:uppercase inline-block">{name}</span>{" "}
          <span className="font-medium text-muted">{year}</span>
        </h2>
        <div className="flex items-center">
          <Arrow label={folded ? "Предыдущая неделя" : "Предыдущий месяц"} d="m15 6-6 6 6 6" onClick={() => nav.step(-1)} />
          <Arrow label={folded ? "Следующая неделя" : "Следующий месяц"} d="m9 6 6 6-6 6" onClick={() => nav.step(1)} />
        </div>
      </div>

      <div className="mt-0.5 grid grid-cols-7 text-center font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.06em]">
        {WEEKDAYS_SHORT_RU.map((day, index) => (
          <span key={day} className="text-muted" style={{ opacity: index > 4 ? 0.6 : 1 }}>
            {day}
          </span>
        ))}
      </div>

      <motion.div
        key={pageKey}
        initial={reduce || nav.direction === 0 ? false : { opacity: 0, x: nav.direction * 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="mt-1"
      >
        {rows.map((row) => (
          <div key={row[0].ymd} className="grid grid-cols-7">
            {row.map((cell, index) => (
              <Day
                key={cell.ymd}
                cell={cell}
                weekend={index > 4}
                chosen={cell.ymd === nav.selected}
                isToday={cell.ymd === today}
                past={compareYmd(cell.ymd, today) < 0}
                mark={marks.get(cell.ymd)}
                now={now}
                onPick={nav.pick}
              />
            ))}
          </div>
        ))}
      </motion.div>

      {/* the grabber: folds the month to the week and back */}
      <button
        type="button"
        data-testid="grid-fold"
        aria-label={folded ? "Показать месяц" : "Свернуть до недели"}
        aria-expanded={!folded}
        onClick={() => nav.setMode(folded ? "month" : "week")}
        className="group flex h-6 w-full items-center justify-center"
      >
        <span
          aria-hidden
          className="h-1 w-9 rounded-full transition-[background-color,transform] duration-[120ms] group-active:scale-x-125"
          style={{ background: "color-mix(in srgb, var(--text-muted) 45%, transparent)" }}
        />
      </button>
    </section>
  );
}

function Day({
  cell,
  weekend,
  chosen,
  isToday,
  past,
  mark,
  now,
  onPick,
}: {
  cell: Cell;
  weekend: boolean;
  chosen: boolean;
  isToday: boolean;
  past: boolean;
  mark: DayMark | undefined;
  now: Date;
  onPick: (ymd: Ymd) => void;
}) {
  const count = mark?.count ?? 0;
  const dot = mark?.answer && !past ? "var(--warn)" : past && !chosen ? "var(--text-muted)" : "var(--accent)";
  const label = humanYmd(cell.ymd, now);

  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={count > 0 ? `${label}, мероприятий: ${count}` : label}
      onClick={() => onPick(cell.ymd)}
      className="flex h-12 flex-col items-center justify-start gap-[3px] pt-1 transition-transform duration-[120ms] active:scale-[0.92] focus-visible:outline-none"
      style={{ opacity: cell.outside ? 0.38 : 1 }}
    >
      <span
        className={[
          "nums flex h-8 w-8 items-center justify-center rounded-full text-[15px] leading-5 transition-colors duration-[120ms]",
          chosen
            ? "bg-accent font-bold text-bg"
            : isToday
              ? "font-bold text-accent ring-[1.5px] ring-inset ring-accent/70"
              : past
                ? "text-muted"
                : weekend
                  ? "text-text/75"
                  : "text-text",
        ].join(" ")}
        style={chosen ? { boxShadow: "0 6px 16px -5px color-mix(in srgb, var(--accent) 75%, transparent)" } : undefined}
      >
        {parseYmd(cell.ymd)!.day}
      </span>
      <span className="flex h-1 gap-[3px]" aria-hidden>
        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
          <span key={i} className="h-1 w-1 rounded-full" style={{ background: dot }} />
        ))}
      </span>
    </button>
  );
}

function Arrow({ label, d, onClick }: { label: string; d: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-[transform,color] duration-[120ms] active:scale-[0.9] active:text-text"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}
