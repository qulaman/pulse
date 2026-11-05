"use client";

import { When } from "@/components/desk/ui/When";
import { hhmm, isOver, myStatus, timeRange } from "@/lib/calendar/agenda";
import { isRunning } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { parseYmd, WEEKDAYS_SHORT_RU, type Month, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import { loudest, type DeadlineMark } from "./deadlines";

/** Meetings a month cell shows before «+N». */
const CELL_CHIPS = 3;
/** Deadline diamonds a month cell shows before their count. */
const CELL_MARKS = 3;

const MARK_COLOR = { danger: "var(--danger)", warn: "var(--text)", muted: "var(--text-muted)" } as const;

type Props = {
  days: Ymd[];
  /** The meetings of the days on screen, by day, in order. */
  byDay: Map<Ymd, CalendarEvent[]>;
  today: Ymd;
  now: Date;
  meId: string;
  /** A meeting was clicked: its card opens beside `element`. */
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
  month: Month;
  onDay: (ymd: Ymd) => void;
  /** «+» of a day — a new meeting on it (the director's, today and later); null — none. */
  onNew: ((ymd: Ymd) => void) | null;
  /** «Сроки задач» while the layer is on; null — off. */
  deadlines: Map<Ymd, DeadlineMark[]> | null;
};

/**
 * The line on a month chip's left, only when it says something: the pen — this person's answer is
 * owed; print — on now. An ordinary meeting ahead is a plain line of text, a past one is quiet.
 */
function chipLine(event: CalendarEvent, meId: string, now: Date): string {
  if (isOver(event, now)) return "transparent";
  if (event.author_id !== meId && myStatus(event, meId) === "invited") return "var(--accent)";
  return isRunning(event, now) ? "var(--text)" : "transparent";
}

/** A day's deadlines as diamonds by the date — a click on the day opens its week, where they are written out. */
function MarkDots({ marks }: { marks: DeadlineMark[] }) {
  if (marks.length === 0) return null;
  const lines = marks.map((mark) => `${mark.time} ${mark.who ? shortName(mark.who) : `${mark.count} чел.`} · ${mark.title}`).join("\n");
  return (
    <span
      className="ml-auto flex items-center gap-[3px] pr-0.5"
      title={lines}
      aria-label={`${marks.length} ${pluralRu(marks.length, ["срок", "срока", "сроков"])}`}
      data-testid="desk-month-deadlines"
      data-tone={loudest(marks)}
    >
      {marks.slice(0, CELL_MARKS).map((mark) => (
        <span key={mark.id} aria-hidden className="h-[6px] w-[6px] rotate-45" style={{ background: MARK_COLOR[mark.tone] }} />
      ))}
      {marks.length > CELL_MARKS ? <span className="nums ml-0.5 text-[10px] leading-3 text-muted">+{marks.length - CELL_MARKS}</span> : null}
    </span>
  );
}

/**
 * The month as weeks of seven under a rule of print: the neighbours' days dimmed, today's date
 * stamped, up to three meetings in a cell and «+N»; a click on a day opens its week, a click on a
 * meeting — the meeting. The chips are plain lines of text — a mark only on what waits for an answer.
 */
export function MonthGrid({ days, byDay, today, now, meId, onOpen, month, onDay, onNew, deadlines }: Props) {
  return (
    <div className="min-w-0 overflow-hidden border-t border-text" data-testid="desk-calendar-month">
      <div className="grid grid-cols-7 border-b border-text">
        {WEEKDAYS_SHORT_RU.map((name, index) => (
          <span key={name} className={`desk-label px-2 py-1.5 uppercase ${index > 0 ? "border-l border-border/60" : ""}`}>
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
              className={`group/day flex min-h-[116px] min-w-0 cursor-pointer flex-col gap-0.5 p-1.5 outline-none transition-colors duration-[120ms] hover:bg-surface-2/50 focus-visible:bg-surface-2/60 ${
                index % 7 > 0 ? "border-l border-border/60" : ""
              } ${index >= 7 ? "border-t border-border/60" : ""}`}
            >
              <span className="mb-0.5 flex items-center">
                <span
                  className={`nums flex h-6 min-w-6 items-center justify-center px-1 text-[13px] leading-none ${
                    isToday ? "bg-text text-bg" : outside ? "text-muted/45" : ymd < today ? "text-muted" : ""
                  }`}
                >
                  {parts.day}
                </span>
                {deadlines ? <MarkDots marks={deadlines.get(ymd) ?? []} /> : null}
                {onNew && ymd >= today ? (
                  <button
                    type="button"
                    aria-label={`Новая встреча на ${ymd}`}
                    title="Новая встреча на этот день"
                    tabIndex={-1}
                    data-testid="desk-month-new"
                    onClick={(click) => {
                      click.stopPropagation();
                      onNew(ymd);
                    }}
                    className={`${deadlines && (deadlines.get(ymd) ?? []).length > 0 ? "ml-1" : "ml-auto"} flex h-6 w-6 items-center justify-center text-[16px] leading-none text-muted opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-accent group-hover/day:opacity-100`}
                  >
                    +
                  </button>
                ) : null}
              </span>
              {events.slice(0, CELL_CHIPS).map((event) => {
                const over = isOver(event, now);
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="desk-event"
                    data-event-id={event.id}
                    title={`${timeRange(event)} · ${event.title}`}
                    onClick={(click) => {
                      click.stopPropagation();
                      onOpen(event, click.currentTarget);
                    }}
                    className={`flex min-w-0 items-center gap-1.5 border-l-2 px-1 py-[3px] text-left text-[12px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 ${
                      over || outside ? "text-muted" : ""
                    }`}
                    style={{ borderLeftColor: chipLine(event, meId, now) }}
                  >
                    <When className={`shrink-0 ${over || outside ? "text-muted/70" : "text-muted"}`}>{hhmm(event.starts_at)}</When>
                    <span className={`min-w-0 truncate ${over ? "" : "font-medium"}`}>{event.title}</span>
                  </button>
                );
              })}
              {more > 0 ? <span className="nums px-1 text-[12px] leading-4 text-muted">+{more}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
