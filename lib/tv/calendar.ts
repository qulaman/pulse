import { lineWidth } from "./boardText";
import { tvTime } from "./clock";
import type { TvCalendar, TvCalendarEvent } from "./queries";

/**
 * The «Календарь» scene (D-96, D-98, D-185) as pure functions: what goes on the «сегодня» table, which
 * days go in «Дальше», how the month lies and which event is running. Checked by a test, not by eye
 * on the TV.
 *
 * Негатива в календаре нет по определению (D-45); гостю названий и мест не отдают уже из
 * БД (D-33) — здесь пустое название становится «Мероприятие».
 */

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Мероприятие без конца считается часовым: иначе «идёт» не погасло бы никогда. */
const DEFAULT_LENGTH_MS = 60 * 60_000;
/** The «сегодня» table — five lines; nobody reads more from three metres. */
export const TODAY_ROWS = 5;
/** «Дальше» — the next three days that have something, two events each. */
export const LATER_DAYS = 3;
export const PER_LATER_DAY = 2;
/**
 * A month cell holds one event — its time by the day's number, its title in whole lines of the
 * wall's smallest readable size — and «+N» for the rest (D-185): seven columns leave a cell about
 * eight letters a line, a second event would never be read from across the room.
 */
export const PER_CELL = 1;
/** The working day on the «сегодня» scale; it widens when an event falls outside it. */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;

export type CalendarState = "past" | "now" | "next" | "later";

export type CalendarRow = {
  id: string;
  time: string;
  title: string;
  /** The place, if set. */
  place: string | null;
  /** «8 чел.», for «всех» — «все». */
  people: string | null;
  state: CalendarState;
  /** A birthday is a celebration: in gold on the wall. */
  birthday: boolean;
  /** The title came through (not for a guest, and then `title` is «Мероприятие»). */
  named: boolean;
};

const longDateFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long", day: "numeric", month: "long" });
const dayMonthFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric", month: "long" });
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long" });
const monthFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", month: "long" });

/** Номер суток по Актобе — фиксированный +05:00 без летнего времени. */
function dayIndex(date: Date): number {
  return Math.floor((date.getTime() + AQTOBE_OFFSET_MS) / DAY_MS);
}

/** Полдень суток с этим номером — безопасная точка для форматирования даты. */
function noonOf(index: number): Date {
  return new Date(index * DAY_MS - AQTOBE_OFFSET_MS + 12 * HOUR_MS);
}

