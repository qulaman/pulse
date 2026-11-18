import { aqtobeIsoToYmdHm, daysBetween, humanYmd, todayYmd, ymdHmToAqtobeIso, type Ymd } from "@/lib/datetime/calendar";
import { sceneOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

/**
 * When the director is busy, as the secretary sees it (owner, 2026-11-04; RPC `director_busy`):
 * spans of time, merged on the server, with no word about the meetings. What the desk draws of
 * them — blocks on the week of hours and one line by the «Посетитель» button. Pure functions over
 * the Aqtobe wall clock.
 */

export type BusySpan = { starts_at: string; ends_at: string };

/** A span on one day: minutes past the wall clock's midnight. */
export type BusyBlock = { start: number; end: number };

const MINUTE_MS = 60_000;
const DAY_MIN = 24 * 60;

/** The spans cut to the days on screen, in order; a span across midnight stands on both days. */
export function busyByDay(spans: readonly BusySpan[], days: readonly Ymd[]): Map<Ymd, BusyBlock[]> {
  const map = new Map<Ymd, BusyBlock[]>();
  for (const ymd of days) {
    const midnight = Date.parse(ymdHmToAqtobeIso(ymd, "00:00") as string);
    const blocks: BusyBlock[] = [];
    for (const span of spans) {
      const start = Math.floor((Date.parse(span.starts_at) - midnight) / MINUTE_MS);
      const end = Math.ceil((Date.parse(span.ends_at) - midnight) / MINUTE_MS);
      if (end <= 0 || start >= DAY_MIN || end <= start) continue;
      blocks.push({ start: Math.max(0, start), end: Math.min(DAY_MIN, end) });
    }
    if (blocks.length > 0) map.set(ymd, blocks.sort((a, b) => a.start - b.start));
  }
  return map;
}

/** The minutes the week's grid has to hold for these blocks (`hourRange`'s `extra`). */
export function busyMinutes(byDay: ReadonlyMap<Ymd, readonly BusyBlock[]>): number[] {
  return [...byDay.values()].flat().flatMap((block) => [block.start, block.end - 1]);
}

/** «до 15:00», «до завтра 10:00», «до чт, 12 ноября». */
function untilWords(iso: string, now: Date): string {
  const at = aqtobeIsoToYmdHm(iso) as { ymd: Ymd; hm: string };
  const ahead = daysBetween(todayYmd(now), at.ymd);
  if (ahead <= 0) return `до ${at.hm}`;
  return ahead === 1 ? `до завтра ${at.hm}` : `до ${humanYmd(at.ymd, now)}`;
}

/**
 * The line by the «Посетитель» button: «Директор на встрече до 15:00», «Директор свободен до
 * 16:30»; with nothing more today — «Директор свободен».
 */
export function busyLine(spans: readonly BusySpan[], now: Date): { busy: boolean; text: string } {
  const at = now.getTime();
  const current = spans.find((span) => Date.parse(span.starts_at) <= at && at < Date.parse(span.ends_at));
  if (current) return { busy: true, text: `Директор на встрече ${untilWords(current.ends_at, now)}` };
  const today = todayYmd(now);
  const next = spans
    .map((span) => span.starts_at)
    .filter((start) => Date.parse(start) > at && aqtobeIsoToYmdHm(start)?.ymd === today)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return { busy: false, text: next ? `Директор свободен ${untilWords(next, now)}` : "Директор свободен" };
}

/* ---- the director's door (D-175) ------------------------------------------------------------ */

/**
 * The director's door closed by an accepted «не беспокоить» (D-99): until when, and which of the
 * secretaries holds it — she is the one who may open it again.
 */
export type DoorHold = { errandId: string; until: string | null; holder: { id: string; name: string } | null };

export type DoorState = "free" | "busy" | "dnd";

/**
 * The door as the secretary's desk says it: «не беспокоить» wins over a meeting, a meeting over
 * free. `text` — the whole state in one line (the top bar); `until` — when this state ends (the
 * meeting's or the closed door's end; free — the next busy span's start today); `next` — the first
 * busy span after it today; `holder` — who closed the door.
 */
export type Door = {
  state: DoorState;
  text: string;
  until: string | null;
  next: BusySpan | null;
  holder: { id: string; name: string } | null;
};

/** What a door hold needs of a request: the list of «Заявки» as it comes. */
type HoldRow = {
  id: string;
  status: string;
  kind: string;
  label: string;
  until_at: string | null;
  claimed_by: string | null;
  claimed?: { full_name: string } | null;
  created_at: string;
};

/**
 * The «не беспокоить» somebody has taken — the newest, whoever holds it; null while the door is
 * open. With `now`, a hold whose time is over is passed by first: an older open-ended one still
 * closes the door after a newer short one ran out.
 */
export function doorHoldOf(rows: readonly HoldRow[], catalogue: readonly SecretaryAction[] = [], now?: Date): DoorHold | null {
  const at = now?.getTime();
  const held = rows
    .filter((row) => row.status === "accepted" && sceneOf(row, catalogue) === "dnd")
    .filter((row) => at === undefined || !row.until_at || Date.parse(row.until_at) > at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!held) return null;
  return {
    errandId: held.id,
    until: held.until_at,
    holder: held.claimed_by ? { id: held.claimed_by, name: held.claimed?.full_name ?? "" } : null,
  };
}

/** The first busy span that ends after `ref` and belongs to today — one going on at `ref` included. */
function firstAfter(spans: readonly BusySpan[], ref: number, today: Ymd): BusySpan | null {
  return (
    [...spans]
      .filter((span) => Date.parse(span.ends_at) > ref && (Date.parse(span.starts_at) <= ref || aqtobeIsoToYmdHm(span.starts_at)?.ymd === today))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null
  );
}

/** Is the door closed now: taken, and its time (if it has one) not over. */
function holds(hold: DoorHold | null, at: number): hold is DoorHold {
  return Boolean(hold) && (!hold?.until || Date.parse(hold.until) > at);
}

/**
 * The door now. `spans` null — the calendar has not answered (or refused): a closed door is still
 * said, otherwise nothing — never a wrong «свободен».
 */
export function doorOf(spans: readonly BusySpan[] | null, hold: DoorHold | null, now: Date): Door | null {
  const at = now.getTime();
  const today = todayYmd(now);
  if (holds(hold, at)) {
    const end = hold.until ? Date.parse(hold.until) : at;
    return {
      state: "dnd",
      text: hold.until ? `Не беспокоить ${untilWords(hold.until, now)}` : "Не беспокоить",
      until: hold.until,
      next: spans ? firstAfter(spans, end, today) : null,
      holder: hold.holder,
    };
  }
  if (!spans) return null;
  const current = spans.find((span) => Date.parse(span.starts_at) <= at && at < Date.parse(span.ends_at));
  if (current) {
    return {
      state: "busy",
      text: `Директор на встрече ${untilWords(current.ends_at, now)}`,
      until: current.ends_at,
      next: firstAfter(spans, Date.parse(current.ends_at), today),
      holder: null,
    };
  }
  const next = firstAfter(spans, at, today);
  return {
    state: "free",
    text: next ? `Директор свободен ${untilWords(next.starts_at, now)}` : "Директор свободен",
    until: next?.starts_at ?? null,
    next,
    holder: null,
  };
}

/** The door's day line: minutes of the wall clock, 08–19 unless a busy span or now falls outside. */
export type DayLine = { from: number; to: number; blocks: BusyBlock[]; now: number };

const HOUR = 60;

export function dayLineOf(spans: readonly BusySpan[], now: Date, from = 8 * HOUR, to = 19 * HOUR): DayLine {
  const today = todayYmd(now);
  const blocks = busyByDay(spans, [today]).get(today) ?? [];
  const wall = aqtobeIsoToYmdHm(now.toISOString()) as { hm: string };
  const [h, m] = wall.hm.split(":").map(Number);
  const at = h * HOUR + m;
  const starts = [from, at, ...blocks.map((block) => block.start)];
  const ends = [to, at + 1, ...blocks.map((block) => block.end)];
  return {
    from: Math.max(0, Math.floor(Math.min(...starts) / HOUR) * HOUR),
    to: Math.min(DAY_MIN, Math.ceil(Math.max(...ends) / HOUR) * HOUR),
    blocks,
    now: at,
  };
}

/** «15:00» of a moment on the Aqtobe wall clock. */
export function wallHm(iso: string): string {
  return aqtobeIsoToYmdHm(iso)?.hm ?? "";
}

/* ---- «Окна директора» (D-180): his free windows, said in words ------------------------------- */

/** A free stretch of one day: minutes of the wall clock. */
export type FreeWindow = { start: number; end: number };

/** Shorter than this, a gap between two meetings is no window to offer a caller. */
export const MIN_WINDOW = 15;

/** `director_busy` answers at most this many days at once (`20261104121000_director_busy.sql:26`). */
export const BUSY_MAX_DAYS = 31;

function shiftYmd(ymd: Ymd, days: number): Ymd {
  const [year, month, day] = ymd.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}-${String(moved.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The reads of `[from, to)` — `to` not included — for an RPC that takes at most `max` days: a
 * month on screen (42 days) is two calls.
 */
export function busyChunks(from: Ymd, to: Ymd, max = BUSY_MAX_DAYS): [Ymd, Ymd][] {
  const out: [Ymd, Ymd][] = [];
  let at = from;
  while (daysBetween(at, to) > 0) {
    const next = daysBetween(at, to) > max ? shiftYmd(at, max) : to;
    out.push([at, next]);
    at = next;
  }
  return out;
}

/** The days of `[from, to)`. */
export function daysFromTo(from: Ymd, to: Ymd): Ymd[] {
  const out: Ymd[] = [];
  for (let at = from; daysBetween(at, to) > 0; at = shiftYmd(at, 1)) out.push(at);
  return out;
}

/**
 * The spans of several reads as one list: in order, what overlaps or touches made one span — as
 * the server does within one read (both reads of a month return a span across their edge).
 */
export function mergeSpans(spans: readonly BusySpan[]): BusySpan[] {
  const sorted = [...spans].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || Date.parse(a.ends_at) - Date.parse(b.ends_at));
  const out: BusySpan[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && Date.parse(span.starts_at) <= Date.parse(last.ends_at)) {
      if (Date.parse(span.ends_at) > Date.parse(last.ends_at)) out[out.length - 1] = { starts_at: last.starts_at, ends_at: span.ends_at };
    } else out.push({ starts_at: span.starts_at, ends_at: span.ends_at });
  }
  return out;
}

/**
 * The free windows of a day inside `[from, to)`: the gaps between busy blocks (in any order, even
 * overlapping), none shorter than `min`. A `from` later than the day's start — today after now — cuts.
 */
export function freeWindows(blocks: readonly BusyBlock[], from: number, to: number, min = MIN_WINDOW): FreeWindow[] {
  const out: FreeWindow[] = [];
  let at = from;
  for (const block of [...blocks].sort((a, b) => a.start - b.start)) {
    if (at >= to || block.start >= to) break;
    if (block.end <= at) continue;
    if (block.start - at >= min) out.push({ start: at, end: block.start });
    at = Math.max(at, block.end);
  }
  if (to - at >= min) out.push({ start: at, end: to });
  return out;
}

/** The minute of the day the wall clock stands at. */
export function wallMinutes(now: Date): number {
  const wall = aqtobeIsoToYmdHm(now.toISOString()) as { hm: string };
  const [h, m] = wall.hm.split(":").map(Number);
  return h * HOUR + m;
}

/** «08:15» of a minute of the day; the midnight that ends it is «24:00». */
export function minuteHm(minute: number): string {
  return `${String(Math.floor(minute / HOUR)).padStart(2, "0")}:${String(minute % HOUR).padStart(2, "0")}`;
}

/** «45 мин», «1 ч», «1 ч 30 мин». */
export function lengthWords(minutes: number): string {
  if (minutes < HOUR) return `${minutes} мин`;
  const rest = minutes % HOUR;
  return `${Math.floor(minutes / HOUR)} ч${rest ? ` ${rest} мин` : ""}`;
}

/**
 * The closed door of today as a block: from now until its end — the rest of the day when it has
 * no end or ends on another day. Null while the door is open. «Не беспокоить» is no free window.
 */
export function holdBlock(hold: DoorHold | null, now: Date): BusyBlock | null {
  if (!holds(hold, now.getTime())) return null;
  const start = wallMinutes(now);
  if (!hold.until) return { start, end: DAY_MIN };
  const until = aqtobeIsoToYmdHm(hold.until) as { ymd: Ymd; hm: string };
  if (until.ymd !== todayYmd(now)) return { start, end: DAY_MIN };
  const [h, m] = until.hm.split(":").map(Number);
  return { start, end: Math.max(start, h * HOUR + m) };
}

/** What a day of the windows is: gone by, today, a working day ahead, a day off. */
export type WindowDay = "past" | "today" | "work" | "off";

/** 1 = Monday … 7 = Sunday, as `settings.workdays` counts. */
export function isoWeekday(ymd: Ymd): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
}

