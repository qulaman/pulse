"use client";

import { useMemo, type CSSProperties } from "react";

import {
  cellShownTitle,
  firstColumn,
  laterDays,
  monthGrid,
  monthLayout,
  softHyphens,
  todayPlan,
  type CalendarState,
  type LaterDay,
  type MonthCell,
  type MonthWeek,
  type TodayRow,
  type TodayTrack,
} from "@/lib/tv/calendar";
import type { TvCalendar as TvCalendarData } from "@/lib/tv/queries";
import type { CalendarView } from "@/lib/tv/state";

import { TvSceneHead } from "./TvSceneHead";
import s from "./tv.module.css";

/**
 * The «Календарь» scene (D-96, D-98, D-185). Two views, switched from the remote:
 *  - «Неделя»: the day's scale 08–20 with a «сейчас» mark, under it the day's table — time | what | where and
 *    who; the running one on the wall's one «now» plate (`.tv-now`) with «идёт · до 13:04», past ones dimmed.
 *    Below, «Дальше» — only days that have something; the day's name stands in the time column, its
 *    meetings start on the line of the titles above;
 *  - «Месяц»: this month's weeks from Monday, today framed in the live colour, one event in a cell and «+N»;
 *    past weeks fold down to one line of their dates; the edge weeks are whole rows — the neighbouring months'
 *    days stand dimmed in them, the next month's with their meetings; nothing ahead — the head says «встреч нет».
 * Every word is at least `tv-small` (D-185). What does not fit is left out whole (the line goes entirely, it is
 * not clipped), the font does not shrink. Birthdays in gold. A guest gets no titles or places — the DB does not
 * send them (D-33).
 */
export function TvCalendar({ calendar, now, view }: { calendar: TvCalendarData | null; now: Date; view: CalendarView }) {
  // the calendar moves by the minute: the «now» mark and the notes are drawn from it, and a
  // minute is also what the server and the browser agree on at hydration
  const minute = now.getTime() - (now.getTime() % 60_000);
  return view === "month" ? <MonthView calendar={calendar} minute={minute} /> : <WeekView calendar={calendar} minute={minute} />;
}

/** Gold for a birthday — a celebration (D-185 colour roles); the rest is white or muted. */
const GOLD = "var(--tv-points)";
const INK = "var(--tv-text)";
const PAST_OPACITY = 0.42;

/**
 * A column that shows only what fits: its items wrap into a second column past its right edge,
 * and the overflow clip hides that column — an item that does not fit goes whole, never cut.
 */
const FIT_COLUMN = "flex min-h-0 flex-col flex-wrap content-start overflow-hidden";

/* -------------------------------------------------------------------------- */
/* Week: scale, day table, «Дальше»                                           */
/* -------------------------------------------------------------------------- */

