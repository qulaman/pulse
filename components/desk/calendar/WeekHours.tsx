"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

import { TONE_VAR } from "@/components/desk/ui/tone";
import { hhmm, isOver, myStatus, timeRange } from "@/lib/calendar/agenda";
import { isRunning, toneAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { parseYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { initialsOf } from "@/lib/people/queries";

import type { DeadlineMark } from "./deadlines";
import { hmAt, minutesAt, SNAP_MIN, slotOf, type Slot } from "./slots";
import { HOUR_PX, hourRange, layoutDay, stackTops, wallOf, yOf, type Placed } from "./week";

/** Faces on a meeting before «+N». */
const FACES = 3;
/** The height of a deadline's mark (two lines: when and who, then what), and the gap between two stacked. */
const MARK_H = 34;
const MARK_GAP = 2;
/** The time column on the left. */
const GUTTER = 52;
/** An hour's label gives way to the clock of now when they would touch. */
const NOW_LABEL_ROOM_MIN = 14;

const pad = (n: number) => String(n).padStart(2, "0");
const COLUMNS = `${GUTTER}px repeat(7, minmax(0, 1fr))`;

type Props = {
  days: Ymd[];
  /** The meetings of the days on screen, by day, in order. */
  byDay: Map<Ymd, CalendarEvent[]>;
  today: Ymd;
  now: Date;
  meId: string;
  /** A meeting's block was clicked (or Enter on it): the card opens beside `element`. */
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
  /** «Сроки задач» while the layer is on; null — off. */
  deadlines: Map<Ymd, DeadlineMark[]> | null;
  /**
   * The director's mouse makes meetings (wave 3): a click or a drag over an empty stretch hands
   * the slot here with the box it stands in on screen; null — the grid only shows.
   */
  onSlot: ((slot: Slot, box: { left: number; right: number; top: number }) => void) | null;
  /** The meeting being made — drawn where it will stand, with its title as typed. */
  ghost: { slot: Slot; title: string } | null;
};

/** A press that moved less than this is a click. */
const DRAG_PX = 4;

/** The earliest minute of `ymd` a new meeting may start at: today — the next quarter, a past day — never. */
function earliest(ymd: Ymd, now: Date): number | null {
  const clock = wallOf(now.getTime());
  if (ymd < clock.ymd) return null;
  if (ymd > clock.ymd) return 0;
  return Math.ceil(clock.minutes / SNAP_MIN) * SNAP_MIN;
}

/** A slot moved to start no earlier than `first`, its length kept within the day; null — nothing of it is ahead. */
function ahead(slot: Slot, first: number | null): Slot | null {
  if (first === null) return null;
  if (slot.start >= first) return slot;
  if (first + SNAP_MIN > 24 * 60) return null;
  return { ...slot, start: first, end: Math.min(24 * 60, first + (slot.end - slot.start)) };
}

/**
 * The week as hours (D-154): a column a day under its date, the hours 08:00–20:00 down the left
 * (wider when a meeting or a deadline on screen lies outside), today in a breath of the accent
 * and the line of now across it. A meeting is a block where the clock puts it, as tall as it
 * lasts, with the rail of its moment; meetings that overlap stand side by side. An empty week
 * still shows its hours — the structure of the days to fill.
 */
export function WeekHours({ days, byDay, today, now, meId, onOpen, deadlines, onSlot, ghost }: Props) {
  const events = days.flatMap((ymd) => byDay.get(ymd) ?? []);
  const marks = deadlines ? days.flatMap((ymd) => deadlines.get(ymd) ?? []) : [];
  const { from, to } = hourRange(
    events,
    marks.map((mark) => mark.minutes),
  );
  const height = (to - from) * HOUR_PX;
  const hours = Array.from({ length: to - from + 1 }, (_, index) => from + index);

  const clock = wallOf(now.getTime());
  const nowShown = days.includes(clock.ymd) && clock.minutes >= from * 60 && clock.minutes <= to * 60;
  const nowY = nowShown ? yOf(clock.minutes, from) : null;

  // a press on an empty stretch of a day: where it went down, where the mouse is now
  const [drag, setDrag] = useState<{ ymd: Ymd; down: number; at: number; moved: boolean; y0: number } | null>(null);
  // the half-hour under a resting mouse: «+ 14:30» says a click makes a meeting there
  const [hover, setHover] = useState<{ ymd: Ymd; minutes: number } | null>(null);
  const dragRef = useRef(drag);
  const slotRef = useRef(onSlot);
  const fromRef = useRef(from);
  useEffect(() => {
    dragRef.current = drag;
    slotRef.current = onSlot;
    fromRef.current = from;
  });
  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;
    const columnOf = (ymd: Ymd) => body.current?.querySelector<HTMLElement>(`[data-testid=desk-week-day][aria-label="${ymd}"]`) ?? null;
    const move = (event: MouseEvent) => {
      const current = dragRef.current;
      const column = current ? columnOf(current.ymd) : null;
      if (!current || !column) return;
      const moved = current.moved || Math.abs(event.clientY - current.y0) > DRAG_PX;
      setDrag({ ...current, at: minutesAt(event.clientY - column.getBoundingClientRect().top, fromRef.current), moved });
    };
    const up = () => {
      const current = dragRef.current;
      setDrag(null);
      const column = current ? columnOf(current.ymd) : null;
      if (!current || !column || !slotRef.current) return;
      const slot = ahead(slotOf(current.ymd, current.down, current.at, current.moved), earliest(current.ymd, new Date()));
      if (!slot) return;
      const rect = column.getBoundingClientRect();
      slotRef.current(slot, { left: rect.left, right: rect.right, top: rect.top + yOf(slot.start, fromRef.current) });
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", esc);
    };
  }, [dragging]);

  /** The minutes under the mouse in a column, from its own box. */
  const minutesIn = (event: ReactMouseEvent<HTMLElement>, step = SNAP_MIN) => minutesAt(event.clientY - event.currentTarget.getBoundingClientRect().top, from, step);
  const onEmpty = (event: ReactMouseEvent<HTMLElement>) => !(event.target as Element).closest("[data-testid=desk-event], [data-testid=desk-deadline]");

  const pressDay = (ymd: Ymd) => (event: ReactMouseEvent<HTMLElement>) => {
    if (!onSlot || event.button !== 0 || !onEmpty(event) || earliest(ymd, now) === null) return;
    // a drag paints a stretch, not a selection of the page's text
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    const minutes = minutesIn(event);
    setHover(null);
    setDrag({ ymd, down: minutes, at: minutes, moved: false, y0: event.clientY });
  };
  const hoverDay = (ymd: Ymd) => (event: ReactMouseEvent<HTMLElement>) => {
    if (!onSlot || drag || ghost) return;
    const first = earliest(ymd, now);
    const minutes = minutesIn(event, 30);
    if (!onEmpty(event) || first === null || minutes + 30 <= first) {
      if (hover) setHover(null);
      return;
    }
    if (hover?.ymd !== ymd || hover.minutes !== minutes) setHover({ ymd, minutes });
  };

  // what is drawn as the new meeting: the press in progress, or the one waiting for its title
  const pressed = drag ? ahead(slotOf(drag.ymd, drag.down, drag.at, drag.moved), earliest(drag.ymd, now)) : null;
  const drawn: { slot: Slot; title: string } | null = drag ? (pressed ? { slot: pressed, title: "" } : null) : ghost;

  // the first look finds now: a line below the fold (an evening on a short screen) is brought into view, once
  const body = useRef<HTMLDivElement>(null);
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    const line = body.current?.querySelector<HTMLElement>("[data-testid=desk-now-line]");
    if (!line) return;
    looked.current = true;
    const { bottom } = line.getBoundingClientRect();
    if (bottom > window.innerHeight - 24) line.scrollIntoView({ block: "center" });
  });

  return (
    <div className="min-w-0 overflow-clip rounded-[12px] border border-border" data-testid="desk-calendar-week" data-hours={`${from}-${to}`}>
      <div className="sticky top-0 z-30 grid border-b border-border bg-bg" style={{ gridTemplateColumns: COLUMNS }}>
        <span aria-hidden />
        {days.map((ymd, index) => (
          <DayHead key={ymd} ymd={ymd} index={index} today={today} />
        ))}
      </div>

      <div ref={body} className="relative grid" style={{ gridTemplateColumns: COLUMNS, height }} data-testid="desk-week-hours">
        <div aria-hidden className="relative">
          {hours.map((hour) => {
            // the last line is the grid's edge; an hour near the clock of now gives way to it
            if (hour === to) return null;
            if (nowY !== null && Math.abs(clock.minutes - hour * 60) < NOW_LABEL_ROOM_MIN) return null;
            return (
              <span key={hour} className="nums absolute right-2 text-[11px] font-medium leading-4 text-muted/80" style={{ top: hour === from ? 3 : yOf(hour * 60, from) - 8 }}>
                {pad(hour)}:00
              </span>
            );
          })}
          {nowY !== null ? (
            <span className="nums absolute right-1.5 rounded-[5px] px-1 text-[11px] font-bold leading-4 text-accent" style={{ top: nowY - 8 }} data-testid="desk-now-time">
              {pad(Math.floor(clock.minutes / 60))}:{pad(clock.minutes % 60)}
            </span>
          ) : null}
        </div>

        {days.map((ymd, index) => (
          <DayColumn
            key={ymd}
            ymd={ymd}
            weekend={index >= 5}
            isToday={ymd === today}
            from={from}
            events={byDay.get(ymd) ?? []}
            marks={deadlines?.get(ymd) ?? []}
            now={now}
            nowY={ymd === clock.ymd ? nowY : null}
            meId={meId}
            onOpen={onOpen}
            creating={Boolean(onSlot)}
            onPress={pressDay(ymd)}
            onHover={hoverDay(ymd)}
            onLeave={() => setHover(null)}
            hover={hover?.ymd === ymd && !drag ? hover.minutes : null}
            ghost={drawn?.slot.ymd === ymd ? drawn : null}
          />
        ))}
      </div>
    </div>
  );
}