/** 0 — воскресенье … 6 — суббота, по календарю Актобе. */
function weekdayOf(index: number): number {
  return new Date(index * DAY_MS).getUTCDay();
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «Воскресенье»: within the week ahead the day's name is enough, no date needed. */
function weekday(date: Date): string {
  return capital(weekdayFmt.format(date));
}

function startOf(event: TvCalendarEvent): number {
  return new Date(event.starts_at).getTime();
}

function endOf(event: TvCalendarEvent): number {
  const start = startOf(event);
  const end = event.ends_at ? new Date(event.ends_at).getTime() : Number.NaN;
  return Number.isFinite(end) && end > start ? end : start + DEFAULT_LENGTH_MS;
}

function titleOf(event: TvCalendarEvent): string {
  return event.title?.trim() || "Мероприятие";
}

function peopleOf(event: TvCalendarEvent): string | null {
  if (event.everyone) return "все";
  return event.people > 0 ? `${event.people} чел.` : null;
}

/** «День рождения Асель», «ДР Марата»: a celebration, not a meeting. */
export function isBirthday(title: string | null | undefined): boolean {
  if (!title) return false;
  return /(^|[\s«"(])(день|дня|днём|днем|дню)\s+рождени/iu.test(title) || /^\s*др(\s|$|[.,:!])/iu.test(title);
}

/**
 * A month cell holds about ten letters a line: «День рождения Асель» would lose the name, so a
 * birthday there is «ДР Асель» (in gold, as everywhere on the wall).
 */
export function cellTitle(row: Pick<CalendarRow, "title" | "birthday" | "named">): string {
  // a guest's month: «Мероприятие» in every cell says nothing the time does not
  if (!row.named) return "";
  if (!row.birthday) return row.title;
  const name = row.title.replace(/^\s*(с\s+)?(день|дня|днём|днем|дню)\s+рождения\s*/iu, "").replace(/^\s*др\s*/iu, "").trim();
  return name ? `ДР ${name}` : row.title;
}

/*
 * Soft hyphens for the month's cells. A cell is eight letters wide at the wall's smallest readable size
 * (D-185): «Корпоратив» or «Планёрка» break in any case, and a break at a syllable with a hyphen reads,
 * a break at any letter («Планёрк|а») does not. The browser's own `hyphens: auto` needs a Russian dictionary
 * a television may not have, so the breaks are put in the text: Khristov's rules — after й/ъ/ь, between
 * vowels, between consonants — and never one letter alone at either end of a word.
 */
const VOWEL = "[аеёиоуыэюя]";
const CONSONANT = "[бвгджзклмнпрстфхцчшщ]";
const LETTER = "[а-яё]";
const SIGN = "[йъь]";
const SYLLABLE_BREAKS = [
  `(${SIGN})(?=${LETTER}${LETTER})`,
  `(${VOWEL})(?=${VOWEL}${LETTER})`,
  `(${VOWEL}${CONSONANT})(?=${CONSONANT}${VOWEL})`,
  `(${CONSONANT}${VOWEL})(?=${CONSONANT}${VOWEL})`,
  `(${VOWEL}${CONSONANT})(?=${CONSONANT}${CONSONANT}${VOWEL})`,
  `(${VOWEL}${CONSONANT}${CONSONANT})(?=${CONSONANT}${CONSONANT}${VOWEL})`,
].map((rule) => new RegExp(rule, "giu"));
const SHY = "­";

/** «Корпоратив» → «Кор·по·ра·тив» with soft hyphens: the browser breaks a long word there, with a hyphen. */
export function softHyphens(text: string): string {
  return text.replace(/[а-яё]{4,}/giu, (word) => {
    let marked = word;
    for (const rule of SYLLABLE_BREAKS) marked = marked.replace(rule, `$1${SHY}`);
    const parts = marked.split(SHY);
    // two letters at least on each side of a break
    while (parts.length > 1 && parts[0].length < 2) parts.splice(0, 2, parts[0] + parts[1]);
    while (parts.length > 1 && parts[parts.length - 1].length < 2) parts.splice(-2, 2, parts[parts.length - 2] + parts[parts.length - 1]);
    return parts.join(SHY);
  });
}

function sorted(calendar: TvCalendar | null | undefined): TvCalendarEvent[] {
  return [...(calendar?.events ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * One event is lit: the one running now, otherwise the nearest ahead. Worked out over the whole
 * calendar at once, so the table, «Дальше» and the month do not disagree.
 */
function statesOf(events: readonly TvCalendarEvent[], now: Date): Map<string, CalendarState> {
  const at = now.getTime();
  const running = events.filter((e) => startOf(e) <= at && at < endOf(e));
  const next = running.length === 0 ? (events.find((e) => startOf(e) > at) ?? null) : null;
  const states = new Map<string, CalendarState>();
  for (const event of events) {
    states.set(
      event.id,
      running.includes(event) ? "now" : event === next ? "next" : endOf(event) <= at ? "past" : "later",
    );
  }
  return states;
}

function rowOf(event: TvCalendarEvent, state: CalendarState): CalendarRow {
  return {
    id: event.id,
    time: tvTime(new Date(event.starts_at)),
    title: titleOf(event),
    place: event.location?.trim() || null,
    people: peopleOf(event),
    state,
    birthday: isBirthday(event.title),
    named: Boolean(event.title?.trim()),
  };
}

/** «через 5 мин», «через 1 ч 20 мин». */
function untilText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `через ${hours} ч ${rest} мин` : `через ${hours} ч`;
}

/* -------------------------------------------------------------------------- */
/* «Сегодня» table (D-98, D-185)                                              */
/* -------------------------------------------------------------------------- */

export type TodayRow = CalendarRow & {
  /** «идёт · до 17:25» for the running one, «через 45 мин» for the nearest, empty for the rest. */
  note: string;
};

export type TrackSegment = { id: string; start: number; end: number; state: CalendarState };

export type TodayTrack = {
  /** The hours at the ends of the scale. */
  from: number;
  to: number;
  /** Labelled hours: every two hours. */
  labels: number[];
  segments: TrackSegment[];
  /** Where now is on the scale, 0..1; outside it, null. */
  now: number | null;
};

export type TodayPlan = {
  /** «Пятница, 20 ноября». */
  date: string;
  total: number;
  rows: TodayRow[];
  track: TodayTrack;
};

/**
 * The day's table: the running, the nearest and the later ones — up to five lines; of the past ones only the last
 * stays while something is still ahead (it is dimmed and shows that the day is under way), and once the day is over —
 * the past ones, the last five.
 */
export function todayPlan(calendar: TvCalendar | null | undefined, now: Date): TodayPlan {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);
  const at = now.getTime();
  const todays = events.filter((e) => dayIndex(new Date(e.starts_at)) === today);

  const past = todays.filter((e) => states.get(e.id) === "past");
  const ahead = todays.filter((e) => states.get(e.id) !== "past");
  const keepPast = ahead.length === 0 ? TODAY_ROWS : ahead.length < TODAY_ROWS ? 1 : 0;
  const shown = [...past.slice(Math.max(0, past.length - keepPast)), ...ahead].slice(0, TODAY_ROWS);

  const rows = shown.map((event): TodayRow => {
    const state = states.get(event.id) ?? "later";
    const note = state === "now" ? `идёт · до ${tvTime(new Date(endOf(event)))}` : state === "next" ? untilText(startOf(event) - at) : "";
    return { ...rowOf(event, state), note };
  });

  // the day's rhythm: the working day, widened to whatever is on it
  const dayStart = today * DAY_MS - AQTOBE_OFFSET_MS;
  const hourOf = (ms: number) => (ms - dayStart) / HOUR_MS;
  const from = Math.max(0, Math.min(DAY_FROM_HOUR, ...todays.map((e) => Math.floor(hourOf(startOf(e))))));
  const to = Math.min(24, Math.max(DAY_TO_HOUR, ...todays.map((e) => Math.ceil(hourOf(endOf(e))))));
  const span = to - from;
  const place = (ms: number) => Math.min(1, Math.max(0, (hourOf(ms) - from) / span));
  const nowHour = hourOf(at);

  return {
    date: capital(longDateFmt.format(now)),
    total: todays.length,
    rows,
    track: {
      from,
      to,
      labels: Array.from({ length: span + 1 }, (_, i) => from + i).filter((hour) => (hour - from) % 2 === 0),
      segments: todays.map((e) => ({
        id: e.id,
        start: place(startOf(e)),
        end: place(endOf(e)),
        state: states.get(e.id) ?? "later",
      })),
      now: nowHour >= from && nowHour <= to ? (nowHour - from) / span : null,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* «Дальше»: the next days that have something                                */
/* -------------------------------------------------------------------------- */

export type LaterDay = {
  key: string;
  /** «Завтра», «Понедельник». */
  label: string;
  /** «23 ноября». */
  date: string;
  rows: CalendarRow[];
  more: number;
};

/** The time of the day's table at `tv-body`, semibold, tabular («18:30»), and the air after it — vh. */
export const TIME_COLUMN = 17;

/**
 * The first column of the scene, vh: the day's times and the names of the days ahead stand in it,
 * so a later day's meetings start on the same line as the titles above (D-185). As wide as the time,
 * or as the widest day name at `tv-small` («Понедельник», «Воскресенье») when one is on the wall.
 */
export function firstColumn(days: readonly Pick<LaterDay, "label">[], size = 4.4): number {
  return Math.max(TIME_COLUMN, ...days.map((day) => Math.ceil(lineWidth(day.label, size, "point") + 1)));
}

/** Days after today that have events: «Дальше» has no empty days. */
export function laterDays(calendar: TvCalendar | null | undefined, now: Date, days = LATER_DAYS, perDay = PER_LATER_DAY): LaterDay[] {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);
  const byDay = new Map<number, TvCalendarEvent[]>();
  for (const event of events) {
    const index = dayIndex(new Date(event.starts_at));
    if (index <= today) continue;
    byDay.set(index, [...(byDay.get(index) ?? []), event]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, days)
    .map(([index, all]) => {
      const noon = noonOf(index);
      const rows = all.slice(0, perDay).map((event) => rowOf(event, states.get(event.id) ?? "later"));
      return {
        key: String(index),
        label: index === today + 1 ? "Завтра" : weekday(noon),
        date: dayMonthFmt.format(noon),
        rows,
        more: all.length - rows.length,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* The month as a grid (D-98, D-185)                                          */
/* -------------------------------------------------------------------------- */

export type MonthCell = {
  key: string;
  day: number;
  /** Another month's day in the edge weeks: the cell is empty. */
  inMonth: boolean;
  today: boolean;
  past: boolean;
  weekend: boolean;
  rows: CalendarRow[];
  more: number;
};

export type MonthWeek = {
  key: string;
  /** All of the month's days in this week are past: the row folds down to the dates. */
  past: boolean;
  days: MonthCell[];
};

export type MonthGrid = {
  /** «Ноябрь». */
  month: string;
  year: number;
  weekdays: string[];
  weeks: MonthWeek[];
};

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
/** Сетка месяца всегда запрашивается на шесть недель: больше их не бывает. */
export const MONTH_DAYS = 42;

function partsOf(index: number): { year: number; month: number; day: number } {
  const date = new Date(index * DAY_MS); // midnight-aligned in Aqtobe: read in UTC
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

function indexOfDate(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / DAY_MS);
}

/** Понедельник недели, в которую попало первое число текущего месяца, — номер суток. */
export function monthGridStart(now: Date): number {
  const { year, month } = partsOf(dayIndex(now));
  const first = indexOfDate(year, month, 1);
  return first - ((weekdayOf(first) + 6) % 7);
}

/** Тот же понедельник строкой `YYYY-MM-DD` — для `tv_calendar(p_from)`. */
export function monthGridFrom(now: Date): string {
  const { year, month, day } = partsOf(monthGridStart(now));
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A month cell's text width on a 16:9 wall, vh: a seventh of the grid minus the cell's padding, less a hyphen's slack. */
const CELL_TEXT = 19.4;

/**
 * How many lines of `tv-small` the busiest cell of a week wants: the date and the time, the first event's title,
 * «+N» for the rest (at least two: a week with nothing still keeps a line under its dates). The weeks ahead share
 * the month's height in these proportions.
 */
export function weekLines(week: MonthWeek): number {
  let most = 2;
  for (const cell of week.days) {
    const first = cell.rows[0];
    if (!cell.inMonth || !first) continue;
    const title = cellTitle(first);
    const lines = title ? Math.min(3, Math.ceil(lineWidth(title, 4.4, "leaf") / CELL_TEXT)) : 0;
    most = Math.max(most, 1 + lines + (cell.rows.length + cell.more > 1 ? 1 : 0));
  }
  return most;
}

/**
 * The month grid's rows, vh, on the wall's scene box (100 vh less the band, the margins and the head — D-185): the
 * weekdays' line, a folded line per past week, the weeks ahead sharing the rest. Each week ahead gets the lines its
 * busiest cell wants when they all fit, and the rest of the room in the same proportions; when they do not, the
 * proportions alone.
 */
const MONTH_HEIGHT = 72.7;
const SMALL_LH = 5.28;
const MONTH_GAP = 0.4;
/** The cell's padding (0.4 vh top and bottom) and a hair for rounding: a title's lines are counted whole. */
const CELL_PAD = 1;

export function monthRows(grid: Pick<MonthGrid, "weeks">): string {
  const past = grid.weeks.filter((week) => week.past).length;
  const room = MONTH_HEIGHT - SMALL_LH - past * 4.4 - grid.weeks.length * MONTH_GAP;
  const want = grid.weeks.map((week) => (week.past ? 0 : weekLines(week)));
  const need = want.map((lines) => Math.round((lines * SMALL_LH + CELL_PAD) * 10) / 10);
  const fits = need.reduce((sum, value) => sum + value, 0) <= room;
  const tracks = grid.weeks.map((week, i) => (week.past ? "auto" : `minmax(${fits ? `${need[i]}vh` : "0"}, ${want[i]}fr)`));
  return ["auto", ...tracks].join(" ");
}

/** This month's weeks from Monday; days of the neighbouring months are empty cells with no events. */
export function monthGrid(calendar: TvCalendar | null | undefined, now: Date): MonthGrid {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);
  const { year, month } = partsOf(today);
  const start = monthGridStart(now);
  const lastIndex = indexOfDate(year, month + 1, 0);
  const weeksCount = Math.ceil((lastIndex - start + 1) / 7);

  const weeks: MonthWeek[] = [];
  for (let w = 0; w < weeksCount; w += 1) {
    const days: MonthCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const index = start + w * 7 + d;
      const parts = partsOf(index);
      const inMonth = parts.month === month;
      const day = inMonth ? events.filter((e) => dayIndex(new Date(e.starts_at)) === index) : [];
      // today's cell leads with what is still ahead: the morning's meeting gives way, into «+N»
      const all = index === today ? [...day.filter((e) => states.get(e.id) !== "past"), ...day.filter((e) => states.get(e.id) === "past")] : day;
      const rows = all.slice(0, PER_CELL).map((event) => rowOf(event, states.get(event.id) ?? "later"));
      days.push({
        key: String(index),
        day: parts.day,
        inMonth,
        today: index === today,
        past: index < today,
        weekend: d >= 5,
        rows,
        more: all.length - rows.length,
      });
    }
    weeks.push({ key: String(start + w * 7), past: days.every((cell) => !cell.inMonth || cell.past), days });
  }

  return { month: capital(monthFmt.format(noonOf(today))), year, weekdays: [...WEEKDAYS], weeks };
}
