import type { TvProgramWindow, TvState } from "./queries";
import type { TvScene } from "./state";

export type { TvProgramWindow } from "./queries";

/**
 * Программа дня стены (D-182): что стена показывает сама, по часам, когда ни человек, ни дело,
 * ни доска не стоят на ней, — чистыми функциями. Киоск и пульт считают одно и то же и сходятся
 * без обмена.
 *
 *  - утро — от конца ночи до 10:00: «Сегодня» календаря; в понедельник первый час — рейтинг недели
 *    (при очках и без гостя);
 *  - день — круг заставок раз в три минуты (D-123), объявление дня первым в круге;
 *  - вечер — «Итог дня» первым, дальше круг; в пятницу с 16:00 в круге «Итог недели»;
 *  - ночь — по окну компании (`tv_summary.program`, умолчание 21:00–08:00): стена спит (D-96, D-105).
 *
 * Ручная заставка с пульта (`carousel = false`, `scene_set_at` в текущем отрезке) держится до конца
 * своего отрезка, потом стена возвращается к программе. Доска, фокус и ночь стоят поверх программы.
 */

export type ProgramSegment = "morning" | "day" | "evening" | "night";

/** Minutes from midnight, Aqtobe. */
export type ProgramWindow = { nightFrom: number; nightTo: number; eveningFrom: number };

export const DEFAULT_PROGRAM_WINDOW: ProgramWindow = { nightFrom: 21 * 60, nightTo: 8 * 60, eveningFrom: 17 * 60 };

/** Every scene the middle of the wall can hold: the remote's screensavers and the program's own. */
export type WallScene = TvScene | "day-result" | "week-result" | "announcement" | "welcome";

export type ProgramOpts = { points: boolean; guest: boolean; weekBoard: boolean; announcement: boolean };

/** Screensavers turn once in three minutes: time to read, not to tire (D-123). */
export const ROUND_MS = 3 * 60_000;
/** The morning runs till 10:00. */
const MORNING_UNTIL = 10 * 60;
/** Monday's first hour of the morning is the week's rating. */
const MONDAY_RATING_MS = 60 * 60_000;
/** «Итог недели» joins the round on Friday from 16:00. */
const FRIDAY_WEEK_FROM = 16 * 60;
/** «Пусть заходит» lets a guest in for an hour (D-96); the wall greets them for the first minute of it. */
export const GUEST_VISIT_MS = 60 * 60_000;
export const WELCOME_MS = 60_000;

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const MIN_MS = 60_000;
const DAY_MIN = 24 * 60;
const DAY_MS = DAY_MIN * MIN_MS;

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** "21:00" → 1260; anything else → null. */
function minutesOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  return mod(h * 60 + m, DAY_MIN);
}

/**
 * The window of the company's program from its summary; a field that is missing or unreadable
 * keeps its default — the wall must not go dark from a database older than the client (D-76).
 */
export function programWindowOf(summary: { program?: TvProgramWindow | null } | null | undefined): ProgramWindow {
  const p = summary?.program;
  if (!p) return DEFAULT_PROGRAM_WINDOW;
  return {
    nightFrom: minutesOf(p.night_from) ?? DEFAULT_PROGRAM_WINDOW.nightFrom,
    nightTo: minutesOf(p.night_to) ?? DEFAULT_PROGRAM_WINDOW.nightTo,
    eveningFrom: minutesOf(p.evening_from) ?? DEFAULT_PROGRAM_WINDOW.eveningFrom,
  };
}

/**
 * The day as offsets from the end of the night (in minutes): morning [0, morningEnd), day
 * [morningEnd, eveningStart), evening [eveningStart, dayLen), night [dayLen, 1440). A night from and
 * to the same minute is no night at all.
 */
function layout(w: ProgramWindow) {
  const night = mod(w.nightTo - w.nightFrom, DAY_MIN);
  const dayLen = DAY_MIN - night;
  const morningEnd = Math.min(dayLen, w.nightTo < MORNING_UNTIL ? MORNING_UNTIL - w.nightTo : 0);
  const eveningStart = Math.min(dayLen, Math.max(morningEnd, mod(w.eveningFrom - w.nightTo, DAY_MIN)));
  return { dayLen, morningEnd, eveningStart };
}

/** Milliseconds since the night last ended. */
function sinceNightEnd(now: Date, w: ProgramWindow): number {
  return mod(now.getTime() + AQTOBE_OFFSET_MS - w.nightTo * MIN_MS, DAY_MS);
}

/** Where the segment of `now` begins and ends, as offsets from the end of the night (ms). */
function bounds(now: Date, w: ProgramWindow): { segment: ProgramSegment; from: number; to: number; at: number } {
  const { dayLen, morningEnd, eveningStart } = layout(w);
  const at = sinceNightEnd(now, w);
  const min = at / MIN_MS;
  if (min < morningEnd) return { segment: "morning", from: 0, to: morningEnd * MIN_MS, at };
  if (min < eveningStart) return { segment: "day", from: morningEnd * MIN_MS, to: eveningStart * MIN_MS, at };
  if (min < dayLen) return { segment: "evening", from: eveningStart * MIN_MS, to: dayLen * MIN_MS, at };
  return { segment: "night", from: dayLen * MIN_MS, to: DAY_MS, at };
}

/** Утро — от конца ночи до 10:00; вечер — с `evening_from`; ночь — по окну компании. */
export function segmentOf(now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): ProgramSegment {
  return bounds(now, w).segment;
}

export function segmentStartsAt(now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): Date {
  const b = bounds(now, w);
  return new Date(now.getTime() - (b.at - b.from));
}

export function segmentEndsAt(now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): Date {
  const b = bounds(now, w);
  return new Date(now.getTime() + (b.to - b.at));
}

