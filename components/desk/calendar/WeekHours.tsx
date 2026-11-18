"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import { Popover } from "@/components/desk/ui/Popover";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { hhmm, ymdOfEvent } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { humanYmd, parseYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";

import { loudest, markBand, markWords, type DeadlineMark } from "./deadlines";
import { Faces } from "./Faces";
import { ahead, earliest, hmAt, minutesAt, movedTo, SNAP_MIN, slotOf, type Slot } from "./slots";
import { answersOf, meetingState, type MeetingState } from "./state";
import {
  bandsOf,
  clockOf,
  columnsOf,
  DAY_FROM,
  DAY_TO,
  dayShares,
  fitMarks,
  HOUR_PX,
  hourPxFor,
  isoWeekday,
  layoutDay,
  spanOf,
  wallOf,
  yOf,
  type Placed,
} from "./week";

/** The time column on the left. */
const GUTTER = 56;
/** The thin rows before 08:00 and after 20:00; a day narrower than this shows only the hour of a chip. */
const OFF_H = 28;
const OFF_NARROW = 84;
/** A day narrower than this shows its date without the weekday. */
const HEAD_NARROW = 56;
/** Room kept under the week's card when the hours are fitted to the screen. */
const FOOT = 20;
/** An hour's label gives way to the clock of now when they would touch. */
const NOW_LABEL_ROOM_MIN = 20;
/** Names on a meeting before «+N» (the print look, where faces are words). */
const NAMES = 3;

/** A block is never shorter than one line of its title. */
const LINE_PX = 20;
/** From this height a block has its title and its time on two lines; from the next — a title of several. */
const TWO_PX = 34;
const FULL_PX = 50;
/** From this height a foot under the title: the faces of who comes (from 120 px of width), or the answer's word. */
const FACES_PX = 62;
const FACES_W = 120;
const TAG_W = 96;
/** Narrower or shorter than this a block keeps its colour rail only, its words in the hint. */
const BAR_W = 36;
const SLIVER_PX = 14;

/** The rail of deadlines on a day's right edge: narrow — ◆ over the hour; a focused day — «◆ 18:00» in a line. */
const RAIL = { narrow: 22, wide: 46 } as const;
const MARK = { narrow: { h: 28, step: 30 }, wide: { h: 18, step: 20 } } as const;
/** «+N» under the marks that fit. */
const MORE_H = 20;

/** A press that moved less than this is a click; a meeting needs a little more to start moving. */
const DRAG_PX = 4;
const MOVE_PX = 6;

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: DAY_TO - DAY_FROM }, (_, index) => DAY_FROM + index);
const EMPTY_EVENTS: CalendarEvent[] = [];
const EMPTY_MARKS: DeadlineMark[] = [];

type Props = {
  days: Ymd[];
  /** The meetings of the days on screen, by day, in order. */
  byDay: Map<Ymd, CalendarEvent[]>;
  today: Ymd;
  now: Date;
  meId: string;
  /** The day drawn wide (2.2 shares); null — every working day alike. */
  focusDay: Ymd | null;
  /** The company's working days, 1 = Monday … 7 = Sunday (`settings.workdays`): the rest are narrow. */
  workdays: readonly number[];
  /** A click on a day's date: that day wide. */
  onFocusDay: (ymd: Ymd) => void;
  /** A meeting's block (or chip) was clicked, or Enter on it: the meeting opens in the side. */
  onOpen: (event: CalendarEvent) => void;
  /** «Сроки задач» while the layer is on; null — off. */
  deadlines: Map<Ymd, DeadlineMark[]> | null;
  /**
   * The director's mouse makes meetings: a click or a drag over an empty stretch hands the slot
   * here with the element of the new meeting's block (`cal-ghost`) — the quick card's anchor; null
   * — the grid only shows.
   */
  onSlot: ((slot: Slot, element: HTMLElement) => void) | null;
  /** The meeting being made — drawn where it will stand, with its title as typed. */
  ghost: { slot: Slot; title: string } | null;
  /** The director drags his own meeting ahead to another time: its new start and end; null — no drag. */
  onMove: ((event: CalendarEvent, start: Date, end: Date) => void) | null;
  /** The meeting open in the side: its block stands raised over the grid. */
  openId: string | null;
};

/** A meeting being dragged: where the hand took it, and where it would land now. */
type MoveState = { event: CalendarEvent; x0: number; y0: number; grab: number; moved: boolean; ymd: Ymd; minutes: number };

/**
 * The hour's height for the room under the grid's top: the twelve working hours fit the window
 * (1280×800, 1440×900, 1920×1080) — measured by layout offsets, so a sliding week does not fool it.
 */
function useGridBox(body: RefObject<HTMLDivElement | null>): { hourPx: number; width: number } {
  const [box, setBox] = useState({ hourPx: HOUR_PX, width: 0 });
  const current = useRef(box);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const scroller = node.closest<HTMLElement>("#desk-main");
    const measure = () => {
      let top = 0;
      let at: HTMLElement | null = node;
      while (at && at !== scroller) {
        top += at.offsetTop;
        at = at.offsetParent as HTMLElement | null;
      }
      const next = { hourPx: hourPxFor((scroller ? scroller.clientHeight : window.innerHeight) - top - OFF_H - FOOT), width: node.clientWidth };
      if (next.hourPx === current.current.hourPx && next.width === current.current.width) return;
      current.current = next;
      // the observer answers after layout and before paint: drawn now, the grid never shows a wrong hour
      flushSync(() => setBox(next));
    };
    // the window, the grid's own width (the side may give way), the page around it (the head may grow)
    const observer = new ResizeObserver(measure);
    observer.observe(scroller ?? document.documentElement);
    observer.observe(node);
    const page = node.closest<HTMLElement>(".desk-page");
    if (page) observer.observe(page);
    return () => observer.disconnect();
  }, [body]);
  return box;
}