function DayHead({ ymd, index, today }: { ymd: Ymd; index: number; today: Ymd }) {
  const isToday = ymd === today;
  const past = ymd < today;
  return (
    <div className={`flex h-[52px] items-center gap-2 border-l border-border/70 px-2.5 ${isToday ? "bg-accent/[0.05]" : ""}`}>
      <span className={`text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] ${isToday ? "text-accent" : "text-muted"}`}>{WEEKDAYS_SHORT_RU[index]}</span>
      <span
        className={`nums flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-display text-[16px] font-bold leading-none ${
          isToday ? "bg-accent text-bg" : past ? "text-muted" : ""
        }`}
      >
        {parseYmd(ymd)!.day}
      </span>
    </div>
  );
}

function DayColumn({
  ymd,
  weekend,
  isToday,
  from,
  events,
  marks,
  now,
  nowY,
  meId,
  onOpen,
  creating,
  onPress,
  onHover,
  onLeave,
  hover,
  ghost,
}: {
  ymd: Ymd;
  weekend: boolean;
  isToday: boolean;
  from: number;
  events: CalendarEvent[];
  marks: DeadlineMark[];
  now: Date;
  nowY: number | null;
  meId: string;
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
  creating: boolean;
  onPress: (event: ReactMouseEvent<HTMLElement>) => void;
  onHover: (event: ReactMouseEvent<HTMLElement>) => void;
  onLeave: () => void;
  /** The half-hour under the resting mouse, in minutes; null — none here. */
  hover: number | null;
  ghost: { slot: Slot; title: string } | null;
}) {
  const placed = layoutDay(events);
  // marks stack downwards when two deadlines share an hour
  // the first line of a mark — its diamond and time — sits on the hour it is due
  const tops = stackTops(
    marks.map((mark) => yOf(mark.minutes, from) - 9),
    MARK_H + MARK_GAP,
  );
  const stacked = marks.map((mark, index) => ({ mark, top: tops[index] }));

  return (
    <section
      aria-label={ymd}
      data-testid="desk-week-day"
      className={`relative min-w-0 select-none border-l border-border/70 ${isToday ? "bg-accent/[0.04]" : weekend ? "bg-surface/40" : ""}`}
      onMouseDown={creating ? onPress : undefined}
      onMouseMove={creating ? onHover : undefined}
      onMouseLeave={creating ? onLeave : undefined}
      style={{
        // the hour lines: one hairline at the top of every hour
        backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--border) 62%, transparent) 1px, transparent 1px)",
        backgroundSize: `100% ${HOUR_PX}px`,
      }}
    >
      {hover !== null ? (
        <span
          aria-hidden
          className="nums pointer-events-none absolute inset-x-[3px] z-[5] flex items-start rounded-[7px] px-2 pt-1 text-[11px] font-semibold leading-4 text-accent/80"
          style={{ top: yOf(hover, from) + 1, height: HOUR_PX / 2 - 2, background: "color-mix(in srgb, var(--accent) 7%, transparent)" }}
          data-testid="desk-slot-hint"
        >
          + {hmAt(hover)}
        </span>
      ) : null}
      {placed.map((item) => (
        <HourEvent key={item.event.id} item={item} from={from} now={now} meId={meId} onOpen={onOpen} />
      ))}
      {ghost ? <Ghost slot={ghost.slot} title={ghost.title} from={from} /> : null}
      {stacked.map(({ mark, top }) => (
        <DeadlineChip key={mark.id} mark={mark} top={top} />
      ))}
      {nowY !== null ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowY }} data-testid="desk-now-line">
          <span className="absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg)]" />
          <span className="absolute inset-x-0 -top-px h-[2px] bg-accent" />
        </div>
      ) : null}
    </section>
  );
}

