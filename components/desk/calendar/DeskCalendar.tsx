"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Diamond, MonitorUp, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, ViewTransition, type ReactNode } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { useScreenKeys } from "@/components/desk/team/keys";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { IconButton } from "@/components/desk/ui/IconButton";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import type { Tone } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { PICK_SWAP, stepType, SWITCH_OR_STEP } from "@/lib/desk/motion";
import { noticeOfEdit, ymdOfEvent } from "@/lib/calendar/agenda";
import { canMove, MOVE_HOLD_MS, moveDraft } from "@/lib/calendar/move";
import { DESK_WORDS, useEditEvent } from "@/lib/calendar/mutations";
import { calendarScreen, isRunning, type CalendarScreen } from "@/lib/calendar/overview";
import { useCalendar, useCalendarMonth, useEvent, warmCalendarMonth, type CalendarEvent } from "@/lib/calendar/queries";
import { addDays, addMonths, compareYmd, monthOf, parseYmd, todayYmd, ymdOf, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useNamesKey } from "@/lib/people/names";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { sceneOf } from "@/lib/tv/state";
import { useNow } from "@/lib/useNow";
import { useOnline } from "@/lib/useOnline";

import { MonthGrid } from "./CalendarGrids";
import { CalendarSide } from "./CalendarSide";
import { deadlineMarks, loudest, markCount } from "./deadlines";
import { EventForm, type EventSeed } from "./EventForm";
import { QuickCreate } from "./QuickCreate";
import { daysOf, monthTitle, weekTitle, type CalendarView } from "./range";
import type { Slot } from "./slots";
import { useDirectorBusy } from "./useDirectorBusy";
import { eventsByDay } from "./week";
import { WeekHours } from "./WeekHours";
import { DirectorWindows, WindowsSide } from "./Windows";

const EMPTY: CalendarEvent[] = [];
/** Monday to Friday, until the company's own working days have come (`settings.daily_report.workdays`). */
const WORKDAYS: readonly number[] = [1, 2, 3, 4, 5];
const AQTOBE_WHEN = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

/** The full form: a meeting to change, or a new one from what is known of it. */
type FormState = { event: CalendarEvent | null; seed: EventSeed | null };
/** A meeting being made with the mouse: its slot on the grid, the ghost it stands on, the title so far. */
type QuickState = { slot: Slot; anchor: HTMLElement; title: string };
/** A dragged meeting waiting out its «Отменить» (D-180): drawn at its new time from the drop. */
type Moving = { start: Date; end: Date };

/** The phone's headline says «мероприятие»; the desk says «встреча» on every screen (D-158). */
function meetingWords(text: string): string {
  return text.replace(/мероприятий/g, "встреч").replace(/мероприятия/g, "встречи").replace(/мероприятие/g, "встреча");
}

/**
 * The moment in one sentence under the title (D-154) — the phone's status screen (D-100) said in
 * a line, loudest first: on now; about to start; invitations waiting; what today holds; a free day.
 * It is print: only an invitation that waits for this person's answer is written in the pen.
 */
function stateLine(screen: CalendarScreen, running: boolean): { text: string; tone?: Tone } {
  const tone: Tone | undefined = screen.focusId ? "warn" : undefined;
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ");
  if (running) return { text: meetingWords(`Идёт: ${screen.detail}`), tone };
  if (screen.value === null) return { text: meetingWords(join(screen.eyebrow, screen.detail || screen.label)), tone };
  if (screen.tone === "warn" && !screen.focusId) return { text: meetingWords(join(screen.eyebrow, screen.detail)), tone };
  const detail = screen.detail ? screen.detail.charAt(0).toLowerCase() + screen.detail.slice(1) : null;
  return { text: meetingWords(join(`${screen.value} ${screen.label}`, screen.focusId ? screen.detail : detail)), tone };
}