/** A block's width in pixels from its day's width and its place (`across`), for the tiers by width. */
function widthOf(item: Placed, area: number): number {
  if (area <= 0) return Number.POSITIVE_INFINITY;
  const step = item.depths > 0 ? Math.min(16, Math.max(0, (area - 56) / item.depths)) : 0;
  return (area - step * item.depth) / item.lanes - 4;
}

/**
 * The week as hours (D-154, D-174, D-180): a column a day under its date, the working hours
 * 08:00–20:00 down the left — fitted to the screen, never stretched: what lies before or after
 * them is a chip in a thin row of its own («до 8», «после 20»). The day the director looks at
 * (`focusDay`, a click on its date) is drawn wide, a day off narrow — by settings and focus, never
 * by the meetings, so a live insert moves nothing. Today's column is lit, its time already gone a
 * shade darker, the line of now under the blocks with its dot over them. A meeting is a block
 * where the clock puts it, its title first, in the colour of what it is to this person
 * (`meetingState`); two at once stand side by side, three and more cascade (`layoutDay`). The
 * author's block says who refused. Deadlines (`D`) are a rail of ◆ on each day's right edge —
 * the meetings give it its width, nothing lies over a block. The director's mouse makes a meeting
 * by a click or a drag on an empty stretch and moves his own meeting ahead by dragging its block.
 */
