import { humanAqtobe } from "@/lib/ai/time";
import { addDays, todayYmd, weekdayOf } from "@/lib/datetime/calendar";

/*
 * The quick answers to «когда сдать?» — one set for the phone's sheet and the desk's picker, so a
 * preset cannot mean two things on two screens. Aqtobe wall clock, the offset written out.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A choice closer than this to now is no deadline to give anybody. */
const FLOOR_MS = 30 * 60_000;

/** The instant a wall day and time name, with the offset written out — what the deadline routes take. */
export function wallIso(ymd: string, hm: string): string {
  return `${ymd}T${hm}:00+05:00`;
}

export type DeadlinePreset = { label: string; iso: string | null };

/**
 * The deadline picker's quick choices: today 18:00 while the working day still has an hour left,
 * tomorrow 9:00 and 13:00 (D-51), the week's end (Friday 18:00, or Monday 9:00 from Friday on),
 * a week ahead, and «без срока».
 */
export function deadlinePresets(now: Date = new Date(), { none = true }: { none?: boolean } = {}): DeadlinePreset[] {
  const today = todayYmd(now);
  const presets: DeadlinePreset[] = [];
  const evening = wallIso(today, "18:00");
  if (new Date(evening).getTime() - now.getTime() > HOUR) presets.push({ label: "Сегодня 18:00", iso: evening });
  presets.push({ label: "Завтра 9:00", iso: wallIso(addDays(today, 1), "09:00") });
  presets.push({ label: "Завтра 13:00", iso: wallIso(addDays(today, 1), "13:00") });
  const weekday = weekdayOf(today);
  if (weekday <= 3) presets.push({ label: "В пятницу 18:00", iso: wallIso(addDays(today, 4 - weekday), "18:00") });
  else presets.push({ label: "В понедельник 9:00", iso: wallIso(addDays(today, 7 - weekday), "09:00") });
  presets.push({ label: "Через неделю", iso: wallIso(addDays(today, 7), "18:00") });
  if (none) presets.push({ label: "Без срока", iso: null });
  return presets;
}

/** «+1 день · чт 07:35»: the deadline moved by a step, the wall time kept. */
export type DeadlineShift = { label: string; iso: string; result: string };

const SHIFTS: readonly { label: string; ms: number }[] = [
  { label: "+1 час", ms: HOUR },
  { label: "+1 день", ms: DAY },
  { label: "+неделя", ms: 7 * DAY },
];

/**
 * Moving a deadline that exists: an hour, a day and a week later than it, the minute kept — one
 * tap for «то же, но завтра». A step that still lands in the past (a deadline long behind) is left
 * out; Aqtobe has no daylight saving, so a day is always 24 hours on its wall clock.
 */
export function deadlineShifts(currentIso: string | null, now: Date = new Date()): DeadlineShift[] {
  if (!currentIso) return [];
  const current = new Date(currentIso).getTime();
  if (!Number.isFinite(current)) return [];
  return SHIFTS.flatMap(({ label, ms }) => {
    const at = current + ms;
    if (at - now.getTime() < FLOOR_MS) return [];
    const date = new Date(at);
    return [{ label, iso: toWallIso(date), result: humanAqtobe(date, now) }];
  });
}

/** The phone's grid of presets: four instants ahead of now, «без срока» is said apart. */
export function sheetPresets(now: Date = new Date()): DeadlinePreset[] {
  return deadlinePresets(now, { none: false }).slice(0, 4);
}

/** The same instant, whatever offset each side wrote it with. */
export function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** A deadline the server would take: some time ahead of now. */
export function isAhead(iso: string | null, now: Date = new Date()): boolean {
  return iso !== null && new Date(iso).getTime() > now.getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** An instant as the Aqtobe wall clock writes it, «…T07:35:00+05:00». */
function toWallIso(date: Date): string {
  const wall = new Date(date.getTime() + 5 * HOUR);
  const ymd = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
  return wallIso(ymd, `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`);
}
