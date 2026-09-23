"use client";

import { motion } from "framer-motion";

import {
  monthGrid,
  monthSummary,
  todayPlan,
  todaySummary,
  weekColumns,
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
 * Заставка «Календарь» (D-96, D-98). Два вида, переключаются с пульта:
 *  - «Неделя»: сверху крупно «Сегодня» — лента дня с отрезками мероприятий и отметкой
 *    «сейчас», под ней карточки с большим временем, «идёт · до 14:30» с полоской прогресса
 *    и «через 45 мин» у ближайшего; снизу шесть следующих дней колонками;
 *  - «Месяц»: сетка недель с понедельника, сегодня в акцентном круге, в клетке — до двух
 *    мероприятий строками.
 * Горит одно мероприятие на всю стену: идущее сейчас, иначе ближайшее. Гостю названий и
 * мест не приезжает уже из БД (D-33). Движение — только opacity и transform (D-45).
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvCalendar({ calendar, now, view }: { calendar: TvCalendarData | null; now: Date; view: CalendarView }) {
  // the calendar moves by the minute: the «now» mark and the progress bars are drawn from
  // it, and a minute is also what the server and the browser agree on at hydration
  const minute = new Date(now.getTime() - (now.getTime() % 60_000));
  return view === "month" ? <MonthView calendar={calendar} now={minute} /> : <WeekView calendar={calendar} now={minute} />;
}

/* -------------------------------------------------------------------------- */
/* Неделя: «Сегодня» крупно, под ним шесть дней                               */
/* -------------------------------------------------------------------------- */

function WeekView({ calendar, now }: { calendar: TvCalendarData | null; now: Date }) {
  const plan = todayPlan(calendar, now);
  const days = weekColumns(calendar, now, 6, 1);

  return (
    <div className="flex w-full max-w-[94vw] flex-col gap-[2.6vh]" data-testid="tv-calendar" data-view="week">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative overflow-hidden rounded-[3vh] px-[3.4vh] pb-[3vh] pt-[2.8vh]"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%), color-mix(in srgb, var(--surface) 92%, transparent)",
          boxShadow: "inset 0 0 0 0.18vh color-mix(in srgb, var(--accent) 28%, var(--border)), 0 2vh 6vh rgba(0,0,0,.35)",
        }}
        data-testid="tv-today"
      >
        <header className="flex items-end justify-between gap-[3vh]">
          <div className="flex items-baseline gap-[2.4vh]">
            <h2 className="text-[7vh] font-bold leading-[7.6vh] tracking-[-0.03em]">Сегодня</h2>
            <span className="text-[3.2vh] leading-[4vh] text-muted">{plan.date}</span>
          </div>
          {plan.total > 0 ? (
            <span className="text-[3vh] font-semibold leading-[4vh]" style={{ color: "var(--accent)" }}>
              {todaySummary(plan)}
            </span>
          ) : null}
        </header>

        <Track track={plan.track} />

        {plan.cards.length > 0 ? (
          // the cards share the width: three meetings are thirds, not three quarters and a hole
          <div className="mt-[2.4vh] grid gap-[2vh]" style={{ gridTemplateColumns: `repeat(${Math.max(plan.cards.length, 2)}, minmax(0, 1fr))` }}>
            {plan.cards.map((card, i) => (
              <TodayTile key={card.id} card={card} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-[3vh] flex items-center gap-[3vh] py-[2vh]">
            <p className="text-[5vh] font-semibold leading-[6vh]">Свободный день</p>
            {plan.ahead ? (
              <p className="text-[3.2vh] leading-[4vh] text-muted">
                Ближайшее — <span className="text-text">{plan.ahead}</span>
              </p>
            ) : null}
          </div>
        )}
        {plan.earlier > 0 ? (
          <p className="mt-[1.4vh] text-[2.2vh] leading-[2.8vh] text-muted">
            Раньше сегодня — ещё {plan.earlier}
          </p>
        ) : null}
      </motion.section>

      <section className="flex flex-col gap-[1.4vh]" data-testid="tv-week">
        <div className="flex items-baseline gap-[2vh] px-[0.6vh]">
          <p className="text-[3.2vh] font-semibold leading-[4vh]">Дальше на неделе</p>
          <p className="text-[2.6vh] leading-[3.4vh] text-muted">{weekSummary(days)}</p>
        </div>
        <div className="grid grid-cols-6 gap-[1.4vh]">
          {days.map((column, index) => (
            <motion.div
              key={column.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2 + index * 0.05, ease: EASE }}
              className="flex min-w-0 flex-col gap-[1vh] rounded-[2vh] p-[1.6vh]"
              style={{ background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}
            >
              <div className="flex items-baseline justify-between gap-[1vh]">
                <span
                  className="truncate text-[2.8vh] font-bold leading-[3.4vh]"
                  style={{ color: column.weekend ? "var(--text-muted)" : "var(--text)" }}
                >
                  {column.label}
                </span>
                <span className="shrink-0 text-[2vh] leading-[2.6vh] text-muted">{column.date}</span>
              </div>
              {column.rows.length === 0 ? (
                <p className="text-[2.4vh] leading-[3vh] text-muted opacity-50">—</p>
              ) : (
                <ul className="flex flex-col gap-[0.8vh]">
                  {column.rows.map((row) => (
                    <DayRow key={row.id} row={row} />
                  ))}
                  {column.more > 0 ? <li className="text-[2vh] leading-[2.6vh] text-muted">+ ещё {column.more}</li> : null}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
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
    <div className="relative mt-[2.4vh] h-[5.8vh]" aria-hidden>
      {/* the rail */}
      <div className="absolute inset-x-0 top-[1.6vh] h-[0.5vh] rounded-full" style={{ background: "color-mix(in srgb, var(--border) 80%, transparent)" }} />
      {/* hour ticks and labels */}
      {labels.map((hour) => (
        <span key={hour} className="absolute top-0 -translate-x-1/2 text-[1.8vh] leading-[1.2vh] text-muted tabular-nums" style={{ left: at(hour) }}>
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: card.state === "past" ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.06, ease: EASE }}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-[2.2vh] px-[2.2vh] pb-[2vh] pt-[1.8vh]"
      style={{
        background: lit ? "color-mix(in srgb, var(--accent) 13%, var(--surface-2))" : "var(--surface-2)",
        boxShadow: lit ? "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 60%, transparent)" : undefined,
      }}
      data-state={card.state}
    >
      <div className="flex items-baseline justify-between gap-[1.4vh]">
        <span className="text-[5.2vh] font-bold leading-[5.6vh] tracking-[-0.02em] tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text)" }}>
          {card.time}
        </span>
        {card.note ? (
          <span
            className="shrink-0 truncate rounded-full px-[1.2vh] py-[0.3vh] text-[2vh] font-semibold leading-[2.6vh]"
            style={{
              color: lit ? "var(--bg)" : "var(--text-muted)",
              background: lit ? "var(--accent)" : "color-mix(in srgb, var(--border) 70%, transparent)",
            }}
          >
            {card.note}
          </span>
        ) : null}
      </div>
      <p className="mt-[1vh] line-clamp-2 text-[3.2vh] font-semibold leading-[4vh] [overflow-wrap:anywhere]">{card.title}</p>
      {card.place || card.people ? (
        <p className="mt-[0.6vh] flex min-w-0 items-center gap-[1.4vh] text-[2.3vh] leading-[3vh] text-muted">
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
          <span
            className={`block h-full w-full ${s.gauge}`}
            style={{ background: "var(--accent)", transform: `scaleX(${card.progress})` }}
          />
        </span>
      ) : null}
    </motion.article>
  );
}

function DayRow({ row }: { row: CalendarRow }) {
  const lit = row.state === "next" || row.state === "now";
  return (
    // time above, title under it: a sixth of the wall is too narrow for both on one line
    <li className="flex min-w-0 flex-col" data-state={row.state}>
      <span className="text-[2.1vh] font-bold leading-[2.6vh] tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text-muted)" }}>
        {row.time}
      </span>
      <span className="min-w-0 truncate text-[2.4vh] font-medium leading-[3vh]">{row.title}</span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Месяц сеткой                                                               */
/* -------------------------------------------------------------------------- */

function MonthView({ calendar, now }: { calendar: TvCalendarData | null; now: Date }) {
  const grid = monthGrid(calendar, now);
  return (
    <div className="flex w-full max-w-[94vw] flex-col gap-[1.4vh]" data-testid="tv-calendar" data-view="month">
      <div className="flex items-baseline justify-between gap-[3vh] px-[0.6vh]">
        <div className="flex items-baseline gap-[2.4vh]">
          <h2 className="text-[6vh] font-bold leading-[6.6vh] tracking-[-0.03em]">{grid.title}</h2>
          <span className="text-[2.8vh] leading-[3.6vh] text-muted">{monthSummary(grid)}</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-[0.9vh] px-[0.4vh]">
        {grid.weekdays.map((day, i) => (
          <span
            key={day}
            className="px-[1vh] text-[2vh] font-semibold uppercase leading-[2.6vh] tracking-[0.12em]"
            style={{ color: i >= 5 ? "color-mix(in srgb, var(--text-muted) 70%, transparent)" : "var(--text-muted)" }}
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid gap-[0.9vh]" style={{ gridTemplateRows: `repeat(${grid.weeks.length}, minmax(0, 1fr))` }}>
        {grid.weeks.map((week, w) => (
          <motion.div
            key={w}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: w * 0.05, ease: EASE }}
            className="grid grid-cols-7 gap-[0.9vh]"
          >
            {week.map((cell) => (
              <MonthDay key={cell.key} cell={cell} weeks={grid.weeks.length} />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function MonthDay({ cell, weeks }: { cell: MonthCell; weeks: number }) {
  // five weeks leave more air per row than six: the cell grows with the month
  const height = weeks > 5 ? "10.4vh" : "12.6vh";
  const faded = !cell.inMonth ? 0.28 : cell.past ? 0.55 : 1;
  return (
    <div
      className="relative flex min-w-0 flex-col gap-[0.5vh] overflow-hidden rounded-[1.6vh] px-[1.2vh] py-[0.9vh]"
      style={{
        height,
        background: cell.today
          ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
          : cell.weekend
            ? "color-mix(in srgb, var(--surface) 40%, transparent)"
            : "color-mix(in srgb, var(--surface) 70%, transparent)",
        boxShadow: cell.today ? "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 65%, transparent)" : undefined,
        opacity: faded,
      }}
      data-today={cell.today || undefined}
    >
      <span className="flex items-center justify-between">
        <span
          className="flex h-[3.4vh] min-w-[3.4vh] items-center justify-center rounded-full px-[0.6vh] text-[2.4vh] font-bold leading-none tabular-nums"
          style={{ background: cell.today ? "var(--accent)" : undefined, color: cell.today ? "var(--bg)" : "var(--text)" }}
        >
          {cell.day}
        </span>
        {cell.more > 0 ? <span className="text-[1.8vh] font-semibold leading-[2.2vh] text-muted">+{cell.more}</span> : null}
      </span>
      {cell.rows.map((row) => {
        const lit = row.state === "next" || row.state === "now";
        return (
          <span key={row.id} className="flex min-w-0 items-center gap-[0.7vh] text-[1.9vh] leading-[2.4vh]" data-state={row.state}>
            <span aria-hidden className="h-[0.9vh] w-[0.9vh] shrink-0 rounded-full" style={{ background: lit ? "var(--accent)" : "var(--text-muted)" }} />
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: lit ? "var(--accent)" : "var(--text)" }}>
              {row.time}
            </span>
            <span className="min-w-0 truncate text-muted">{row.title}</span>
          </span>
        );
      })}
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
