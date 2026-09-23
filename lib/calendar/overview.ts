import { humanAqtobe } from "@/lib/ai/time";
import { daysBetween, humanYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { pluralRu } from "@/lib/tasks/status-text";
import type { Tone } from "@/lib/tasks/tone";

import { hhmm, isOver, myStatus, SOON_MS, ymdOfEvent } from "./agenda";
import type { CalendarEvent } from "./queries";

/**
 * How /calendar reads at a glance (D-100) — the same shape as the status screen of «Задачи»
 * (D-83): one number and a sentence about the moment, loudest first; a strip under them;
 * «ближайшее» as the foot. Pure functions: the same rows and the same clock always give
 * the same screen.
 */

const MINUTE = 60_000;
/** A meeting with no end still takes room on the day strip — an hour, the usual length. */
const DEFAULT_LENGTH_MS = 60 * MINUTE;
/** «Через 40 мин» is still news; further out the clock time says it better. */
const RELATIVE_MS = 60 * MINUTE;

const at = (iso: string) => new Date(iso).getTime();

/** Where a meeting ends on the strip: its own end, or an hour after it began. */
export function endOf(event: { starts_at: string; ends_at?: string | null }): number {
  return event.ends_at ? at(event.ends_at) : at(event.starts_at) + DEFAULT_LENGTH_MS;
}

/** Began and not over yet. */
export function isRunning(event: { starts_at: string; ends_at?: string | null }, now: Date): boolean {
  return at(event.starts_at) <= now.getTime() && !isOver(event, now);
}

/**
 * When, the way a person says it about something ahead: «идёт», «через 25 мин» within the
 * hour, then the clock — «сегодня 15:00», «завтра 10:00», «пт 10:00».
 */
export function whenAhead(event: { starts_at: string; ends_at?: string | null }, now: Date): string {
  if (isRunning(event, now)) return event.ends_at ? `идёт · до ${hhmm(event.ends_at)}` : "идёт";
  const left = at(event.starts_at) - now.getTime();
  if (left > 0 && left < RELATIVE_MS) return `через ${Math.max(1, Math.round(left / MINUTE))} мин`;
  return humanAqtobe(new Date(event.starts_at), now);
}

/** Loud when it is on or about to be; the accent otherwise; quiet once it is over. */
export function toneAhead(event: { starts_at: string; ends_at?: string | null }, now: Date): Tone {
  if (isOver(event, now)) return "muted";
  if (isRunning(event, now)) return "accent";
  return at(event.starts_at) - now.getTime() <= SOON_MS ? "warn" : "accent";
}

/** The invitations this person still owes an answer to — never their own meetings. */
export function awaitingAnswer(events: readonly CalendarEvent[], meId: string, now: Date): CalendarEvent[] {
  return events.filter(
    (event) => event.author_id !== meId && myStatus(event, meId) === "invited" && !isOver(event, now),
  );
}

export type DayBlock = { id: string; left: number; width: number; state: "past" | "now" | "ahead" };

export type DayStrip = {
  /** Hours on the wall clock the strip spans — the working day, widened to fit the meetings. */
  from: number;
  to: number;
  blocks: DayBlock[];
  /** Where the clock stands, 0–100; null outside the strip. */
  now: number | null;
  ticks: number[];
};

const wallHours = (ms: number) => {
  const wall = new Date(ms + 5 * 60 * MINUTE);
  return wall.getUTCHours() + wall.getUTCMinutes() / 60;
};

/**
 * Today as a strip, 08:00–20:00 unless a meeting lies outside: every meeting a block where
 * the clock puts it (a sliver at least, so a short one is still seen), and the hand of now.
 */
export function dayStrip(events: readonly CalendarEvent[], now: Date): DayStrip {
  const today = todayYmd(now);
  const todays = events.filter((event) => ymdOfEvent(event) === today);
  let from = 8;
  let to = 20;
  for (const event of todays) {
    from = Math.min(from, Math.floor(wallHours(at(event.starts_at))));
    // an end past midnight (or exactly on it) still closes today's strip at 24
    const end = wallHours(endOf(event));
    to = Math.max(to, end < wallHours(at(event.starts_at)) ? 24 : Math.min(24, Math.ceil(end)));
  }
  const span = to - from;
  const pct = (hours: number) => Math.min(100, Math.max(0, ((hours - from) / span) * 100));

  const blocks = todays.map((event) => {
    const start = wallHours(at(event.starts_at));
    const endRaw = wallHours(endOf(event));
    const end = endRaw < start ? 24 : endRaw;
    const left = pct(start);
    return {
      id: event.id,
      left,
      width: Math.max(2.5, pct(end) - left),
      state: isOver(event, now) ? ("past" as const) : isRunning(event, now) ? ("now" as const) : ("ahead" as const),
    };
  });

  const hour = wallHours(now.getTime());
  const step = span > 12 ? 6 : 4;
  const ticks: number[] = [];
  for (let tick = Math.ceil(from / step) * step; tick <= to; tick += step) ticks.push(tick);

  return { from, to, blocks, now: hour >= from && hour <= to ? pct(hour) : null, ticks };
}

export type CalendarScreen = {
  tone: Tone;
  eyebrow: string;
  /** The big number; null — a mark instead of a number (a free day). */
  value: number | null;
  label: string;
  detail: string;
  /** Top right: the week ahead in one number. */
  week: number;
  strip: DayStrip;
  legend: { key: string; label: string; count: number; tone: Tone }[];
  nearest: { id: string; title: string; when: string; tone: Tone } | null;
};

const place = (event: CalendarEvent) => (event.location ? ` · ${event.location}` : "");

/**
 * The status screen of the calendar, loudest first: a meeting on or about to start → the
 * invitations that wait for this person's answer → what today still holds → a free day
 * and what comes next.
 */
export function calendarScreen(events: readonly CalendarEvent[], meId: string, now: Date): CalendarScreen {
  const today = todayYmd(now);
  const sorted = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const todays = sorted.filter((event) => ymdOfEvent(event) === today);
  const aheadToday = todays.filter((event) => !isOver(event, now));
  const pastToday = todays.length - aheadToday.length;
  const running = aheadToday.find((event) => isRunning(event, now)) ?? null;
  const next = sorted.find((event) => !isOver(event, now)) ?? null;
  const unanswered = awaitingAnswer(sorted, meId, now);
  const week = sorted.filter((event) => {
    const diff = daysBetween(today, ymdOfEvent(event));
    return diff >= 0 && diff < 7 && !isOver(event, now);
  }).length;

  const legend: CalendarScreen["legend"] = [];
  if (todays.length > 0) {
    legend.push({ key: "ahead", label: "впереди", count: aheadToday.length, tone: "accent" });
    // a zero says nothing: the morning that has not happened yet is not «0 прошло»
    if (pastToday > 0) legend.push({ key: "past", label: "прошло", count: pastToday, tone: "muted" });
  } else {
    // the week is already in the corner: a free day speaks of the month ahead
    const month = sorted.filter((event) => !isOver(event, now)).length;
    legend.push({ key: "month", label: "впереди за месяц", count: month, tone: "accent" });
  }
  if (unanswered.length > 0) legend.push({ key: "answer", label: "ждут ответа", count: unanswered.length, tone: "warn" });

  const nearest = next
    ? { id: next.id, title: next.title, when: whenAhead(next, now), tone: toneAhead(next, now) }
    : null;
  const base = { week, strip: dayStrip(sorted, now), legend, nearest };
  const todayWord = (n: number) => pluralRu(n, ["мероприятие сегодня", "мероприятия сегодня", "мероприятий сегодня"]);

  // 1. on right now, or about to start
  if (running) {
    return {
      ...base,
      tone: "accent",
      eyebrow: "Идёт сейчас",
      value: aheadToday.length,
      label: todayWord(aheadToday.length),
      detail: `${running.title}${running.ends_at ? ` · до ${hhmm(running.ends_at)}` : ""}${place(running)}`,
    };
  }
  const soon = aheadToday.find((event) => at(event.starts_at) - now.getTime() <= SOON_MS);
  if (soon) {
    return {
      ...base,
      tone: "warn",
      eyebrow: whenAhead(soon, now).replace(/^./, (c) => c.toUpperCase()),
      value: aheadToday.length,
      label: todayWord(aheadToday.length),
      detail: `${hhmm(soon.starts_at)} — ${soon.title}${place(soon)}`,
    };
  }

  // 2. somebody has to answer
  if (unanswered.length > 0) {
    const first = unanswered[0];
    return {
      ...base,
      tone: "warn",
      eyebrow: "Ваш ответ",
      value: unanswered.length,
      label: pluralRu(unanswered.length, ["приглашение ждёт ответа", "приглашения ждут ответа", "приглашений ждут ответа"]),
      detail: `${first.title} · ${humanAqtobe(new Date(first.starts_at), now)}`,
    };
  }

  // 3. what today still holds
  if (aheadToday.length > 0) {
    const first = aheadToday[0];
    return {
      ...base,
      tone: "accent",
      eyebrow: "Сегодня",
      value: aheadToday.length,
      label: todayWord(aheadToday.length),
      detail: `Ближайшее в ${hhmm(first.starts_at)} — ${first.title}${place(first)}`,
    };
  }

  // 4. a free day, and what comes after it
  const after = next ? `Дальше — ${dayWord(ymdOfEvent(next), now)} в ${hhmm(next.starts_at)}: ${next.title}` : "";
  return {
    ...base,
    tone: "muted",
    eyebrow: pastToday > 0 ? "На сегодня всё" : "Сегодня свободно",
    value: null,
    label: pastToday > 0 ? pluralRu(pastToday, ["встреча позади", "встречи позади", "встреч позади"]) : "Встреч нет",
    detail: after || (week === 0 ? "На неделе тоже пусто" : ""),
  };
}

/** «завтра», «пт, 25 сентября» — the day in the words of the ribbon. */
function dayWord(ymd: Ymd, now: Date): string {
  return humanYmd(ymd, now);
}
