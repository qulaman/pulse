import { compareYmd, daysInMonth, isWithin, parseYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";

/**
 * The desk's history read from the server (the closed tasks, the errands): a range of days from
 * the address, the words of a search as `ilike` patterns, and pages folded into one list. Pure —
 * the hooks in lib/tasks/queries.ts and lib/errands/queries.ts do the asking. No imports from
 * lib/tasks: the phone's bundle holds these hooks too.
 */

/** What «Закрытые» holds: done and recalled — a refusal waits in «Ждут вас», whatever its age. */
export const ARCHIVE_STATUSES = ["done", "revoked"] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* A range of days on the Aqtobe wall clock                                    */
/* -------------------------------------------------------------------------- */

/** Both ends inclusive; one end may stay open («с 1 октября»). */
export type DayRange = { from: Ymd | null; to: Ymd | null };

const dayOf = (ymd: Ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const pad = (n: number) => String(n).padStart(2, "0");

function shift(ymd: Ymd, days: number): Ymd {
  const moved = dayOf(ymd);
  moved.setUTCDate(moved.getUTCDate() + days);
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** `?from=&to=` as a range: a broken end is no end, two ends the wrong way round change places. */
export function parseRange(from: string | null | undefined, to: string | null | undefined): DayRange | null {
  const start = parseYmd(from) ? (from as Ymd) : null;
  const end = parseYmd(to) ? (to as Ymd) : null;
  if (!start && !end) return null;
  if (start && end && compareYmd(start, end) > 0) return { from: end, to: start };
  return { from: start, to: end };
}

/** The instants of a range as a query asks them: `>= gte` and `< lt`, the end day whole (+05:00 all year). */
export function rangeBounds(range: DayRange | null): { gte: string | null; lt: string | null } {
  return {
    gte: range?.from ? `${range.from}T00:00:00+05:00` : null,
    lt: range?.to ? `${shift(range.to, 1)}T00:00:00+05:00` : null,
  };
}

/** An instant falls within the range by its Aqtobe day. */
export function inRange(iso: string, range: DayRange | null): boolean {
  if (!range) return true;
  return isWithin(todayYmd(new Date(iso)), range.from, range.to);
}

export type RangePreset = { key: string; label: string; from: Ymd; to: Ymd };

/** The quick choices: the week runs Monday to Sunday, the month its whole length. */
export function rangePresets(now: Date = new Date()): RangePreset[] {
  const today = todayYmd(now);
  const monday = shift(today, -((dayOf(today).getUTCDay() + 6) % 7));
  const [year, month] = today.split("-").map(Number);
  const before = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const whole = ({ year: y, month: m }: { year: number; month: number }) => ({
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`,
  });
  return [
    { key: "this-week", label: "Эта неделя", from: monday, to: shift(monday, 6) },
    { key: "last-week", label: "Прошлая неделя", from: shift(monday, -7), to: shift(monday, -1) },
    { key: "this-month", label: "Этот месяц", ...whole({ year, month }) },
    { key: "last-month", label: "Прошлый месяц", ...whole(before) },
  ];
}

const DAY_WORDS = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** «4 ноября», with the year when it is not this one. */
function dayWords(ymd: Ymd, thisYear: number): string {
  const year = Number(ymd.slice(0, 4));
  return `${DAY_WORDS.format(dayOf(ymd))}${year === thisYear ? "" : ` ${year}`}`;
}

/** The range in words: a quick choice by its name, else its days. */
export function rangeWords(range: DayRange | null, now: Date = new Date()): string {
  if (!range) return "Все даты";
  const { from, to } = range;
  const preset = from && to ? rangePresets(now).find((one) => one.from === from && one.to === to) : undefined;
  return preset ? preset.label : daysWords(range, now);
}

/** «1–15 октября», «28 октября – 3 ноября», «7 октября», «с 1 октября». */
export function daysWords({ from, to }: DayRange, now: Date = new Date()): string {
  const thisYear = Number(todayYmd(now).slice(0, 4));
  if (from && !to) return `с ${dayWords(from, thisYear)}`;
  if (to && !from) return `по ${dayWords(to, thisYear)}`;
  if (from === to) return dayWords(from as Ymd, thisYear);
  const [a, b] = [from as Ymd, to as Ymd];
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))}–${dayWords(b, thisYear)}`;
  return `${dayWords(a, thisYear)} – ${dayWords(b, thisYear)}`;
}

/* -------------------------------------------------------------------------- */
/* The words of a search, as `ilike` asks them                                  */
/* -------------------------------------------------------------------------- */

/** Fewer letters than this ask the whole table for nothing: the screens' own lists answer them. */
export const SEARCH_MIN = 2;

/** A word this long also finds its «ё» and its «е»: the short ones would drown in look-alikes. */
const FOLD_FROM = 4;
/** A word this long also finds its other cases: «смету» finds «Смета». */
const STEM_FROM = 5;

const BACKSLASH = String.fromCharCode(92);

/**
 * The typed text as literal text of a LIKE pattern. `*` is PostgREST's own alias of `%`, with no
 * way to escape it: it becomes «any one letter», which still finds a real asterisk.
 */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, (mark) => `${BACKSLASH}${mark}`).replace(/\*/g, "_");
}

/** «отчет» and «отчёт» are one word to the person typing; `_` is any one letter. */
const anyYo = (text: string) => (text.length >= FOLD_FROM ? text.replace(/[её]/gi, "_") : text);

/** The search's words, lower case; nothing while the text is shorter than the search asks. */
export function searchWords(text: string): string[] {
  const clean = text.trim().toLowerCase();
  if (clean.length < SEARCH_MIN) return [];
  return clean.split(/\s+/).filter(Boolean);
}

/** One word of a title search: anywhere in the title, a Russian word in any of its cases; a number stays whole. */
export function wordPattern(word: string): string {
  const stem = word.length >= STEM_FROM && /[а-яё]$/i.test(word) ? word.slice(0, -1) : word;
  return `%${anyYo(literal(stem))}%`;
}

/** The whole text as one phrase: «без сахара» anywhere. */
export function phrasePattern(text: string): string {
  return `%${anyYo(literal(text.trim().toLowerCase()))}%`;
}

/**
 * `ilike` over several columns, one `or()` filter. The text comes from a person, so the value is
 * always double-quoted: a comma, a bracket or a dot in it is not PostgREST's syntax.
 */
export function ilikeAny(columns: readonly string[], pattern: string): string {
  const quoted = `"${pattern.replace(/[\\"]/g, (mark) => `${BACKSLASH}${mark}`)}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}

/* -------------------------------------------------------------------------- */
/* Pages of one list                                                            */
/* -------------------------------------------------------------------------- */

type Row = { id: string };

/**
 * A fresh first page over the list already held: the pages «Показать ещё» has opened stay, so a
 * refresh after an event costs one request. A held row newer than the page's last and not in it is
 * gone for good; a short page is the whole list.
 */
export function foldFirstPage<T extends Row>(first: readonly T[], held: readonly T[], size: number, order: (row: T) => string): T[] {
  if (first.length < size || held.length === 0) return [...first];
  const edge = order(first[first.length - 1]);
  const seen = new Set(first.map((row) => row.id));
  return [...first, ...held.filter((row) => !seen.has(row.id) && order(row) < edge)];
}

/** The next page after the list held; a row already there (the list moved under the page) stays once. */
export function appendPage<T extends Row>(held: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(held.map((row) => row.id));
  return [...held, ...page.filter((row) => !seen.has(row.id))];
}

/** How many rows `Показать ещё` still promises; null total — not known yet. */
export function rowsLeft(total: number | null | undefined, held: number): number {
  return Math.max(0, (total ?? 0) - held);
}