export function windowDayOf(ymd: Ymd, today: Ymd, workdays: readonly number[]): WindowDay {
  const ahead = daysBetween(today, ymd);
  if (ahead < 0) return "past";
  if (!workdays.includes(isoWeekday(ymd))) return "off";
  return ahead === 0 ? "today" : "work";
}

/**
 * One day of «Окна директора»: its free windows inside the working hours — none on a day gone by
 * or a day off (he is not at work to be offered) — how long he is free in all, whether he has any
 * busy time at all (a day without is «нет встреч», never «весь день свободен»: the calendar knows
 * meetings only), and his busy time outside the hours in words for the row's ends: «занят с
 * 07:30», «занят 22:00→01:00». `night` — the next day's blocks, for a span past midnight.
 */
export type DayWindows = { windows: FreeWindow[]; free: number; busy: boolean; early: string | null; late: string | null };

export function dayWindows({
  blocks,
  kind,
  from,
  to,
  nowMinute = null,
  hold = null,
  night = [],
}: {
  blocks: readonly BusyBlock[];
  kind: WindowDay;
  from: number;
  to: number;
  /** Today: the windows start now. */
  nowMinute?: number | null;
  /** Today: the closed door. */
  hold?: BusyBlock | null;
  night?: readonly BusyBlock[];
}): DayWindows {
  const open = kind === "today" || kind === "work";
  const start = kind === "today" && nowMinute !== null ? Math.max(from, nowMinute) : from;
  const windows = open ? freeWindows(hold ? [...blocks, hold] : blocks, start, to) : [];
  const early = blocks
    .filter((block) => block.start < from)
    // a block from midnight is mostly the night before going on: until when is the news
    .map((block) => (block.start === 0 ? `до ${minuteHm(block.end)}` : block.end <= from ? `${minuteHm(block.start)}–${minuteHm(block.end)}` : `с ${minuteHm(block.start)}`));
  const late = blocks
    .filter((block) => block.end > to)
    .map((block) => {
      // a span past midnight goes on as the next day's first block
      const next = block.end >= DAY_MIN ? night.find((other) => other.start === 0) : undefined;
      const end = minuteHm(next ? next.end : block.end);
      return block.start >= to ? `${minuteHm(block.start)}→${end}` : `до ${end}`;
    });
  return {
    windows,
    free: windows.reduce((sum, window) => sum + window.end - window.start, 0),
    busy: blocks.length > 0,
    early: early.length ? `занят ${early.join(", ")}` : null,
    late: late.length ? `занят ${late.join(", ")}` : null,
  };
}

