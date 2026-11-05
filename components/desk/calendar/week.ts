import { ymdOfEvent } from "@/lib/calendar/agenda";
import { endOf } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { Ymd } from "@/lib/datetime/calendar";

/**
 * The week of the desk's calendar as hours (D-154): a column a day, an hour 48 px tall,
 * 08:00–20:00 unless something on screen lies outside — then the range widens to hold it.
 * Meetings that overlap stand side by side in their column. Pure functions over the Aqtobe
 * wall clock (+05:00 all year, docs/AI.md §2).
 */

/** The height of an hour on the grid. */
export const HOUR_PX = 48;
/** The working day the grid shows when nothing asks for more. */
export const DAY_FROM = 8;
export const DAY_TO = 20;
/** A meeting shorter than this still gets room for a line of words — and overlaps by it. */
const MIN_MINUTES = 30;

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

/** Where a meeting stands on its own day, in minutes: an end on a later day closes it at midnight. */
export function spanOf(event: CalendarEvent): { start: number; end: number } {
  const start = wallOf(event.starts_at);
  const end = wallOf(endOf(event));
  const close = end.ymd !== start.ymd ? DAY_MIN : end.minutes;
  return { start: start.minutes, end: Math.max(close, start.minutes) };
}

/**
 * The hours the grid spans: the working day, widened to whole hours around every meeting and
 * every other mark (`extra` — minutes past midnight) on screen.
 */
export function hourRange(events: readonly CalendarEvent[], extra: readonly number[] = []): { from: number; to: number } {
  let from = DAY_FROM;
  let to = DAY_TO;
  for (const event of events) {
    const { start, end } = spanOf(event);
    from = Math.min(from, Math.floor(start / 60));
    to = Math.max(to, Math.ceil(Math.max(end, start + MIN_MINUTES) / 60));
  }
  for (const minutes of extra) {
    from = Math.min(from, Math.floor(minutes / 60));
    // a mark sits on its line: a 20:00 deadline needs the hour under it
    to = Math.max(to, Math.floor(minutes / 60) + 1);
  }
  return { from: Math.max(0, from), to: Math.min(24, Math.max(to, from + 1)) };
}

export type Placed = {
  event: CalendarEvent;
  /** Minutes past midnight. */
  start: number;
  end: number;
  /** The lane of the meeting among those it overlaps, and how many lanes they take. */
  lane: number;
  lanes: number;
};

/**
 * One day's meetings on the grid: in order, each in the first lane free at its start; a run of
 * meetings that overlap one another shares the column's width evenly.
 */
export function layoutDay(events: readonly CalendarEvent[]): Placed[] {
  const items = events
    .map((event) => {
      const { start, end } = spanOf(event);
      return { event, start, end: Math.max(end, start + MIN_MINUTES), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let lanes: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const item of cluster) item.lanes = lanes.length;
    cluster = [];
    lanes = [];
  };
  for (const item of items) {
    if (item.start >= clusterEnd) close();
    let lane = lanes.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(item.end);
    } else {
      lanes[lane] = item.end;
    }
    item.lane = lane;
    cluster.push(item);
    placed.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  close();
  return placed;
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

/** Pixels from the top of the grid for a time of the day. */
export function yOf(minutes: number, from: number): number {
  return ((minutes - from * 60) * HOUR_PX) / 60;
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