/** The one word a meeting owes this person: an answer still to give. */
function owesAnswer(event: CalendarEvent, meId: string, now: Date): boolean {
  return event.author_id !== meId && !isOver(event, now) && myStatus(event, meId) === "invited";
}

/** Who comes, as neutral initials: the ones who have not refused, three and «+N». */
function Faces({ event }: { event: CalendarEvent }) {
  const names = event.participants.filter((p) => p.status !== "declined").map((p) => p.person?.full_name ?? "");
  if (names.length === 0) return null;
  return (
    <span className="flex items-center" title={names.filter(Boolean).join(", ")}>
      {names.slice(0, FACES).map((name, index) => (
        <span
          key={`${name}-${index}`}
          aria-hidden
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface-2 font-display text-[8px] font-bold leading-none text-text/85 shadow-[0_0_0_1.5px_var(--surface)] ${index > 0 ? "-ml-1" : ""}`}
        >
          {name ? initialsOf(name) : "•"}
        </span>
      ))}
      {names.length > FACES ? <span className="nums ml-1 text-[10px] font-semibold leading-4 text-muted">+{names.length - FACES}</span> : null}
    </span>
  );
}

/** A meeting on the grid: when, what, who — the rail in the colour of its moment. */
function HourEvent({ item, from, now, meId, onOpen }: { item: Placed; from: number; now: Date; meId: string; onOpen: (event: CalendarEvent, element: HTMLElement) => void }) {
  const { event } = item;
  const over = isOver(event, now);
  const running = isRunning(event, now);
  const owes = owesAnswer(event, meId, now);
  const tone = toneAhead(event, now);
  const top = yOf(item.start, from) + 1;
  const height = Math.max(20, ((item.end - item.start) * HOUR_PX) / 60 - 2);
  const narrow = item.lanes > 1;
  const compact = height < 38;
  const tall = height >= 76;
  // the title takes the lines the block has left after the time and the faces
  const titleLines = Math.max(1, Math.floor((height - 8 - 16 - (tall ? 24 : 0)) / 16));
  const style: CSSProperties = {
    top,
    height,
    left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
    width: `calc(${100 / item.lanes}% - ${item.lanes > 1 ? 3 : 6}px)`,
    background: running ? "color-mix(in srgb, var(--accent) 10%, var(--surface-2))" : over ? "color-mix(in srgb, var(--surface) 70%, transparent)" : "var(--surface-2)",
  };

  return (
    <button
      type="button"
      onClick={(click) => onOpen(event, click.currentTarget)}
      data-testid="desk-event"
      data-event-id={event.id}
      title={`${timeRange(event)} · ${event.title}${event.location ? ` · ${event.location}` : ""}`}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-[8px] border border-border/80 py-1 pl-2.5 ${narrow ? "pr-1" : "pr-1.5"} text-left shadow-[0_1px_0_rgba(0,0,0,.25)] transition-[border-color,filter] duration-[120ms] hover:border-muted/60 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        over ? "text-muted" : ""
      }`}
      style={style}
    >
      <span aria-hidden className="absolute inset-y-1 left-[3px] w-[3px] rounded-full" style={{ background: TONE_VAR[tone], opacity: over ? 0.35 : 1 }} />
      {owes ? <span aria-label="нужен ответ" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)" }} /> : null}
      {compact ? (
        <span className="truncate pr-2 text-[12px] leading-4">
          <span className="nums text-muted">{hhmm(event.starts_at)}</span> <span className="font-semibold">{event.title}</span>
        </span>
      ) : (
        <>
          <span className={`text-[12px] font-semibold leading-4 ${narrow ? "pr-0.5" : "pr-2"}`} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: titleLines, overflow: "hidden" }}>
            {event.title}
          </span>
          <span className="nums mt-0.5 truncate text-[11px] leading-4 text-muted">
            {timeRange(event)}
            {event.location ? ` · ${event.location}` : ""}
          </span>
          {tall ? (
            <span className="mt-auto flex min-h-[20px] items-center justify-between gap-1 pt-1">
              <Faces event={event} />
              {owes ? <span className="truncate text-[10px] font-semibold leading-4 text-warn">нужен ответ</span> : null}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

/** The meeting being made: where it will stand, the title as it is typed, the time it takes. */
function Ghost({ slot, title, from }: { slot: Slot; title: string; from: number }) {
  const top = yOf(slot.start, from) + 1;
  const height = Math.max(20, ((slot.end - slot.start) * HOUR_PX) / 60 - 2);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-[3px] z-[25] flex flex-col overflow-hidden rounded-[8px] border px-2 py-1"
      style={{
        top,
        height,
        background: "color-mix(in srgb, var(--accent) 16%, var(--surface-2))",
        borderColor: "color-mix(in srgb, var(--accent) 60%, transparent)",
        boxShadow: "0 6px 18px -8px rgba(0,0,0,.6)",
      }}
      data-testid="desk-slot-ghost"
    >
      <span className="truncate text-[12px] font-semibold leading-4">{title.trim() || "Новое мероприятие"}</span>
      <span className="nums truncate text-[11px] leading-4 text-text/70">
        {hmAt(slot.start)}–{hmAt(slot.end)}
      </span>
    </div>
  );
}

const MARK_STYLE: Record<DeadlineMark["tone"], { background: string; border: string; time: string; glyph: string }> = {
  danger: {
    background: "color-mix(in srgb, var(--danger) 14%, var(--bg))",
    border: "color-mix(in srgb, var(--danger) 45%, transparent)",
    time: "var(--danger)",
    glyph: "var(--danger)",
  },
  warn: {
    background: "color-mix(in srgb, var(--warn) 13%, var(--bg))",
    border: "color-mix(in srgb, var(--warn) 42%, transparent)",
    time: "var(--warn)",
    glyph: "var(--warn)",
  },
  muted: {
    background: "color-mix(in srgb, var(--surface-2) 92%, var(--bg))",
    border: "var(--border)",
    time: "var(--text-muted)",
    glyph: "var(--text-muted)",
  },
};

/** «◆ 18:00 Айгуль · Смета» — an order due at this hour; a click opens it in «Задачи». */
function DeadlineChip({ mark, top }: { mark: DeadlineMark; top: number }) {
  const style = MARK_STYLE[mark.tone];
  const who = mark.who ? shortName(mark.who) : `${mark.count} чел.`;
  const state = mark.tone === "danger" ? "просрочено" : mark.tone === "warn" ? "срок сегодня" : "срок";
  return (
    <Link
      href={`/desk/tasks?id=${mark.id}`}
      data-testid="desk-deadline"
      data-tone={mark.tone}
      title={`${state} ${mark.time} · ${mark.who ?? `${mark.count} человек`} · ${mark.title}`}
      className="absolute inset-x-[3px] z-[15] flex flex-col justify-center overflow-hidden rounded-[7px] border px-1.5 text-[11px] leading-[14px] shadow-[0_1px_0_rgba(0,0,0,.3)] transition-[filter] duration-[120ms] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      style={{ top, height: MARK_H, background: style.background, borderColor: style.border }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rotate-45 rounded-[1px]" style={{ background: style.glyph }} />
        <span className="nums shrink-0 font-semibold" style={{ color: style.time }}>
          {mark.time}
        </span>
        <span className="min-w-0 truncate font-medium text-text/90">{who}</span>
      </span>
      <span className="truncate pl-[13px] text-text/75">{mark.title}</span>
    </Link>
  );
}