function WeekView({ calendar, minute }: { calendar: TvCalendarData | null; minute: number }) {
  const plan = useMemo(() => todayPlan(calendar, new Date(minute)), [calendar, minute]);
  const later = useMemo(() => laterDays(calendar, new Date(minute)), [calendar, minute]);
  // a free day: the days ahead are the scene, one step larger, right under the note
  const free = plan.total === 0;
  // one grid for the day's table and «Дальше»: the time column holds the days' names too
  const grid = useMemo<CSSProperties>(
    () => ({ gridTemplateColumns: `${firstColumn(later, free ? 5.6 : 4.4)}vh minmax(0, 1fr) 44vh`, columnGap: "var(--tv-gap)" }),
    [later, free],
  );

  return (
    <div className="tv-box" data-testid="tv-calendar" data-view="week">
      <TvSceneHead title="Календарь" sub={plan.date} />
      {free ? null : <Track track={plan.track} />}
      <div className={`${FIT_COLUMN} flex-1 gap-x-[12vh]`} data-testid="tv-calendar-today">
        {free ? (
          // the same step in as the table rows: one left edge for every line under the head
          <p className="tv-lead w-full px-[2.4vh] pb-[3vh]" style={{ color: INK }}>
            Свободный день
          </p>
        ) : (
          plan.rows.map((row) => <TodayLine key={row.id} row={row} grid={grid} />)
        )}
        {later.length > 0 ? (
          <>
            {/* under a busy day «Дальше» sits at the bottom of the scene; the air above it grows and shrinks */}
            {free ? null : <div aria-hidden className="min-h-[2.4vh] w-full flex-1" />}
            {later.map((day) => (
              <LaterLines key={day.key} day={day} grid={grid} large={free} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** The meetings on the scale: the running one live, the rest white, the past ones quiet. */
const SEGMENT_COLOR: Record<CalendarState, string> = {
  now: "var(--tv-live)",
  next: `color-mix(in srgb, ${INK} 72%, var(--bg))`,
  later: `color-mix(in srgb, ${INK} 72%, var(--bg))`,
  past: "color-mix(in srgb, var(--text-muted) 40%, var(--bg))",
};

/**
 * The day as a scale read from the door: a line 0.8 vh thick, a block 2.8 vh tall per meeting, the «now» mark
 * standing across it, the hours under it at `tv-small`.
 */
function Track({ track }: { track: TodayTrack }) {
  const at = (hour: number) => ((hour - track.from) / (track.to - track.from)) * 100;
  const last = track.labels.length - 1;
  return (
    <div className="relative h-[9.6vh] w-full shrink-0" aria-hidden data-testid="tv-track">
      <div className="absolute inset-x-0 top-[1.6vh] h-[0.8vh] rounded-full" style={{ background: "color-mix(in srgb, var(--text-muted) 42%, var(--bg))" }} />
      {track.segments.map((segment) => (
        <span
          key={segment.id}
          className={`absolute top-[0.6vh] h-[2.8vh] rounded-[0.7vh] ${segment.state === "now" ? s.live : ""}`}
          style={{
            left: `${segment.start * 100}%`,
            width: `max(1.4vh, ${(segment.end - segment.start) * 100}%)`,
            background: SEGMENT_COLOR[segment.state],
          }}
        />
      ))}
      {track.labels.map((hour, i) => (
        <span
          key={hour}
          className="tv-small tv-num absolute top-[4.2vh] text-muted"
          // the end labels stay inside the grid: the first starts at its hour, the last ends at it
          style={{ left: `${at(hour)}%`, transform: `translateX(${i === 0 ? "0" : i === last ? "-100%" : "-50%"})` }}
        >
          {String(hour).padStart(2, "0")}
        </span>
      ))}
      {track.now !== null ? (
        <span className="absolute top-0 h-[4vh] w-[0.8vh] -translate-x-1/2 rounded-full" style={{ left: `${track.now * 100}%`, background: INK }} />
      ) : null}
    </div>
  );
}

/** The day's table, one line per meeting: the plate of the running one stays inside the grid, the text a step in. */
function TodayLine({ row, grid }: { row: TodayRow; grid: CSSProperties }) {
  const now = row.state === "now";
  const where = [row.place, row.people].filter(Boolean).join(" · ");
  return (
    <div
      className={`grid w-full items-baseline px-[2.4vh] py-[1.4vh] ${now ? "tv-now" : ""}`}
      style={{ ...grid, opacity: row.state === "past" ? PAST_OPACITY : 1 }}
      data-state={row.state}
    >
      <span className="tv-body tv-num font-semibold" style={{ color: INK }}>
        {row.time}
      </span>
      <span className="tv-body tv-two-lines" style={{ color: row.birthday ? GOLD : INK, fontWeight: now ? 600 : 400 }}>
        {row.title}
      </span>
      <span className="tv-small flex flex-col">
        {row.note ? (
          <span className="font-semibold" style={{ color: INK }}>
            {row.note}
          </span>
        ) : null}
        {where ? <span className="tv-two-lines text-muted">{where}</span> : null}
      </span>
    </div>
  );
}

/**
 * A later day: its name in the time column, its meetings one per line from the title column — the time muted,
 * then the title. A whole day is one block: it shows entire or not at all.
 */
function LaterLines({ day, grid, large }: { day: LaterDay; grid: CSSProperties; large: boolean }) {
  const size = large ? "tv-body" : "tv-small";
  return (
    <div className={`w-full px-[2.4vh] ${large ? "py-[0.8vh]" : "py-[0.5vh]"}`} data-testid="tv-later">
      {day.rows.map((row, i) => (
        <div key={row.id} className="grid items-baseline" style={grid}>
          <span className={`${size} font-semibold`} style={{ color: INK }}>
            {i === 0 ? day.label : null}
          </span>
          <span className={`${size} grid min-w-0 items-baseline gap-x-[1.6vh]`} style={{ gridColumn: "span 2", gridTemplateColumns: "auto minmax(0, 1fr)" }}>
            <span className="tv-num text-muted">{row.time}</span>
            <span className="tv-two-lines" style={{ color: row.birthday ? GOLD : INK }}>
              {row.title}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Месяц сеткой                                                               */
/* -------------------------------------------------------------------------- */

/** The line of `tv-small` (4.4 vh × 1.2): a cell's title is cut at whole lines of it. */
const SMALL_LINE = "5.28vh";

function MonthView({ calendar, minute }: { calendar: TvCalendarData | null; minute: number }) {
  const grid = useMemo(() => monthGrid(calendar, new Date(minute)), [calendar, minute]);
  // past weeks fold to their numbers; the weeks ahead share the rest by the lines their cells want, so a week
  // of long titles gets its lines and a quiet one gives them up
  const layout = useMemo(() => monthLayout(grid), [grid]);

  return (
    <div className="tv-box" data-testid="tv-calendar" data-view="month">
      <TvSceneHead title={grid.month} sub={grid.note ? `${grid.year} · ${grid.note}` : String(grid.year)} />
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-[0.4vh]" style={{ gridTemplateRows: layout.rows }}>
        {grid.weekdays.map((day, i) => (
          <span key={day} className="tv-small px-[1.2vh] text-muted" style={{ opacity: i >= 5 ? 0.7 : 1 }}>
            {day}
          </span>
        ))}
        {grid.weeks.map((week, i) => week.days.map((cell) => <MonthDay key={cell.key} cell={cell} week={week} lines={layout.lines[i]} />))}
      </div>
    </div>
  );
}

/**
 * A day of the month: its number and the first event's time on the top line, the title — whole, when it fits the
 * lines the cell has left — «+N» on the last line for the rest. Today is framed in the live colour — a frame, not a
 * fill: the loudest thing on the month is the date, not a green block.
 */
function MonthDay({ cell, week, lines }: { cell: MonthCell; week: MonthWeek; lines: number }) {
  // a folded week shows no meetings
  const first = week.past ? null : (cell.rows[0] ?? null);
  const hidden = first ? cell.rows.length + cell.more - 1 : 0;
  const title = first ? softHyphens(cellShownTitle(cell, lines)) : "";
  // another month's day is quieter than the month's own: a fainter cell, its number in muted
  const background = !cell.inMonth || cell.weekend ? "color-mix(in srgb, var(--surface) 30%, var(--bg))" : "color-mix(in srgb, var(--surface) 62%, var(--bg))";
  return (
    <div
      // a folded week is one line of dates standing in the middle of its strip
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden px-[1.2vh] ${week.past ? "justify-center" : "py-[0.4vh]"}`}
      style={{
        background,
        // the frame sits inside the cell: nothing moves when the day turns
        boxShadow: cell.today ? "inset 0 0 0 0.5vh var(--tv-live)" : undefined,
        opacity: cell.past ? PAST_OPACITY : 1,
      }}
      data-today={cell.today || undefined}
      data-other={cell.inMonth ? undefined : true}
    >
      <div className="flex shrink-0 items-baseline gap-[1.2vh] whitespace-nowrap">
        <span
          className={`tv-small tv-num font-bold ${cell.inMonth ? "" : "text-muted"}`}
          style={{ color: cell.today ? "var(--tv-live)" : cell.inMonth ? INK : undefined, opacity: cell.weekend && !cell.today && cell.inMonth ? 0.75 : 1 }}
        >
          {cell.day}
          {cell.mark ? <span className="font-semibold"> {cell.mark}</span> : null}
        </span>
        {first && !cell.mark ? <span className="tv-small tv-num text-muted">{first.time}</span> : null}
      </div>
      {title ? (
        // the title takes the whole lines the cell has left — a short cell shows a line, a tall one two or three
        <div className="relative min-h-0 flex-1">
          <p
            className="tv-small absolute inset-x-0 top-0"
            style={{
              maxHeight: `round(down, 100%, ${SMALL_LINE})`,
              overflow: "hidden",
              overflowWrap: "anywhere",
              // breaks at the soft hyphens of `softHyphens`, with a hyphen drawn; never the browser's guess
              hyphens: "manual",
              color: first?.birthday ? GOLD : INK,
              fontWeight: first?.birthday ? 600 : 400,
            }}
            data-state={first?.state}
          >
            {title}
          </p>
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {hidden > 0 ? <span className="tv-small tv-num shrink-0 font-semibold text-muted">+{hidden}</span> : null}
    </div>
  );
}
