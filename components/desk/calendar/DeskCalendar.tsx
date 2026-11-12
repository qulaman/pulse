"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight, Diamond, MonitorUp, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import type { Anchor } from "@/components/desk/ui/Popover";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import type { Tone } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { shiftDay, ymdOfEvent } from "@/lib/calendar/agenda";
import { calendarScreen, isRunning, type CalendarScreen } from "@/lib/calendar/overview";
import { useCalendar, useCalendarMonth, useEvent, warmCalendarMonth, type CalendarEvent } from "@/lib/calendar/queries";
import { addMonths, compareYmd, monthOf, parseYmd, todayYmd, ymdOf, type Ymd } from "@/lib/datetime/calendar";
import { busyByDay } from "@/lib/desk/busy";
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
import { EventCard } from "./EventCard";
import { EventForm, type EventSeed } from "./EventForm";
import { QuickCreate } from "./QuickCreate";
import { daysOf, monthTitle, weekTitle, type CalendarView } from "./range";
import { besideAnchor, type Slot } from "./slots";
import { useDirectorBusy } from "./useDirectorBusy";
import { eventsByDay } from "./week";
import { WeekHours } from "./WeekHours";

const EMPTY: CalendarEvent[] = [];
/** The width of the meeting's card and of the quick card — where they stand beside a block. */
const CARD_W = 384;
const QUICK_W = 360;
/** What the cards may grow to (the people's list opened in the quick one): they stand where that fits. */
const CARD_H = 380;
const QUICK_H = 420;

/** The open meeting's card: which meeting, where it stands, and whether it is asking «Удалить?». */
type CardState = { id: string; anchor: Anchor; confirming: boolean };
/** The full form: a meeting to change, or a new one from what is known of it. */
type FormState = { event: CalendarEvent | null; seed: EventSeed | null };
/** A meeting being made with the mouse: its slot on the grid, the card beside it, the title so far. */
type QuickState = { slot: Slot; anchor: { x: number; y: number }; title: string };

/** Where a card stands beside an element of the screen. */
function besideOf(element: HTMLElement, width: number, height: number): { x: number; y: number } {
  return besideAnchor(element.getBoundingClientRect(), width, { width: window.innerWidth, height: window.innerHeight }, height);
}

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
  // a free day has no number: its words and what comes after it
  if (screen.value === null) return { text: meetingWords(join(screen.eyebrow, screen.detail || screen.label)), tone };
  // about to start — «Через 12 мин · 10:00 — Планёрка»
  if (screen.tone === "warn" && !screen.focusId) return { text: meetingWords(join(screen.eyebrow, screen.detail)), tone };
  const detail = screen.detail ? screen.detail.charAt(0).toLowerCase() + screen.detail.slice(1) : null;
  return { text: meetingWords(join(`${screen.value} ${screen.label}`, screen.focusId ? screen.detail : detail)), tone };
}

