"use client";

import { TONE_VAR } from "@/components/desk/ui/tone";
import { hhmm, isOver, myStatus, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { toneAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { parseYmd, WEEKDAYS_SHORT_RU, type Month, type Ymd } from "@/lib/datetime/calendar";
import { initialsOf } from "@/lib/people/queries";

/** Chips a month cell shows before «+N». */
const CELL_CHIPS = 3;
/** Faces on a week's event before «+N». */
const FACES = 3;

type GridProps = {
  days: Ymd[];
  /** The meetings of the days on screen, by day, in order. */
  byDay: Map<Ymd, CalendarEvent[]>;
  today: Ymd;
  now: Date;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
};

/** The one word a meeting owes this person: an answer, or how it stands. */
function flagOf(event: CalendarEvent, meId: string, now: Date): { text: string; color: string } | null {
  if (event.author_id === meId || isOver(event, now)) return null;
  const mine = myStatus(event, meId);
  if (mine === "invited") return { text: "нужен ответ", color: "var(--warn)" };
  if (mine === "declined") return { text: "не смогу", color: "var(--text-muted)" };
  return null;
}

/** Who comes, as initials: the ones who have not refused, three and «+N». */
function Faces({ event }: { event: CalendarEvent }) {
  const names = event.participants.filter((p) => p.status !== "declined").map((p) => p.person?.full_name ?? "");
  if (names.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5" title={names.filter(Boolean).join(", ")}>
      {names.slice(0, FACES).map((name, index) => (
        <span
          key={`${name}-${index}`}
          aria-hidden
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full font-display text-[9px] font-bold leading-none text-bg"
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
        >
          {name ? initialsOf(name) : "•"}
        </span>
      ))}
      {names.length > FACES ? <span className="nums ml-0.5 text-[11px] leading-4 text-muted">+{names.length - FACES}</span> : null}
    </span>
  );
}

/** A meeting in a week's column: when, what, who — a rail in the colour of the moment. */
function WeekEvent({ event, now, meId, onOpen }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void }) {
  const over = isOver(event, now);
  const flag = flagOf(event, meId, now);
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      data-testid="desk-event"
      data-event-id={event.id}
      className="relative flex w-full flex-col gap-1 rounded-[10px] border border-border/70 bg-surface py-1.5 pl-3 pr-2 text-left transition-[border-color,background-color] duration-[120ms] hover:border-muted/50 hover:bg-surface-2/60"
    >
      <span aria-hidden className="absolute inset-y-1.5 left-1 w-[3px] rounded-full" style={{ background: TONE_VAR[toneAhead(event, now)], opacity: over ? 0.35 : 1 }} />
      <span className={`nums text-[12px] font-semibold leading-4 ${over ? "text-muted" : ""}`}>{timeRange(event)}</span>
      <span className={`line-clamp-3 text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere] ${over ? "text-muted" : ""}`}>{event.title}</span>
      {event.location ? <span className="truncate text-[12px] leading-4 text-muted">{event.location}</span> : null}
      <span className="flex min-h-[18px] items-center justify-between gap-1">
        <Faces event={event} />
        {flag ? (
          <span className="truncate text-[11px] font-semibold leading-4" style={{ color: flag.color }}>
            {flag.text}
          </span>
        ) : null}
      </span>
    </button>
  );
}

const dayNumber = (ymd: Ymd) => parseYmd(ymd)!.day;