export function WeekHours({ days, byDay, today, now, meId, focusDay, workdays, onFocusDay, onOpen, deadlines, onSlot, ghost, onMove, openId }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const { hourPx, width } = useGridBox(body);
  const height = (DAY_TO - DAY_FROM) * hourPx;
  const shares = dayShares(days, focusDay, workdays);
  const columns = columnsOf(GUTTER, shares);
  const shareSum = shares.reduce((sum, share) => sum + share, 0);
  const work = new Set(workdays);

  const clock = wallOf(now.getTime());
  const nowShown = days.includes(clock.ymd) && clock.minutes >= DAY_FROM * 60 && clock.minutes <= DAY_TO * 60;
  const nowY = nowShown ? yOf(clock.minutes, DAY_FROM, hourPx) : null;

  // each day: its meetings by the part of the day they are drawn in, its deadlines likewise
  const parts = days.map((ymd, index) => {
    const bands = bandsOf(byDay.get(ymd) ?? EMPTY_EVENTS);
    const marks = deadlines?.get(ymd) ?? EMPTY_MARKS;
    const focused = ymd === focusDay;
    return {
      ymd,
      focused,
      // the day's width in pixels (0 — not measured yet): what fits in a block is decided by it
      px: width > 0 && shareSum > 0 ? ((width - GUTTER) * shares[index]) / shareSum : 0,
      bands,
      marks: {
        early: marks.filter((mark) => markBand(mark) === "early"),
        day: marks.filter((mark) => markBand(mark) === "day"),
        late: marks.filter((mark) => markBand(mark) === "late"),
      },
      rail: deadlines ? (focused ? RAIL.wide : RAIL.narrow) : 0,
    };
  });

  // a press on an empty stretch of a day: where it went down, where the mouse is now
  const [drag, setDrag] = useState<{ ymd: Ymd; down: number; at: number; moved: boolean; y0: number } | null>(null);
  // the half-hour under a resting mouse: «+ 14:30» says a click makes a meeting there
  const [hover, setHover] = useState<{ ymd: Ymd; minutes: number } | null>(null);
  // the director's own meeting on its way to another time
  const [move, setMove] = useState<MoveState | null>(null);
  const dragRef = useRef(drag);
  const moveRef = useRef(move);
  const slotRef = useRef(onSlot);
  const moveCb = useRef(onMove);
  const pxRef = useRef(hourPx);
  const ghostRef = useRef<HTMLDivElement>(null);
  // the click that ends a drag of a block is not a click on it
  const dragged = useRef(false);
  useEffect(() => {
    dragRef.current = drag;
    moveRef.current = move;
    slotRef.current = onSlot;
    moveCb.current = onMove;
    pxRef.current = hourPx;
  });

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const columnOf = (ymd: Ymd) => body.current?.querySelector<HTMLElement>(`[data-testid=desk-week-day][aria-label="${ymd}"]`) ?? null;
    const onMouse = (event: MouseEvent) => {
      const current = dragRef.current;
      const column = current ? columnOf(current.ymd) : null;
      if (!current || !column) return;
      const moved = current.moved || Math.abs(event.clientY - current.y0) > DRAG_PX;
      setDrag({ ...current, at: minutesAt(event.clientY - column.getBoundingClientRect().top, DAY_FROM, pxRef.current), moved });
    };
    const up = () => {
      const current = dragRef.current;
      setDrag(null);
      const column = current ? columnOf(current.ymd) : null;
      if (!current || !column || !slotRef.current) return;
      const slot = ahead(slotOf(current.ymd, current.down, current.at, current.moved), earliest(current.ymd, new Date()));
      if (!slot) return;
      // the ghost drawn for the press stays the same element once the parent holds the slot
      slotRef.current(slot, ghostRef.current ?? column);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", esc);
    };
  }, [dragging]);

  const moving = move !== null;
  useEffect(() => {
    if (!moving) return;
    const onMouse = (event: MouseEvent) => {
      const current = moveRef.current;
      const grid = body.current;
      if (!current || !grid) return;
      if (!current.moved && Math.hypot(event.clientX - current.x0, event.clientY - current.y0) <= MOVE_PX) return;
      const columns = [...grid.querySelectorAll<HTMLElement>("[data-testid=desk-week-day]")];
      if (columns.length === 0) return;
      // the day under the hand — the first or the last when it is past either edge
      const column =
        columns.find((node) => {
          const rect = node.getBoundingClientRect();
          return event.clientX >= rect.left && event.clientX < rect.right;
        }) ?? (event.clientX < columns[0].getBoundingClientRect().left ? columns[0] : columns[columns.length - 1]);
      const raw = DAY_FROM * 60 + ((event.clientY - grid.getBoundingClientRect().top) / pxRef.current) * 60 - current.grab;
      const minutes = Math.max(DAY_FROM * 60, Math.min(DAY_TO * 60 - SNAP_MIN, Math.round(raw / SNAP_MIN) * SNAP_MIN));
      const ymd = column.getAttribute("aria-label") ?? current.ymd;
      if (current.moved && ymd === current.ymd && minutes === current.minutes) return;
      setMove({ ...current, moved: true, ymd, minutes });
    };
    const up = () => {
      const current = moveRef.current;
      setMove(null);
      if (!current?.moved) return;
      // the click that follows this release (if it lands on the block) is not a click; the next one is
      dragged.current = true;
      window.setTimeout(() => {
        dragged.current = false;
      }, 0);
      const target = movedTo(current.event, current.ymd, current.minutes, new Date());
      if (target) moveCb.current?.(current.event, target.start, target.end);
    };
    // Esc lets the meeting go back where it was, and goes no further (the side stays as it is)
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (moveRef.current?.moved) {
        // the release still to come is no click on the block
        dragged.current = true;
        window.addEventListener("mouseup", () => window.setTimeout(() => (dragged.current = false), 0), { once: true });
      }
      setMove(null);
    };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", esc, true);
    };
  }, [moving]);

  /** The minutes under the mouse in a column, from its own box. */
  const minutesIn = (event: ReactMouseEvent<HTMLElement>, step = SNAP_MIN) => minutesAt(event.clientY - event.currentTarget.getBoundingClientRect().top, DAY_FROM, hourPx, step);
  const onEmpty = (event: ReactMouseEvent<HTMLElement>) => !(event.target as Element).closest("[data-testid=desk-event], .cal-rail");

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
    if (!onSlot || drag || ghost || move) return;
    const first = earliest(ymd, now);
    const minutes = minutesIn(event, 30);
    if (!onEmpty(event) || first === null || minutes + 30 <= first) {
      if (hover) setHover(null);
      return;
    }
    if (hover?.ymd !== ymd || hover.minutes !== minutes) setHover({ ymd, minutes });
  };

  /** The director's own meeting still ahead moves by a drag of its block. */
  const movable = (event: CalendarEvent) => onMove !== null && event.author_id === meId && new Date(event.starts_at).getTime() > now.getTime();
  const pressBlock = (event: CalendarEvent) => (mouse: ReactMouseEvent<HTMLElement>) => {
    dragged.current = false;
    if (mouse.button !== 0 || !movable(event)) return;
    const rect = mouse.currentTarget.getBoundingClientRect();
    const grab = ((mouse.clientY - rect.top) / hourPx) * 60;
    setHover(null);
    setMove({ event, x0: mouse.clientX, y0: mouse.clientY, grab, moved: false, ymd: ymdOfEvent(event), minutes: spanOf(event).start });
  };
  const openBlock = (event: CalendarEvent) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onOpen(event);
  };

  // what is drawn as the new meeting: the press in progress, or the one waiting for its title
  const pressed = drag ? ahead(slotOf(drag.ymd, drag.down, drag.at, drag.moved), earliest(drag.ymd, now)) : null;
  const drawn: { slot: Slot; title: string } | null = drag ? (pressed ? { slot: pressed, title: "" } : null) : ghost;
  const drawnAt = drawn ? days.indexOf(drawn.slot.ymd) : -1;
  const moveAt = move?.moved ? days.indexOf(move.ymd) : -1;

  // the first look finds now: a line below the fold (an evening on a short screen) is brought into view, once
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    const line = body.current?.querySelector<HTMLElement>("[data-testid=desk-now-line]");
    if (!line) return;
    looked.current = true;
    const { bottom } = line.getBoundingClientRect();
    if (bottom > window.innerHeight - 24) line.scrollIntoView({ block: "center" });
  });

  const cell = { today, now, meId, onOpen: openBlock, openId };

  return (
    <div
      className="cal-week min-w-0 overflow-clip"
      data-testid="desk-calendar-week"
      data-hours={`${DAY_FROM}-${DAY_TO}`}
      data-hour-px={hourPx}
      data-moving={move?.moved ? "" : undefined}
      style={{ "--hour": `${hourPx}px` } as CSSProperties}
    >
      <div className="cal-week-head cal-cols sticky top-0 z-30 grid" style={{ gridTemplateColumns: columns }}>
        <span aria-hidden />
        {parts.map((part) => (
          <DayHead
            key={part.ymd}
            ymd={part.ymd}
            today={today}
            now={now}
            focused={part.focused}
            off={!work.has(isoWeekday(part.ymd))}
            narrow={part.px > 0 && part.px < HEAD_NARROW}
            count={(byDay.get(part.ymd) ?? EMPTY_EVENTS).length}
            onFocus={onFocusDay}
          />
        ))}
      </div>

      <OffRow band="early" columns={columns} parts={parts} work={work} {...cell} />

      <div ref={body} className="cal-week-body cal-cols relative grid" style={{ gridTemplateColumns: columns, height }} data-testid="desk-week-hours">
        <div aria-hidden className="cal-gutter relative">
          {HOURS.map((hour) => {
            if (nowY !== null && Math.abs(clock.minutes - hour * 60) < NOW_LABEL_ROOM_MIN) return null;
            return (
              <span key={hour} className="cal-hour nums absolute right-2 text-[11px] leading-4" style={{ top: hour === DAY_FROM ? 3 : yOf(hour * 60, DAY_FROM, hourPx) - 8 }}>
                {pad(hour)}:00
              </span>
            );
          })}
          {nowY !== null ? (
            // moved by a transform: the clock glides to its next minute, the hours around it stay put
            <span className="cal-now-time nums absolute right-1.5 top-0 text-[11px] leading-4" style={{ transform: `translateY(${nowY - 8}px)` }} data-testid="desk-now-time">
              {pad(Math.floor(clock.minutes / 60))}:{pad(clock.minutes % 60)}
            </span>
          ) : null}
        </div>

        {parts.map((part, index) => (
          <DayColumn
            key={part.ymd}
            ymd={part.ymd}
            index={index}
            off={!work.has(isoWeekday(part.ymd))}
            focused={part.focused}
            area={part.px > 0 ? part.px - part.rail : 0}
            hourPx={hourPx}
            height={height}
            events={part.bands.day}
            marks={deadlines ? part.marks.day : null}
            rail={part.rail}
            nowY={part.ymd === clock.ymd ? nowY : null}
            creating={Boolean(onSlot)}
            onPress={pressDay(part.ymd)}
            onHover={hoverDay(part.ymd)}
            onLeave={() => setHover(null)}
            hover={hover?.ymd === part.ymd && !drag && !move ? hover.minutes : null}
            movingId={move?.moved ? move.event.id : null}
            movable={movable}
            onPressBlock={pressBlock}
            {...cell}
          />
        ))}

        {drawn && drawnAt >= 0 ? (
          <Ghost key="ghost" ref={ghostRef} slot={drawn.slot} title={drawn.title} column={drawnAt + 2} right={parts[drawnAt].rail} hourPx={hourPx} />
        ) : null}
        {move?.moved && moveAt >= 0 ? <MovePreview move={move} column={moveAt + 2} right={parts[moveAt].rail} hourPx={hourPx} now={now} /> : null}

        {/* now across the whole week, faint: the days around today are read against the same minute */}
        {nowY !== null ? <span aria-hidden className="cal-now-week pointer-events-none absolute right-0 top-0 z-[3]" style={{ left: GUTTER, transform: `translateY(${nowY}px)` }} /> : null}
      </div>

      <OffRow band="late" columns={columns} parts={parts} work={work} {...cell} />
    </div>
  );
}

