"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";

import { Popover } from "@/components/desk/ui/Popover";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { hhmm, timeRange } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { humanYmd, parseYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import { busyMinutes, type BusyBlock } from "@/lib/desk/busy";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import { loudest, type DeadlineMark } from "./deadlines";
import { Faces } from "./Faces";
import { hmAt, minutesAt, SNAP_MIN, slotOf, type Slot } from "./slots";
import { meetingState, type MeetingState } from "./state";
import { fitMarks, HOUR_PX, hourRange, layoutDay, wallOf, yOf, type Placed } from "./week";

/** Names on a meeting before «+N». */
const NAMES = 3;
/** The height of a deadline's mark (two lines: when and who, then what), and the gap between two stacked. */
const MARK_H = 34;
const MARK_GAP = 2;
/** «+N» under the marks that fit. */
const MORE_H = 20;
/** A block of the director's busy time this tall holds its hours under the words. */
const BUSY_TWO_LINES = 38;
/** The time column on the left. */
const GUTTER = 52;
/** An hour's label gives way to the clock of now when they would touch. */
const NOW_LABEL_ROOM_MIN = 20;

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
  /** The secretary's layer: when the director is busy, nothing about what with; null — not hers. */
  busy: Map<Ymd, BusyBlock[]> | null;
  /** The meeting whose card is open: its block stands raised over the grid. */
  openId: string | null;
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
 * The week as hours (D-154, D-174): a living week — a column a day under its date, the hours
 * 08:00–20:00 down the left (wider when a meeting or a deadline on screen lies outside), today's
 * column lit and its date stamped, the time already gone a shade darker, the line of now across
 * the week (bold in today's column, its clock in the margin) gliding on as the minutes go. A
 * meeting is a block where the clock puts it, as tall as it lasts, in the colour of what it is to
 * this person (`meetingState`): ahead, on now, waiting for an answer, refused, over; the open one
 * stands raised. Meetings that overlap stand side by side. An empty week still shows its hours —
 * the structure of the days to fill. Deadlines are chips on the sheet, stacked from their hours;
 * what does not fit goes behind «+N», a list beside the day. For the secretary the director's busy
 * time is a hatched stretch under her own meetings, without a word about them.
 */
export function WeekHours({ days, byDay, today, now, meId, onOpen, deadlines, onSlot, ghost, busy, openId }: Props) {
  const events = days.flatMap((ymd) => byDay.get(ymd) ?? []);
  const marks = deadlines ? days.flatMap((ymd) => deadlines.get(ymd) ?? []) : [];
  const { from, to } = hourRange(events, [...marks.map((mark) => mark.minutes), ...(busy ? busyMinutes(busy) : [])]);
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
  const onEmpty = (event: ReactMouseEvent<HTMLElement>) => !(event.target as Element).closest("[data-testid=desk-event], [data-testid=desk-deadline], [data-testid=desk-deadline-more]");

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
    <div className="cal-week min-w-0 overflow-clip border-t border-text" data-testid="desk-calendar-week" data-hours={`${from}-${to}`}>
      <div className="cal-week-head sticky top-0 z-30 grid border-b border-text bg-bg" style={{ gridTemplateColumns: COLUMNS }}>
        <span aria-hidden />
        {days.map((ymd, index) => (
          <DayHead key={ymd} ymd={ymd} index={index} today={today} count={(byDay.get(ymd) ?? []).length} />
        ))}
      </div>

      <div ref={body} className="cal-week-body relative grid" style={{ gridTemplateColumns: COLUMNS, height }} data-testid="desk-week-hours">
        <div aria-hidden className="cal-gutter relative">
          {hours.map((hour) => {
            // the last line is the grid's edge; an hour near the clock of now gives way to it
            if (hour === to) return null;
            if (nowY !== null && Math.abs(clock.minutes - hour * 60) < NOW_LABEL_ROOM_MIN) return null;
            return (
              <span key={hour} className="cal-hour nums absolute right-2 text-[11px] leading-4 text-muted" style={{ top: hour === from ? 3 : yOf(hour * 60, from) - 8 }}>
                {pad(hour)}:00
              </span>
            );
          })}
          {nowY !== null ? (
            // moved by a transform: the clock glides to its next minute, the hours around it stay put
            <span className="cal-now-time nums absolute right-1.5 top-0 text-[11px] leading-4 text-text" style={{ transform: `translateY(${nowY - 8}px)` }} data-testid="desk-now-time">
              {pad(Math.floor(clock.minutes / 60))}:{pad(clock.minutes % 60)}
            </span>
          ) : null}
        </div>

        {days.map((ymd, index) => (
          <DayColumn
            key={ymd}
            ymd={ymd}
            index={index}
            today={today}
            from={from}
            height={height}
            events={byDay.get(ymd) ?? []}
            marks={deadlines?.get(ymd) ?? []}
            busy={busy?.get(ymd) ?? []}
            now={now}
            nowY={ymd === clock.ymd ? nowY : null}
            meId={meId}
            onOpen={onOpen}
            openId={openId}
            creating={Boolean(onSlot)}
            onPress={pressDay(ymd)}
            onHover={hoverDay(ymd)}
            onLeave={() => setHover(null)}
            hover={hover?.ymd === ymd && !drag ? hover.minutes : null}
            ghost={drawn?.slot.ymd === ymd ? drawn : null}
          />
        ))}

        {/* now across the whole week, faint: the days around today are read against the same minute */}
        {nowY !== null ? <span aria-hidden className="cal-now-week pointer-events-none absolute right-0 top-0 z-[4]" style={{ left: GUTTER, transform: `translateY(${nowY}px)` }} /> : null}
      </div>
    </div>
  );
}

function DayHead({ ymd, index, today, count }: { ymd: Ymd; index: number; today: Ymd; count: number }) {
  const isToday = ymd === today;
  const past = ymd < today;
  return (
    <div
      className="cal-day-head flex h-10 items-center gap-2 border-l border-border/60 px-2"
      data-today={isToday ? "" : undefined}
      data-past={past ? "" : undefined}
      data-weekend={index >= 5 ? "" : undefined}
      title={count > 0 ? `${count} ${pluralRu(count, ["встреча", "встречи", "встреч"])}` : undefined}
    >
      <span className="desk-label uppercase">{WEEKDAYS_SHORT_RU[index]}</span>
      {/* today is a date stamped in print: the one solid mark on the head of the week */}
      <span className={`nums desk-figure flex h-6 min-w-6 items-center justify-center px-1 text-[17px] leading-none ${isToday ? "desk-today" : past ? "text-muted" : ""}`}>{parseYmd(ymd)!.day}</span>
    </div>
  );
}

function DayColumn({
  ymd,
  index,
  today,
  from,
  height,
  events,
  marks,
  busy,
  now,
  nowY,
  meId,
  onOpen,
  openId,
  creating,
  onPress,
  onHover,
  onLeave,
  hover,
  ghost,
}: {
  ymd: Ymd;
  /** 0 = Monday: the weekend is shaded, the blocks of a day arrive a beat after the day before. */
  index: number;
  today: Ymd;
  from: number;
  /** The grid's height, the foot the marks must stay above. */
  height: number;
  events: CalendarEvent[];
  marks: DeadlineMark[];
  busy: BusyBlock[];
  now: Date;
  nowY: number | null;
  meId: string;
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
  openId: string | null;
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
  const fit = fitMarks(
    marks.map((mark) => yOf(mark.minutes, from) - 9),
    MARK_H + MARK_GAP,
    MARK_H,
    MORE_H,
    height,
  );

  return (
    <section
      aria-label={ymd}
      data-testid="desk-week-day"
      className="cal-day relative min-w-0 select-none border-l border-border/60"
      data-today={ymd === today ? "" : undefined}
      data-past={ymd < today ? "" : undefined}
      data-weekend={index >= 5 ? "" : undefined}
      onMouseDown={creating ? onPress : undefined}
      onMouseMove={creating ? onHover : undefined}
      onMouseLeave={creating ? onLeave : undefined}
      style={
        {
          // the hour lines: one hairline at the top of every hour
          backgroundImage: "linear-gradient(to bottom, var(--rule-soft) 1px, transparent 1px)",
          backgroundSize: `100% ${HOUR_PX}px`,
          "--day": index,
        } as CSSProperties
      }
    >
      {/* the part of today already gone, a shade darker — scaled, not resized, as the minutes go */}
      {nowY !== null ? <span aria-hidden className="cal-gone pointer-events-none absolute inset-x-0 top-0" style={{ height, transform: `scaleY(${Math.max(0, Math.min(1, nowY / height))})` }} /> : null}
      {hover !== null ? (
        <span
          aria-hidden
          className="cal-slot-hint nums pointer-events-none absolute inset-x-[3px] z-[5] flex items-start px-2 pt-1 text-[11px] leading-4 text-accent"
          style={{ top: yOf(hover, from) + 1, height: HOUR_PX / 2 - 2, background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}
          data-testid="desk-slot-hint"
        >
          + {hmAt(hover)}
        </span>
      ) : null}
      {busy.map((block) => (
        <DirectorBusy key={block.start} block={block} from={from} />
      ))}
      {placed.map((item) => (
        <HourEvent key={item.event.id} item={item} from={from} now={now} meId={meId} onOpen={onOpen} open={item.event.id === openId} />
      ))}
      {ghost ? <Ghost slot={ghost.slot} title={ghost.title} from={from} /> : null}
      {marks.slice(0, fit.shown).map((mark, index) => (
        <DeadlineChip key={mark.id} mark={mark} top={fit.tops[index]} />
      ))}
      {fit.moreTop !== null ? <DeadlinesMore marks={marks.slice(fit.shown)} top={fit.moreTop} ymd={ymd} now={now} /> : null}
      {nowY !== null ? (
        <div aria-hidden className="cal-now pointer-events-none absolute inset-x-0 top-0 z-20" style={{ transform: `translateY(${nowY}px)` }} data-testid="desk-now-line">
          <span className="desk-now absolute inset-x-0 -top-px h-[2px]" />
          <span className="cal-now-dot" />
        </div>
      ) : null}
    </section>
  );
}

/** The director's busy time for the secretary: a hatched stretch under her own meetings, and nothing about it but the hours. */
function DirectorBusy({ block, from }: { block: BusyBlock; from: number }) {
  const height = Math.max(20, ((block.end - block.start) * HOUR_PX) / 60 - 2);
  return (
    <div
      className="desk-busy cal-busy pointer-events-none absolute inset-x-[3px] z-[5] overflow-hidden px-2 py-1 text-[11px] leading-4 text-muted"
      style={{ top: yOf(block.start, from) + 1, height }}
      data-testid="desk-director-busy"
    >
      <span className="block w-fit max-w-full truncate bg-bg pr-1 font-medium">Директор занят</span>
      {height >= BUSY_TWO_LINES ? (
        <span className="nums block w-fit max-w-full truncate bg-bg pr-1">
          {hmAt(block.start)}–{hmAt(block.end)}
        </span>
      ) : null}
    </div>
  );
}

/** What the state says in words, for a screen reader and the hint: the colour says it to the eye. */
const STATE_WORDS: Partial<Record<MeetingState, string>> = {
  running: "идёт",
  owes: "нужен ответ",
  declined: "вы не сможете",
  over: "прошла",
};

/** Who comes, in words: the ones who have not refused, three names and «+N». */
function Who({ event }: { event: CalendarEvent }) {
  const names = event.participants.filter((p) => p.status !== "declined").flatMap((p) => (p.person?.full_name ? [p.person.full_name] : []));
  if (names.length === 0) return null;
  return (
    <span className="cal-who min-w-0 truncate text-[11px] leading-4 text-muted" title={names.join(", ")}>
      {names.slice(0, NAMES).map((name) => shortName(name)).join(", ")}
      {names.length > NAMES ? ` +${names.length - NAMES}` : ""}
    </span>
  );
}

/**
 * A meeting on the grid: what, when, who — a block in the colour of what it is to this person (a
 * rail on its left and a wash of the same colour), the faces of who comes once it is tall enough.
 * The open one (`open`) stands raised while its card is beside it.
 */
function HourEvent({ item, from, now, meId, onOpen, open }: { item: Placed; from: number; now: Date; meId: string; onOpen: (event: CalendarEvent, element: HTMLElement) => void; open: boolean }) {
  const { event } = item;
  const state = meetingState(event, meId, now);
  const words = STATE_WORDS[state];
  const top = yOf(item.start, from) + 1;
  const height = Math.max(20, ((item.end - item.start) * HOUR_PX) / 60 - 2);
  // on each line, not on the block: the block's second column must start past its edge, out of sight
  const edge = item.lanes > 1 ? "pr-1" : "pr-1.5";
  const compact = height < 38;
  const tall = height >= 76;
  // the words matter more than the time, which the grid already says: a short title leaves room for
  // it, a long one takes it (the block's column wraps: what does not fit leaves whole, not half a line)
  const titleLines = Math.max(1, Math.floor((height - 8 - (tall ? 22 : 0)) / 16));
  const style: CSSProperties = {
    top,
    height,
    left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
    width: `calc(${100 / item.lanes}% - ${item.lanes > 1 ? 3 : 6}px)`,
  };

  return (
    <button
      type="button"
      onClick={(click) => onOpen(event, click.currentTarget)}
      data-testid="desk-event"
      data-event-id={event.id}
      data-state={state}
      data-open={open ? "" : undefined}
      aria-expanded={open}
      title={`${timeRange(event)} · ${event.title}${event.location ? ` · ${event.location}` : ""}${words ? ` · ${words}` : ""}`}
      className="cal-event absolute z-10 flex flex-col flex-wrap content-start overflow-hidden border border-l-2 border-border/60 py-1 pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      style={style}
    >
      {words ? <span className="sr-only">{words}</span> : null}
      {compact ? (
        <span className={`w-full truncate ${edge} text-[12px] leading-4`}>
          <When className="cal-event-time">{hhmm(event.starts_at)}</When> <span className="cal-event-title font-semibold">{event.title}</span>
        </span>
      ) : (
        <>
          <span className={`cal-event-title w-full ${edge} text-[12px] font-semibold leading-4`} style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: titleLines, overflow: "hidden" }}>
            {event.title}
          </span>
          <span className={`cal-event-time w-full truncate ${edge} text-[11px] leading-4`}>
            <When>{timeRange(event)}</When>
            {event.location ? ` · ${event.location}` : ""}
          </span>
          {tall ? (
            <span className={`mt-auto flex min-h-[20px] w-full ${edge} items-center justify-between gap-1`}>
              <Faces event={event} size={18} max={4} className="cal-event-faces" />
              <Who event={event} />
              {state === "owes" ? <span aria-hidden className="cal-event-ask shrink-0 text-[11px] font-medium leading-4 text-warn">нужен ответ</span> : null}
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
      className="cal-ghost pointer-events-none absolute inset-x-[3px] z-[25] flex flex-col overflow-hidden border border-l-2 border-accent bg-surface px-2 py-1"
      style={{ top, height }}
      data-testid="desk-slot-ghost"
    >
      <span className="truncate text-[12px] font-semibold leading-4">{title.trim() || "Новая встреча"}</span>
      <span className="nums truncate text-[11px] leading-4 text-muted">
        {hmAt(slot.start)}–{hmAt(slot.end)}
      </span>
    </div>
  );
}

/** A deadline's ink: the red of the pencil once it is late; today's in print, any other day's quiet. */
const MARK_INK: Record<DeadlineMark["tone"], string> = {
  danger: "var(--danger)",
  warn: "var(--text)",
  muted: "var(--text-muted)",
};

const markWho = (mark: DeadlineMark) => (mark.who ? shortName(mark.who) : `${mark.count} чел.`);

function markTitle(mark: DeadlineMark): string {
  const state = mark.tone === "danger" ? "просрочено" : mark.tone === "warn" ? "срок сегодня" : "срок";
  return `${state} ${mark.time} · ${mark.who ?? `${mark.count} человек`} · ${mark.title}`;
}

/** ↑/↓ walk the list; the calendar's own keys (arrows, letters) wait until it is closed. */
function walkLinks(event: ReactKeyboardEvent<HTMLElement>) {
  event.stopPropagation();
  if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return;
  event.preventDefault();
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>("a")];
  const at = links.indexOf(document.activeElement as HTMLElement);
  links[(at + (event.code === "ArrowDown" ? 1 : links.length - 1)) % links.length]?.focus();
}

/** «+5» under the marks that fit: the rest of the day's deadlines in a list, each opens its task. */
function DeadlinesMore({ marks, top, ymd, now }: { marks: DeadlineMark[]; top: number; ymd: Ymd; now: Date }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ink = MARK_INK[loudest(marks)];
  const count = `${marks.length} ${pluralRu(marks.length, ["срок", "срока", "сроков"])}`;
  const close = () => {
    anchor?.focus({ preventScroll: true });
    setAnchor(null);
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-label={`Ещё ${count}`}
        title={`Ещё ${count}`}
        onClick={(click) => setAnchor(anchor ? null : click.currentTarget)}
        data-testid="desk-deadline-more"
        data-tone={loudest(marks)}
        className="cal-mark cal-mark-more absolute inset-x-[3px] z-[15] flex items-center gap-1.5 overflow-hidden bg-bg px-1 text-[11px] leading-[14px] transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        style={{ top, height: MORE_H }}
      >
        <span aria-hidden className="h-[6px] w-[6px] shrink-0 rotate-45" style={{ background: ink }} />
        <span className="nums" style={{ color: ink }}>
          +{marks.length}
        </span>
      </button>
      <Popover open={Boolean(anchor)} onClose={close} anchor={anchor} width={320} label={`Ещё ${count}`}>
        <div className="flex max-h-[min(420px,70vh)] flex-col" onKeyDown={walkLinks} data-testid="desk-deadline-list">
          <SectionLabel count={marks.length} className="px-3 pt-1.5">
            Ещё сроки · {humanYmd(ymd, now)}
          </SectionLabel>
          <div className="min-h-0 overflow-y-auto py-1">
            {marks.map((mark, index) => (
              <Link
                key={mark.id}
                href={`/desk/tasks?id=${mark.id}`}
                title={markTitle(mark)}
                onClick={() => setAnchor(null)}
                data-autofocus={index === 0 ? "" : undefined}
                data-testid="desk-deadline-item"
                className="flex h-8 min-w-0 items-center gap-2 px-3 text-[13px] leading-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <span aria-hidden className="h-[6px] w-[6px] shrink-0 rotate-45" style={{ background: MARK_INK[mark.tone] }} />
                <When overdue={mark.tone === "danger"} className={`shrink-0 ${mark.tone === "muted" ? "text-muted" : ""}`}>
                  {mark.time}
                </When>
                <span className="shrink-0 font-medium">{markWho(mark)}</span>
                <span className="min-w-0 truncate text-muted">{mark.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

/** «◆ 18:00 Айгуль · Смета» — an order due at this hour, words on the sheet; a click opens it in «Задачи». */
function DeadlineChip({ mark, top }: { mark: DeadlineMark; top: number }) {
  const ink = MARK_INK[mark.tone];
  return (
    <Link
      href={`/desk/tasks?id=${mark.id}`}
      data-testid="desk-deadline"
      data-tone={mark.tone}
      title={markTitle(mark)}
      className="cal-mark absolute inset-x-[3px] z-[15] flex flex-col justify-center overflow-hidden bg-bg px-1 text-[11px] leading-[14px] transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      style={{ top, height: MARK_H }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className="h-[6px] w-[6px] shrink-0 rotate-45" style={{ background: ink }} />
        <When overdue={mark.tone === "danger"} className={`shrink-0 ${mark.tone === "muted" ? "text-muted" : ""}`}>
          {mark.time}
        </When>
        <span className="min-w-0 truncate font-medium">{markWho(mark)}</span>
      </span>
      <span className="truncate pl-3 text-muted">{mark.title}</span>
    </Link>
  );
}
