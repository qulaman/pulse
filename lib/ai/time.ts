/**
 * Company time conventions (D-15, docs/AI.md §2 rule 3), resolved deterministically.
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

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock view of an instant in Aqtobe, as a Date whose UTC fields are local fields. */
function toWall(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

function fromWall(wall: Date): Date {
  return new Date(wall.getTime() - OFFSET_MS);
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

export function weekdayRu(date: Date): string {
  return WEEKDAYS_RU[toWall(date).getUTCDay()];
}

/** Builds an instant from Aqtobe wall-clock fields, shifting the day by `dayShift`. */
function atAqtobe(now: Date, dayShift: number, hours: number, minutes: number): Date {
  const w = toWall(now);
  return fromWall(
    new Date(
      Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + dayShift, hours, minutes, 0, 0),
    ),
  );
}

type TimeOfDay = { hours: number; minutes: number; confidence: number };

// Longest patterns first: "к концу недели" must win over "к <дню недели>".
const TIME_OF_DAY: { pattern: RegExp; value: TimeOfDay }[] = [
  { pattern: /до\s+обеда/, value: { hours: 13, minutes: 0, confidence: 0.7 } },
  { pattern: /к\s+обеду/, value: { hours: 12, minutes: 30, confidence: 0.7 } },
  { pattern: /(?:к\s+вечеру|вечером)/, value: { hours: 18, minutes: 0, confidence: 0.7 } },
  { pattern: /(?:к\s+утру|утром)/, value: { hours: 9, minutes: 0, confidence: 0.7 } },
];

const DAY_SHIFTS: { pattern: RegExp; shift: number }[] = [
  { pattern: /послезавтра/, shift: 2 },
  { pattern: /завтра/, shift: 1 },
  { pattern: /сегодня/, shift: 0 },
];

// Dative forms as spoken: "к понедельнику", "к среде", "к пятнице".
const WEEKDAY_DATIVE: { pattern: RegExp; weekday: number }[] = [
  { pattern: /к\s+понедельнику/, weekday: 1 },
  { pattern: /к\s+вторнику/, weekday: 2 },
  { pattern: /к\s+среде/, weekday: 3 },
  { pattern: /к\s+четвергу/, weekday: 4 },
  { pattern: /к\s+пятнице/, weekday: 5 },
  { pattern: /к\s+субботе/, weekday: 6 },
  { pattern: /к\s+воскресенью/, weekday: 0 },
];

const END_OF_WEEK: { pattern: RegExp; confidence: number }[] = [
  { pattern: /к\s+концу\s+недели/, confidence: 0.6 },
  { pattern: /на\s+неделе/, confidence: 0.5 },
];

export interface ResolvedConvention {
  deadline_iso: string;
  confidence: number;
  source_text: string;
}

/** Lowercasing and ё→е preserve length, so match offsets still index the original text. */
function fold(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

function span(text: string, ...matches: RegExpMatchArray[]): string {
  const present = matches.filter((m) => m.index !== undefined);
  const start = Math.min(...present.map((m) => m.index!));
  const end = Math.max(...present.map((m) => m.index! + m[0].length));
  return text.slice(start, end);
}

/** Strictly after today: "к четвергу" said on Thursday means the next one. */
function daysUntilWeekday(now: Date, weekday: number): number {
  const today = toWall(now).getUTCDay();
  return ((weekday - today + 6) % 7) + 1;
}

/**
 * Returns null when nothing from the conventions table is said — the parser never
 * invents a deadline (rule 3). Explicit clock times are the model's job, not ours.
 */
export function resolveConvention(text: string, now: Date): ResolvedConvention | null {
  const folded = fold(text);

  for (const { pattern, confidence } of END_OF_WEEK) {
    const match = folded.match(pattern);
    if (match) {
      const shift = daysUntilFriday(now);
      return {
        deadline_iso: toAqtobeIso(atAqtobe(now, shift, 18, 0)),
        confidence,
        source_text: span(text, match),
      };
    }
  }

  for (const { pattern, weekday } of WEEKDAY_DATIVE) {
    const match = folded.match(pattern);
    if (match) {
      return {
        deadline_iso: toAqtobeIso(atAqtobe(now, daysUntilWeekday(now, weekday), 9, 0)),
        confidence: 0.6,
        source_text: span(text, match),
      };
    }
  }

  for (const { pattern, value } of TIME_OF_DAY) {
    const match = folded.match(pattern);
    if (!match) continue;

    const day = DAY_SHIFTS.map((d) => ({ ...d, match: folded.match(d.pattern) })).find(
      (d) => d.match,
    );
    let shift = day?.shift ?? 0;
    // No explicit day and the hour has already passed today → the nearest such hour.
    if (!day && atAqtobe(now, 0, value.hours, value.minutes).getTime() <= now.getTime()) shift = 1;

    return {
      deadline_iso: toAqtobeIso(atAqtobe(now, shift, value.hours, value.minutes)),
      confidence: value.confidence,
      source_text: day?.match ? span(text, day.match, match) : span(text, match),
    };
  }

  return null;
}

/** Nearest Friday: today if it has not passed 18:00 yet, otherwise the next one. */
function daysUntilFriday(now: Date): number {
  const today = toWall(now).getUTCDay();
  if (today === 5 && atAqtobe(now, 0, 18, 0).getTime() > now.getTime()) return 0;
  return daysUntilWeekday(now, 5);
}