type Part = {
  ymd: Ymd;
  focused: boolean;
  /** The day's width in pixels; 0 — not measured yet (everything is shown). */
  px: number;
  bands: Record<"early" | "day" | "late", CalendarEvent[]>;
  marks: Record<"early" | "day" | "late", DeadlineMark[]>;
  rail: number;
};

function DayHead({
  ymd,
  today,
  now,
  focused,
  off,
  narrow,
  count,
  onFocus,
}: {
  ymd: Ymd;
  today: Ymd;
  now: Date;
  focused: boolean;
  off: boolean;
  /** Too narrow for the weekday beside the date: the date alone (the weekday is in the hint). */
  narrow: boolean;
  count: number;
  onFocus: (ymd: Ymd) => void;
}) {
  const isToday = ymd === today;
  const past = ymd < today;
  const weekday = WEEKDAYS_SHORT_RU[isoWeekday(ymd) - 1];
  const meetings = count > 0 ? `${count} ${pluralRu(count, ["встреча", "встречи", "встреч"])}` : "встреч нет";
  // the focused day says it in words; the others give their count, a day off only its date
  const words = focused ? (isToday ? `сегодня · ${meetings}` : meetings) : null;
  return (
    <Tooltip label={focused ? `${humanYmd(ymd, now)} · ${meetings}` : `Крупно: ${humanYmd(ymd, now)} · ${meetings}`} className="flex min-w-0" side="bottom">
      <button
        type="button"
        onClick={() => onFocus(ymd)}
        aria-pressed={focused}
        aria-label={`${humanYmd(ymd, now)}, ${meetings}${focused ? ", открыт крупно" : ""}`}
        className="cal-day-head flex h-10 min-w-0 flex-1 items-center gap-2 px-2 text-left"
        data-today={isToday ? "" : undefined}
        data-past={past ? "" : undefined}
        data-off={off ? "" : undefined}
        data-focus={focused ? "" : undefined}
        data-testid="cal-day-head"
      >
        {narrow ? null : <span className="desk-label shrink-0">{weekday}</span>}
        {/* today is a date stamped in print: the one solid mark on the head of the week */}
        <span className={`nums desk-figure flex h-6 min-w-6 shrink-0 items-center justify-center px-1 text-[16px] leading-none ${isToday ? "desk-today" : ""}`}>{parseYmd(ymd)!.day}</span>
        {words ? <span className="cal-day-words min-w-0 truncate text-[12px] leading-4">{words}</span> : null}
        {!focused && count > 0 && !off && !narrow ? <span className="cal-day-count nums ml-auto shrink-0 text-[11px] leading-4">{count}</span> : null}
      </button>
    </Tooltip>
  );
}

type CellProps = { today: Ymd; now: Date; meId: string; onOpen: (event: CalendarEvent) => void; openId: string | null };

