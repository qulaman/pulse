"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EventEditor } from "@/components/calendar/EventEditor";
import { EventSheet } from "@/components/calendar/EventSheet";
import { useDeskScope } from "@/components/desk/DeskScope";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import type { Tone } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { shiftDay, ymdOfEvent } from "@/lib/calendar/agenda";
import { calendarScreen, isRunning, type CalendarScreen } from "@/lib/calendar/overview";
import { useCalendar, useCalendarMonth, useEvent, warmCalendarMonth, type CalendarEvent } from "@/lib/calendar/queries";
import { addMonths, compareYmd, monthOf, parseYmd, todayYmd, ymdOf, type Ymd } from "@/lib/datetime/calendar";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useNamesKey } from "@/lib/people/names";
import { usePointsEnabled } from "@/lib/points/queries";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { sceneOf } from "@/lib/tv/state";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/pulse/queries";
import { useMe, useSentTasks } from "@/lib/tasks/queries";

import { CalendarAside } from "./CalendarAside";
import { MonthGrid } from "./CalendarGrids";
import { deadlineMarks, loudest, markCount } from "./deadlines";
import { daysOf, monthTitle, weekTitle, type CalendarView } from "./range";
import { eventsByDay } from "./week";
import { WeekHours } from "./WeekHours";

const EMPTY: CalendarEvent[] = [];

/**
 * The moment in one sentence under the title (D-154) — the phone's status screen (D-100) said in
 * a line, loudest first: on now; about to start; invitations waiting; what today holds; a free day.
 */
function stateLine(screen: CalendarScreen, running: boolean): { text: string; tone?: Tone } {
  const tone = screen.tone === "muted" ? undefined : screen.tone;
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ");
  if (running) return { text: `Идёт: ${screen.detail}`, tone };
  // a free day has no number: its words and what comes after it
  if (screen.value === null) return { text: join(screen.eyebrow, screen.detail || screen.label), tone };
  // about to start — «Через 12 мин · 10:00 — Планёрка»
  if (screen.tone === "warn" && !screen.focusId) return { text: join(screen.eyebrow, screen.detail), tone };
  const detail = screen.detail ? screen.detail.charAt(0).toLowerCase() + screen.detail.slice(1) : null;
  return { text: join(`${screen.value} ${screen.label}`, screen.focusId ? screen.detail : detail), tone };
}

/**
 * «Календарь» of the desk (D-153, D-154): «‹ сегодня ›» and «Неделя | Месяц» over the grid — a
 * week of hours or the month's weeks, `?view` and `?d` in the address — and «Ближайшее» beside
 * it. «Сроки задач» (`?deadlines=1`, the key D) lays the director's open orders over the days.
 * A meeting opens in the phone's own sheet, drawn as a dialog here; the director makes a new one
 * in the phone's form. `?e=<id>` (a push opened on a computer) turns to that meeting's day and
 * opens it. The light of the screen is the nearest meeting's: on now, or about to start.
 */
