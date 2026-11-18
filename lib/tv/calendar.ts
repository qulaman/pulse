import { pluralRu } from "@/lib/tasks/status-text";

import { tvTime } from "./clock";
import type { TvCalendar, TvCalendarEvent } from "./queries";

/**
 * Заставка «Календарь» (D-96, D-98) — чистыми функциями: что крупно в «Сегодня», какие дни
 * внизу, как лежит месяц и какое мероприятие горит. Проверяется тестом, а не глазами на
 * телевизоре.
 *
 * Негатива в календаре нет по определению (D-45); гостю названий и мест не отдают уже из
 * БД (D-33) — здесь пустое название становится «Мероприятие».
 */

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Мероприятие без конца считается часовым: иначе «идёт» не погасло бы никогда. */
const DEFAULT_LENGTH_MS = 60 * 60_000;
/** Больше трёх строк в колонке недели под «Сегодня» не помещаются: остальное — «+ ещё N». */
export const PER_DAY = 3;
/** Карточек «Сегодня» — четыре в ряд; прошедшие уступают место будущим. */
export const TODAY_CARDS = 4;
/** В клетке месяца — две строки, дальше «+N». */
export const PER_CELL = 2;
/** Рабочий день на ленте времени «Сегодня»; раздвигается, если мероприятие вне его. */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 20;

export type CalendarState = "past" | "now" | "next" | "later";

export type CalendarRow = {
  id: string;
  time: string;
  /** «10:00–11:30»: конец только когда он задан. */
  span: string;
  title: string;
  /** «Переговорная · 6 чел.» — место и сколько придёт; у «всех» — «все». */
  detail: string;
  state: CalendarState;
};

export type CalendarColumn = {
  key: string;
  /** «Сегодня», «Завтра», «Пт». */
  label: string;
  /** «26 сен». */
  date: string;
  today: boolean;
  weekend: boolean;
  rows: CalendarRow[];
  more: number;
};

const shortDateFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric", month: "short" });
const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "short" });
const longDateFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long", day: "numeric", month: "long" });
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

/** «26 сент.» → «26 сен»: на стене читают с двух метров, три буквы месяца. */
function shortDate(date: Date): string {
  return shortDateFmt.format(date).replace(/(\p{L}{3})\p{L}*\.?$/u, "$1");
}

function weekday(date: Date): string {
  return capital(weekdayFmt.format(date).replace(/\.$/, ""));
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

function detailOf(event: TvCalendarEvent): string {
  return [event.location?.trim() || null, peopleOf(event)].filter(Boolean).join(" · ");
}

function spanOf(event: TvCalendarEvent): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  return end && end.getTime() > start.getTime() ? `${tvTime(start)}–${tvTime(end)}` : tvTime(start);
}