/**
 * «Календарь» of the desk (D-153, D-154, wave 3): «‹ сегодня ›» and «Неделя | Месяц» over the
 * grid — a week of hours or the month's weeks, `?view` and `?d` in the address — and «Ближайшее»
 * beside it. «Сроки задач» (`?deadlines=1`, the key D) lays the director's open orders over the
 * days. The secretary's week shows when the director is busy, as grey blocks with no word about
 * the meetings; a month has no hours to lay them on. Made for a mouse and a keyboard: a meeting
 * opens as a card beside its block (the grid stays in sight), a click or a drag over an empty
 * stretch of the week makes a new one with a quick card (title, people, Enter), N opens the full
 * desk form, E edits the open meeting and
 * Delete asks to delete it; W/M, ←/→, T and D move the view. `?e=<id>` (a push opened on a
 * computer) turns to that meeting's day and opens its card.
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

  // the secretary sees the director's time, and only that (owner, 2026-11-04)
  const busyShown = role === "secretary" && view === "week";
  const busy = useDirectorBusy(first, shiftDay(last, 1), busyShown);
  const busyDays = busyShown ? busyByDay(busy.data ?? [], days) : null;

  // the moment in a line under the title
  const ahead = upcoming.data ?? EMPTY;
  const screen = calendarScreen(ahead, meId, now);
  // today's meeting on now — the one the status screen speaks of
  const running = ahead.some((event) => isRunning(event, now) && ymdOfEvent(event) === today);

  // the open meeting, by id: its card stays open (and live) when an edit carries it off the screen
  const [card, setCard] = useState<CardState | null>(() => {
    const linked = params.get("e");
    return linked ? { id: linked, anchor: null, confirming: false } : null;
  });
  const openId = card?.id ?? null;
  const known = openId ? (events.find((event) => event.id === openId) ?? upcoming.data?.find((event) => event.id === openId) ?? null) : null;
  const opened = useEvent(openId, known);
  const [form, setForm] = useState<FormState | null>(null);
  const [quick, setQuick] = useState<QuickState | null>(null);

  // a push's `?e`: the grid turns to that meeting's day once it is read, and the address lets it go
  const deepLink = params.get("e");
  const linked = deepLink && opened.data?.id === deepLink ? opened.data : null;
  useEffect(() => {
    // `go` drops `?e` from the address: the next render has nothing to follow
    if (linked) go({ d: ymdOfEvent(linked) });
  });
  // a card opened without a block under the hand (the push): beside the block once the grid shows
  // it, else at the top of the screen
  const unplaced = card !== null && card.anchor === null && opened.data ? card.id : null;
  useEffect(() => {
    if (!unplaced) return;
    const frame = requestAnimationFrame(() => {
      const block = document.querySelector<HTMLElement>(`#desk-main [data-testid=desk-event][data-event-id="${unplaced}"]`);
      const anchor = block ? besideOf(block, CARD_W, CARD_H) : { x: Math.max(16, window.innerWidth / 2 - CARD_W / 2), y: 120 };
      setCard((current) => (current && current.id === unplaced ? { ...current, anchor } : current));
    });
    return () => cancelAnimationFrame(frame);
  }, [unplaced, deepLink]);

  const open = (event: CalendarEvent, element: HTMLElement) => {
    setQuick(null);
    setCard({ id: event.id, anchor: besideOf(element, CARD_W, CARD_H), confirming: false });
  };
  const follow = (startsAt: string) => go({ d: ymdOfEvent({ starts_at: startsAt }) });
  // a new meeting is made for a day ahead: from a past day the form starts at today
  const newDay = compareYmd(day, today) < 0 ? today : day;
  const newMeeting = (seed: EventSeed = { day: newDay }) => {
    setCard(null);
    setQuick(null);
    setForm({ event: null, seed });
  };
  const editOpen = () => {
    if (!opened.data) return;
    setForm({ event: opened.data, seed: null });
    setCard(null);
  };

  const step = (delta: -1 | 1) => {
    if (view === "week") return go({ d: shiftDay(day, delta * 7) });
    const next = addMonths(month, delta);
    const todayParts = parseYmd(today)!;
    // today when the month has it, its first day otherwise — as the phone's arrows do
    go({ d: todayParts.year === next.year && todayParts.month === next.month ? today : ymdOf(next.year, next.month, 1) });
  };

  const toggleDeadlines = () => go({ deadlines: !showDeadlines });
  const setView = (next: CalendarView) => {
    if (next !== view) go({ view: next }, true);
  };

  // the keys of the screen, by the physical key so a Russian layout works: ←/→ — the previous or
  // next week (month), T — today, W/M — the view, D — the deadlines, N — a new meeting, E — edit
  // the open one, Delete — delete it (asked once more in its card)
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      const code = event.code;
      if (code === "ArrowLeft" || code === "ArrowRight") {
        setCard(null);
        setQuick(null);
        step(code === "ArrowLeft" ? -1 : 1);
      } else if (code === "KeyT") go({ d: today });
      else if (code === "KeyW") setView("week");
      else if (code === "KeyM") setView("month");
      else if (code === "KeyD" && isDirector) toggleDeadlines();
      else if (code === "KeyN" && isDirector) newMeeting();
      else if (code === "KeyE" && isDirector && card && opened.data) editOpen();
      else if ((code === "Delete" || code === "Backspace") && isDirector) {
        if (card && opened.data) setCard({ ...card, confirming: true });
        else {
          // a block with the focus (Tab reached it): its card opens asking
          const focused = document.activeElement as HTMLElement | null;
          const id = focused?.getAttribute("data-testid") === "desk-event" ? focused.getAttribute("data-event-id") : null;
          if (!id || !focused) return false;
          setCard({ id, anchor: besideOf(focused, CARD_W, CARD_H), confirming: true });
        }
      } else return false;
      return true;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open")) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts("Календарь", [
    { keys: ["←", "→"], label: view === "week" ? "Прошлая и следующая неделя" : "Прошлый и следующий месяц" },
    { keys: ["T"], label: "Сегодня" },
    { keys: ["W"], label: "Неделя" },
    { keys: ["M"], label: "Месяц" },
    ...(isDirector
      ? [
          { keys: ["N"], label: "Новая встреча" },
          { keys: ["D"], label: "Сроки задач на календаре" },
          { keys: ["E"], label: "Изменить открытую встречу" },
          { keys: ["Del"], label: "Удалить открытую встречу" },
        ]
      : []),
    { keys: ["Tab", "Enter"], label: "К встрече и открыть её" },
    { keys: ["Esc"], label: "Закрыть карточку" },
  ]);

  const loading = (head.isLoading && !head.data) || (tail.isLoading && !tail.data);
  const title = view === "week" ? weekTitle(first, last) : monthTitle(month);

  // another week slides in from the side it lies on, another view rises into place; the data are
  // already drawn under it — the motion never holds the grid back (principle 1a)
  const stage = useRef<HTMLDivElement>(null);
  const shown = useRef<{ view: CalendarView; first: Ymd } | null>(null);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = { view, first };
    const node = stage.current;
    if (!was || !node || (was.view === view && was.first === first)) return;
    if (typeof node.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frames =
      was.view !== view
        ? [
            { opacity: 0, transform: "translateY(10px) scale(0.995)" },
            { opacity: 1, transform: "none" },
          ]
        : [
            { opacity: 0.35, transform: `translateX(${compareYmd(first, was.first) > 0 ? 28 : -28}px)` },
            { opacity: 1, transform: "none" },
          ];
    node.animate(frames, { duration: was.view !== view ? 280 : 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, [view, first]);

  return (
    <DeskPage>
      <PageTitle
        title="Календарь"
        state={upcoming.data ? stateLine(screen, running) : null}
        actions={
          isDirector ? (
            <>
              <CalendarOnWallButton />
              <Tooltip label="Новая встреча" keys={["N"]} side="bottom">
                <Button size="sm" icon={<Plus size={15} strokeWidth={2.2} aria-hidden />} onClick={() => newMeeting()} data-testid="desk-event-new">
                  Новая встреча
                </Button>
              </Tooltip>
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
              onChange={setView}
              items={[
                { value: "week", label: <KeyLabel label="Неделя" hint="W" /> },
                { value: "month", label: <KeyLabel label="Месяц" hint="M" /> },
              ]}
            />
          </>
        }
      >
        <h2 className="cal-title desk-figure min-w-[160px] text-[20px] leading-6" data-testid="desk-calendar-title">
          {title}
        </h2>
        <div className="cal-nav flex items-center">
          <ArrowButton label={view === "week" ? "Прошлая неделя" : "Прошлый месяц"} hint="←" onClick={() => step(-1)} back />
          <Tooltip label="Сегодня" keys={["T"]} side="bottom">
            <Button size="sm" variant="ghost" className="cal-today-button !min-h-8 !px-2 !text-[14px]" disabled={day === today} onClick={() => go({ d: today })} data-testid="desk-calendar-today">
              Сегодня
            </Button>
          </Tooltip>
          <ArrowButton label={view === "week" ? "Следующая неделя" : "Следующий месяц"} hint="→" onClick={() => step(1)} />
        </div>
      </Toolbar>

      {/* the grid first: the column beside it gives way on a narrower screen */}
      <div className="cal-layout grid grid-cols-[minmax(0,1fr)_clamp(224px,18vw,280px)] items-start gap-8">
        <div ref={stage} className="cal-stage min-w-0">
        {loading ? (
          <Bone h={view === "week" ? 628 : 640} />
        ) : view === "week" ? (
          <WeekHours
            days={days}
            byDay={byDay}
            today={today}
            now={now}
            meId={meId}
            onOpen={open}
            deadlines={showDeadlines ? marks : null}
            onSlot={
              isDirector
                ? (slot, box) => {
                    setCard(null);
                    setQuick({ slot, anchor: besideAnchor(box, QUICK_W, { width: window.innerWidth, height: window.innerHeight }, QUICK_H), title: "" });
                  }
                : null
            }
            ghost={quick ? { slot: quick.slot, title: quick.title } : null}
            busy={busyDays}
            openId={card?.anchor ? openId : null}
          />
        ) : (
          <MonthGrid
            days={days}
            byDay={byDay}
            today={today}
            now={now}
            meId={meId}
            onOpen={open}
            openId={card?.anchor ? openId : null}
            month={month}
            onDay={(ymd) => go({ d: ymd, view: "week" }, true)}
            onNew={isDirector ? (ymd) => newMeeting({ day: ymd }) : null}
            deadlines={showDeadlines ? marks : null}
          />
        )}
        </div>
        <CalendarAside upcoming={upcoming.data ?? EMPTY} now={now} meId={meId} onOpen={open} openId={card?.anchor ? openId : null} />
      </div>

      <EventCard
        event={card && card.anchor ? (opened.data ?? null) : null}
        anchor={card?.anchor ?? null}
        onClose={() => setCard(null)}
        meId={meId}
        isDirector={isDirector}
        now={now}
        onEdit={editOpen}
        confirming={card?.confirming ?? false}
        onConfirming={(on) => setCard((current) => (current ? { ...current, confirming: on } : current))}
      />

      {isDirector ? (
        <>
          <QuickCreate
            slot={quick?.slot ?? null}
            anchor={quick?.anchor ?? null}
            meId={meId}
            now={now}
            onClose={() => setQuick(null)}
            onTitle={(title) => setQuick((current) => (current ? { ...current, title } : current))}
            onMore={(seed) => newMeeting(seed)}
            onCreated={follow}
          />
          <EventForm
            open={form !== null}
            onClose={() => setForm(null)}
            event={form?.event ?? null}
            seed={form?.seed ?? null}
            meId={meId}
            now={now}
            onSaved={follow}
          />
        </>
      ) : null}
    </DeskPage>
  );
}

