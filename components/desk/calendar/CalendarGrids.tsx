"use client";

import { Plus } from "lucide-react";

import { When } from "@/components/desk/ui/When";
import { hhmm, timeRange } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { parseYmd, WEEKDAYS_SHORT_RU, type Month, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import { loudest, type DeadlineMark } from "./deadlines";
import { meetingState } from "./state";

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
  /** The meeting whose card is open: its chip stays lit. */
  openId: string | null;
  month: Month;
  onDay: (ymd: Ymd) => void;
  /** «+» of a day — a new meeting on it (the director's, today and later); null — none. */
  onNew: ((ymd: Ymd) => void) | null;
  /** «Сроки задач» while the layer is on; null — off. */
  deadlines: Map<Ymd, DeadlineMark[]> | null;
};

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
 * The month as weeks of seven (D-174): the neighbours' days dimmed, the weekend shaded, today's
 * cell lit and its date stamped, up to three meetings in a cell and «ещё N»; a click on a day opens
 * its week, a click on a meeting — the meeting. A chip is a line of text with a dot in the colour
 * of what the meeting is to this person (`meetingState`); what waits for an answer is outlined.
 */
export function MonthGrid({ days, byDay, today, now, meId, onOpen, openId, month, onDay, onNew, deadlines }: Props) {
  return (
    <div className="cal-month min-w-0 overflow-hidden border-t border-text" data-testid="desk-calendar-month">
      <div className="cal-month-head grid grid-cols-7 border-b border-text">
        {WEEKDAYS_SHORT_RU.map((name, index) => (
          <span key={name} className={`desk-label px-2 py-1.5 uppercase ${index > 0 ? "border-l border-border/60" : ""}`} data-weekend={index >= 5 ? "" : undefined}>
            {name}
          </span>
        ))}
      </div>
      <div className="cal-month-body grid grid-cols-7">
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
              data-today={isToday ? "" : undefined}
              data-outside={outside ? "" : undefined}
              data-past={ymd < today ? "" : undefined}
              data-weekend={index % 7 >= 5 ? "" : undefined}
              onClick={() => onDay(ymd)}
              onKeyDown={(event) => {
                if (event.code === "Enter" || event.code === "Space") {
                  event.preventDefault();
                  onDay(ymd);
                }
              }}
              className={`cal-cell group/day flex min-h-[116px] min-w-0 cursor-pointer flex-col gap-0.5 p-1.5 outline-none transition-colors duration-[120ms] hover:bg-surface-2/50 focus-visible:bg-surface-2/60 ${
                index % 7 > 0 ? "border-l border-border/60" : ""
              } ${index >= 7 ? "border-t border-border/60" : ""}`}
            >
              <span className="mb-0.5 flex items-center">
                <span
                  className={`cal-cell-day nums flex h-6 min-w-6 items-center justify-center px-1 text-[13px] leading-none ${
                    isToday ? "desk-today" : outside ? "text-muted/45" : ymd < today ? "text-muted" : ""
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
                    className={`cal-cell-new ${deadlines && (deadlines.get(ymd) ?? []).length > 0 ? "ml-1" : "ml-auto"} flex h-6 w-6 items-center justify-center text-[16px] leading-none text-muted opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-accent group-hover/day:opacity-100`}
                  >
                    <Plus aria-hidden size={14} strokeWidth={2.2} />
                  </button>
                ) : null}
              </span>
              {events.slice(0, CELL_CHIPS).map((event) => {
                const state = meetingState(event, meId, now);
                const over = state === "over";
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="desk-event"
                    data-event-id={event.id}
                    data-state={state}
                    data-open={event.id === openId ? "" : undefined}
                    title={`${timeRange(event)} · ${event.title}`}
                    onClick={(click) => {
                      click.stopPropagation();
                      onOpen(event, click.currentTarget);
                    }}
                    className={`cal-chip flex min-w-0 items-center gap-1.5 border-l-2 px-1 py-[3px] text-left text-[12px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 ${
                      over || outside ? "text-muted" : ""
                    }`}
                  >
                    <span aria-hidden className="cal-chip-dot" />
                    <When className={`shrink-0 ${over || outside ? "text-muted/70" : "text-muted"}`}>{hhmm(event.starts_at)}</When>
                    <span className={`min-w-0 truncate ${over ? "" : "font-medium"}`}>{event.title}</span>
                  </button>
                );
              })}
              {more > 0 ? <span className="cal-cell-more nums px-1 text-[12px] leading-4 text-muted">ещё {more}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
