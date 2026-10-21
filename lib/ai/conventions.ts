import { z } from "zod";

/**
 * Company time conventions (D-15): what «до обеда» or «к вечеру» means for THIS company.
 * Data, not prompt text — the director edits the rows on the settings page. The model only
 * maps the words to a fixed key (a `part` of its TimeRef, lib/ai/timeref.ts); the time of
 * the key is applied by code. Defaults are the table client №1 approved; a new company
 * starts from them and adjusts.
 */

/** The parts of a day or a week the model may name — the keys it puts into TimeRef.part. */
export const TIME_PARTS = [
  "morning",
  "before_lunch",
  "lunch",
  "after_lunch",
  "evening",
  "end_of_day",
  "end_of_week",
  "this_week",
] as const;
export type TimePart = (typeof TIME_PARTS)[number];

/**
 * Every row a company has, in this order: the parts plus the two code-only fallbacks — a day
 * named without a time (`day_default`, D-52) and a weekday named without a time.
 */
export const CONVENTION_KEYS = [...TIME_PARTS, "day_default", "weekday_default"] as const;
export type ConventionKey = (typeof CONVENTION_KEYS)[number];

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export const ConventionSchema = z.object({
  key: z.enum(CONVENTION_KEYS),
  /** As spoken, several forms through « / »: «вечером / к вечеру». The model sees them. */
  phrase: z.string().trim().max(120),
  /** The time of day the key resolves to, Asia/Aqtobe. */
  time: z.string().regex(CLOCK),
  /** `friday` — the nearest Friday («к концу недели»); `same` — the day that was named. */
  day: z.enum(["same", "friday"]),
  /** The deadline confidence when this row fires; below 0.8 the director sees a yellow chip. */
  confidence: z.number().min(0).max(1).default(0.7),
});

export type Convention = z.infer<typeof ConventionSchema>;

export const DEFAULT_CONVENTIONS: Convention[] = [
  { key: "morning", phrase: "утром / с утра", time: "09:00", day: "same", confidence: 0.7 },
  { key: "before_lunch", phrase: "до обеда", time: "13:00", day: "same", confidence: 0.7 },
  { key: "lunch", phrase: "к обеду", time: "12:30", day: "same", confidence: 0.7 },
  { key: "after_lunch", phrase: "после обеда", time: "14:00", day: "same", confidence: 0.6 },
  { key: "evening", phrase: "вечером / к вечеру / до вечера", time: "18:00", day: "same", confidence: 0.7 },
  { key: "end_of_day", phrase: "до конца дня / к концу дня", time: "18:00", day: "same", confidence: 0.7 },
  { key: "end_of_week", phrase: "к концу недели / до конца недели", time: "18:00", day: "friday", confidence: 0.6 },
  { key: "this_week", phrase: "на неделе", time: "18:00", day: "friday", confidence: 0.5 },
  // D-52 open point closed as data: a day without a time is the end of that working day.
  { key: "day_default", phrase: "сегодня / завтра / послезавтра без времени", time: "18:00", day: "same", confidence: 0.5 },
  { key: "weekday_default", phrase: "к пятнице / в понедельник — день недели без времени", time: "09:00", day: "same", confidence: 0.6 },
];

const DEFAULT_BY_KEY = new Map(DEFAULT_CONVENTIONS.map((row) => [row.key, row]));

/** The company's row for a key, or the default one when the company has none. */
export function conventionFor(conventions: readonly Convention[], key: ConventionKey): Convention {
  return conventions.find((row) => row.key === key) ?? DEFAULT_BY_KEY.get(key)!;
}

/** The phrases of the table before D-15 rows had keys (task 026): what each one became. */
const LEGACY_KEYS: Record<string, ConventionKey> = {
  "до обеда": "before_lunch",
  "к обеду": "lunch",
  "вечером / к вечеру / до вечера": "evening",
  "до конца дня / к концу дня": "end_of_day",
  "после обеда": "after_lunch",
  "утром / с утра": "morning",
  "к концу недели / до конца недели": "end_of_week",
  "на неделе": "this_week",
  "к <дню недели> («к пятнице»)": "weekday_default",
  "сегодня / завтра / послезавтра без времени": "day_default",
};

const squash = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/** A `{phrase, meaning, confidence}` row of the old table, if its phrase is one of the defaults. */
function fromLegacy(row: unknown): Convention | null {
  if (typeof row !== "object" || row === null) return null;
  const { phrase, meaning, confidence } = row as { phrase?: unknown; meaning?: unknown; confidence?: unknown };
  if (typeof phrase !== "string") return null;
  const key = LEGACY_KEYS[squash(phrase)];
  if (!key) return null;
  const base = DEFAULT_BY_KEY.get(key)!;
  const clock = typeof meaning === "string" ? /(\d{1,2}):(\d{2})/.exec(meaning) : null;
  const time = clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : base.time;
  return {
    ...base,
    time: CLOCK.test(time) ? time : base.time,
    confidence: typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : base.confidence,
  };
}

/**
 * Whatever company.settings holds → one row per key, in key order. Old `phrase/meaning` rows
 * become key rows by their phrase; a row that is neither is dropped with a server log line —
 * reading settings never fails on it. A key the company lacks takes the default row.
 */
export function normalizeConventions(raw: unknown): Convention[] {
  const byKey = new Map<ConventionKey, Convention>();
  for (const row of Array.isArray(raw) ? raw : []) {
    const parsed = ConventionSchema.safeParse(row);
    const convention = parsed.success ? parsed.data : fromLegacy(row);
    if (!convention) {
      console.warn(`[conventions] dropped an unrecognised row: ${JSON.stringify(row)?.slice(0, 160)}`);
      continue;
    }
    if (!byKey.has(convention.key)) byKey.set(convention.key, convention);
  }
  return CONVENTION_KEYS.map((key) => byKey.get(key) ?? DEFAULT_BY_KEY.get(key)!);
}

/** What a part means in plain words — the model reads it next to the company's phrases. */
const PART_GLOSS: Record<TimePart, string> = {
  morning: "утро",
  before_lunch: "до обеда",
  lunch: "обед",
  after_lunch: "после обеда",
  evening: "вечер",
  end_of_day: "конец рабочего дня",
  end_of_week: "конец недели",
  this_week: "в течение недели",
};

/** The «слова → part» list of the prompt's «Время» section; times stay out — code applies them. */
export function renderConventionPhrases(conventions: readonly Convention[]): string {
  return TIME_PARTS.map((part) => {
    const phrase = conventionFor(conventions, part).phrase.trim();
    return `- ${part} (${PART_GLOSS[part]}): ${phrase || "—"}`;
  }).join("\n");
}
