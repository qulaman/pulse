"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";

import {
  cellTitle,
  laterDays,
  monthGrid,
  todayPlan,
  type CalendarRow,
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
 *    who; the running one on an accent plane with «идёт · до 13:04», past ones dimmed. Below, «Дальше» —
 *    only days that have something, one line per day;
 *  - «Месяц»: this month's weeks from Monday, today a solid accent plane,
 *    up to two events in a cell and «+N»; past weeks fold down to the dates.
 * What does not fit is left out whole (the line goes entirely, it is not clipped), the font does not
 * shrink. Birthdays in gold. A guest gets no titles or places — the DB does not send them (D-33).
 */
export function TvCalendar({ calendar, now, view }: { calendar: TvCalendarData | null; now: Date; view: CalendarView }) {
  // the calendar moves by the minute: the «now» mark and the notes are drawn from it, and a
  // minute is also what the server and the browser agree on at hydration
  const minute = now.getTime() - (now.getTime() % 60_000);
  return view === "month" ? <MonthView calendar={calendar} minute={minute} /> : <WeekView calendar={calendar} minute={minute} />;
}

/** Tints of the scene: one accent (what is on now), gold for a birthday, the rest from the text. */
const ACCENT_PLANE = "color-mix(in srgb, var(--accent) 18%, var(--bg))";
const GOLD = "var(--gold)";
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

  return (
    <div className="tv-box" data-testid="tv-calendar" data-view="week">
      <TvSceneHead title="Календарь" sub={plan.date} />
      {free ? null : <Track track={plan.track} />}
      {/* the rows' planes run 2vh past the grid on both sides: the box widens by as much, the text stays on the grid */}
      <div className={`${FIT_COLUMN} -mx-[2vh] flex-1 gap-x-[12vh] gap-y-[0.8vh] px-[2vh]`} data-testid="tv-calendar-today">
        {free ? (
          <p className="tv-lead w-full pb-[3vh]" style={{ color: "var(--tv-text)" }}>
            Свободный день
          </p>
        ) : (
          plan.rows.map((row) => <TodayLine key={row.id} row={row} />)
        )}
        {later.length > 0 ? (
          <>
            {/* under a busy day «Дальше» sits at the bottom of the scene; the air above it grows and shrinks */}
            {free ? null : <div aria-hidden className="min-h-[3vh] w-full flex-1" />}
            {later.map((day) => (
              <LaterLine key={day.key} day={day} large={free} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

const SEGMENT_COLOR: Record<CalendarState, string> = {
  now: "var(--accent)",
  next: "color-mix(in srgb, var(--accent) 55%, var(--bg))",
  later: "color-mix(in srgb, var(--tv-text) 55%, var(--bg))",
  past: "color-mix(in srgb, var(--text-muted) 35%, var(--bg))",
};

/** The day as a scale: hours under it, a bar per meeting, the «now» mark standing across it. */
function Track({ track }: { track: TodayTrack }) {
  const at = (hour: number) => ((hour - track.from) / (track.to - track.from)) * 100;
  const last = track.labels.length - 1;
  return (
    <div className="relative h-[8.4vh] w-full shrink-0" aria-hidden data-testid="tv-track">
      <div className="absolute inset-x-0 top-[1.2vh] h-[1.4vh] rounded-full" style={{ background: "color-mix(in srgb, var(--surface-2) 80%, var(--bg))" }} />
      {track.segments.map((segment) => (
        <span
          key={segment.id}
          className={`absolute top-[1.2vh] h-[1.4vh] rounded-full ${segment.state === "now" ? s.live : ""}`}
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
          className="tv-small tv-num absolute top-[3.2vh] text-muted"
          // the end labels stay inside the grid: the first starts at its hour, the last ends at it
          style={{ left: `${at(hour)}%`, transform: `translateX(${i === 0 ? "0" : i === last ? "-100%" : "-50%"})` }}
        >
          {String(hour).padStart(2, "0")}
        </span>
      ))}
      {track.now !== null ? (
        <span className="absolute top-0 h-[3.8vh] w-[0.5vh] -translate-x-1/2 rounded-full" style={{ left: `${track.now * 100}%`, background: "var(--tv-text)" }} />
      ) : null}
    </div>
  );
}

/** The board's columns: the time, what, where and who. */
const TODAY_COLUMNS: CSSProperties = { gridTemplateColumns: "21vh minmax(0, 1fr) 44vh" };

function TodayLine({ row }: { row: TodayRow }) {
  const lit = row.state === "now" || row.state === "next";
  const where = [row.place, row.people].filter(Boolean).join(" · ");
  return (
    <div
      className="relative grid w-full items-baseline gap-x-[3vh] py-[1.2vh]"
      style={{ ...TODAY_COLUMNS, opacity: row.state === "past" ? PAST_OPACITY : 1 }}
      data-state={row.state}
    >
      {lit ? <span aria-hidden className="absolute -inset-x-[2vh] inset-y-0" style={{ background: ACCENT_PLANE }} /> : null}
      <span className="tv-lead tv-num relative" style={{ color: "var(--tv-text)" }}>
        {row.time}
      </span>
      <span className="tv-body tv-two-lines relative" style={{ color: row.birthday ? GOLD : "var(--tv-text)", fontWeight: lit ? 600 : 400 }}>
        {row.title}
      </span>
      <span className="tv-small relative flex flex-col">
        {row.note ? (
          <span className="font-semibold" style={{ color: "var(--accent)" }}>
            {row.note}
          </span>
        ) : null}
        {where ? <span className="tv-two-lines text-muted">{where}</span> : null}
      </span>
    </div>
  );
}

/** A later day in one line: its name («Понедельник» is the widest), then up to two meetings side by side. */
const LATER_COLUMNS: CSSProperties = { gridTemplateColumns: "29vh repeat(2, minmax(0, 1fr))" };
const LATER_COLUMNS_LARGE: CSSProperties = { gridTemplateColumns: "37vh repeat(2, minmax(0, 1fr))" };

function LaterLine({ day, large }: { day: LaterDay; large: boolean }) {
  const size = large ? "tv-body" : "tv-small";
  return (
    <div
      className={`grid w-full items-baseline gap-x-[var(--tv-gap)] ${large ? "py-[1vh]" : "py-[0.6vh]"}`}
      style={large ? LATER_COLUMNS_LARGE : LATER_COLUMNS}
      data-testid="tv-later"
    >
      <span className={`${size} font-semibold`} style={{ color: "var(--tv-text)" }}>
        {day.label}
      </span>
      {day.rows.map((row) => (
        <span
          key={row.id}
          className={`${size} grid min-w-0 items-baseline gap-x-[1.6vh]`}
          // a day with one meeting gives it both slots: a long title stays on one line
          style={{ gridTemplateColumns: "auto minmax(0, 1fr)", gridColumn: day.rows.length === 1 ? "span 2" : undefined }}
        >
          <span className="tv-num text-muted">{row.time}</span>
          <span className="tv-two-lines" style={{ color: row.birthday ? GOLD : "var(--tv-text)" }}>
            {row.title}
          </span>
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Месяц сеткой                                                               */
/* -------------------------------------------------------------------------- */

function MonthView({ calendar, minute }: { calendar: TvCalendarData | null; minute: number }) {
  const grid = useMemo(() => monthGrid(calendar, new Date(minute)), [calendar, minute]);
  const ref = useRef<HTMLDivElement>(null);
  // what each cell shows changes with the data and the day, not with the second
  const signature = useMemo(
    () => grid.weeks.map((week) => `${week.past ? "p" : ""}${week.days.map((cell) => `${cell.today ? "t" : ""}${cell.rows.map((row) => row.id).join(",")}`).join("|")}`).join("/"),
    [grid],
  );
  const shown = useFitCounts(ref, signature);
  // past weeks fold to their numbers: the rows ahead get the height their meetings need
  const rows = `auto ${grid.weeks.map((week) => (week.past ? "auto" : "minmax(0, 1fr)")).join(" ")}`;

  return (
    <div className="tv-box" data-testid="tv-calendar" data-view="month">
      <TvSceneHead title={grid.month} sub={String(grid.year)} />
      <div ref={ref} className="grid min-h-0 flex-1 grid-cols-7 gap-[0.4vh]" style={{ gridTemplateRows: rows }}>
        {grid.weekdays.map((day, i) => (
          <span key={day} className="tv-fine px-[0.8vh] pb-[0.4vh] text-muted" style={{ opacity: i >= 5 ? 0.7 : 1 }}>
            {day}
          </span>
        ))}
        {grid.weeks.map((week) => week.days.map((cell) => <MonthDay key={cell.key} cell={cell} week={week} shown={shown?.[cell.key]} />))}
      </div>
    </div>
  );
}

function MonthDay({ cell, week, shown }: { cell: MonthCell; week: MonthWeek; shown: number | undefined }) {
  // another month's day in an edge week: an empty cell, not a dim number
  if (!cell.inMonth) return <div aria-hidden />;
  const total = cell.rows.length + cell.more;
  // a folded week shows no meetings; elsewhere the rows that did not fit count into «+N» with the rest
  const visible = week.past ? 0 : Math.min(shown ?? cell.rows.length, cell.rows.length);
  const hidden = week.past ? 0 : total - visible;
  const ink = cell.today ? "var(--bg)" : "var(--tv-text)";
  const background = cell.today
    ? "var(--accent)"
    : cell.weekend
      ? "color-mix(in srgb, var(--surface) 30%, var(--bg))"
      : "color-mix(in srgb, var(--surface) 62%, var(--bg))";
  const first = week.past ? null : (cell.rows[0] ?? null);
  return (
    <div
      className="flex min-h-0 min-w-0 flex-col gap-[0.3vh] overflow-hidden px-[0.8vh] py-[0.6vh]"
      style={{ background, opacity: cell.past ? PAST_OPACITY : 1 }}
      data-today={cell.today || undefined}
    >
      {/* the number, the first meeting's time beside it, «+N» at the end: the title below gets whole lines */}
      <div className="flex items-baseline gap-[1.2vh]">
        <span className="tv-small tv-num font-semibold" style={{ color: ink, opacity: cell.weekend && !cell.today ? 0.75 : 1 }}>
          {cell.day}
        </span>
        {first ? (
          <span className="tv-fine tv-num" style={{ color: timeInk(cell.today) }}>
            {first.time}
          </span>
        ) : null}
        {hidden > 0 ? (
          <span className="tv-fine tv-num ml-auto font-semibold" style={{ color: cell.today ? "var(--bg)" : "var(--text-muted)" }}>
            +{hidden}
          </span>
        ) : null}
      </div>
      {first ? (
        <div className={`${FIT_COLUMN} relative flex-1 gap-x-[4vh] gap-y-[0.4vh]`} data-fit={cell.key}>
          {cell.rows.map((row, i) => (
            <MonthRow key={row.id} row={row} today={cell.today} first={i === 0} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function timeInk(today: boolean): string {
  return today ? "color-mix(in srgb, var(--bg) 72%, var(--accent))" : "var(--text-muted)";
}

/**
 * The first meeting of a cell always shows — its time stands by the day's number, its title gets
 * the lines below, cut at a whole line if the cell is short (`round()` keeps the height to whole
 * lines of 4vh, the line of `tv-fine`; a word too long for the cell is hyphenated). The next one shows whole, its time in front, or not at all.
 */
const FIRST_ROW: CSSProperties = { maxHeight: "round(down, 100%, 4vh)", overflow: "hidden", overflowWrap: "anywhere", hyphens: "auto", letterSpacing: "-0.01em" };

function MonthRow({ row, today, first }: { row: CalendarRow; today: boolean; first: boolean }) {
  const title = today ? "var(--bg)" : row.birthday ? GOLD : "var(--tv-text)";
  return (
    <p className="tv-fine w-full" style={first ? FIRST_ROW : undefined} data-state={row.state}>
      {first ? null : (
        <>
          <span className="tv-num" style={{ color: timeInk(today) }}>
            {row.time}
          </span>{" "}
        </>
      )}
      <span style={{ color: title, fontWeight: row.birthday ? 600 : 400 }}>{cellTitle(row)}</span>
    </p>
  );
}

/**
 * How many meetings each cell of the month really shows: a fit column hides what does not fit,
 * and «+N» has to count those too. Measured after layout, by the cells' own boxes, again when
 * the wall's size or the month's content changes — not every second.
 */
function useFitCounts(ref: RefObject<HTMLElement | null>, signature: string): Record<string, number> | null {
  const [state, setState] = useState<{ signature: string; counts: Record<string, number> } | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // the observer reports once right away, then on every resize of the grid
    const observer = new ResizeObserver(() => {
      const counts: Record<string, number> = {};
      for (const box of root.querySelectorAll<HTMLElement>("[data-fit]")) {
        const limit = box.clientWidth;
        counts[box.dataset.fit!] = Array.from(box.children).filter((child) => (child as HTMLElement).offsetLeft < limit).length;
      }
      setState((before) =>
        before && before.signature === signature && sameCounts(before.counts, counts) ? before : { signature, counts },
      );
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [ref, signature]);
  return state?.signature === signature ? state.counts : null;
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
