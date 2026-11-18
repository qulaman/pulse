"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { DoorLamp, doorWords } from "@/components/desk/errands/Door";
import { useSettled } from "@/components/desk/ui/SideNav";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { hhmm, isOver, shiftDay, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { daysBetween, humanYmd, parseYmd, todayYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import {
  dayWindows,
  holdBlock,
  isoWeekday,
  lengthWords,
  minuteHm,
  nearestWindows,
  wallMinutes,
  windowCopy,
  windowDayOf,
  type BusyBlock,
  type DatedWindow,
  type Door,
  type WindowDay,
} from "@/lib/desk/busy";
import { usePeople } from "@/lib/people/queries";

import { useFitHeight } from "./CalendarGrids";
import { useDirectorDoor } from "./DirectorBusyLine";
import { meetingState } from "./state";
import { useDirectorBusy, useWorkHours } from "./useDirectorBusy";

/*
 * «Окна директора» — the secretary's week of the calendar (D-180): her job is his time. One row a
 * day: his busy time hatched in the amber of «Стойка» (D-175), his free windows labelled
 * («свободен 15:00–17:30», «1 ч 30 мин») and the next one outlined, a click copies one for a call;
 * busy time before or after the working hours said in words at the row's ends; her own meetings as
 * pills under the line. Never a word of his meetings (D-158 §5): `director_busy` gives spans only.
 * «Не беспокоить» is no free window; a day without his meetings is «нет встреч» — the calendar
 * knows meetings only, never «весь день свободен».
 */

/** The director's busy time as the page reads it (`useDirectorBusy`). */
export type BusyFeed = { status: "loading" | "error" | "ready"; blocks: Map<Ymd, BusyBlock[]>; onRetry: () => void };

const WORKDAYS_DEFAULT: readonly number[] = [1, 2, 3, 4, 5];
/** A pill's room beyond its own minutes: the hour and the title in 12 px. */
const PILL_CHAR_PX = 6.6;
const PILL_PAD_PX = 26;

/** The width of an element, kept up to date. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A window put on the clipboard for a call: «Свободен завтра, 12:30–14:00». */
async function copyWindow(window: DatedWindow, now: Date): Promise<void> {
  const text = windowCopy(window, now);
  try {
    await navigator.clipboard.writeText(text);
    toast(`Скопировал: ${text}`);
  } catch {
    toast("Браузер не дал скопировать — время на экране");
  }
}

/** About how wide a label of 11 px is: its letters and the window's padding. */
const LABEL_CHAR_PX = 6.3;
const LABEL_PAD_PX = 10;

/** What a free window says in the room it has: «свободен 15:00–17:30», «15:00–17:30», «1 ч 30 мин», «1 ч», nothing. */
function windowLabel(start: number, end: number, px: number): string {
  const range = `${minuteHm(start)}–${minuteHm(end)}`;
  const choices = [`свободен ${range}`, range, lengthWords(end - start)];
  return choices.find((words) => words.length * LABEL_CHAR_PX + LABEL_PAD_PX <= px) ?? "";
}

/** The day's line under its date: how long he is free, or why he is not. */
function dayWords(kind: WindowDay, day: ReturnType<typeof dayWindows>, closed: BusyBlock | null): { text: string; tone?: "ok" | "dnd" } | null {
  if (kind === "past") return null;
  if (kind === "off") return { text: "выходной" };
  if (kind === "today" && closed) return { text: closed.end >= 24 * 60 ? "не беспокоить" : `не беспокоить до ${minuteHm(closed.end)}`, tone: "dnd" };
  if (!day.busy) return { text: "нет встреч" };
  if (day.free === 0) return { text: kind === "today" ? "занят до конца дня" : "занят весь день" };
  return { text: kind === "today" ? `свободен ещё ${lengthWords(day.free)}` : `свободен ${lengthWords(day.free)}`, tone: "ok" };
}

/** Her meetings of a day in lines under the bar: a pill that would run into the one before it goes a line lower. */
function pillLines(events: readonly CalendarEvent[], at: (minute: number) => number, width: number): number[] {
  const ends: number[] = [];
  return events.map((event) => {
    const start = minuteOfDay(event.starts_at);
    const x0 = (at(start) / 100) * width;
    const words = (hhmm(event.starts_at).length + event.title.length) * PILL_CHAR_PX + PILL_PAD_PX;
    const x1 = Math.max((at(start + lengthOf(event)) / 100) * width, x0 + Math.min(words, 260));
    let line = ends.findIndex((end) => x0 >= end + 4);
    if (line === -1) line = ends.length < 2 ? ends.length : 1;
    ends[line] = x1;
    return line;
  });
}

function minuteOfDay(iso: string): number {
  const [h, m] = hhmm(iso).split(":").map(Number);
  return h * 60 + m;
}

/** A meeting's minutes; one without an end lasts an hour (D-180). */
function lengthOf(event: CalendarEvent): number {
  return event.ends_at ? Math.max(15, Math.round((Date.parse(event.ends_at) - Date.parse(event.starts_at)) / 60_000)) : 60;
}

export function DirectorWindows({
  days,
  today,
  now,
  workdays,
  busy,
  mine,
  meId,
  onOpen,
}: {
  days: Ymd[];
  today: Ymd;
  now: Date;
  workdays: readonly number[];
  busy: BusyFeed;
  /** Her own meetings of the days on screen, by day, in order (RLS leaves her nothing else). */
  mine: Map<Ymd, CalendarEvent[]>;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
}) {
  const box = useRef<HTMLElement>(null);
  const height = useFitHeight(box, 420);
  const axis = useRef<HTMLDivElement>(null);
  const laneWidth = useWidth(axis);
  const hours = useWorkHours();
  const settled = useSettled();
  const { hold } = useDirectorDoor(settled, now);
  const closed = holdBlock(hold, now);
  const nowMinute = wallMinutes(now);
  const span = hours.to - hours.from;
  const at = (minute: number) => ((Math.max(hours.from, Math.min(hours.to, minute)) - hours.from) / span) * 100;
  const ready = busy.status === "ready";
  // the window outlined: the first one from now on, on the days on screen
  const next = ready ? (nearestWindows({ blocks: busy.blocks, days, now, workdays, from: hours.from, to: hours.to, hold: closed, limit: 1 })[0] ?? null) : null;
  const marks: number[] = [];
  for (let minute = Math.ceil(hours.from / 60) * 60; minute <= hours.to; minute += 60) marks.push(minute);

  return (
    <section
      ref={box}
      className="cal-win"
      style={{ ...(height ? { height } : {}), ["--cal-win-n" as string]: span / 60 }}
      aria-label="Окна директора"
      data-testid="desk-director-windows"
      data-status={busy.status}
    >
      <div className="cal-win-axis" aria-hidden>
        <span className="cal-win-corner" />
        <div ref={axis} className="cal-win-hours nums">
          {marks.map((minute) => (
            <span key={minute} style={{ left: `${at(minute)}%` }}>
              {String(minute / 60).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
      {busy.status === "error" ? (
        <WindowsError onRetry={busy.onRetry} />
      ) : (
        <div className="cal-win-rows">
          {days.map((ymd) => {
            const kind = windowDayOf(ymd, today, workdays);
            const isToday = ymd === today;
            const blocks = busy.blocks.get(ymd) ?? [];
            const day = dayWindows({
              blocks,
              kind,
              from: hours.from,
              to: hours.to,
              nowMinute: isToday ? nowMinute : null,
              hold: isToday ? closed : null,
              night: busy.blocks.get(shiftDay(ymd, 1)) ?? [],
            });
            const words = ready ? dayWords(kind, day, isToday ? closed : null) : null;
            const parts = parseYmd(ymd)!;
            const weekday = WEEKDAYS_SHORT_RU[isoWeekday(ymd) - 1];
            const own = kind === "past" ? [] : (mine.get(ymd) ?? []);
            const lines = pillLines(own, at, laneWidth);
            return (
              <div
                key={ymd}
                className="cal-win-row"
                data-kind={kind}
                data-today={isToday ? "" : undefined}
                data-lines={lines.length ? Math.max(...lines) + 1 : 0}
                data-testid="desk-windows-day"
                data-ymd={ymd}
              >
                <div className="cal-win-label">
                  <p className="cal-win-date">
                    <span>{weekday}</span>
                    <b className="nums">{parts.day}</b>
                    {isToday ? <span className="cal-win-today">сегодня</span> : null}
                  </p>
                  {words ? (
                    <p className="cal-win-say nums" data-tone={words.tone}>
                      {words.text}
                    </p>
                  ) : null}
                </div>
                <div className="cal-win-lane">
                  {!ready ? (
                    <span className="cal-win-bone">
                      <Bone h={kind === "past" ? 10 : 22} />
                    </span>
                  ) : (
                    <>
                      {blocks
                        .filter((block) => block.end > hours.from && block.start < hours.to)
                        .map((block) => (
                          <span
                            key={block.start}
                            className="cal-win-busy"
                            data-gone={kind === "past" || (isToday && block.end <= nowMinute) ? "" : undefined}
                            style={{ left: `${at(block.start)}%`, width: `${at(block.end) - at(block.start)}%` }}
                            data-testid="desk-windows-busy"
                          >
                            <Tooltip label={`Директор занят ${minuteHm(block.start)}–${minuteHm(block.end)}`} side="bottom" className="flex h-full w-full">
                              <span className="h-full w-full" />
                            </Tooltip>
                          </span>
                        ))}
                      {isToday && closed && closed.end > hours.from && closed.start < hours.to ? (
                        <span className="cal-win-dnd" style={{ left: `${at(closed.start)}%`, width: `${at(closed.end) - at(closed.start)}%` }} data-testid="desk-windows-dnd">
                          <Tooltip label={closed.end >= 24 * 60 ? "Не беспокоить" : `Не беспокоить до ${minuteHm(closed.end)}`} side="bottom" className="flex h-full w-full">
                            <span className="h-full w-full" />
                          </Tooltip>
                        </span>
                      ) : null}
                      {day.windows.map((window) => {
                        const dated = { ...window, ymd };
                        const px = ((at(window.end) - at(window.start)) / 100) * laneWidth;
                        const isNext = next !== null && next.ymd === ymd && next.start === window.start;
                        // a day without his meetings says so under its date; its one window stays quiet
                        const label = day.busy ? windowLabel(window.start, window.end, px) : "";
                        return (
                          <span key={window.start} className="cal-win-slot" style={{ left: `${at(window.start)}%`, width: `${at(window.end) - at(window.start)}%` }}>
                            <Tooltip
                              label={`${windowCopy(dated, now)} · ${lengthWords(window.end - window.start)} — клик скопирует для звонка`}
                              side="bottom"
                              className="flex h-full w-full"
                            >
                              <button
                                type="button"
                                className="cal-win-free desk-focus nums"
                                data-next={isNext ? "" : undefined}
                                data-testid="desk-window"
                                aria-label={`${windowCopy(dated, now)}, ${lengthWords(window.end - window.start)} — скопировать`}
                                onClick={() => void copyWindow(dated, now)}
                              >
                                {label}
                              </button>
                            </Tooltip>
                          </span>
                        );
                      })}
                      {day.early && kind !== "past" ? (
                        <span className="cal-win-edge nums" data-side="start">
                          {day.early}
                        </span>
                      ) : null}
                      {day.late && kind !== "past" ? (
                        <span className="cal-win-edge nums" data-side="end">
                          {day.late}
                        </span>
                      ) : null}
                    </>
                  )}
                  {own.map((event, index) => {
                    const state = meetingState(event, meId, now);
                    const start = minuteOfDay(event.starts_at);
                    return (
                      <span
                        key={event.id}
                        className="cal-win-pill-slot"
                        style={{
                          left: `${Math.min(at(start), 88)}%`,
                          minWidth: `${at(start + lengthOf(event)) - at(start)}%`,
                          maxWidth: `${100 - Math.min(at(start), 88)}%`,
                          top: `calc(var(--cal-win-pills) + ${lines[index] * 22}px)`,
                        }}
                      >
                        <Tooltip label={`${timeRange(event)} · ${event.title}${state === "owes" ? " · нужен ваш ответ" : ""}`} side="bottom" className="flex w-full">
                          <button type="button" className="cal-win-pill desk-focus" data-state={state} data-testid="desk-event" data-event-id={event.id} onClick={() => onOpen(event)}>
                            <span className="nums">{hhmm(event.starts_at)}</span>
                            <span className="min-w-0 truncate">{event.title}</span>
                          </button>
                        </Tooltip>
                      </span>
                    );
                  })}
                  {isToday && nowMinute >= hours.from && nowMinute <= hours.to ? (
                    <span className="cal-win-now" style={{ left: `${at(nowMinute)}%` }} aria-hidden>
                      <b className="nums">{minuteHm(nowMinute)}</b>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The read failed: said, with «Повторить» — never an empty week that looks free (D-158). */
function WindowsError({ onRetry }: { onRetry: () => void }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="cal-win-error" role="alert" data-testid="desk-windows-error">
      <p className="cal-win-error-title">{offline ? "Нет связи — эта неделя не загружена" : "Не удалось загрузить календарь"}</p>
      <p className="cal-win-error-words">Когда директор занят, сейчас не видно — свободным его не считаю.</p>
      <Button size="sm" variant="secondary" onClick={onRetry} data-testid="desk-windows-retry">
        Повторить
      </Button>
    </div>
  );
}

const DOOR_TITLE: Record<Door["state"], string> = {
  free: "Директор свободен",
  busy: "Директор на встрече",
  dnd: "Не беспокоить",
};

/** «ср 11:30», «сегодня 11:30», «завтра 9:00» — when one of her meetings is. */
function whenOf(event: CalendarEvent, now: Date): string {
  const ymd = ymdOfEvent(event);
  const ahead = daysBetween(todayYmd(now), ymd);
  const day = ahead === 0 ? "" : ahead === 1 ? "завтра " : `${WEEKDAYS_SHORT_RU[isoWeekday(ymd) - 1]} `;
  return `${day}${hhmm(event.starts_at)}`;
}

/**
 * The side of «Окна директора» (D-180), in the slot «Ближайшее» has on the director's calendar:
 * the door now (the lamp and words of «Стойка»), «Ближайшие окна» from now on — each copied for a
 * call with a click — and «Ваши встречи». It reads its own week from today, so the windows are
 * the nearest whatever week is on screen. With two directors their busy time is one: said once.
 */
export function WindowsSide({
  now,
  mine,
  meId,
  onOpen,
}: {
  now: Date;
  /** The page's read of the days on screen: the side reads its own week from today and does not use it. */
  busy?: BusyFeed;
  /** Her meetings ahead (the calendar's list): RLS leaves her only her own. */
  mine: readonly CalendarEvent[];
  meId: string;
  onOpen: (event: CalendarEvent) => void;
}) {
  const settled = useSettled();
  const queryClient = useQueryClient();
  const { door, pending, hold } = useDirectorDoor(settled, now);
  const today = todayYmd(now);
  const ahead = useDirectorBusy(today, shiftDay(today, 8), settled);
  const hours = useWorkHours();
  const settings = useCompanySettings();
  const workdays = settings.data?.daily_report.workdays ?? WORKDAYS_DEFAULT;
  const people = usePeople(settled);
  const directors = (people.data ?? []).filter((person) => person.role === "director" && person.is_active).length;
  const days: Ymd[] = [];
  for (let index = 0; index < 8; index += 1) days.push(shiftDay(today, index));
  const windows = ahead.status === "ready" ? nearestWindows({ blocks: ahead.blocks, days, now, workdays, from: hours.from, to: hours.to, hold: holdBlock(hold, now) }) : [];
  const meetings = mine.filter((event) => !isOver(event, now)).slice(0, 6);
  const retryDoor = () => void queryClient.refetchQueries({ queryKey: ["director-busy"] });

  return (
    <aside className="cal-wside" aria-label="Директор и ваши встречи" data-testid="cal-windows-side">
      {door ? (
        <section className="cal-wside-door" data-state={door.state} data-testid="cal-windows-door">
          <p className="cal-wside-door-title">
            <DoorLamp state={door.state} size={10} />
            {DOOR_TITLE[door.state]}
          </p>
          <p className="cal-wside-door-words nums">{doorWords(door, now, meId)}</p>
        </section>
      ) : pending ? (
        <Bone h={68} />
      ) : (
        <section className="cal-wside-door" data-state="unknown">
          <p className="cal-wside-door-title">Не знаю, занят ли директор</p>
          <p className="cal-wside-door-words">
            Календарь не ответил.{" "}
            <button type="button" className="cal-wside-link desk-focus" onClick={retryDoor}>
              Повторить
            </button>
          </p>
        </section>
      )}

      <section className="cal-wside-part">
        <h3 className="cal-wside-title">Ближайшие окна</h3>
        {ahead.status === "loading" ? (
          <div className="flex flex-col gap-2 pt-1">
            <Bone h={20} />
            <Bone h={20} />
            <Bone h={20} />
          </div>
        ) : ahead.status === "error" ? (
          <p className="cal-wside-empty">
            Не удалось загрузить.{" "}
            <button type="button" className="cal-wside-link desk-focus" onClick={ahead.refetch}>
              Повторить
            </button>
          </p>
        ) : windows.length === 0 ? (
          <p className="cal-wside-empty">На неделю вперёд окон нет</p>
        ) : (
          <ul className="cal-wside-lines">
            {windows.map((window, index) => (
              <li key={`${window.ymd}-${window.start}`}>
                <Tooltip label="Скопировать для звонка" side="top" className="flex w-full">
                  <button
                    type="button"
                    className="cal-wside-line desk-focus"
                    data-next={index === 0 ? "" : undefined}
                    data-testid="cal-window-line"
                    onClick={() => void copyWindow(window, now)}
                  >
                    <span className="cal-wside-time nums">
                      {minuteHm(window.start)}–{minuteHm(window.end)}
                    </span>
                    <span className="cal-wside-words nums">
                      {humanYmd(window.ymd, now)} · {lengthWords(window.end - window.start)}
                    </span>
                    <Copy aria-hidden size={13} className="cal-wside-copy" />
                  </button>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cal-wside-part">
        <h3 className="cal-wside-title">
          Ваши встречи {meetings.length ? <span className="cal-wside-count nums">{meetings.length}</span> : null}
        </h3>
        {meetings.length === 0 ? (
          <p className="cal-wside-empty">Встреч нет</p>
        ) : (
          <ul className="cal-wside-lines">
            {meetings.map((event) => {
              const state = meetingState(event, meId, now);
              return (
                <li key={event.id}>
                  <button type="button" className="cal-wside-line desk-focus" data-state={state} data-testid="cal-mine" onClick={() => onOpen(event)}>
                    <span className="cal-wside-when nums">{whenOf(event, now)}</span>
                    <span aria-hidden className="cal-wside-dot" />
                    <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                    {state === "owes" ? <span className="cal-wside-owes">нужен ответ</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="cal-wside-foot">
        <p className="cal-wside-legend">
          <span>
            <i data-kind="busy" />
            занят
          </span>
          <span>
            <i data-kind="free" />
            свободен
          </span>
          <span>
            <i data-kind="mine" />
            ваши
          </span>
        </p>
        <p className="cal-wside-hint">
          {directors > 1
            ? `Директоров ${directors}: «занят» — когда занят любой из них. Названий их встреч здесь нет`
            : "О встречах директора — только «занят»: названия видит он сам"}
        </p>
      </footer>
    </aside>
  );
}