function DayColumn({
  ymd,
  index,
  off,
  focused,
  area,
  hourPx,
  height,
  events,
  marks,
  rail,
  nowY,
  creating,
  onPress,
  onHover,
  onLeave,
  hover,
  movingId,
  movable,
  onPressBlock,
  today,
  now,
  meId,
  onOpen,
  openId,
}: CellProps & {
  ymd: Ymd;
  /** 0 = Monday: the blocks of a day arrive a beat after the day before. */
  index: number;
  off: boolean;
  focused: boolean;
  /** The width the meetings have in pixels (the day less the rail); 0 — not measured yet. */
  area: number;
  hourPx: number;
  height: number;
  events: CalendarEvent[];
  /** The deadlines inside the hours while the layer is on; null — off. */
  marks: DeadlineMark[] | null;
  /** The rail's width the meetings give up (0 — no layer). */
  rail: number;
  nowY: number | null;
  creating: boolean;
  onPress: (event: ReactMouseEvent<HTMLElement>) => void;
  onHover: (event: ReactMouseEvent<HTMLElement>) => void;
  onLeave: () => void;
  /** The half-hour under the resting mouse, in minutes; null — none here. */
  hover: number | null;
  movingId: string | null;
  movable: (event: CalendarEvent) => boolean;
  onPressBlock: (event: CalendarEvent) => (mouse: ReactMouseEvent<HTMLElement>) => void;
}) {
  // a block gets room for a line of its title, up to the next meeting
  const placed = layoutDay(events, { minMinutes: Math.ceil(((LINE_PX + 2) * 60) / hourPx) });
  return (
    <section
      aria-label={ymd}
      data-testid="desk-week-day"
      className="cal-day relative min-w-0 select-none"
      data-today={ymd === today ? "" : undefined}
      data-past={ymd < today ? "" : undefined}
      data-off={off ? "" : undefined}
      data-focus={focused ? "" : undefined}
      onMouseDown={creating ? onPress : undefined}
      onMouseMove={creating ? onHover : undefined}
      onMouseLeave={creating ? onLeave : undefined}
      style={
        {
          // the hour lines: one hairline at the top of every hour
          backgroundImage: "linear-gradient(to bottom, var(--rule-soft) 1px, transparent 1px)",
          backgroundSize: `100% ${hourPx}px`,
          "--day": index,
        } as CSSProperties
      }
    >
      {/* the part of today already gone, a shade darker — scaled, not resized, as the minutes go */}
      {nowY !== null ? <span aria-hidden className="cal-gone pointer-events-none absolute inset-x-0 top-0" style={{ height, transform: `scaleY(${Math.max(0, Math.min(1, nowY / height))})` }} /> : null}
      {nowY !== null ? (
        // now under the blocks: a meeting's words are never crossed by it
        <span aria-hidden className="cal-now pointer-events-none absolute inset-x-0 top-0 z-[4]" style={{ transform: `translateY(${nowY}px)` }} data-testid="desk-now-line">
          <span className="desk-now absolute inset-x-0 -top-px h-[2px]" />
        </span>
      ) : null}
      {hover !== null ? (
        <span
          aria-hidden
          className="cal-slot-hint nums pointer-events-none absolute left-[3px] z-[5] flex items-start px-2 pt-1 text-[11px] leading-4"
          style={{ top: yOf(hover, DAY_FROM, hourPx) + 1, height: hourPx / 2 - 2, right: rail + 3 }}
          data-testid="desk-slot-hint"
        >
          + {hmAt(hover)}
        </span>
      ) : null}
      <div className="cal-lanes absolute inset-y-0 left-0" style={{ right: rail }}>
        {placed.map((item) => (
          <HourEvent
            key={item.event.id}
            item={item}
            hourPx={hourPx}
            widthPx={widthOf(item, area)}
            now={now}
            meId={meId}
            onOpen={onOpen}
            open={item.event.id === openId}
            moving={item.event.id === movingId}
            onPress={movable(item.event) ? onPressBlock(item.event) : undefined}
          />
        ))}
      </div>
      {marks ? <Rail marks={marks} ymd={ymd} now={now} wide={focused} width={rail} hourPx={hourPx} height={height} /> : null}
      {nowY !== null ? <span aria-hidden className="cal-now-dot pointer-events-none absolute left-0 top-0 z-[22]" style={{ transform: `translateY(${nowY}px)` }} /> : null}
    </section>
  );
}

/** What the state says in words, for a screen reader and the hint: the colour says it to the eye. */
const STATE_WORDS: Partial<Record<MeetingState, string>> = {
  running: "идёт",
  owes: "нужен ответ",
  declined: "вы не сможете",
  over: "прошла",
};

/** «2 не смогут» — on the author's own block: who of the invited refused (D-180). */
function refusalsOf(event: CalendarEvent, meId: string): string | null {
  if (event.author_id !== meId) return null;
  const { declined } = answersOf(event);
  return declined > 0 ? `${declined} ${pluralRu(declined, ["не сможет", "не смогут", "не смогут"])}` : null;
}

/** Who comes, in words (the print look has no faces): the ones who have not refused, three names and «+N». */
function Who({ event }: { event: CalendarEvent }) {
  const names = event.participants.filter((p) => p.status !== "declined").flatMap((p) => (p.person?.full_name ? [p.person.full_name] : []));
  if (names.length === 0) return null;
  return (
    <span className="cal-who min-w-0 truncate text-[11px] leading-4">
      {names.slice(0, NAMES).map((name) => shortName(name)).join(", ")}
      {names.length > NAMES ? ` +${names.length - NAMES}` : ""}
    </span>
  );
}

/** The lines a title takes at 12 px semibold in `width` pixels — measured in the page's own font (an estimate on the server). */
let ruler: { context: CanvasRenderingContext2D; font: string } | null = null;
function linesOf(title: string, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  let measured = title.length * 6.6;
  if (typeof document !== "undefined") {
    const family = getComputedStyle(document.body).fontFamily;
    const font = `600 12px ${family}`;
    if (!ruler) {
      const context = document.createElement("canvas").getContext("2d");
      if (context) ruler = { context, font: "" };
    }
    if (ruler) {
      if (ruler.font !== font) {
        ruler.context.font = font;
        ruler.font = font;
      }
      measured = ruler.context.measureText(title).width;
    }
  }
  // words wrap whole: a little slack for the end of each line
  return Math.max(1, Math.ceil((measured * 1.08) / width));
}

/** Where a placed meeting stands across its day: a lane of a few side by side, a step of a cascade. */
function across(item: Placed): CSSProperties {
  const step = item.depths > 0 ? `min(16px, max(0px, (100% - 56px) / ${item.depths}))` : "0px";
  const indent = item.depth > 0 ? `(${step} * ${item.depth})` : "0px";
  return {
    left: `calc(${indent} + (100% - ${indent}) * ${item.lane} / ${item.lanes} + 2px)`,
    width: `calc((100% - ${indent}) / ${item.lanes} - 4px)`,
  };
}

/**
 * A meeting on the grid: its title first, then when and where — a block in the colour of what it
 * is to this person (a rail on its left and a wash of the same colour). Tiers by height: one line
 * (the title, its hour after it when there is room), two lines, the title on several lines with a
 * foot under it — the faces of who comes (from 120 px of width), «нужен ответ» or the author's
 * «2 не смогут»; a block too narrow or too short for a word keeps its rail and says itself in the
 * hint. The open one stands raised; a later one in a cascade lies over the earlier, a hover
 * brings any to the top.
 */
