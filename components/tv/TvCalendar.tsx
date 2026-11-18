"use client";

import { motion } from "motion/react";

import {
  monthGrid,
  monthSummary,
  todayPlan,
  todaySummary,
  weekColumns,
  weekStrip,
  weekSummary,
  type CalendarRow,
  type CalendarState,
  type MonthCell,
  type TodayCard,
  type TodayTrack,
} from "@/lib/tv/calendar";
import type { TvCalendar as TvCalendarData } from "@/lib/tv/queries";
import type { CalendarView } from "@/lib/tv/state";

import s from "./tv.module.css";

/**
 * Заставка «Календарь» (D-96, D-98; v5 — D-182). Два вида, переключаются с пульта:
 *  - «Неделя»: сверху крупно «Сегодня» — лента дня с отрезками мероприятий и отметкой
 *    «сейчас», под ней карточки с большим временем, «идёт · до 14:30» с полоской прогресса
 *    и «через 45 мин» у ближайшего; снизу — только дни со встречами, пустые одной строкой
 *    («Сб–Вт свободно»);
 *  - «Месяц»: четыре недели от текущей, сегодня в акцентном круге, в клетке — одна встреча
 *    крупно и «+N».
 * Названия переносятся на вторую строку, а не режутся. Горит одно мероприятие на всю стену:
 * идущее сейчас, иначе ближайшее. Гостю названий и мест не приезжает уже из БД (D-33).
 * Движение — только opacity и transform (D-45).
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvCalendar({ calendar, now, view }: { calendar: TvCalendarData | null; now: Date; view: CalendarView }) {
  // the calendar moves by the minute: the «now» mark and the progress bars are drawn from
  // it, and a minute is also what the server and the browser agree on at hydration
  const minute = new Date(now.getTime() - (now.getTime() % 60_000));
  return view === "month" ? <MonthView calendar={calendar} now={minute} /> : <WeekView calendar={calendar} now={minute} />;
}

/* -------------------------------------------------------------------------- */
/* Неделя: «Сегодня» крупно, под ним дни со встречами                         */
/* -------------------------------------------------------------------------- */