/** Seven columns, a date over each (today lit), the day's meetings in order; an empty day says «—». */
export function WeekGrid({ days, byDay, today, now, meId, onOpen }: GridProps) {
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-[12px] border border-border" data-testid="desk-calendar-week">
      {days.map((ymd, index) => {
        const isToday = ymd === today;
        const past = ymd < today;
        const events = byDay.get(ymd) ?? [];
        return (
          <section key={ymd} aria-label={ymd} className={`flex min-h-[460px] min-w-0 flex-col ${index > 0 ? "border-l border-border/70" : ""} ${isToday ? "bg-accent/[0.04]" : ""}`}>
            <header className="flex items-baseline gap-1.5 border-b border-border/70 px-2.5 py-2">
              <span className={`text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] ${isToday ? "text-accent" : "text-muted"}`}>{WEEKDAYS_SHORT_RU[index]}</span>
              <span
                className={`nums flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-display text-[15px] font-bold leading-none ${
                  isToday ? "bg-accent text-bg" : past ? "text-muted" : ""
                }`}
              >
                {dayNumber(ymd)}
              </span>
            </header>
            <div className="flex flex-1 flex-col gap-1.5 p-1.5">
              {events.length === 0 ? (
                <span className="mt-3 text-center text-[14px] leading-5 text-muted/60">—</span>
              ) : (
                events.map((event) => <WeekEvent key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The month as weeks of seven: the neighbours' days dimmed, today ringed, up to three meetings
 * in a cell and «+N»; a click on a day opens its week, a click on a meeting — the meeting.
 */
export function MonthGrid({ days, byDay, today, now, meId, onOpen, month, onDay }: GridProps & { month: Month; onDay: (ymd: Ymd) => void }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border" data-testid="desk-calendar-month">
      <div className="grid grid-cols-7 border-b border-border/70 bg-surface-2/60">
        {WEEKDAYS_SHORT_RU.map((name) => (
          <span key={name} className="px-2.5 py-1.5 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">
            {name}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((ymd, index) => {
          const parts = parseYmd(ymd)!;
          const outside = parts.year !== month.year || parts.month !== month.month;
          const isToday = ymd === today;
          const events = byDay.get(ymd) ?? [];
          const more = events.length - CELL_CHIPS;
          return (
            <div
              key={ymd}
              role="button"
              tabIndex={0}
              aria-label={ymd}
              data-testid="desk-month-day"
              onClick={() => onDay(ymd)}
              onKeyDown={(event) => {
                if (event.code === "Enter" || event.code === "Space") {
                  event.preventDefault();
                  onDay(ymd);
                }
              }}
              className={`flex min-h-[112px] min-w-0 cursor-pointer flex-col gap-1 p-1.5 outline-none transition-colors duration-[120ms] hover:bg-surface-2/50 focus-visible:bg-surface-2/60 ${
                index % 7 > 0 ? "border-l border-border/60" : ""
              } ${index >= 7 ? "border-t border-border/60" : ""} ${outside ? "bg-bg/40" : ""}`}
            >
              <span
                className={`nums flex h-6 w-fit min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-semibold leading-none ${
                  isToday ? "bg-accent text-bg" : outside ? "text-muted/50" : ymd < today ? "text-muted" : ""
                }`}
              >
                {parts.day}
              </span>
              {events.slice(0, CELL_CHIPS).map((event) => {
                const over = isOver(event, now);
                const owes = !over && event.author_id !== meId && myStatus(event, meId) === "invited";
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="desk-event"
                    data-event-id={event.id}
                    title={`${timeRange(event)} · ${event.title}`}
                    onClick={(click) => {
                      click.stopPropagation();
                      onOpen(event);
                    }}
                    className={`flex min-w-0 items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left text-[12px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 ${
                      over || outside ? "text-muted" : ""
                    }`}
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: owes ? "var(--warn)" : TONE_VAR[toneAhead(event, now)], opacity: over ? 0.5 : 1 }} />
                    <span className="nums shrink-0 text-muted">{hhmm(event.starts_at)}</span>
                    <span className="min-w-0 truncate font-medium">{event.title}</span>
                  </button>
                );
              })}
              {more > 0 ? <span className="nums px-1 text-[12px] font-medium leading-4 text-muted">+{more}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The meetings of the days on screen, grouped by the company's day, in order. */
export function eventsByDay(events: readonly CalendarEvent[], days: readonly Ymd[]): Map<Ymd, CalendarEvent[]> {
  const shown = new Set(days);
  const map = new Map<Ymd, CalendarEvent[]>();
  for (const event of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const ymd = ymdOfEvent(event);
    if (!shown.has(ymd)) continue;
    const list = map.get(ymd);
    if (list) list.push(event);
    else map.set(ymd, [event]);
  }
  return map;
}