export function DeskCalendar() {
  // a namesake gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { role } = useDeskScope();
  const isDirector = role === "director";
  const me = useMe();
  const meId = me.data?.userId ?? "";
  const now = useNow();
  const today = todayYmd(now);
  const queryClient = useQueryClient();

  const params = useSearchParams();
  const pathname = usePathname();
  const view: CalendarView = params.get("view") === "month" ? "month" : "week";
  const asked = params.get("d");
  const day: Ymd = asked && parseYmd(asked) ? asked : today;
  const month = monthOf(day);
  // the layer of deadlines is the director's: his orders, by his own hand
  const showDeadlines = isDirector && params.get("deadlines") === "1";

  /** The address holds what is on screen: steps replace it, a change of view is a step back can undo. */
  const go = (next: { d?: Ymd; view?: CalendarView; deadlines?: boolean }, push = false) => {
    const query = new URLSearchParams(params.toString());
    if (next.d !== undefined) {
      if (next.d === today) query.delete("d");
      else query.set("d", next.d);
    }
    if (next.view !== undefined) {
      if (next.view === "week") query.delete("view");
      else query.set("view", next.view);
    }
    if (next.deadlines !== undefined) {
      if (next.deadlines) query.set("deadlines", "1");
      else query.delete("deadlines");
    }
    query.delete("e");
    const text = query.toString();
    const url = text ? `${pathname}?${text}` : pathname;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  // seven to forty-two day strings: cheaper to draw again than to remember
  const days = daysOf(view, day, month);
  const first = days[0];
  const last = days[days.length - 1];
  // a month's window holds it and the next one: the first and the last day on screen cover the edges
  const head = useCalendarMonth(monthOf(first));
  const tail = useCalendarMonth(monthOf(last));
  const upcoming = useCalendar();

  // the neighbours of what is shown are read before the arrow is pressed
  useEffect(() => {
    void warmCalendarMonth(queryClient, addMonths(monthOf(first), -1));
    void warmCalendarMonth(queryClient, addMonths(monthOf(last), 1));
  }, [queryClient, first, last]);

  const events = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const event of [...(head.data ?? EMPTY), ...(tail.data ?? EMPTY)]) byId.set(event.id, event);
    return [...byId.values()];
  }, [head.data, tail.data]);
  const byDay = eventsByDay(events, days);

  // the director's open orders due on the days on screen — counted for the switch even while it is off
  const sent = useSentTasks(isDirector ? meId || undefined : undefined);
  const marks = deadlineMarks(isDirector ? (sent.data ?? []) : [], days, today, now);
  const marksShown = markCount(marks);
  const marksTone = loudest([...marks.values()].flat());

  // the moment, and the light of the nearest meeting: on now — the accent, a quarter of an hour away — a warning
  const ahead = upcoming.data ?? EMPTY;
  const screen = calendarScreen(ahead, meId, now);
  // today's meeting on now — the one the status screen speaks of
  const running = ahead.some((event) => isRunning(event, now) && ymdOfEvent(event) === today);
  const soon = !running && screen.tone === "warn" && !screen.focusId;
  const light: Tone | null = running ? "accent" : soon ? "warn" : null;

  // the open meeting, by id: it stays open (and live) when an edit carries it off the screen
  const [openId, setOpenId] = useState<string | null>(() => params.get("e"));
  const known = openId ? (events.find((event) => event.id === openId) ?? upcoming.data?.find((event) => event.id === openId) ?? null) : null;
  const opened = useEvent(openId, known);
  const [creating, setCreating] = useState(false);

  // a push's `?e`: the grid turns to that meeting's day once it is read, and the address lets it go
  const deepLink = params.get("e");
  const linked = deepLink && opened.data?.id === deepLink ? opened.data : null;
  useEffect(() => {
    // `go` drops `?e` from the address: the next render has nothing to follow
    if (linked) go({ d: ymdOfEvent(linked) });
  });

  const open = (event: CalendarEvent) => setOpenId(event.id);
  const follow = (startsAt: string) => go({ d: ymdOfEvent({ starts_at: startsAt }) });

  const step = (delta: -1 | 1) => {
    if (view === "week") return go({ d: shiftDay(day, delta * 7) });
    const next = addMonths(month, delta);
    const todayParts = parseYmd(today)!;
    // today when the month has it, its first day otherwise — as the phone's arrows do
    go({ d: todayParts.year === next.year && todayParts.month === next.month ? today : ymdOf(next.year, next.month, 1) });
  };

  const toggleDeadlines = () => go({ deadlines: !showDeadlines });

  // ←/→ — the previous or next week (month), T — today, D — the deadlines; by the physical key, so a Russian layout works
  const stepRef = useRef(step);
  const todayRef = useRef(() => go({ d: today }));
  const deadlinesRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    stepRef.current = step;
    todayRef.current = () => go({ d: today });
    deadlinesRef.current = isDirector ? toggleDeadlines : null;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open")) return;
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        stepRef.current(event.code === "ArrowLeft" ? -1 : 1);
      } else if (event.code === "KeyT") {
        event.preventDefault();
        todayRef.current();
      } else if (event.code === "KeyD" && deadlinesRef.current) {
        event.preventDefault();
        deadlinesRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loading = (head.isLoading && !head.data) || (tail.isLoading && !tail.data);
  const title = view === "week" ? weekTitle(first, last) : monthTitle(month);

  return (
    <DeskPage>
      <PageTitle
        title="Календарь"
        light={light}
        state={upcoming.data ? stateLine(screen, running) : null}
        actions={
          isDirector ? (
            <>
              <CalendarOnWallButton />
              <Button size="sm" onClick={() => setCreating(true)} data-testid="desk-event-new">
                Новое мероприятие
              </Button>
            </>
          ) : null
        }
      />

      <Toolbar
        end={
          <>
            {isDirector ? <DeadlinesToggle on={showDeadlines} count={marksShown} tone={marksTone} onToggle={toggleDeadlines} /> : null}
            <SegmentTabs<CalendarView>
            aria-label="Вид календаря"
            value={view}
            onChange={(next) => {
              if (next !== view) go({ view: next }, true);
            }}
            items={[
              { value: "week", label: "Неделя" },
              { value: "month", label: "Месяц" },
            ]}
            />
          </>
        }
      >
        <div className="flex items-center gap-1">
          <ArrowButton label={view === "week" ? "Прошлая неделя" : "Прошлый месяц"} onClick={() => step(-1)} back />
          <Button size="sm" variant="secondary" disabled={day === today} onClick={() => go({ d: today })} data-testid="desk-calendar-today">
            Сегодня
          </Button>
          <ArrowButton label={view === "week" ? "Следующая неделя" : "Следующий месяц"} onClick={() => step(1)} />
        </div>
        <h2 className="ml-2 font-display text-[17px] font-semibold leading-6" data-testid="desk-calendar-title">
          {title}
        </h2>
      </Toolbar>

      {/* the grid first: the column beside it gives way on a narrower screen */}
      <div className="grid grid-cols-[minmax(0,1fr)_clamp(224px,18vw,280px)] items-start gap-5">
        {loading ? (
          <Bone h={view === "week" ? 628 : 640} className="!rounded-[12px]" />
        ) : view === "week" ? (
          <WeekHours days={days} byDay={byDay} today={today} now={now} meId={meId} onOpen={open} deadlines={showDeadlines ? marks : null} />
        ) : (
          <MonthGrid
            days={days}
            byDay={byDay}
            today={today}
            now={now}
            meId={meId}
            onOpen={open}
            month={month}
            onDay={(ymd) => go({ d: ymd, view: "week" }, true)}
            deadlines={showDeadlines ? marks : null}
          />
        )}
        <CalendarAside upcoming={upcoming.data ?? EMPTY} now={now} meId={meId} onOpen={open} />
      </div>

      <EventSheet event={opened.data ?? null} onClose={() => setOpenId(null)} meId={meId} isDirector={isDirector} onSaved={follow} />

      {isDirector ? (
        <EventEditor
          open={creating}
          onClose={() => setCreating(false)}
          event={null}
          // a meeting is made for a day ahead: from a past day the form starts at today
          day={compareYmd(day, today) < 0 ? today : day}
          meId={meId}
          now={now}
          onSaved={follow}
        />
      ) : null}
    </DeskPage>
  );
}

