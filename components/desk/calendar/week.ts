import { isoWeekday } from "@/lib/desk/busy";
import { hhmm, ymdOfEvent } from "@/lib/calendar/agenda";
import { endOf } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { Ymd } from "@/lib/datetime/calendar";

/**
 * The week of the desk's calendar as hours (D-154, D-180): a column a day, the working hours
 * 08:00–20:00 always — what lies before or after them goes into a thin row of its own above or
 * under the grid, so one early call never stretches the whole week. An hour is as tall as the
 * screen allows (`hourPxFor`); the day the director looks at is wider than the rest, a day off
 * narrower (`dayShares`) — widths come from settings and the focus, never from the meetings.
 * Meetings that overlap stand side by side when two, cascade when three or more (`layoutDay`).
 * Pure functions over the Aqtobe wall clock (+05:00 all year, docs/AI.md §2).
 */

/** The working day the grid always shows; the rest is a row of chips at either end. */
export const DAY_FROM = 8;
export const DAY_TO = 20;
const HOURS = DAY_TO - DAY_FROM;
/** An hour before the screen was measured (and the floor of the old fixed grid). */
export const HOUR_PX = 48;
/** An hour is never shorter than this (a 15-minute call still a sliver) nor taller (a huge screen). */
export const HOUR_MIN_PX = 40;
export const HOUR_MAX_PX = 72;

/** The widths of the days, in shares of what is left after the hours' column (D-180). */
export const SHARE = { focus: 2.2, work: 1, off: 0.55 } as const;

/** Two meetings starting within this many minutes stand side by side, not one over the other. */
export const TOGETHER_MIN = 30;

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MIN = 24 * 60;