/**
 * «Календарь» of the desk (D-153, D-154, D-180). The director's week is the main form: the day he
 * looks at (`?day`, a click on its date or Shift+←/→; today by default) is wider inside the week,
 * meetings that overlap cascade, deadlines stand on a rail of their own (`?deadlines=1`, D). Beside
 * the grid, in one fixed column, is the day — what is on now, invitations, answers, what is next —
 * and an open meeting takes that place (`?e=<id>`, kept in the address: reload and links keep it).
 * A click or a drag over an empty stretch makes a meeting with the quick card beside its ghost;
 * a drag of his own meeting moves it after 5 s that «Отменить» can stop (everyone gets «Перенос»).
 * The secretary's week is «Окна директора»: when he is busy and free, never what with (D-158 §5).
 * A failed read says so and offers «Повторить» — never an empty week that looks free (D-158).
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
  const online = useOnline();
  const settings = useCompanySettings();
  // the company's working days live with the daily report (D-155 §7): one list for the whole product
  const workdays = settings.data?.daily_report.workdays ?? WORKDAYS;

  const params = useDeskParams();
  const pathname = usePathname();
  const view: CalendarView = params.get("view") === "month" ? "month" : "week";
  const asked = params.get("d");
  const anchor: Ymd = asked && parseYmd(asked) ? asked : today;
  const month = monthOf(anchor);
  // the layer of deadlines is the director's: his orders, by his own hand
  const showDeadlines = isDirector && params.get("deadlines") === "1";
  const openId = params.get("e");

  /**
   * The address holds what is on screen: steps replace it, a change of view is a step back can undo.
   * Through the desk's address (D-184): the week and the month swap as two pictures, the side
   * changes in place for a meeting or a day, a step of weeks or months slides the way it goes (a held
   * arrow — at once).
   */
  const go = (next: { d?: Ymd; view?: CalendarView; deadlines?: boolean; day?: Ymd | null; e?: string | null }, push = false, fromKeys = false) => {
    // from the address as it is now, not as drawn: a step may still wait for its transition
    const query = new URLSearchParams(window.location.search);
    const set = (name: string, value: string | null) => (value === null ? query.delete(name) : query.set(name, value));
    if (next.d !== undefined) set("d", next.d === today ? null : next.d);
    if (next.view !== undefined) set("view", next.view === "week" ? null : next.view);
    if (next.deadlines !== undefined) set("deadlines", next.deadlines ? "1" : null);
    if (next.day !== undefined) set("day", next.day);
    if (next.e !== undefined) set("e", next.e);
    const text = query.toString();
    const url = text ? `${pathname}?${text}` : pathname;
    const switched = next.view !== undefined && next.view !== view;
    // a step only when the week or the month on screen changes: a date inside it does not slide
    const target = !switched && next.d !== undefined ? daysOf(view, next.d, monthOf(next.d))[0] : undefined;
    const stepped = target !== undefined && target !== first ? stepType(first, target) : undefined;
    const picked = !switched && next.d === undefined && (next.e !== undefined || next.day !== undefined);
    writeDeskAddress(url, { push, type: switched ? "desk-switch" : (stepped ?? (picked ? "desk-pick" : undefined)), burst: fromKeys });
  };

  // seven to forty-two day strings: cheaper to draw again than to remember
  const days = daysOf(view, anchor, month);
  const first = days[0];
  const last = days[days.length - 1];
  const head = useCalendarMonth(monthOf(first));
  const tail = useCalendarMonth(monthOf(last));
  const upcoming = useCalendar();

  // the day the week is looking at: chosen, else today when it is on screen, else none (all equal)
  const chosenDay = params.get("day");
  const focusDay: Ymd | null = view === "week" ? (chosenDay && days.includes(chosenDay) ? chosenDay : days.includes(today) ? today : null) : null;
  // the side speaks of a day: the one looked at, else today, else the first of the screen
  const sideDay: Ymd = focusDay ?? (chosenDay && parseYmd(chosenDay) ? chosenDay : days.includes(today) ? today : first);

  // the neighbours of what is shown are read before the arrow is pressed
  useEffect(() => {
    void warmCalendarMonth(queryClient, addMonths(monthOf(first), -1));
    void warmCalendarMonth(queryClient, addMonths(monthOf(last), 1));
  }, [queryClient, first, last]);

  // a dragged meeting stands at its new time from the drop, while its write waits for «Отменить»
  const [moving, setMoving] = useState<ReadonlyMap<string, Moving>>(() => new Map());
  const events = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const event of [...(head.data ?? EMPTY), ...(tail.data ?? EMPTY)]) byId.set(event.id, event);
    for (const [id, to] of moving) {
      const event = byId.get(id);
      if (event) byId.set(id, { ...event, starts_at: to.start.toISOString(), ends_at: to.end.toISOString() });
    }
    return [...byId.values()];
  }, [head.data, tail.data, moving]);
  const byDay = eventsByDay(events, days);

  // the director's open orders due on the days on screen — counted for the switch even while it is off
  const sent = useSentTasks(isDirector ? meId || undefined : undefined);
  const marks = deadlineMarks(isDirector ? (sent.data ?? []) : [], days, today, now);
  const marksShown = markCount(marks);
  const marksTone = loudest([...marks.values()].flat());

  // the secretary sees the director's time, and only that (owner, 2026-11-04; D-158 §5)
  const isSecretary = role === "secretary";
  const busy = useDirectorBusy(first, addDays(last, 1), isSecretary);
  // already laid by day and cut to the days on screen; `to` is exclusive, long ranges are read in parts
  const busyState = { status: busy.status, blocks: busy.blocks, onRetry: () => void busy.refetch() };

  // the moment in a line under the title
  const ahead = upcoming.data ?? EMPTY;
  const screen = calendarScreen(ahead, meId, now);
  const running = ahead.some((event) => isRunning(event, now) && ymdOfEvent(event) === today);

  // the open meeting, by id from the address: it stays open (and live) when an edit carries it off
  const known = openId ? (events.find((event) => event.id === openId) ?? upcoming.data?.find((event) => event.id === openId) ?? null) : null;
  const opened = useEvent(openId, known);
  const missing = Boolean(openId) && opened.isFetched && !opened.isError && !opened.data;
  const [form, setForm] = useState<FormState | null>(null);
  const [quick, setQuick] = useState<QuickState | null>(null);

  // a link's `?e`: the grid turns to that meeting's day once it is read; `?e` itself stays
  const linkedDay = openId && opened.data?.id === openId ? ymdOfEvent(opened.data) : null;
  useEffect(() => {
    if (linkedDay && !days.includes(linkedDay)) go({ d: linkedDay, day: view === "week" ? linkedDay : null });
  });

  const open = (event: CalendarEvent) => {
    setQuick(null);
    go({ e: event.id });
  };
  const close = () => go({ e: null });
  const follow = (startsAt: string) => go({ d: ymdOfEvent({ starts_at: startsAt }), day: null });
  // a new meeting is made for a day ahead: from a past day the form starts at today
  const newDay = compareYmd(sideDay, today) < 0 ? today : sideDay;
  const newMeeting = (seed: EventSeed = { day: newDay }) => {
    setQuick(null);
    setForm({ event: null, seed });
  };
  const editOpen = () => {
    if (!opened.data) return;
    setForm({ event: opened.data, seed: null });
  };

  // a drag of the director's own meeting (D-180): the write waits 5 s for «Отменить», a new drag or
  // leaving the page sends the waiting one at once — a meeting is never left moved only on screen
  const edit = useEditEvent(DESK_WORDS);
  const holds = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void; token: number }>());
  const tokens = useRef(0);
  const setMoved = (id: string, to: Moving | null) =>
    setMoving((current) => {
      const next = new Map(current);
      if (to) next.set(id, to);
      else next.delete(id);
      return next;
    });
  /** Send one waiting move now (or every one: leaving the page). */
  const flushMove = (id?: string) => {
    for (const [key, waiting] of [...holds.current]) {
      if (id !== undefined && key !== id) continue;
      clearTimeout(waiting.timer);
      holds.current.delete(key);
      waiting.send();
    }
  };
  /** «Отменить» of one toast: that move only, and only while it still waits. */
  const cancelMove = (id: string, token: number) => {
    const waiting = holds.current.get(id);
    if (!waiting || waiting.token !== token) return;
    clearTimeout(waiting.timer);
    holds.current.delete(id);
    setMoved(id, null);
  };
  const onMove = (event: CalendarEvent, start: Date, end: Date) => {
    if (!canMove(event, meId, now) || start.getTime() < now.getTime()) {
      toast("В прошлое встречу не перенести");
      return;
    }
    // the same meeting dragged again: the newer place replaces the waiting one, the timer starts over
    const before = holds.current.get(event.id);
    if (before) clearTimeout(before.timer);
    const draft = moveDraft(event, start, end);
    const notice = noticeOfEdit(event, draft, now);
    const send = () =>
      edit.mutate(
        { eventId: event.id, draft, toast: `Перенёс «${event.title}» на ${AQTOBE_WHEN.format(start)}` },
        {
          onSettled: () => setMoved(event.id, null),
          onError: (error) => toast(error instanceof Error && error.message ? error.message : "Не получилось перенести — встреча на прежнем месте"),
        },
      );
    const token = ++tokens.current;
    holds.current.set(event.id, { timer: setTimeout(() => flushMove(event.id), MOVE_HOLD_MS), send, token });
    setMoved(event.id, { start, end });
    // who gets what is the server's rule (declined people get nothing): the same rule says it here
    toast(`Перенесу «${event.title}» на ${AQTOBE_WHEN.format(start)}${notice === "Перенос" ? " — участникам уйдёт «Перенос»" : ""}`, {
      lifetimeMs: MOVE_HOLD_MS,
      action: { label: "Отменить", onClick: () => cancelMove(event.id, token) },
    });
  };
  useEffect(() => {
    const leave = () => flushMove();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
    // the holds live in a ref: one listener for the page's life
  }, []);

  const step = (delta: -1 | 1, fromKeys = false) => {
    setQuick(null);
    if (view === "week") return go({ d: addDays(anchor, delta * 7), day: null, e: null }, false, fromKeys);
    const next = addMonths(month, delta);
    const todayParts = parseYmd(today)!;
    // today when the month has it, its first day otherwise — as the phone's arrows do
    go({ d: todayParts.year === next.year && todayParts.month === next.month ? today : ymdOf(next.year, next.month, 1), day: null, e: null }, false, fromKeys);
  };
  /** Shift+←/→: the day looked at moves along the week (the grid widens it). */
  const stepDay = (delta: -1 | 1) => {
    if (view !== "week") return;
    const from = focusDay ?? (delta > 0 ? addDays(first, -1) : addDays(last, 1));
    const next = addDays(from, delta);
    if (days.includes(next)) go({ day: next });
  };

  const toggleDeadlines = () => go({ deadlines: !showDeadlines });
  const setView = (next: CalendarView) => {
    if (next !== view) go({ view: next, day: null }, true);
  };

  // the keys of the screen, by the physical key so a Russian layout works. The secretary's M stays
  // «Сообщение» of the top bar (D-175): her W turns «Окна директора» and the month in turn.
  useScreenKeys((event) => {
    const code = event.code;
    const arrow = code === "ArrowLeft" || code === "ArrowRight";
    if (event.shiftKey) {
      if (arrow && isDirector) {
        stepDay(code === "ArrowLeft" ? -1 : 1);
        return true;
      }
      return false;
    }
    if (arrow) step(code === "ArrowLeft" ? -1 : 1, true);
    else if (code === "KeyT") go({ d: today, day: null });
    else if (code === "KeyW") setView(isSecretary && view === "week" ? "month" : "week");
    else if (code === "KeyM" && isDirector) setView("month");
    else if (code === "KeyD" && isDirector) toggleDeadlines();
    else if (code === "KeyN" && isDirector) newMeeting();
    else if (code === "KeyE" && isDirector && openId && opened.data) editOpen();
    else if (code === "Escape" && openId) close();
    else return false;
    return true;
  });

  useShortcuts("Календарь", [
    { keys: ["←", "→"], label: view === "week" ? "Прошлая и следующая неделя" : "Прошлый и следующий месяц" },
    ...(isDirector && view === "week" ? [{ keys: ["Shift", "←", "→"], label: "День крупно — соседний" }] : []),
    { keys: ["T"], label: "Сегодня" },
    ...(isDirector
      ? [
          { keys: ["W"], label: "Неделя" },
          { keys: ["M"], label: "Месяц" },
          { keys: ["N"], label: "Новая встреча" },
          { keys: ["D"], label: "Сроки задач на календаре" },
          { keys: ["E"], label: "Изменить открытую встречу" },
        ]
      : [{ keys: ["W"], label: "Окна директора · месяц" }]),
    { keys: ["Tab", "Enter"], label: "К встрече и открыть её" },
    { keys: ["Esc"], label: "Закрыть встречу" },
  ]);

  const failed = (head.isError && !head.data) || (tail.isError && !tail.data);
  const loading = !failed && ((head.isLoading && !head.data) || (tail.isLoading && !tail.data));
  const unreachable = !online && !head.data && !tail.data;
  const retry = () => {
    void head.refetch();
    void tail.refetch();
  };
  const title = view === "week" ? weekTitle(first, last) : monthTitle(month);


  const sideStatus = upcoming.isError && !upcoming.data ? "error" : upcoming.isLoading && !upcoming.data ? "loading" : "ready";
  const sideOpen = openId ? { id: openId, event: opened.data ?? null, missing } : null;
  // the side reads every meeting loaded — the months on screen and the month ahead — so a focused
  // day outside the month ahead is not «Встреч нет»
  const sideEvents = useMemo(() => {
    const byId = new Map<string, CalendarEvent>();
    for (const event of [...events, ...ahead]) if (!byId.has(event.id)) byId.set(event.id, event);
    return [...byId.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, ahead]);

  let grid: ReactNode;
  if (unreachable) {
    grid = <EmptyState title="Нет связи — эта неделя не загружена" hint="Встречи появятся, как только вернётся связь" />;
  } else if (failed) {
    grid = (
      <EmptyState
        title="Не удалось загрузить календарь"
        hint="Встречи не пропали — их не получилось прочитать"
        action={
          <Button size="sm" variant="secondary" onClick={retry} data-testid="desk-calendar-retry">
            Повторить
          </Button>
        }
      />
    );
  } else if (loading) {
    grid = <Bone h={view === "week" ? 628 : 640} />;
  } else if (view === "month") {
    grid = (
      <MonthGrid
        days={days}
        byDay={byDay}
        today={today}
        now={now}
        meId={meId}
        onOpen={open}
        openId={openId}
        month={month}
        onDay={(ymd) => go({ d: ymd, view: "week", day: ymd }, true)}
        onNew={isDirector ? (ymd) => newMeeting({ day: ymd }) : null}
        deadlines={showDeadlines ? marks : null}
        busy={isSecretary && busy.status === "ready" ? busy.blocks : null}
        workdays={workdays}
      />
    );
  } else if (isSecretary) {
    grid = <DirectorWindows days={days} today={today} now={now} workdays={workdays} busy={busyState} mine={byDay} meId={meId} onOpen={open} />;
  } else {
    grid = (
      <WeekHours
        days={days}
        byDay={byDay}
        today={today}
        now={now}
        meId={meId}
        focusDay={focusDay}
        workdays={workdays}
        onFocusDay={(ymd) => go({ day: ymd === focusDay && ymd !== today ? null : ymd })}
        onOpen={open}
        deadlines={showDeadlines ? marks : null}
        onSlot={
          isDirector
            ? (slot, element) => {
                setQuick({ slot, anchor: element, title: "" });
              }
            : null
        }
        ghost={quick ? { slot: quick.slot, title: quick.title } : null}
        onMove={isDirector ? onMove : null}
        openId={openId}
      />
    );
  }

  return (
    <DeskPage>
      <PageTitle
        title="Календарь"
        state={upcoming.data ? stateLine(screen, running) : null}
        actions={
          <>
            <h2 className="desk-figure min-w-[150px] text-[20px] leading-6" data-testid="desk-calendar-title">
              {title}
            </h2>
            <div className="cal-nav flex items-center">
              <IconButton label={view === "week" ? "Прошлая неделя" : "Прошлый месяц"} keys={["←"]} icon={<ChevronLeft size={16} aria-hidden />} onClick={() => step(-1)} testId="desk-calendar-prev" />
              <Tooltip label="Сегодня" keys={["T"]} side="bottom">
                <Button size="sm" variant="ghost" className="cal-today-button" disabled={anchor === today && !chosenDay} onClick={() => go({ d: today, day: null })} data-testid="desk-calendar-today">
                  Сегодня
                </Button>
              </Tooltip>
              <IconButton label={view === "week" ? "Следующая неделя" : "Следующий месяц"} keys={["→"]} icon={<ChevronRight size={16} aria-hidden />} onClick={() => step(1)} testId="desk-calendar-next" />
            </div>
            {isDirector ? <DeadlinesToggle on={showDeadlines} count={marksShown} tone={marksTone} onToggle={toggleDeadlines} /> : null}
            <SegmentTabs<CalendarView>
              aria-label="Вид календаря"
              value={view}
              onChange={setView}
              items={
                isDirector
                  ? [
                      { value: "week", label: <KeyLabel label="Неделя" hint="W" /> },
                      { value: "month", label: <KeyLabel label="Месяц" hint="M" /> },
                    ]
                  : [
                      { value: "week", label: <KeyLabel label="Окна директора" hint="W" /> },
                      { value: "month", label: "Месяц" },
                    ]
              }
            />
            {isDirector ? (
              <>
                <CalendarOnWallButton view={view} />
                <Tooltip label="Новая встреча" keys={["N"]} side="bottom">
                  <Button size="sm" icon={<Plus size={15} strokeWidth={2.2} aria-hidden />} onClick={() => newMeeting()} data-testid="desk-event-new">
                    Новая встреча
                  </Button>
                </Tooltip>
              </>
            ) : null}
          </>
        }
      />

      {/* the grid and, beside it, the day or the open meeting; the shell's own panel takes the side's place */}
      <div className="cal-layout grid items-start gap-6">
        <div className="min-w-0">
          {/* the week and the month swap as two pictures, a step slides the way it goes (D-184) */}
          <ViewTransition update={SWITCH_OR_STEP} default="none">
            {grid}
          </ViewTransition>
        </div>
        {/* the day or the open meeting: the side stays, what is on it changes in place */}
        <ViewTransition update={PICK_SWAP} default="none">
          <div className="cal-side-slot min-w-0">
            {isSecretary && !openId ? (
              <WindowsSide now={now} busy={busyState} mine={ahead} meId={meId} onOpen={open} />
            ) : (
              <CalendarSide
                day={sideDay}
                upcoming={sideEvents}
                status={sideStatus}
                onRetry={() => void upcoming.refetch()}
                now={now}
                meId={meId}
                isDirector={isDirector}
                deadlines={showDeadlines ? (marks.get(sideDay) ?? []) : null}
                open={sideOpen}
                onOpen={open}
                onClose={close}
                onEdit={editOpen}
              />
            )}
          </div>
        </ViewTransition>
      </div>

      {isDirector ? (
        <>
          <QuickCreate
            slot={quick?.slot ?? null}
            anchor={quick?.anchor ?? null}
            meId={meId}
            now={now}
            onClose={() => setQuick(null)}
            onTitle={(text) => setQuick((current) => (current ? { ...current, title: text } : current))}
            onMore={(seed) => newMeeting(seed)}
            onCreated={follow}
            events={events}
          />
          <EventForm open={form !== null} onClose={() => setForm(null)} event={form?.event ?? null} seed={form?.seed ?? null} meId={meId} now={now} onSaved={follow} />
        </>
      ) : null}
    </DeskPage>
  );
}