function HourEvent({
  item,
  hourPx,
  widthPx,
  now,
  meId,
  onOpen,
  open,
  moving,
  onPress,
}: {
  item: Placed;
  hourPx: number;
  /** The block's width in pixels (Infinity — not measured yet). */
  widthPx: number;
  now: Date;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
  open: boolean;
  moving: boolean;
  onPress?: (mouse: ReactMouseEvent<HTMLElement>) => void;
}) {
  const { event } = item;
  const state = meetingState(event, meId, now);
  const words = STATE_WORDS[state];
  const refusals = refusalsOf(event, meId);
  const clock = clockOf(event);
  const top = yOf(item.start, DAY_FROM, hourPx) + 1;
  // drawn to `drawEnd`: a line's room when there is space, never into the next meeting
  const height = Math.max(6, ((item.drawEnd - item.start) * hourPx) / 60 - 2);
  const tier = widthPx < BAR_W || height < SLIVER_PX ? "bar" : height < TWO_PX ? "line" : height < FULL_PX ? "two" : "full";
  const tag = state === "owes" ? "нужен ответ" : refusals;
  const faces = widthPx >= FACES_W;
  const foot = tier === "full" && height >= FACES_PX && (faces || (tag !== null && widthPx >= TAG_W));
  // the words matter more than the time: a title takes the lines the block has, the time one under it
  // a title that needs two lines takes them before the time on a short block: the hour is where the block stands
  const needed = linesOf(event.title, widthPx - 17);
  const titleOnly = tier === "two" && needed >= 2 && height >= 38;
  const titleLines = tier === "full" ? Math.max(1, Math.min(4, Math.floor((height - 6 - 14 - (foot ? 24 : 0)) / 16))) : titleOnly ? 2 : 1;
  const said = [clock, event.title, event.location, words, refusals].filter(Boolean).join(" · ");

  return (
    <div
      className="cal-block absolute z-10"
      style={{ top, height, ...across(item) }}
      data-open={open ? "" : undefined}
      data-moving={moving ? "" : undefined}
      data-depth={item.depth || undefined}
    >
      <Tooltip label={said} className="flex h-full w-full">
        <button
          type="button"
          onMouseDown={onPress}
          onClick={() => onOpen(event)}
          data-testid="desk-event"
          data-event-id={event.id}
          data-state={state}
          data-tier={tier}
          data-open={open ? "" : undefined}
          data-movable={onPress ? "" : undefined}
          data-clip-top={item.clipTop ? "" : undefined}
          data-clip-bottom={item.clipBottom ? "" : undefined}
          aria-current={open ? "true" : undefined}
          aria-label={said}
          className="cal-event relative flex h-full w-full min-w-0 flex-col overflow-hidden text-left"
        >
          {tier === "bar" ? null : tier === "line" ? (
            // one line: the title, its hour after it only when both fit — what does not fit wraps out of sight
            <span className="cal-event-line flex h-4 w-full flex-wrap items-baseline gap-x-1.5 overflow-hidden">
              <span className="cal-event-title max-w-full truncate text-[12px] font-semibold leading-4">{event.title}</span>
              <When className="cal-event-time shrink-0 text-[11px] leading-4">{hhmm(event.starts_at)}</When>
            </span>
          ) : (
            <>
              <span className="cal-event-title w-full text-[12px] font-semibold leading-4" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: titleLines, overflow: "hidden" }}>
                {event.title}
              </span>
              {titleOnly ? null : (
                <span className="cal-event-time w-full truncate text-[11px] leading-[14px]">
                  <When>{clock}</When>
                  {refusals && !foot ? <span className="cal-event-refused"> · {refusals}</span> : event.location ? ` · ${event.location}` : ""}
                </span>
              )}
              {foot ? (
                <span className="cal-event-foot mt-auto flex min-h-[20px] w-full items-center gap-1.5">
                  {faces ? <Faces event={event} size={18} max={4} className="cal-event-faces" /> : null}
                  {faces ? <Who event={event} /> : null}
                  {tag ? (
                    <span aria-hidden className={`${state === "owes" ? "cal-event-ask" : "cal-event-refused"} ml-auto shrink-0 text-[11px] font-medium leading-4`}>
                      {tag}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </>
          )}
        </button>
      </Tooltip>
    </div>
  );
}

/** The meeting being made: where it will stand, the title as it is typed, the time it takes — the quick card's anchor. */
function Ghost({ ref, slot, title, column, right, hourPx }: { ref: RefObject<HTMLDivElement | null>; slot: Slot; title: string; column: number; right: number; hourPx: number }) {
  const top = yOf(Math.max(slot.start, DAY_FROM * 60), DAY_FROM, hourPx) + 1;
  const bottom = yOf(Math.min(slot.end, DAY_TO * 60), DAY_FROM, hourPx) - 1;
  return (
    <div
      ref={ref}
      aria-hidden
      className="cal-ghost pointer-events-none absolute z-[25] flex flex-col overflow-hidden px-2 py-1"
      style={{ gridColumn: `${column} / span 1`, gridRow: "1 / span 1", top, height: Math.max(LINE_PX, bottom - top), left: 3, right: right + 3 }}
      data-testid="cal-ghost"
    >
      <span className="truncate text-[12px] font-semibold leading-4">{title.trim() || "Новая встреча"}</span>
      <span className="cal-ghost-time nums truncate text-[11px] leading-4">
        {hmAt(slot.start)}–{hmAt(slot.end)}
      </span>
    </div>
  );
}

/** Where a dragged meeting would land: its day and hours — or that the past is closed to it. */
function MovePreview({ move, column, right, hourPx, now }: { move: MoveState; column: number; right: number; hourPx: number; now: Date }) {
  const length = spanOf(move.event).end - spanOf(move.event).start;
  const end = Math.min(DAY_TO * 60, move.minutes + Math.max(length, SNAP_MIN));
  const top = yOf(move.minutes, DAY_FROM, hourPx) + 1;
  const target = movedTo(move.event, move.ymd, move.minutes, now);
  const same = move.ymd === ymdOfEvent(move.event) && move.minutes === spanOf(move.event).start;
  const past = !target && !same;
  const weekday = WEEKDAYS_SHORT_RU[isoWeekday(move.ymd) - 1];
  return (
    <div
      aria-hidden
      className="cal-move pointer-events-none absolute z-[25] flex flex-col overflow-hidden px-2 py-1"
      style={{ gridColumn: `${column} / span 1`, gridRow: "1 / span 1", top, height: Math.max(LINE_PX, ((end - move.minutes) * hourPx) / 60 - 2), left: 3, right: right + 3 }}
      data-past={past ? "" : undefined}
      data-testid="cal-move"
    >
      <span className="truncate text-[12px] font-semibold leading-4">{move.event.title}</span>
      <span className="cal-ghost-time nums truncate text-[11px] leading-4">
        {past ? "В прошлое нельзя" : `${weekday} ${hmAt(move.minutes)}–${hmAt(move.minutes + length)}`}
      </span>
    </div>
  );
}

/**
 * A thin row before 08:00 or after 20:00: the meetings there as chips with their hours («07:30
 * Объезд», «22:00→01:00 Ночная заливка»), one a day (two on the focused day) and «+N» for the
 * rest; the deadlines there as ◆ with the hour. It never stretches the grid.
 */
function OffRow({ band, columns, parts, work, today, now, meId, onOpen, openId }: CellProps & { band: "early" | "late"; columns: string; parts: Part[]; work: Set<number> }) {
  return (
    <div className="cal-off cal-cols grid" data-band={band} style={{ gridTemplateColumns: columns, height: OFF_H }} data-testid={`cal-${band}`}>
      <span className="cal-off-label nums flex items-center justify-end whitespace-nowrap pr-1.5 text-[11px] leading-4">{band === "early" ? "до 8" : "после 20"}</span>
      {parts.map((part) => {
        const events = part.bands[band];
        const marks = part.marks[band];
        const limit = part.focused ? 2 : 1;
        return (
          <div
            key={part.ymd}
            className="cal-off-cell flex min-w-0 items-center gap-1 px-[3px]"
            data-today={part.ymd === today ? "" : undefined}
            data-past={part.ymd < today ? "" : undefined}
            data-off={!work.has(isoWeekday(part.ymd)) ? "" : undefined}
            data-focus={part.focused ? "" : undefined}
          >
            {events.slice(0, limit).map((event) => (
              <OffChip key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} open={event.id === openId} narrow={part.px > 0 && part.px < OFF_NARROW} />
            ))}
            {events.length > limit ? <OffMore events={events.slice(limit)} band={band} ymd={part.ymd} now={now} onOpen={onOpen} /> : null}
            {marks.length > 0 ? (
              <span className="ml-auto flex shrink-0">
                {marks.length === 1 ? <OffMark mark={marks[0]} /> : <DeadlinesMore marks={marks} ymd={part.ymd} now={now} inline />}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** A meeting outside the working hours: its hours and its title, in the colour of its state. */
function OffChip({ event, now, meId, onOpen, open, narrow }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void; open: boolean; narrow: boolean }) {
  const state = meetingState(event, meId, now);
  const clock = clockOf(event);
  const overnight = spanOf(event).overnight;
  // the hour leads (the row does not say it); a narrow day keeps only the start, «23:00→» for a night
  const said = [clock, event.title, event.location, STATE_WORDS[state], refusalsOf(event, meId)].filter(Boolean).join(" · ");
  return (
    <Tooltip label={said} className="flex min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onOpen(event)}
        data-testid="desk-event"
        data-event-id={event.id}
        data-state={state}
        data-band="off"
        data-open={open ? "" : undefined}
        aria-current={open ? "true" : undefined}
        aria-label={said}
        className="cal-event cal-event-chip flex h-[22px] min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left text-[11px] leading-4"
      >
        <When className="cal-event-time shrink-0">{narrow ? `${hhmm(event.starts_at)}${overnight ? "→" : ""}` : overnight ? clock : hhmm(event.starts_at)}</When>
        {narrow ? null : <span className="cal-event-title min-w-0 truncate font-semibold">{event.title}</span>}
      </button>
    </Tooltip>
  );
}

/** «+2» in a thin row: the rest of its meetings in a list, each opens in the side. */
function OffMore({ events, band, ymd, now, onOpen }: { events: CalendarEvent[]; band: "early" | "late"; ymd: Ymd; now: Date; onOpen: (event: CalendarEvent) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = `Ещё ${events.length} ${pluralRu(events.length, ["встреча", "встречи", "встреч"])} ${band === "early" ? "до 8:00" : "после 20:00"}`;
  const close = () => {
    anchor?.focus({ preventScroll: true });
    setAnchor(null);
  };
  return (
    <>
      <Tooltip label={label}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          aria-label={label}
          onClick={(click) => setAnchor(anchor ? null : click.currentTarget)}
          className="cal-off-more nums flex h-[22px] shrink-0 items-center px-1.5 text-[11px] font-medium leading-4"
          data-testid="cal-off-more"
        >
          +{events.length}
        </button>
      </Tooltip>
      <Popover open={Boolean(anchor)} onClose={close} anchor={anchor} width={300} label={label}>
        <div className="flex max-h-[min(360px,60vh)] flex-col" onKeyDown={walk("button")}>
          <SectionLabel count={events.length} className="px-3 pt-1.5">
            {band === "early" ? "До 8:00" : "После 20:00"} · {humanYmd(ymd, now)}
          </SectionLabel>
          <div className="min-h-0 overflow-y-auto py-1">
            {events.map((event, index) => (
              <button
                key={event.id}
                type="button"
                data-autofocus={index === 0 ? "" : undefined}
                onClick={() => {
                  setAnchor(null);
                  onOpen(event);
                }}
                className="flex h-8 w-full min-w-0 items-center gap-2 px-3 text-left text-[13px] leading-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <When className="shrink-0">{clockOf(event)}</When>
                <span className="min-w-0 truncate font-medium">{event.title}</span>
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

/** A deadline's ink: the red of the pencil once it is late; today's in print, any other day's quiet. */
const MARK_INK: Record<DeadlineMark["tone"], string> = {
  danger: "var(--danger)",
  warn: "var(--text)",
  muted: "var(--text-muted)",
};

const markWho = (mark: DeadlineMark) => (mark.who ? shortName(mark.who) : `${mark.count} чел.`);

/** ↑/↓ walk the list; the calendar's own keys (arrows, letters) wait until it is closed. */
function walk(selector: string) {
  return (event: ReactKeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.code !== "ArrowDown" && event.code !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.code === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
}

/**
 * The rail of deadlines on a day's right edge (D-180): a ◆ on the hour each order is due, the
 * hour beside it — under it on a narrow day, «◆ 18:00» on the focused one; the name in the hint
 * and in the side's «Сроки сегодня». Marks of one hour stack; what does not fit is «+N».
 */
function Rail({ marks, ymd, now, wide, width, hourPx, height }: { marks: DeadlineMark[]; ymd: Ymd; now: Date; wide: boolean; width: number; hourPx: number; height: number }) {
  const size = wide ? MARK.wide : MARK.narrow;
  // the ◆ sits on the hour it is due: the mark's top a little above the line
  const anchor = wide ? 9 : 5;
  const fit = fitMarks(
    marks.map((mark) => Math.max(0, yOf(mark.minutes, DAY_FROM, hourPx) - anchor)),
    size.step,
    size.h,
    MORE_H,
    height,
  );
  return (
    <div className="cal-rail absolute inset-y-0 right-0 z-[12]" style={{ width }} data-wide={wide ? "" : undefined} data-testid="cal-rail">
      {marks.slice(0, fit.shown).map((mark, index) => (
        <div key={mark.id} className="absolute inset-x-0" style={{ top: fit.tops[index], height: size.h }}>
          <Tooltip label={markWords(mark)} className="flex h-full w-full">
            <Link
              href={`/desk/tasks?id=${mark.id}`}
              data-testid="desk-deadline"
              data-tone={mark.tone}
              aria-label={markWords(mark)}
              className={`cal-mark flex h-full w-full items-center ${wide ? "gap-1 px-1" : "flex-col justify-start gap-0.5 pt-px"}`}
            >
              <span aria-hidden className="cal-mark-diamond h-[7px] w-[7px] shrink-0 rotate-45" style={{ background: MARK_INK[mark.tone] }} />
              <When overdue={mark.tone === "danger"} className="cal-mark-time text-[11px] leading-[13px]">
                {wide ? mark.time : mark.time.slice(0, 2)}
              </When>
            </Link>
          </Tooltip>
        </div>
      ))}
      {fit.moreTop !== null ? (
        <div className="absolute inset-x-0" style={{ top: fit.moreTop, height: MORE_H }}>
          <DeadlinesMore marks={marks.slice(fit.shown)} ymd={ymd} now={now} />
        </div>
      ) : null}
    </div>
  );
}

/** A deadline before 08:00 or after 20:00, in its thin row: «◆ 21:00». */
function OffMark({ mark }: { mark: DeadlineMark }) {
  return (
    <Tooltip label={markWords(mark)}>
      <Link href={`/desk/tasks?id=${mark.id}`} data-testid="desk-deadline" data-tone={mark.tone} aria-label={markWords(mark)} className="cal-mark flex h-[22px] items-center gap-1 px-1">
        <span aria-hidden className="cal-mark-diamond h-[7px] w-[7px] shrink-0 rotate-45" style={{ background: MARK_INK[mark.tone] }} />
        <When overdue={mark.tone === "danger"} className="cal-mark-time text-[11px] leading-[13px]">
          {mark.time}
        </When>
      </Link>
    </Tooltip>
  );
}

/** «+5» (or «◆ 3» in a thin row): the rest of the day's deadlines in a list, each opens its task. */
function DeadlinesMore({ marks, ymd, now, inline = false }: { marks: DeadlineMark[]; ymd: Ymd; now: Date; inline?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ink = MARK_INK[loudest(marks)];
  const count = `${marks.length} ${pluralRu(marks.length, ["срок", "срока", "сроков"])}`;
  const label = inline ? `Сроки: ${count}` : `Ещё ${count}`;
  const close = () => {
    anchor?.focus({ preventScroll: true });
    setAnchor(null);
  };
  return (
    <>
      <Tooltip label={label} className={inline ? "inline-flex" : "flex h-full w-full"}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={Boolean(anchor)}
          aria-label={label}
          onClick={(click) => setAnchor(anchor ? null : click.currentTarget)}
          data-testid="desk-deadline-more"
          data-tone={loudest(marks)}
          className={`cal-mark cal-mark-more flex items-center justify-center gap-1 text-[11px] leading-[13px] ${inline ? "h-[22px] px-1" : "h-full w-full"}`}
        >
          <span aria-hidden className="cal-mark-diamond h-[6px] w-[6px] shrink-0 rotate-45" style={{ background: ink }} />
          <span className="nums" style={{ color: ink }}>
            {inline ? marks.length : `+${marks.length}`}
          </span>
        </button>
      </Tooltip>
      <Popover open={Boolean(anchor)} onClose={close} anchor={anchor} width={320} label={label}>
        <div className="flex max-h-[min(420px,70vh)] flex-col" onKeyDown={walk("a")} data-testid="desk-deadline-list">
          <SectionLabel count={marks.length} className="px-3 pt-1.5">
            {inline ? "Сроки" : "Ещё сроки"} · {humanYmd(ymd, now)}
          </SectionLabel>
          <div className="min-h-0 overflow-y-auto py-1">
            {marks.map((mark, index) => (
              <Link
                key={mark.id}
                href={`/desk/tasks?id=${mark.id}`}
                aria-label={markWords(mark)}
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
