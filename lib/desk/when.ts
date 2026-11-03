/**
 * When, on the desk (D-154): the director types a deadline the way he says it — «завтра 15»,
 * «пт», «12.11 10:00», «через 3 дня» — or picks one of a few presets, and the order carries it as
 * the parser's own ISO with the explicit +05:00 (docs/AI.md §2). Aqtobe is +05:00 all year, so the
 * wall clock is plain arithmetic. Pure: the confirm editor renders, this one reads and writes time.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** A day said without an hour is due by the end of the working day. */
export const DEFAULT_TIME = { h: 18, min: 0 };

const pad = (n: number) => String(n).padStart(2, "0");

/** The Aqtobe wall clock of an instant; `weekday` is ISO, 1 (пн) … 7 (вс). */
export type Wall = { y: number; m: number; d: number; h: number; min: number; weekday: number };

export function wallOf(date: Date): Wall {
  const w = new Date(date.getTime() + OFFSET_MS);
  return {
    y: w.getUTCFullYear(),
    m: w.getUTCMonth() + 1,
    d: w.getUTCDate(),
    h: w.getUTCHours(),
    min: w.getUTCMinutes(),
    weekday: ((w.getUTCDay() + 6) % 7) + 1,
  };
}

/** Wall-clock fields (any overflow normalised) as the parser's ISO: «2026-11-07T18:00:00+05:00». */
export function isoAt(y: number, m: number, d: number, h: number, min: number): string {
  const at = new Date(Date.UTC(y, m - 1, d, h, min, 0, 0));
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:00+05:00`;
}

/** `days` after today in Aqtobe, at the given wall time. */
function dayAt(now: Date, days: number, h: number, min: number): string {
  const w = wallOf(now);
  return isoAt(w.y, w.m, w.d + days, h, min);
}

/** Days from today to the next given weekday: 0 — today. */
function daysTo(now: Date, weekday: number): number {
  return (weekday - wallOf(now).weekday + 7) % 7;
}

const WEEKDAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** The value of a `datetime-local` field for an ISO: «2026-11-07T18:00» on the Aqtobe clock. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const w = wallOf(date);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.min)}`;
}

/** A `datetime-local` value back to the parser's ISO; null — the field is empty or broken. */
export function fromLocalInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return isoAt(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]));
}

/**
 * A deadline in words, as the desk writes time (DESIGN §5 — always concrete): «сегодня 18:00»,
 * «завтра 10:00», «пт 07.11 18:00», another year — «07.11.2027 18:00».
 */
export function formatWhen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const w = wallOf(date);
  const today = wallOf(now);
  const time = `${pad(w.h)}:${pad(w.min)}`;
  const dayIndex = (x: Wall) => Date.UTC(x.y, x.m - 1, x.d) / DAY_MS;
  const shift = dayIndex(w) - dayIndex(today);
  if (shift === 0) return `сегодня ${time}`;
  if (shift === 1) return `завтра ${time}`;
  if (shift === -1) return `вчера ${time}`;
  if (w.y !== today.y) return `${pad(w.d)}.${pad(w.m)}.${w.y} ${time}`;
  return `${WEEKDAY_SHORT[w.weekday]} ${pad(w.d)}.${pad(w.m)} ${time}`;
}

export type WhenPreset = { key: string; label: string; iso: string | null };

/**
 * The few deadlines a director gives most (D-154): today by the evening while there is still a
 * working day, tomorrow, Friday (Monday when Friday is tomorrow), a week from today, no deadline.
 */
export function whenPresets(now: Date, { allowNone = true }: { allowNone?: boolean } = {}): WhenPreset[] {
  const { h, min } = DEFAULT_TIME;
  const presets: WhenPreset[] = [];
  if (wallOf(now).h < h - 1) presets.push({ key: "today", label: "Сегодня", iso: dayAt(now, 0, h, min) });
  presets.push({ key: "tomorrow", label: "Завтра", iso: dayAt(now, 1, h, min) });
  let friday = daysTo(now, 5);
  if (friday === 0) friday = 7;
  if (friday === 1) {
    let monday = daysTo(now, 1);
    if (monday <= 1) monday += 7;
    presets.push({ key: "monday", label: "Понедельник", iso: dayAt(now, monday, h, min) });
  } else {
    presets.push({ key: "friday", label: "Пятница", iso: dayAt(now, friday, h, min) });
  }
  presets.push({ key: "week", label: "Через неделю", iso: dayAt(now, 7, h, min) });
  if (allowNone) presets.push({ key: "none", label: "Без срока", iso: null });
  return presets;
}