/**
 * «Сроки задач»: the director's open orders on the calendar, on and off — a word of the head with
 * how many are due on the days on screen, red while one of them is already late.
 */
function DeadlinesToggle({ on, count, tone, onToggle }: { on: boolean; count: number; tone: "danger" | "warn" | "muted"; onToggle: () => void }) {
  return (
    <Tooltip label="Сроки открытых задач на этих днях" keys={["D"]} side="bottom">
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        data-testid="desk-deadlines-toggle"
        data-tone={tone}
        className={`cal-deadlines flex h-8 items-center gap-1.5 text-[14px] leading-5 transition-colors duration-[120ms] ${on ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--text)]" : "text-muted hover:text-text"}`}
      >
        <Diamond aria-hidden size={13} strokeWidth={2.2} className="cal-deadlines-icon" />
        Сроки
        {count > 0 ? (
          <span className="cal-deadlines-count nums text-[12px]" style={{ color: tone === "danger" ? "var(--danger)" : undefined }}>
            {count}
          </span>
        ) : null}
        <Kbd>D</Kbd>
      </button>
    </Tooltip>
  );
}

/** A segment's word with its key, quiet until hovered — the mouse teaches the keyboard. */
function KeyLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="group/key inline-flex items-center gap-1.5">
      {label}
      <span className="nums text-[11px] text-muted transition-colors duration-[120ms] group-hover/key:text-text">{hint}</span>
    </span>
  );
}