function WeekView({ calendar, now }: { calendar: TvCalendarData | null; now: Date }) {
  const plan = todayPlan(calendar, now);
  const days = weekColumns(calendar, now, 6, 1);
  const strip = weekStrip(days);

  return (
    // two blocks in a column that wraps what does not fit into a second column the box cuts off: at a big
    // «Крупность» the days under «Сегодня» leave whole, never cut through a title
    <div className="flex h-[74vh] w-full max-w-[94vw] flex-col flex-wrap content-start justify-center gap-[2.4vh] overflow-hidden" data-testid="tv-calendar" data-view="week">
      <motion.section
        initial={{ opacity: 0, y: "1.6vh" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative w-full overflow-hidden rounded-[3vh] px-[3.4vh] pb-[2.4vh] pt-[2vh]"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%), color-mix(in srgb, var(--surface) 92%, transparent)",
          boxShadow: "inset 0 0 0 0.18vh color-mix(in srgb, var(--accent) 28%, var(--border)), 0 2vh 6vh rgba(0,0,0,.35)",
        }}
        data-testid="tv-today"
      >
        <header className="flex items-end justify-between gap-[3vh]">
          <div className="flex min-w-0 items-baseline gap-[2.4vh]">
            <h2 className="tv-title font-bold tracking-[-0.03em]">Сегодня</h2>
            <span className="tv-text truncate text-muted">{plan.date}</span>
          </div>
          {plan.total > 0 ? (
            <span className="tv-text shrink-0 font-semibold" style={{ color: "var(--accent)" }}>
              {todaySummary(plan)}
            </span>
          ) : null}
        </header>

        <Track track={plan.track} />

        {plan.cards.length > 0 ? (
          // the cards share the width: three meetings are thirds, not three quarters and a hole
          <div className="mt-[2vh] grid gap-[2vh]" style={{ gridTemplateColumns: `repeat(${Math.max(plan.cards.length, 2)}, minmax(0, 1fr))` }}>
            {plan.cards.map((card, i) => (
              <TodayTile key={card.id} card={card} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-[2.4vh] flex flex-wrap items-baseline gap-x-[3vh] gap-y-[1vh] py-[1vh]">
            <p className="tv-lead font-semibold">Свободный день</p>
            {plan.ahead ? (
              <p className="tv-text text-muted">
                Ближайшее — <span className="text-text">{plan.ahead}</span>
              </p>
            ) : null}
          </div>
        )}
        {plan.earlier > 0 ? <p className="tv-caption mt-[1.2vh] text-muted">Раньше сегодня — ещё {plan.earlier}</p> : null}
      </motion.section>

      <section className="flex w-full flex-col gap-[1.4vh]" data-testid="tv-week">
        <div className="flex items-baseline gap-[2vh] px-[0.6vh]">
          <p className="tv-text font-semibold">Дальше на неделе</p>
          {strip.busy.length > 0 ? <p className="tv-caption text-muted">{weekSummary(days)}</p> : null}
          {/* the empty days in one line, beside the heading: «Вс–Вт свободно» */}
          {strip.free ? (
            <p className="tv-text ml-auto text-muted" data-testid="tv-week-free">
              {strip.free}
            </p>
          ) : null}
        </div>
        {strip.busy.length > 0 ? (
          <div className="grid gap-[1.4vh]" style={{ gridTemplateColumns: `repeat(${Math.max(strip.busy.length, 3)}, minmax(0, 1fr))` }}>
            {strip.busy.map((column, index) => (
              <motion.div
                key={column.key}
                initial={{ opacity: 0, y: "1.4vh" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + index * 0.05, ease: EASE }}
                className="flex min-w-0 flex-col gap-[1vh] rounded-[2vh] px-[2vh] py-[1.6vh]"
                style={{ background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}
                data-day={column.key}
              >
                <div className="flex items-baseline gap-[1vh]">
                  <span className="tv-text min-w-0 flex-1 truncate font-bold">{column.label}</span>
                  {column.more > 0 ? <span className="tv-caption nums shrink-0 font-semibold tabular-nums text-muted">+{column.more}</span> : null}
                  <span className="tv-caption shrink-0 text-muted">{column.date}</span>
                </div>
                <ul className="flex flex-col gap-[1vh]">
                  {column.rows.map((row) => (
                    <DayRow key={row.id} row={row} />
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

const STATE_COLOR: Record<CalendarState, string> = {
  now: "var(--accent)",
  next: "var(--accent)",
  later: "color-mix(in srgb, var(--text) 70%, transparent)",
  past: "color-mix(in srgb, var(--text-muted) 45%, transparent)",
};

/** The day as a line: hours along it, a bar per meeting, the «now» mark riding over it. */
function Track({ track }: { track: TodayTrack }) {
  const labels = track.hours.filter((h, i) => i % 2 === 0 || track.hours.length <= 8);
  const at = (hour: number) => `${((hour - track.from) / (track.to - track.from)) * 100}%`;
  return (
    <div className="relative mt-[2vh] h-[5.8vh]" aria-hidden>
      {/* the rail */}
      <div className="absolute inset-x-0 top-[1.6vh] h-[0.5vh] rounded-full" style={{ background: "color-mix(in srgb, var(--border) 80%, transparent)" }} />
      {/* hour ticks and labels: the one text on the wall allowed under the scale (tv-type.css) */}
      {labels.map((hour) => (
        <span key={hour} className="nums absolute top-0 -translate-x-1/2 text-[2.2vh] leading-[1.2vh] text-muted tabular-nums" style={{ left: at(hour) }}>
          <span className="absolute left-1/2 top-[1.5vh] block h-[0.9vh] w-[0.15vh] -translate-x-1/2 rounded-full" style={{ background: "var(--border)" }} />
          <span className="mt-[3.8vh] block">{String(hour).padStart(2, "0")}</span>
        </span>
      ))}
      {/* meetings */}
      {track.segments.map((segment) => (
        <span
          key={segment.id}
          className={`absolute top-[1.2vh] h-[1.3vh] rounded-full ${segment.state === "now" ? s.live : ""}`}
          style={{
            left: `${segment.start * 100}%`,
            width: `max(1.3vh, ${(segment.end - segment.start) * 100}%)`,
            background: STATE_COLOR[segment.state],
            boxShadow: segment.state === "now" || segment.state === "next" ? "0 0 1.6vh color-mix(in srgb, var(--accent) 55%, transparent)" : undefined,
          }}
        />
      ))}
      {/* now */}
      {track.now !== null ? (
        <span className="absolute top-[0.4vh] -translate-x-1/2" style={{ left: `${track.now * 100}%` }}>
          <span className="block h-[2.4vh] w-[0.3vh] rounded-full" style={{ background: "var(--text)" }} />
          <span className="absolute -top-[0.5vh] left-1/2 block h-[1vh] w-[1vh] -translate-x-1/2 rounded-full" style={{ background: "var(--text)" }} />
        </span>
      ) : null}
    </div>
  );
}

function TodayTile({ card, index }: { card: TodayCard; index: number }) {
  const lit = card.state === "now" || card.state === "next";
  return (
    <motion.article
      initial={{ opacity: 0, y: "1.6vh" }}
      animate={{ opacity: card.state === "past" ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.06, ease: EASE }}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[2.2vh] px-[2.2vh] pb-[1.8vh] pt-[1.4vh]"
      style={{
        background: lit ? "color-mix(in srgb, var(--accent) 13%, var(--surface-2))" : "var(--surface-2)",
        boxShadow: lit ? "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 60%, transparent)" : undefined,
      }}
      data-state={card.state}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-[1.4vh] gap-y-[0.4vh]">
        <span className="tv-lead nums font-bold tracking-[-0.02em] tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text)" }}>
          {card.time}
        </span>
        {card.note ? (
          <span
            className="tv-caption nums shrink-0 rounded-full px-[1.2vh] font-semibold tabular-nums"
            style={{
              color: lit ? "var(--bg)" : "var(--text-muted)",
              background: lit ? "var(--accent)" : "color-mix(in srgb, var(--border) 70%, transparent)",
            }}
          >
            {card.note}
          </span>
        ) : null}
      </div>
      <p className="tv-text mt-[0.8vh] line-clamp-2 font-semibold [overflow-wrap:anywhere]">{card.title}</p>
      {card.place || card.people ? (
        <p className="tv-caption mt-[0.4vh] flex min-w-0 items-center gap-[1.4vh] text-muted">
          {card.place ? (
            <span className="flex min-w-0 items-center gap-[0.6vh]">
              <PinIcon />
              <span className="truncate">{card.place}</span>
            </span>
          ) : null}
          {card.people ? (
            <span className="flex shrink-0 items-center gap-[0.6vh]">
              <PeopleIcon />
              {card.people}
            </span>
          ) : null}
        </p>
      ) : null}
      {card.progress !== null ? (
        <span className="absolute inset-x-0 bottom-0 h-[0.6vh]" style={{ background: "color-mix(in srgb, var(--accent) 20%, transparent)" }}>
          <span className={`block h-full w-full ${s.gauge}`} style={{ background: "var(--accent)", transform: `scaleX(${card.progress})` }} />
        </span>
      ) : null}
    </motion.article>
  );
}

function DayRow({ row }: { row: CalendarRow }) {
  const lit = row.state === "next" || row.state === "now";
  return (
    // time above, the title under it on up to two lines: a title is wrapped, never cut
    <li className="flex min-w-0 flex-col" data-state={row.state}>
      <span className="tv-caption nums font-bold tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text-muted)" }}>
        {row.time}
      </span>
      <span className="tv-text line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere]">{row.title}</span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Месяц: четыре недели от текущей                                           */
/* -------------------------------------------------------------------------- */

function MonthView({ calendar, now }: { calendar: TvCalendarData | null; now: Date }) {
  const grid = monthGrid(calendar, now);
  return (
    <div className="flex h-[74vh] w-full max-w-[94vw] flex-col gap-[1.4vh]" data-testid="tv-calendar" data-view="month">
      <div className="flex items-baseline gap-[2.4vh] px-[0.6vh]">
        <h2 className="tv-title font-bold tracking-[-0.03em]">{grid.title}</h2>
        <span className="tv-text text-muted">{monthSummary(grid)}</span>
      </div>

      <div className="grid grid-cols-7 gap-[0.9vh] px-[0.4vh]">
        {grid.weekdays.map((day, i) => (
          <span
            key={day}
            className="tv-caption px-[1vh] font-semibold uppercase tracking-[0.12em]"
            style={{ color: i >= 5 ? "color-mix(in srgb, var(--text-muted) 70%, transparent)" : "var(--text-muted)" }}
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-[0.9vh]" style={{ gridTemplateRows: `repeat(${grid.weeks.length}, minmax(0, 1fr))` }}>
        {grid.weeks.map((week, w) => (
          <motion.div
            key={w}
            initial={{ opacity: 0, y: "1.2vh" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: w * 0.05, ease: EASE }}
            className="grid min-h-0 grid-cols-7 gap-[0.9vh]"
          >
            {week.map((cell) => (
              <MonthDay key={cell.key} cell={cell} />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function MonthDay({ cell }: { cell: MonthCell }) {
  const row = cell.rows[0] ?? null;
  const lit = row !== null && (row.state === "next" || row.state === "now");
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-col gap-[0.4vh] overflow-hidden rounded-[1.6vh] px-[1.4vh] py-[1vh]"
      style={{
        background: cell.today
          ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
          : cell.weekend
            ? "color-mix(in srgb, var(--surface) 40%, transparent)"
            : "color-mix(in srgb, var(--surface) 70%, transparent)",
        boxShadow: cell.today ? "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 65%, transparent)" : undefined,
        opacity: cell.past ? 0.42 : 1,
      }}
      data-today={cell.today || undefined}
    >
      <span className="flex items-center justify-between gap-[1vh]">
        <span
          className="tv-caption nums flex min-w-[2em] items-center justify-center rounded-full px-[0.8vh] font-bold tabular-nums"
          style={{
            background: cell.today ? "var(--accent)" : undefined,
            color: cell.today ? "var(--bg)" : cell.dayLabel !== String(cell.day) ? "var(--accent)" : "var(--text)",
          }}
        >
          {cell.dayLabel}
        </span>
        {cell.more > 0 ? <span className="tv-caption nums font-semibold tabular-nums text-muted">+{cell.more}</span> : null}
      </span>
      {row ? (
        <p className="tv-text line-clamp-2 min-w-0 font-medium [overflow-wrap:anywhere]" data-state={row.state}>
          <span className="nums mr-[0.8vh] font-bold tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text-muted)" }}>
            {row.time}
          </span>
          {row.title}
        </p>
      ) : null}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[1em] w-[1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[1em] w-[1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8.5" r="3.3" />
      <path d="M3 19.5c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.1M18.2 14.6c1.8.6 2.8 2.2 2.8 4.9" />
    </svg>
  );
}