/** The wall's night by the company's window — one rule for the kiosk, the remote and the face. */
export function nightIn(now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  return segmentOf(now, w) === "night";
}

/** Minutes since local midnight and the weekday (Monday 0 … Sunday 6), Aqtobe. */
function localOf(now: Date): { minutes: number; weekday: number } {
  const local = new Date(now.getTime() + AQTOBE_OFFSET_MS);
  return { minutes: local.getUTCHours() * 60 + local.getUTCMinutes(), weekday: (local.getUTCDay() + 6) % 7 };
}

function fridayWeekOn(now: Date): boolean {
  const { minutes, weekday } = localOf(now);
  return weekday === 4 && minutes >= FRIDAY_WEEK_FROM;
}

/**
 * The screensavers of the round (D-123): face, rating (with points), calendar, team; the clock is the
 * quiet screen for meetings and never turns by itself; the week board last (D-144).
 */
export function baseRound(points: boolean, weekBoard = false): TvScene[] {
  const scenes: TvScene[] = points ? ["face", "rating", "calendar", "team"] : ["face", "calendar", "team"];
  return weekBoard ? [...scenes, "board"] : scenes;
}

/**
 * The round of the segment of `now`: «Итог дня» first in the evening (and at night, when the wall is
 * woken), «Итог недели» on Friday from 16:00, today's announcement before the screensavers. A guest
 * sees no rating, no week board and no announcement (D-33). The morning has no round — an empty list.
 */
export function programRound(now: Date, w: ProgramWindow, o: ProgramOpts): WallScene[] {
  const segment = segmentOf(now, w);
  if (segment === "morning") return [];
  const list: WallScene[] = [];
  if (segment === "evening" || segment === "night") list.push("day-result");
  if (segment !== "night" && fridayWeekOn(now)) list.push("week-result");
  if (o.announcement && !o.guest) list.push("announcement");
  list.push(...baseRound(o.points && !o.guest, o.weekBoard && !o.guest && segment !== "night"));
  return list;
}

/** What the program puts on the wall now. */
export function programScene(now: Date, w: ProgramWindow, o: ProgramOpts): WallScene {
  const b = bounds(now, w);
  if (b.segment === "morning") {
    const monday = localOf(now).weekday === 0;
    return monday && b.at - b.from < MONDAY_RATING_MS && o.points && !o.guest ? "rating" : "calendar";
  }
  const list = programRound(now, w, o);
  const step = Math.floor((b.at - b.from) / ROUND_MS);
  return list[step % list.length]!;
}

/** The next moment the program may turn: the round's next step, the Monday hour, Friday 16:00, the segment's end. */
function nextBoundary(now: Date, w: ProgramWindow): Date {
  const b = bounds(now, w);
  const t = now.getTime();
  const candidates = [t + (b.to - b.at)];
  if (b.segment === "morning") {
    const hourEnd = b.from + MONDAY_RATING_MS;
    if (b.at < hourEnd) candidates.push(t + (hourEnd - b.at));
  } else {
    const step = Math.floor((b.at - b.from) / ROUND_MS);
    candidates.push(t + (b.from + (step + 1) * ROUND_MS - b.at));
    const { minutes, weekday } = localOf(now);
    if (weekday === 4 && minutes < FRIDAY_WEEK_FROM) {
      const local = mod(t + AQTOBE_OFFSET_MS, DAY_MS);
      candidates.push(t + (FRIDAY_WEEK_FROM * MIN_MS - local));
    }
  }
  return new Date(Math.min(...candidates.filter((c) => c > t)));
}

/**
 * When the program changes the wall next and to what — for the remote («дальше — календарь в
 * 14:03») and for the kiosk, which draws the next scene ahead of time.
 */
export function programNext(now: Date, w: ProgramWindow, o: ProgramOpts): { scene: WallScene; at: Date } {
  const current = programScene(now, w, o);
  let t = now;
  for (let i = 0; i < 96; i += 1) {
    const at = nextBoundary(t, w);
    const scene = programScene(at, w, o);
    if (scene !== current) return { scene, at };
    t = at;
  }
  return { scene: current, at: segmentEndsAt(now, w) };
}

/** `tv_state` as a database older than D-182 sends it: no `scene_set_at` at all. */
type StateAnyAge = Omit<TvState, "scene_set_at"> & { scene_set_at?: string | null };

/**
 * A screensaver picked by hand holds till the end of its segment, then the program takes the wall
 * back. The round (`carousel = true`) is the program always; the board lives by its own `board_until`.
 * A database older than D-182 sends no `scene_set_at` at all — then the hand holds as it always did.
 */
export function manualHolds(state: TvState | null, now: Date, w: ProgramWindow = DEFAULT_PROGRAM_WINDOW): boolean {
  if (!state || state.carousel === true || state.scene === "board") return false;
  const setAt = (state as StateAnyAge).scene_set_at;
  if (setAt === undefined) return true;
  if (setAt === null) return false;
  const at = Date.parse(setAt);
  if (Number.isNaN(at)) return false;
  return at >= segmentStartsAt(now, w).getTime() && at < segmentEndsAt(now, w).getTime();
}

/**
 * «Пусть заходит» (D-96) turned the guest on for an hour: the first minute of that hour the wall greets
 * the guest. A guest switched on by hand has no `guest_until` and no greeting.
 */
export function welcomeOn(state: TvState | null, now: Date): boolean {
  if (!state?.guest || !state.guest_until) return false;
  const left = Date.parse(state.guest_until) - now.getTime();
  return left > GUEST_VISIT_MS - WELCOME_MS && left <= GUEST_VISIT_MS + WELCOME_MS;
}