/**
 * «Календарь на стену» (D-96, D-98): the view on screen — the week or the month — goes up on the
 * office wall as the «Календарь» scene; again — the face comes back. A remote command (`tv_control`),
 * no queue: without network an honest «нет связи». An icon of the head, lit while it is up.
 */
function CalendarOnWallButton({ view }: { view: CalendarView }) {
  const state = useTvState();
  const control = useTvControl();
  // the round of scenes counts the rating only with points on (D-123): the same count as the wall
  const points = usePointsEnabled().data ?? true;
  const onWall = sceneOf(state.data ?? null, new Date(), points) === "calendar";
  const word = view === "month" ? "месяц" : "неделя";
  return (
    <IconButton
      label={onWall ? "Календарь на стене — убрать" : `Календарь на стену · ${word}`}
      icon={onWall ? <CalendarRange size={16} aria-hidden /> : <MonitorUp size={16} aria-hidden />}
      pressed={onWall}
      disabled={control.isPending}
      testId="desk-calendar-on-wall"
      onClick={() =>
        control.mutate(
          onWall ? { scene: "face" } : { scene: "calendar", calendar: view === "month" ? "month" : "week" },
          { onSuccess: () => toast(onWall ? "Календарь убран со стены" : `Календарь на стене · ${word}`) },
        )
      }
    />
  );
}