const WEEKDAYS: [RegExp, number][] = [
  [/^(пн|пон|понедельник\p{L}*)$/u, 1],
  [/^(вт|вто|вторник\p{L}*)$/u, 2],
  [/^(ср|сре|сред\p{L}*)$/u, 3],
  [/^(чт|чет|четверг\p{L}*)$/u, 4],
  [/^(пт|пят|пятниц\p{L}*)$/u, 5],
  [/^(сб|суб|суббот\p{L}*)$/u, 6],
  [/^(вс|вос|воскресень\p{L}*)$/u, 7],
];

/** Parts of the day that name an hour. */
const DAYPARTS: [RegExp, number][] = [
  [/^утр\p{L}*$/u, 10],
  [/^(днем|обед\p{L}*)$/u, 13],
  [/^вечер\p{L}*$/u, 18],
];

/** Words that carry nothing: «до пятницы», «к 15», «в 10 часов». */
const FILLER = /^(в|во|до|к|ко|на|часов|часа|час|ч|числа|г|года)$/u;

/**
 * What the director typed as a deadline: an ISO, null — «без срока», undefined — not understood.
 * A day without an hour is due at 18:00; an hour without a day is today, or tomorrow once it has
 * passed; a weekday is the next one (today, while its hour is still ahead).
 */
export function parseWhen(text: string, now: Date = new Date()): string | null | undefined {
  const source = text.toLowerCase().replace(/ё/g, "е").trim();
  if (!source) return undefined;
  if (/^(без срока|без|нет|никогда|-|—)$/u.test(source)) return null;

  const today = wallOf(now);
  let day: { y: number; m: number; d: number } | null = null;
  let weekday: number | null = null;
  let time: { h: number; min: number } | null = null;
  let bare: number | null = null;

  const words = source.split(/[\s,]+/u).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (FILLER.test(word)) continue;
    let match: RegExpExecArray | null;
    if (/^(сегодня|сег)$/u.test(word)) {
      day = { y: today.y, m: today.m, d: today.d };
    } else if (/^(завтра|завт|зав)$/u.test(word)) {
      day = { y: today.y, m: today.m, d: today.d + 1 };
    } else if (/^послезавтра$/u.test(word)) {
      day = { y: today.y, m: today.m, d: today.d + 2 };
    } else if (word === "через") {
      // «через 3 дня», «через неделю», «через 2 недели»
      const next = words[i + 1] ?? "";
      const count = /^\d+$/.test(next) ? Number(next) : 1;
      const unit = /^\d+$/.test(next) ? (words[i + 2] ?? "") : next;
      if (/^(дн|день|дня|дней)/u.test(unit)) day = { y: today.y, m: today.m, d: today.d + count };
      else if (/^недел/u.test(unit)) day = { y: today.y, m: today.m, d: today.d + count * 7 };
      else return undefined;
      i += /^\d+$/.test(next) ? 2 : 1;
    } else if ((match = /^(\d{1,2}):(\d{2})$/.exec(word))) {
      time = { h: Number(match[1]), min: Number(match[2]) };
    } else if ((match = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(word))) {
      const year = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : today.y;
      day = { y: year, m: Number(match[2]), d: Number(match[1]) };
      if (day.m < 1 || day.m > 12 || day.d < 1 || day.d > 31) return undefined;
      // a date already behind us without a year is next year's
      if (!match[3] && Date.UTC(year, day.m - 1, day.d) < Date.UTC(today.y, today.m - 1, today.d)) day.y += 1;
    } else if (/^\d{1,2}$/.test(word)) {
      bare = Number(word);
    } else if (WEEKDAYS.some(([re]) => re.test(word))) {
      weekday = WEEKDAYS.find(([re]) => re.test(word))?.[1] ?? null;
    } else if (DAYPARTS.some(([re]) => re.test(word))) {
      const hour = DAYPARTS.find(([re]) => re.test(word))?.[1] ?? DEFAULT_TIME.h;
      time = { h: hour, min: 0 };
    } else {
      return undefined;
    }
  }

  if (bare !== null) {
    if (time) return undefined;
    time = { h: bare, min: 0 };
  }
  if (time && (time.h > 23 || time.min > 59)) return undefined;
  if (!day && weekday === null && !time) return undefined;

  const at = time ?? DEFAULT_TIME;
  if (weekday !== null) {
    let shift = daysTo(now, weekday);
    if (shift === 0 && (at.h < today.h || (at.h === today.h && at.min <= today.min))) shift = 7;
    return dayAt(now, shift, at.h, at.min);
  }
  if (day) return isoAt(day.y, day.m, day.d, at.h, at.min);
  // an hour alone: today while it is ahead, else tomorrow
  const passed = at.h < today.h || (at.h === today.h && at.min <= today.min);
  return dayAt(now, passed ? 1 : 0, at.h, at.min);
}
