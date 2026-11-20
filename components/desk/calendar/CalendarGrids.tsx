"use client";

import { Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { hhmm, timeRange } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { parseYmd, WEEKDAYS_SHORT_RU, type Month, type Ymd } from "@/lib/datetime/calendar";
import { isoWeekday, lengthWords, minuteHm, type BusyBlock } from "@/lib/desk/busy";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import { loudest, type DeadlineMark } from "./deadlines";
import { meetingState } from "./state";
import { useWorkHours } from "./useDirectorBusy";

/** Deadline diamonds a month cell shows before their count. */
const CELL_MARKS = 3;
/** One meeting's line in a cell (with the gap under it), «ещё N», and the cell's own parts — what decides how many lines fit. */
const CHIP_STEP = 22;
const MORE_H = 18;
const CELL_CHROME = 8 + 26 + 4;
const STRIP_H = 9;
/** The weekdays' heads over the grid. */
const HEAD_H = 37;
/** Until the screen is measured: a laptop's month. */
const CHIPS_DEFAULT = 3;

/** «18 ноября» — a cell's name for a screen reader and its buttons. */
const DAY_NAME = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

const MARK_COLOR = { danger: "var(--danger)", warn: "var(--text)", muted: "var(--text-muted)" } as const;

/**
 * A screen's part sized to what is left of the window under it (D-180): from its own top to the
 * foot of the desk's scrolling area, at least `min`. The head above may change (a state line, a
 * wrapped toolbar) — it is measured again then, and on a resize. Null before the first measure:
 * the stylesheet's own height stands in.
 */
export function useFitHeight(ref: RefObject<HTMLElement | null>, min = 420, gap = 0): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const main = node.closest<HTMLElement>("#desk-main");
    // the screen's page (DeskPage): its padding at the foot, and what grows above the node
    const page = node.closest<HTMLElement>(".desk-page");
    const measure = () => {
      const top = node.getBoundingClientRect().top + (main?.scrollTop ?? 0);
      const bottom = main ? main.getBoundingClientRect().bottom : window.innerHeight;
      // the page's own margin at the foot stays: the screen ends where the desk's pages end
      const foot = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0;
      const next = Math.max(min, Math.floor(bottom - top - foot - gap));
      setHeight((current) => (current === next ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (observer && page) observer.observe(page);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [ref, min, gap]);
  return height;
}

type Props = {
  days: Ymd[];
  /** The meetings of the days on screen, by day, in order. */
  byDay: Map<Ymd, CalendarEvent[]>;
  today: Ymd;
  now: Date;
  meId: string;
  /** A meeting was clicked: it opens in the side. */
  onOpen: (event: CalendarEvent) => void;
  /** The meeting open in the side: its chip stays lit. */
  openId: string | null;
  month: Month;
  /** A day's date or «ещё N»: that day, focused in its week. */
  onDay: (ymd: Ymd) => void;
  /** «+» of a day — a new meeting on it (the director's, today and later); null — none. */
  onNew: ((ymd: Ymd) => void) | null;
  /** «Сроки задач» while the layer is on; null — off. */
  deadlines: Map<Ymd, DeadlineMark[]> | null;
  /**
   * The secretary's: when the director is busy, a hatched strip under each day's date (D-180) —
   * only once the read has answered; null — no strip (the director's month, or no answer yet:
   * nothing is drawn as free).
   */
  busy: Map<Ymd, BusyBlock[]> | null;
  /** The company's working days (1 = Monday … 7 = Sunday, `settings.workdays`): the others are shaded. */
  workdays?: readonly number[];
};

/** A day's deadlines as diamonds by the date — the day's week writes them out. */
function MarkDots({ marks }: { marks: DeadlineMark[] }) {
  if (marks.length === 0) return null;
  const lines = marks.map((mark) => `${mark.time} ${mark.who ? shortName(mark.who) : `${mark.count} чел.`} · ${mark.title}`).join(" · ");
  return (
    <Tooltip label={lines} side="bottom">
      <span
        className="flex items-center gap-[3px] pr-0.5"
        aria-label={`${marks.length} ${pluralRu(marks.length, ["срок", "срока", "сроков"])}`}
        data-testid="desk-month-deadlines"
        data-tone={loudest(marks)}
      >
        {marks.slice(0, CELL_MARKS).map((mark) => (
          <span key={mark.id} aria-hidden className="h-[6px] w-[6px] rotate-45" style={{ background: MARK_COLOR[mark.tone] }} />
        ))}
        {marks.length > CELL_MARKS ? <span className="nums ml-0.5 text-[11px] leading-3 text-muted">+{marks.length - CELL_MARKS}</span> : null}
      </span>
    </Tooltip>
  );
}

/** «10» for a meeting on the hour, «10:30» otherwise — the narrow cell's hour (D-180). */
function shortHour(iso: string): string {
  const hm = hhmm(iso);
  return hm.endsWith(":00") ? String(Number(hm.slice(0, 2))) : hm;
}

/**
 * The director's busy time on a day as the secretary sees it: a hatched strip over the working
 * hours, and how long he is busy in them. Nothing about the meetings (D-158 §5).
 */
function BusyStrip({ blocks, hours }: { blocks: readonly BusyBlock[]; hours: { from: number; to: number } }) {
  const span = hours.to - hours.from;
  const shown = blocks.filter((block) => block.end > hours.from && block.start < hours.to);
  const at = (minute: number) => ((Math.max(hours.from, Math.min(hours.to, minute)) - hours.from) / span) * 100;
  const words = blocks.length ? `Директор занят ${blocks.map((block) => `${minuteHm(block.start)}–${minuteHm(block.end)}`).join(", ")}` : "Встреч директора нет";
  return (
    <Tooltip label={words} side="bottom" className="flex">
      <span className="cal-cell-busy" role="img" aria-label={words} data-testid="desk-month-busy">
        {shown.map((block) => (
          <i key={block.start} style={{ left: `${at(block.start)}%`, width: `${at(block.end) - at(block.start)}%` }} />
        ))}
      </span>
    </Tooltip>
  );
}

/** How long the director is busy within the hours, for the date's row: «3 ч 30 мин». */
function busyLength(blocks: readonly BusyBlock[], hours: { from: number; to: number }): number {
  return blocks.reduce((sum, block) => sum + Math.max(0, Math.min(hours.to, block.end) - Math.max(hours.from, block.start)), 0);
}

/**
 * The month as weeks of seven (D-174, D-180): equal rows sized to the screen, the neighbours'
 * days readable, the days off shaded, today's cell lit and its date stamped. A cell holds as many
 * meetings as fit — the hour short in a narrow cell («10 Планёрка») — and «ещё N», a button to
 * that day in its week, as the date is. «+» of a day is reached by Tab too. A chip is a line of
 * text with a dot in the colour of what the meeting is to this person (`meetingState`); what waits
 * for an answer is outlined. The secretary's cells carry the director's busy strip.
 */
export function MonthGrid({ days, byDay, today, now, meId, onOpen, openId, month, onDay, onNew, deadlines, busy, workdays = [1, 2, 3, 4, 5] }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const height = useFitHeight(box, 480);
  const hours = useWorkHours();
  const rows = Math.max(1, Math.ceil(days.length / 7));
  const rowH = height ? (height - HEAD_H) / rows : null;
  // how many of a day's meetings stand in its cell: all when they fit, else as many as leave room for «ещё N»
  const shownOf = (count: number, strip: boolean) => {
    if (!rowH) return count > CHIPS_DEFAULT ? CHIPS_DEFAULT - 1 : count;
    const room = rowH - CELL_CHROME - (strip ? STRIP_H : 0);
    if (count * CHIP_STEP <= room) return count;
    return Math.max(0, Math.floor((room - MORE_H) / CHIP_STEP));
  };

  return (
    <div
      ref={box}
      className="cal-month flex min-w-0 flex-col overflow-hidden border-t border-text"
      style={height ? { height } : undefined}
      data-testid="desk-calendar-month"
      data-busy={busy ? "" : undefined}
    >
      <div className="cal-month-head grid shrink-0 grid-cols-7 border-b border-text">
        {WEEKDAYS_SHORT_RU.map((name, index) => (
          <span key={name} className={`desk-label px-2 py-1.5 uppercase ${index > 0 ? "border-l border-border/60" : ""}`} data-weekend={workdays.includes(index + 1) ? undefined : ""}>
            {name}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {days.map((ymd, index) => {
          const parts = parseYmd(ymd)!;
          const outside = parts.year !== month.year || parts.month !== month.month;
          const isToday = ymd === today;
          const past = ymd < today;
          const off = !workdays.includes(isoWeekday(ymd));
          const events = byDay.get(ymd) ?? [];
          const blocks = busy?.get(ymd) ?? [];
          // a day gone by keeps no strip; a day off only when he was busy on it
          const strip = busy !== null && !past && (!off || blocks.length > 0);
          const shown = events.slice(0, shownOf(events.length, strip));
          const more = events.length - shown.length;
          const marks = deadlines?.get(ymd) ?? [];
          const load = strip ? busyLength(blocks, hours) : 0;
          const label = DAY_NAME.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
          return (
            <div
              key={ymd}
              role="group"
              aria-label={label}
              data-ymd={ymd}
              data-testid="desk-month-day"
              data-today={isToday ? "" : undefined}
              data-outside={outside ? "" : undefined}
              data-past={past ? "" : undefined}
              data-weekend={off ? "" : undefined}
              // the mouse may take the whole cell; the keyboard has the date, «ещё N» and the chips
              onClick={() => onDay(ymd)}
              className={`cal-cell group/day flex min-h-0 min-w-0 cursor-pointer flex-col gap-0.5 overflow-hidden p-1.5 transition-colors duration-[120ms] hover:bg-surface-2/50 ${
                index % 7 > 0 ? "border-l border-border/60" : ""
              } ${index >= 7 ? "border-t border-border/60" : ""}`}
            >
              <span className="mb-0.5 flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`${label} — открыть день`}
                  data-testid="desk-month-date"
                  onClick={(click) => {
                    click.stopPropagation();
                    onDay(ymd);
                  }}
                  className={`cal-cell-day desk-focus nums flex h-6 min-w-6 items-center justify-center px-1 text-[13px] leading-none ${isToday ? "desk-today" : past || outside ? "text-muted" : ""}`}
                >
                  {parts.day}
                </button>
                {load > 0 ? (
                  <span className="cal-cell-load nums" data-testid="desk-month-load">
                    {lengthWords(load)}
                  </span>
                ) : null}
                <span className="ml-auto flex items-center gap-1">
                  {deadlines ? <MarkDots marks={marks} /> : null}
                  {onNew && ymd >= today ? (
                    <Tooltip label="Новая встреча на этот день" side="bottom">
                      <button
                        type="button"
                        aria-label={`Новая встреча на ${label}`}
                        data-testid="desk-month-new"
                        onClick={(click) => {
                          click.stopPropagation();
                          onNew(ymd);
                        }}
                        className="cal-cell-new desk-focus flex h-6 w-6 items-center justify-center text-[16px] leading-none text-muted opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-accent focus-visible:opacity-100 group-hover/day:opacity-100"
                      >
                        <Plus aria-hidden size={14} strokeWidth={2.2} />
                      </button>
                    </Tooltip>
                  ) : null}
                </span>
              </span>
              {strip ? <BusyStrip blocks={blocks} hours={hours} /> : null}
              {shown.map((event) => {
                const state = meetingState(event, meId, now);
                const over = state === "over";
                return (
                  <Tooltip key={event.id} label={`${timeRange(event)} · ${event.title}`} side="bottom" className="flex min-w-0">
                    <button
                      type="button"
                      data-testid="desk-event"
                      data-event-id={event.id}
                      data-state={state}
                      data-open={event.id === openId ? "" : undefined}
                      onClick={(click) => {
                        click.stopPropagation();
                        onOpen(event);
                      }}
                      className={`cal-chip desk-focus flex w-full min-w-0 items-center gap-1.5 border-l-2 px-1 py-[3px] text-left text-[12px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 ${
                        over || outside ? "text-muted" : ""
                      }`}
                    >
                      <span aria-hidden className="cal-chip-dot" />
                      <When className="cal-chip-hm shrink-0 text-muted">{hhmm(event.starts_at)}</When>
                      <span aria-hidden className="cal-chip-h nums shrink-0 text-muted">
                        {shortHour(event.starts_at)}
                      </span>
                      <span className={`min-w-0 truncate ${over ? "" : "font-medium"}`}>{event.title}</span>
                    </button>
                  </Tooltip>
                );
              })}
              {more > 0 ? (
                <button
                  type="button"
                  className="cal-cell-more desk-focus nums self-start px-1 text-[12px] leading-4 text-muted"
                  data-testid="desk-month-more"
                  aria-label={`Ещё ${more} ${pluralRu(more, ["встреча", "встречи", "встреч"])} — открыть день`}
                  onClick={(click) => {
                    click.stopPropagation();
                    onDay(ymd);
                  }}
                >
                  ещё {more}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
