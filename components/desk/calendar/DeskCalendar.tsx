"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EventEditor } from "@/components/calendar/EventEditor";
import { EventSheet } from "@/components/calendar/EventSheet";
import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { shiftDay, ymdOfEvent } from "@/lib/calendar/agenda";
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
import { useMe } from "@/lib/tasks/queries";

import { CalendarAside } from "./CalendarAside";
import { eventsByDay, MonthGrid, WeekGrid } from "./CalendarGrids";
import { daysOf, monthTitle, weekTitle, type CalendarView } from "./range";

const EMPTY: CalendarEvent[] = [];

/**
 * «Календарь» of the desk (D-153): «‹ сегодня ›» and «Неделя | Месяц» over the grid — a week of
 * seven columns or the month's weeks, `?view` and `?d` in the address — and «Сегодня и
 * ближайшее» beside it. A meeting opens in the phone's own sheet, drawn as a dialog here; the
 * director makes a new one in the phone's form. `?e=<id>` (a push opened on a computer) turns to
 * that meeting's day and opens it.
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

  /** The address holds what is on screen: steps replace it, a change of view is a step back can undo. */
  const go = (next: { d?: Ymd; view?: CalendarView }, push = false) => {
    const query = new URLSearchParams(params.toString());
    if (next.d !== undefined) {
      if (next.d === today) query.delete("d");
      else query.set("d", next.d);
    }
    if (next.view !== undefined) {
      if (next.view === "week") query.delete("view");
      else query.set("view", next.view);
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

  // ←/→ — the previous or next week (month), T — today; by the physical key, so a Russian layout works
  const stepRef = useRef(step);
  const todayRef = useRef(() => go({ d: today }));
  useEffect(() => {
    stepRef.current = step;
    todayRef.current = () => go({ d: today });
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

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-5">
        {loading ? (
          <Bone h={view === "week" ? 460 : 560} className="!rounded-[12px]" />
        ) : view === "week" ? (
          <WeekGrid days={days} byDay={byDay} today={today} now={now} meId={meId} onOpen={open} />
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