function sorted(calendar: TvCalendar | null | undefined): TvCalendarEvent[] {
  return [...(calendar?.events ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Горит одно: то, что идёт сейчас, иначе — ближайшее впереди. Считается по всему
 * календарю сразу, чтобы «Сегодня», неделя и месяц не спорили между собой.
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
    span: spanOf(event),
    title: titleOf(event),
    detail: detailOf(event),
    state,
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
/* «Сегодня» крупно (D-98)                                                    */
/* -------------------------------------------------------------------------- */

export type TodayCard = CalendarRow & {
  place: string | null;
  people: string | null;
  /** «идёт · до 17:25», «через 45 мин», «прошло» — или пусто у дальних. */
  note: string;
  /** Сколько идущего уже прошло, 0..1; у остальных — null. */
  progress: number | null;
};

export type TrackSegment = { id: string; start: number; end: number; state: CalendarState };

export type TodayTrack = {
  /** Часы по краям ленты и метки на ней. */
  from: number;
  to: number;
  hours: number[];
  segments: TrackSegment[];
  /** Где сейчас на ленте, 0..1; вне окна ленты — null. */
  now: number | null;
};

export type TodayPlan = {
  /** «Среда, 23 сентября». */
  date: string;
  total: number;
  cards: TodayCard[];
  /** Сколько прошедших не поместилось в ряд. */
  earlier: number;
  track: TodayTrack;
  /** Сегодня пусто — что ближайшее впереди: «Пт, 10:00 · Выезд на объект». */
  ahead: string | null;
};

export function todayPlan(calendar: TvCalendar | null | undefined, now: Date): TodayPlan {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);
  const at = now.getTime();
  const todays = events.filter((e) => dayIndex(new Date(e.starts_at)) === today);

  // four cards in a row: the past gives way to what is still ahead
  const past = todays.filter((e) => states.get(e.id) === "past");
  const rest = todays.filter((e) => states.get(e.id) !== "past");
  const keepPast = Math.max(0, TODAY_CARDS - rest.length);
  const shown = [...past.slice(past.length - keepPast), ...rest].slice(0, TODAY_CARDS);

  const cards = shown.map((event): TodayCard => {
    const state = states.get(event.id) ?? "later";
    const start = startOf(event);
    const end = endOf(event);
    const note =
      state === "now"
        ? `идёт · до ${tvTime(new Date(end))}`
        : state === "next"
          ? untilText(start - at)
          : state === "past"
            ? "прошло"
            : "";
    return {
      ...rowOf(event, state),
      place: event.location?.trim() || null,
      people: peopleOf(event),
      note,
      progress: state === "now" ? Math.min(1, Math.max(0, (at - start) / (end - start))) : null,
    };
  });

  // the day's rhythm: the working day, widened to whatever is on it
  const dayStart = today * DAY_MS - AQTOBE_OFFSET_MS;
  const hourOf = (ms: number) => (ms - dayStart) / HOUR_MS;
  const from = Math.max(0, Math.min(DAY_FROM_HOUR, ...todays.map((e) => Math.floor(hourOf(startOf(e))))));
  const to = Math.min(24, Math.max(DAY_TO_HOUR, ...todays.map((e) => Math.ceil(hourOf(endOf(e))))));
  const span = to - from;
  const place = (ms: number) => Math.min(1, Math.max(0, (hourOf(ms) - from) / span));
  const nowHour = hourOf(at);

  const next = events.find((e) => dayIndex(new Date(e.starts_at)) > today) ?? null;
  const ahead =
    todays.length === 0 && next ? `${weekday(new Date(next.starts_at))}, ${tvTime(new Date(next.starts_at))} · ${titleOf(next)}` : null;

  return {
    date: capital(longDateFmt.format(now)),
    total: todays.length,
    cards,
    earlier: todays.length - cards.length,
    track: {
      from,
      to,
      hours: Array.from({ length: span + 1 }, (_, i) => from + i),
      segments: todays.map((e) => ({
        id: e.id,
        start: place(startOf(e)),
        end: place(endOf(e)),
        state: states.get(e.id) ?? "later",
      })),
      now: nowHour >= from && nowHour <= to ? (nowHour - from) / span : null,
    },
    ahead,
  };
}

/** «3 мероприятия сегодня» / «Сегодня свободно». */
export function todaySummary(plan: TodayPlan): string {
  if (plan.total === 0) return "Сегодня свободно";
  return `${plan.total} ${pluralRu(plan.total, ["мероприятие", "мероприятия", "мероприятий"])}`;
}

/* -------------------------------------------------------------------------- */
/* Неделя колонками                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `days` колонок, начиная с `from` суток от сегодня по Актобе: в виде «Неделя» под крупным
 * «Сегодня» это шесть дней с завтрашнего.
 */
export function weekColumns(calendar: TvCalendar | null | undefined, now: Date, days = 7, from = 0): CalendarColumn[] {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);

  const columns: CalendarColumn[] = [];
  for (let offset = from; offset < from + days; offset += 1) {
    const index = today + offset;
    const noon = noonOf(index);
    const dow = weekdayOf(index);
    const all = events.filter((e) => dayIndex(new Date(e.starts_at)) === index);
    const rows = all.slice(0, PER_DAY).map((event) => rowOf(event, states.get(event.id) ?? "later"));
    columns.push({
      key: String(index),
      label: offset === 0 ? "Сегодня" : offset === 1 ? "Завтра" : weekday(noon),
      date: shortDate(noon),
      today: offset === 0,
      weekend: dow === 0 || dow === 6,
      rows,
      more: Math.max(0, all.length - rows.length),
    });
  }
  return columns;
}

/** Подпись недели: «3 мероприятия» или «Свободно». */
export function weekSummary(columns: readonly CalendarColumn[]): string {
  const total = columns.reduce((sum, column) => sum + column.rows.length + column.more, 0);
  if (total === 0) return "Свободно";
  return `${total} ${pluralRu(total, ["мероприятие", "мероприятия", "мероприятий"])}`;
}

/* -------------------------------------------------------------------------- */
/* Месяц сеткой (D-98)                                                        */
/* -------------------------------------------------------------------------- */

export type MonthCell = {
  key: string;
  day: number;
  inMonth: boolean;
  today: boolean;
  past: boolean;
  weekend: boolean;
  rows: CalendarRow[];
  more: number;
};

export type MonthGrid = {
  /** «Сентябрь 2026». */
  title: string;
  weekdays: string[];
  weeks: MonthCell[][];
  /** Мероприятий в самом месяце, без хвостов соседних. */
  total: number;
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

export function monthGrid(calendar: TvCalendar | null | undefined, now: Date): MonthGrid {
  const events = sorted(calendar);
  const states = statesOf(events, now);
  const today = dayIndex(now);
  const { year, month } = partsOf(today);
  const start = monthGridStart(now);
  const lastIndex = indexOfDate(year, month + 1, 0);
  const weeksCount = Math.ceil((lastIndex - start + 1) / 7);

  let total = 0;
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < weeksCount; w += 1) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const index = start + w * 7 + d;
      const parts = partsOf(index);
      const inMonth = parts.month === month;
      const all = events.filter((e) => dayIndex(new Date(e.starts_at)) === index);
      if (inMonth) total += all.length;
      const rows = all.slice(0, PER_CELL).map((event) => rowOf(event, states.get(event.id) ?? "later"));
      week.push({
        key: String(index),
        day: parts.day,
        inMonth,
        today: index === today,
        past: index < today,
        weekend: d >= 5,
        rows,
        more: Math.max(0, all.length - rows.length),
      });
    }
    weeks.push(week);
  }

  return {
    title: `${capital(monthFmt.format(noonOf(today)))} ${year}`,
    weekdays: [...WEEKDAYS],
    weeks,
    total,
  };
}

/** Подпись месяца: «12 мероприятий» или «Свободно». */
export function monthSummary(grid: MonthGrid): string {
  if (grid.total === 0) return "Свободно";
  return `${grid.total} ${pluralRu(grid.total, ["мероприятие", "мероприятия", "мероприятий"])}`;
}