/**
 * «Сроки задач»: the layer of the director's open orders over the calendar, on and off — with
 * how many are due on the days on screen, red while one of them is already late.
 */
function DeadlinesToggle({ on, count, tone, onToggle }: { on: boolean; count: number; tone: "danger" | "warn" | "muted"; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title="Сроки открытых задач на этих днях · клавиша D"
      data-testid="desk-deadlines-toggle"
      className={`flex h-9 items-center gap-2 rounded-[11px] border px-3 font-display text-[13px] font-semibold leading-4 transition-colors duration-[120ms] ${
        on ? "border-accent/55 bg-accent/[0.08] text-text" : "border-border/75 bg-surface/80 text-muted hover:text-text"
      }`}
    >
      <span aria-hidden className={`h-[7px] w-[7px] rotate-45 rounded-[1px] ${on ? "bg-accent" : "bg-muted"}`} />
      Сроки задач
      {count > 0 ? (
        <span className="nums text-[12px]" style={{ color: tone === "danger" ? "var(--danger)" : on ? "var(--accent)" : undefined }}>
          {count}
        </span>
      ) : null}
      <Kbd>D</Kbd>
    </button>
  );
}

function ArrowButton({ label, onClick, back = false }: { label: string; onClick: () => void; back?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={back ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
      </svg>
    </button>
  );
}

/**
 * «Календарь на стену» (D-96) — the phone calendar's head button as a desk button: the week ahead
 * goes up on the office wall as the «Календарь» scene, again — the face comes back. A remote
 * command (`tv_control`), no queue: without network an honest «нет связи».
 */
function CalendarOnWallButton() {
  const state = useTvState();
  const control = useTvControl();
  // the round of scenes counts the rating only with points on (D-123): the same count as the wall
  const points = usePointsEnabled().data ?? true;
  const onWall = sceneOf(state.data ?? null, new Date(), points) === "calendar";
  return (
    <Button
      size="sm"
      variant={onWall ? "primary" : "secondary"}
      aria-pressed={onWall}
      disabled={control.isPending}
      data-testid="desk-calendar-on-wall"
      onClick={() =>
        control.mutate(
          { scene: onWall ? "face" : "calendar" },
          { onSuccess: () => toast(onWall ? "Календарь убран со стены" : "Календарь на стене · неделя вперёд") },
        )
      }
    >
      {onWall ? "Календарь на стене" : "Календарь на стену"}
    </Button>
  );
}
