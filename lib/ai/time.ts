/**
 * Asia/Aqtobe clock helpers for the prompt, the time resolver (lib/ai/timeref.ts) and the UI.
 * Asia/Aqtobe is a fixed +05:00 all year — no DST, so no date library is needed.
 */

export const AQTOBE_OFFSET = "+05:00";
const OFFSET_MS = 5 * 60 * 60 * 1000;

const WEEKDAYS_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
] as const;

const WEEKDAYS_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock view of an instant in Aqtobe, as a Date whose UTC fields are local fields. */
function toWall(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

function fromWall(wall: Date): Date {
  return new Date(wall.getTime() - OFFSET_MS);
}

/** Days since the epoch on the Aqtobe wall clock — the bucket key of a per-day strip. */
export function aqtobeDay(date: Date): number {
  return Math.floor(toWall(date).getTime() / 86_400_000);
}

export function toAqtobeIso(date: Date): string {
  const w = toWall(date);
  return (
    `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}` +
    `T${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}:${pad(w.getUTCSeconds())}${AQTOBE_OFFSET}`
  );
}

export function aqtobeIsoToUtc(iso: string): string {
  return new Date(iso).toISOString();
}

export function formatAqtobe(date: Date): string {
  const w = toWall(date);
  return (
    `${pad(w.getUTCDate())}.${pad(w.getUTCMonth() + 1)}.${w.getUTCFullYear()} ` +
    `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`
  );
}

/**
 * What a person would say: «сегодня 13:00», «завтра 13:00», «пт 13:00» within the
 * coming week, «14.08 13:00» further out, the year only when it differs from now's.
 */
export function humanAqtobe(date: Date, now: Date = new Date()): string {
  const w = toWall(date);
  const n = toWall(now);
  const time = `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
  const dayOf = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  const diff = dayOf(w) - dayOf(n);
  if (diff === 0) return `сегодня ${time}`;
  if (diff === 1) return `завтра ${time}`;
  if (diff === -1) return `вчера ${time}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS_SHORT_RU[w.getUTCDay()]} ${time}`;
  const day = `${pad(w.getUTCDate())}.${pad(w.getUTCMonth() + 1)}`;
  return w.getUTCFullYear() === n.getUTCFullYear() ? `${day} ${time}` : `${day}.${w.getUTCFullYear()} ${time}`;
}

export function weekdayRu(date: Date): string {
  return WEEKDAYS_RU[toWall(date).getUTCDay()];
}

/** Builds an instant from Aqtobe wall-clock fields, shifting the day by `dayShift`. */
export function atAqtobe(now: Date, dayShift: number, hours: number, minutes: number): Date {
  const w = toWall(now);
  return fromWall(
    new Date(
      Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + dayShift, hours, minutes, 0, 0),
    ),
  );
}

/** The instant of an Aqtobe calendar date and time; null when the date does not exist (31.02). */
export function aqtobeDateAt(year: number, month: number, day: number, hours: number, minutes: number): Date | null {
  const wall = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null;
  return fromWall(wall);
}

/** ISO weekday on the Aqtobe wall clock: 1 — Monday … 7 — Sunday. */
export function aqtobeIsoWeekday(date: Date): number {
  return toWall(date).getUTCDay() || 7;
}
