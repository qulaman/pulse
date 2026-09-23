import { pluralRu } from "@/lib/tasks/status-text";

import { tvTime } from "./clock";
import type { TvCalendar, TvCalendarEvent } from "./queries";

/**
 * Заставка «Календарь» (D-96): неделя семью колонками, начиная с сегодня. Чистая функция:
 * что подписано над колонкой и какое мероприятие горит — проверяется тестом, а не
 * глазами на телевизоре.
 *
 * Негатива в календаре нет по определению (D-45); гостю названий и мест не отдают уже из
 * БД (D-33) — здесь пустое название становится «Мероприятие».
 */

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
/** Мероприятие без конца считается часовым: иначе «идёт» не погасло бы никогда. */
const DEFAULT_LENGTH_MS = 60 * 60_000;
/** Больше четырёх строк в колонке на стене не помещаются: остальное — «+ ещё N». */
export const PER_DAY = 4;

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

function dayIndex(date: Date): number {
  return Math.floor((date.getTime() + AQTOBE_OFFSET_MS) / DAY_MS);
}

/** «26 сент.» → «26 сен»: на стене читают с двух метров, три буквы месяца. */
function shortDate(date: Date): string {
  return shortDateFmt.format(date).replace(/(\p{L}{3})\p{L}*\.?$/u, "$1");
}

function weekday(date: Date): string {
  const word = weekdayFmt.format(date).replace(/\.$/, "");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function endOf(event: TvCalendarEvent): number {
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : Number.NaN;
  return Number.isFinite(end) && end > start ? end : start + DEFAULT_LENGTH_MS;
}

function detailOf(event: TvCalendarEvent): string {
  const people = event.everyone ? "все" : event.people > 0 ? `${event.people} чел.` : "";
  return [event.location?.trim() || null, people || null].filter(Boolean).join(" · ");
}

/**
 * Семь колонок с сегодняшнего дня по Актобе. Горит одно: что идёт сейчас, иначе —
 * ближайшее впереди; прошедшее за сегодня гаснет.
 */
export function weekColumns(calendar: TvCalendar | null | undefined, now: Date, days = 7): CalendarColumn[] {
  const events = [...(calendar?.events ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const today = dayIndex(now);
  const at = now.getTime();

  const running = events.filter((e) => new Date(e.starts_at).getTime() <= at && at < endOf(e));
  const next = running.length === 0 ? events.find((e) => new Date(e.starts_at).getTime() > at) ?? null : null;

  const columns: CalendarColumn[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const index = today + offset;
    const noon = new Date(index * DAY_MS - AQTOBE_OFFSET_MS + 12 * 3_600_000);
    const dow = new Date(index * DAY_MS).getUTCDay(); // day index is midnight-aligned in Aqtobe
    const all = events.filter((e) => dayIndex(new Date(e.starts_at)) === index);
    const rows = all.slice(0, PER_DAY).map((event): CalendarRow => {
      const start = new Date(event.starts_at);
      const end = event.ends_at ? new Date(event.ends_at) : null;
      const state: CalendarState = running.includes(event)
        ? "now"
        : event === next
          ? "next"
          : endOf(event) <= at
            ? "past"
            : "later";
      return {
        id: event.id,
        time: tvTime(start),
        span: end && end.getTime() > start.getTime() ? `${tvTime(start)}–${tvTime(end)}` : tvTime(start),
        title: event.title?.trim() || "Мероприятие",
        detail: detailOf(event),
        state,
      };
    });
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

/** Подпись под заголовком заставки: «3 мероприятия на неделе» или «На неделе свободно». */
export function weekSummary(columns: readonly CalendarColumn[]): string {
  const total = columns.reduce((sum, column) => sum + column.rows.length + column.more, 0);
  if (total === 0) return "На неделе свободно";
  return `${total} ${pluralRu(total, ["мероприятие", "мероприятия", "мероприятий"])} на неделе`;
}