/** Minutes past the wall clock's midnight, and the day they belong to. */
export function wallOf(at: string | number): { ymd: Ymd; minutes: number } {
  const wall = new Date((typeof at === "string" ? new Date(at).getTime() : at) + OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    ymd: `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
    minutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
  };
}

/**
 * Where a meeting stands on its own day, in minutes: an end on a later day closes it at midnight
 * (`overnight`). A meeting without an end lasts an hour, everywhere (`endOf`, D-180).
 */
export function spanOf(event: CalendarEvent): { start: number; end: number; overnight: boolean } {
  const start = wallOf(event.starts_at);
  const end = wallOf(endOf(event));
  const overnight = end.ymd !== start.ymd;
  return { start: start.minutes, end: Math.max(overnight ? DAY_MIN : end.minutes, start.minutes), overnight };
}

/** Which part of a day a meeting is drawn in: the row before the grid, the grid, the row after it. */
export type Band = "early" | "day" | "late";

export function bandOf(span: { start: number; end: number }, from = DAY_FROM, to = DAY_TO): Band {
  if (span.start >= to * 60) return "late";
  if (span.start < from * 60 && span.end <= from * 60) return "early";
  return "day";
}

/** A day's meetings by the part of the day they are drawn in, each list in its order. */
export function bandsOf(events: readonly CalendarEvent[], from = DAY_FROM, to = DAY_TO): Record<Band, CalendarEvent[]> {
  const out: Record<Band, CalendarEvent[]> = { early: [], day: [], late: [] };
  for (const event of events) out[bandOf(spanOf(event), from, to)].push(event);
  return out;
}

/** «10:00», «10:00–11:30», a night that runs into the next day — «22:00→01:00». */
export function clockOf(event: CalendarEvent): string {
  const start = hhmm(event.starts_at);
  if (!event.ends_at) return start;
  return `${start}${spanOf(event).overnight ? "→" : "–"}${hhmm(event.ends_at)}`;
}

/** The height of an hour for the room the grid has below its top: the twelve working hours fit. */
export function hourPxFor(available: number): number {
  if (!Number.isFinite(available)) return HOUR_PX;
  return Math.max(HOUR_MIN_PX, Math.min(HOUR_MAX_PX, Math.floor(available / HOURS)));
}

/** Pixels from the top of the grid for a time of the day. */
export function yOf(minutes: number, from: number, hourPx: number = HOUR_PX): number {
  return ((minutes - from * 60) * hourPx) / 60;
}

// one Monday-to-Sunday rule for the widths here and «Окна директора» (lib/desk/busy.ts)
export { isoWeekday };

/** Each day's share of the width: the focused day widest, a working day one, a day off narrow. */
export function dayShares(days: readonly Ymd[], focusDay: Ymd | null, workdays: readonly number[]): number[] {
  const work = new Set(workdays);
  return days.map((ymd) => (ymd === focusDay ? SHARE.focus : work.has(isoWeekday(ymd)) ? SHARE.work : SHARE.off));
}

/** The grid's columns: the hours' column, then each day in its share. */
export function columnsOf(gutter: number, shares: readonly number[]): string {
  return `${gutter}px ${shares.map((share) => `minmax(0, ${share}fr)`).join(" ")}`;
}

export type Placed = {
  event: CalendarEvent;
  /** Minutes past midnight, the real ones cut to the grid's hours. */
  start: number;
  end: number;
  /** Where the block is drawn to: tall enough for a line of words, never into the next meeting. */
  drawEnd: number;
  /** The meeting goes on before the grid's first hour or after its last. */
  clipTop: boolean;
  clipBottom: boolean;
  /** Side by side: the place among the meetings that share the width, and how many share it. */
  lane: number;
  lanes: number;
  /** A cascade (three or more at once): how far in this one is set, and the deepest of its run; 0 — none. */
  depth: number;
  depths: number;
};

type Item = Placed & { realEnd: number };

/**
 * One day's meetings on the grid (`bandOf` = "day"). Whether two meetings overlap is decided by
 * their real ends — a 10:00–10:15 call and a 10:15 meeting do not; `minMinutes` only gives a short
 * one room for its words, and only up to the next meeting. A run of overlapping meetings that
 * never has more than two at once stands side by side. A run with three or more cascades: each
 * meeting that starts while others are on is set in one step further and lies over them; the ones
 * starting together (within `TOGETHER_MIN` of the first of them) share their step side by side.
 */
export function layoutDay(events: readonly CalendarEvent[], options: { from?: number; to?: number; minMinutes?: number } = {}): Placed[] {
  const from = (options.from ?? DAY_FROM) * 60;
  const to = (options.to ?? DAY_TO) * 60;
  const minMinutes = options.minMinutes ?? 0;
  const items: Item[] = events
    .map((event) => {
      const span = spanOf(event);
      const start = Math.max(from, Math.min(span.start, to));
      const realEnd = Math.max(start, Math.min(span.end, to));
      return { event, start, end: realEnd, realEnd, drawEnd: realEnd, clipTop: span.start < from, clipBottom: span.end > to, lane: 0, lanes: 1, depth: 0, depths: 0 };
    })
    .sort((a, b) => a.start - b.start || b.realEnd - a.realEnd || a.event.id.localeCompare(b.event.id));

  // runs of meetings that overlap one another, by their real ends
  const runs: Item[][] = [];
  let runEnd = -1;
  for (const item of items) {
    // a meeting of no length still stands with the one it starts inside
    if (runs.length === 0 || item.start >= runEnd) {
      runs.push([item]);
      runEnd = Math.max(item.realEnd, item.start + 1);
    } else {
      runs[runs.length - 1].push(item);
      runEnd = Math.max(runEnd, item.realEnd);
    }
  }

  for (const run of runs) {
    const ends: number[] = [];
    for (const item of run) {
      let lane = ends.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = ends.length;
        ends.push(Math.max(item.realEnd, item.start + 1));
      } else {
        ends[lane] = Math.max(item.realEnd, item.start + 1);
      }
      item.lane = lane;
    }
    if (ends.length <= 2) {
      for (const item of run) item.lanes = ends.length;
      continue;
    }
    cascade(run);
  }

  // a short meeting is drawn tall enough for its words, but never over the next one
  for (const item of items) {
    const next = items.reduce((min, other) => (other !== item && other.start >= item.realEnd && other.start < min ? other.start : min), to);
    item.drawEnd = Math.max(item.realEnd, Math.min(item.start + minMinutes, next, to));
  }
  return items.map((item) => ({
    event: item.event,
    start: item.start,
    end: item.end,
    drawEnd: item.drawEnd,
    clipTop: item.clipTop,
    clipBottom: item.clipBottom,
    lane: item.lane,
    lanes: item.lanes,
    depth: item.depth,
    depths: item.depths,
  }));
}

/** Steps for a run of three or more at once (see `layoutDay`). */
function cascade(run: Item[]) {
  let index = 0;
  const done: Item[] = [];
  while (index < run.length) {
    const lead = run[index];
    const group: Item[] = [];
    while (index < run.length && run[index].start - lead.start < TOGETHER_MIN) group.push(run[index++]);
    // one step deeper than the deepest meeting still on when the group starts
    const depth = done.reduce((deepest, item) => (item.realEnd > lead.start ? Math.max(deepest, item.depth + 1) : deepest), 0);
    group.forEach((item, at) => {
      item.depth = depth;
      item.lane = at;
      item.lanes = group.length;
    });
    done.push(...group);
  }
  const depths = Math.max(...run.map((item) => item.depth));
  for (const item of run) item.depths = depths;
}

/** The meetings of the days on screen, grouped by the company's day, in order. */
export function eventsByDay(events: readonly CalendarEvent[], days: readonly Ymd[]): Map<Ymd, CalendarEvent[]> {
  const shown = new Set(days);
  const map = new Map<Ymd, CalendarEvent[]>();
  for (const event of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const ymd = ymdOfEvent(event);
    if (!shown.has(ymd)) continue;
    const list = map.get(ymd);
    if (list) list.push(event);
    else map.set(ymd, [event]);
  }
  return map;
}

/** Tops for marks in order, each pushed below the one before it when they would touch. */
export function stackTops(wanted: readonly number[], step: number): number[] {
  const tops: number[] = [];
  for (const top of wanted) tops.push(tops.length ? Math.max(top, tops[tops.length - 1] + step) : top);
  return tops;
}

/** What of a stack stands in its column: the tops, how many marks are shown, where «+N» goes (null — no need). */
export type MarkFit = { tops: number[]; shown: number; moreTop: number | null };

/**
 * A day's marks in a column `height` tall: stacked from their hours, as many as fit whole; the
 * rest go behind «+N», which takes the place under the last mark shown. A single mark that would
 * hang over the column's foot stands up instead — a «+1» is no better than the mark itself.
 */
export function fitMarks(wanted: readonly number[], step: number, markH: number, moreH: number, height: number): MarkFit {
  const tops = stackTops(wanted, step);
  let shown = tops.filter((top) => top + markH <= height).length;
  if (shown === tops.length) return { tops, shown, moreTop: null };
  const above = shown > 0 ? tops[shown - 1] + step : 0;
  if (shown === tops.length - 1 && height - markH >= above) {
    tops[shown] = height - markH;
    return { tops, shown: tops.length, moreTop: null };
  }
  while (shown > 0 && tops[shown - 1] + step + moreH > height) shown -= 1;
  const moreTop = shown > 0 ? tops[shown - 1] + step : Math.max(0, Math.min(tops[0], height - moreH));
  return { tops, shown, moreTop };
}