/**
 * «Сроки задач»: the layer of the director's open orders over the calendar, on and off — a word
 * of the toolbar with how many are due on the days on screen, red while one of them is already late.
 */
function DeadlinesToggle({ on, count, tone, onToggle }: { on: boolean; count: number; tone: "danger" | "warn" | "muted"; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title="Сроки открытых задач на этих днях · клавиша D"
      data-testid="desk-deadlines-toggle"
      data-tone={tone}
      className={`cal-deadlines mr-3 flex h-8 items-center gap-1.5 text-[14px] leading-5 transition-colors duration-[120ms] ${on ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--text)]" : "text-muted hover:text-text"}`}
    >
      <Diamond aria-hidden size={13} strokeWidth={2.2} className="cal-deadlines-icon" />
      Сроки задач
      {count > 0 ? (
        <span className="cal-deadlines-count nums text-[12px]" style={{ color: tone === "danger" ? "var(--danger)" : undefined }}>
          {count}
        </span>
      ) : null}
      <Kbd>D</Kbd>
    </button>
  );
}

function ArrowButton({ label, hint, onClick, back = false }: { label: string; hint: string; onClick: () => void; back?: boolean }) {
  return (
    <Tooltip label={label} keys={[hint]} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="cal-arrow flex h-8 w-8 items-center justify-center text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
      >
        {back ? <ChevronLeft aria-hidden size={17} strokeWidth={2} /> : <ChevronRight aria-hidden size={17} strokeWidth={2} />}
      </button>
    </Tooltip>
  );
}

/** A segment's word with its key, quiet until hovered — the mouse teaches the keyboard. */
function KeyLabel({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="group/key inline-flex items-center gap-1.5">
      {label}
      <span className="nums text-[11px] text-muted/60 transition-colors duration-[120ms] group-hover/key:text-muted">{hint}</span>
    </span>
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
      variant="secondary"
      icon={onWall ? <CalendarRange size={15} aria-hidden /> : <MonitorUp size={15} aria-hidden />}
      className={onWall ? "cal-on-wall" : ""}
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