/** A window offered for a call: which day, from when, until when. */
export type DatedWindow = FreeWindow & { ymd: Ymd };

/**
 * «Ближайшие окна»: the free windows from now on over the days given — today and the working days
 * ahead, inside the hours, the closed door taken out of today — the soonest first.
 */
export function nearestWindows({
  blocks,
  days,
  now,
  workdays,
  from,
  to,
  hold = null,
  limit = 6,
}: {
  blocks: ReadonlyMap<Ymd, readonly BusyBlock[]>;
  days: readonly Ymd[];
  now: Date;
  workdays: readonly number[];
  from: number;
  to: number;
  hold?: BusyBlock | null;
  limit?: number;
}): DatedWindow[] {
  const today = todayYmd(now);
  const out: DatedWindow[] = [];
  for (const ymd of days) {
    const kind = windowDayOf(ymd, today, workdays);
    if (kind !== "today" && kind !== "work") continue;
    const day = dayWindows({ blocks: blocks.get(ymd) ?? [], kind, from, to, nowMinute: kind === "today" ? wallMinutes(now) : null, hold: kind === "today" ? hold : null });
    for (const window of day.windows) out.push({ ...window, ymd });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** What a window says when copied for a caller: «Свободен завтра, 12:30–14:00». */
export function windowCopy(window: DatedWindow, now: Date): string {
  return `Свободен ${humanYmd(window.ymd, now)}, ${minuteHm(window.start)}–${minuteHm(window.end)}`;
}
