import { pluralRu } from "@/lib/tasks/status-text";

import { tvTime, tvWeekday } from "./clock";
import type { TvLine } from "./feed";
import type { TvEventRow, TvSummary } from "./queries";
import { formatPoints } from "./leaders";
import { PHRASE_MAX, phraseOf } from "./voice";

/**
 * The news line at the bottom of the wall (D-185): everything the screen tells about the company, as one tape —
 * the next meetings, the latest events, the week's top and total (the day's numbers are on «Сегодня»). A pure function: the order and the words
 * are checked by a test, not by eye on the wall.
 *
 * An item is two words in different voices: `lead` (a time, «+50», «Топ недели») in its tone's colour and
 * semibold, `text` in calm white. There is nothing negative in the line at all (D-45): no overdue, no
 * declines, no «на приёмке» — that is the language of the director's «Входящее», not of the wall. For a guest
 * no surnames and no points get into the line, because the data has none already (D-33).
 */

export type TickerTone = "accent" | "ok" | "gold" | "muted" | "warn";

export type TickerItem = { id: string; lead: string | null; text: string; tone: TickerTone };

/** Сколько событий едет в строке: дальше уже не новости, а история. */
const EVENTS = 8;

export function tickerItems(lines: readonly TvLine[], summary: TvSummary | undefined): TickerItem[] {
  const items: TickerItem[] = [];

  if (summary) {
    // the day's numbers live large on «Сегодня», every other turn of the round: the band does not repeat them

    // что впереди у всей компании: три ближайшие встречи, гостю — без названий (D-33)
    for (const event of (summary.events ?? []).slice(0, EVENTS_AHEAD)) {
      const meeting = meetingText(event, new Date(summary.now));
      items.push({
        id: `meeting:${event.id}`,
        lead: meeting.lead,
        text: meeting.text,
        tone: startsWithin(event, new Date(summary.now), SOON_MS) ? "warn" : "accent",
      });
    }
  }

  for (const line of lines.slice(0, EVENTS)) {
    items.push({
      id: `event:${line.id}`,
      lead: tvTime(line.at),
      text: phraseOf(line),
      tone: line.tone,
    });
  }

  if (summary?.points_enabled && summary.rating.length > 0) {
    // first names only: three full names never fit the band's window whole
    const top = summary.rating
      .slice(0, 3)
      .map((row) => (row.points === null ? firstName(row.name) : `${firstName(row.name)} ${formatPoints(row.points)}`))
      .join(" · ");
    items.push({ id: "rating", lead: "Топ недели", text: top, tone: "gold" });
  }

  const week = summary?.week?.reduce((sum, day) => sum + day.done, 0) ?? 0;
  if (week > 0) {
    items.push({ id: "week", lead: "За неделю", text: `готово ${week} ${pluralRu(week, ["дело", "дела", "дел"])}`, tone: "ok" });
  }

  if (summary?.points_enabled && summary.merch.length > 0) {
    const last = summary.merch[0]!;
    if (`${last.name} · ${last.title}`.length <= PHRASE_MAX) {
      items.push({ id: "merch", lead: "Награда", text: `${last.name} · ${last.title}`, tone: "gold" });
    }
  }

  return items;
}

/** Сколько встреч едет в строке: дальше это уже расписание, а не новость. */
const EVENTS_AHEAD = 3;
/** За полчаса до начала строка становится жёлтой. */
const SOON_MS = 30 * 60_000;
const DAY_MS = 86_400_000;
const AQTOBE_OFFSET_MS = 5 * 3_600_000;

function startsWithin(event: TvEventRow, now: Date, withinMs: number): boolean {
  const left = new Date(event.starts_at).getTime() - now.getTime();
  return left <= withinMs;
}

/** День по стенным часам Актобе — та же арифметика, что в lib/tv/clock.ts. */
function dayIndex(iso: string | Date): number {
  const ms = (typeof iso === "string" ? new Date(iso) : iso).getTime();
  return Math.floor((ms + AQTOBE_OFFSET_MS) / DAY_MS);
}

/** «16:00 Планёрка, в переговорной» — the place only while the line stays short; no head count. */
function meetingText(event: TvEventRow, now: Date): { lead: string; text: string } {
  const diff = dayIndex(event.starts_at) - dayIndex(now);
  const time = tvTime(new Date(event.starts_at));
  const lead = diff <= 0 ? time : `${diff === 1 ? "Завтра" : tvWeekday(new Date(event.starts_at))} ${time}`;
  const title = event.title?.trim() || "Встреча";
  const place = event.location?.trim() || null;
  const withPlace = place ? `${title}, ${place}` : title;
  return { lead, text: withPlace.length <= PHRASE_MAX ? withPlace : title };
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

