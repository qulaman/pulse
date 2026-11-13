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
