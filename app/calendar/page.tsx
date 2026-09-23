"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { EventRow } from "@/components/calendar/CalendarList";
import { EventEditor } from "@/components/calendar/EventEditor";
import { EventSheet } from "@/components/calendar/EventSheet";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { CalendarListBone } from "@/components/ui/PageSkeletons";
import { agendaFrom, countByDay, ymdOfEvent } from "@/lib/calendar/agenda";
import { useCalendarMonth, useEvent, type CalendarEvent } from "@/lib/calendar/queries";
import {
  addMonths,
  compareYmd,
  monthOf,
  parseYmd,
  todayYmd,
  ymdOf,
  type Month,
  type Ymd,
} from "@/lib/datetime/calendar";
import { useNow } from "@/lib/pulse/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Календарь» (D-78, D-94): the month on top, and under it the ribbon from the chosen day
 * on — the day itself even when it is empty, then every day ahead that has something. The
 * director's «+» opens the meeting form on the chosen day; a tap on a row opens the
 * meeting, where the director changes or deletes it. A push lands here with `?e=<id>`:
 * the meeting opens by itself and the month turns to its day.
 */
export default function CalendarPage() {
  const me = useMe();
  const now = useNow();
  const today = todayYmd(now);

  const [month, setMonth] = useState<Month>(() => monthOf(null));
  const [selected, setSelected] = useState<Ymd>(() => todayYmd());
  const calendar = useCalendarMonth(month);

  const params = useSearchParams();
  const deepLink = params.get("e");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [creating, setCreating] = useState(false);

  const meId = me.data?.userId ?? "";
  const isDirector = me.data?.role === "director";
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);
  const counts = useMemo(() => countByDay(events), [events]);
  const agenda = useMemo(() => agendaFrom(events, selected, now), [events, selected, now]);

  // the deep link opens the meeting from the month, or fetches the one that lies past it;
  // the card last shown stands in while an edit carries the meeting out of the month
  const wantedId = openId ?? (dismissed ? null : deepLink);
  const fromList = useMemo(() => events.find((event) => event.id === wantedId) ?? null, [events, wantedId]);
  const [shown, setShown] = useState<CalendarEvent | null>(null);
  const fetched = useEvent(wantedId && !fromList ? wantedId : null, shown);
  const open: CalendarEvent | null = fromList ?? fetched.data ?? null;
  if (open && open !== shown) setShown(open);

  // a saved meeting may now live on another day: the grid and the ribbon go there
  const follow = (startsAt: string) => {
    const day = ymdOfEvent({ starts_at: startsAt });
    setSelected(day);
    setMonth(monthOf(day));
  };

  // …and once it is known, the grid turns to its day (once — the arrows are the person's again)
  const [jumpedFor, setJumpedFor] = useState<string | null>(null);
  if (deepLink && open?.id === deepLink && jumpedFor !== deepLink) {
    setJumpedFor(deepLink);
    const day = ymdOfEvent(open);
    setSelected(day);
    setMonth(monthOf(day));
  }

  const closeSheet = () => {
    setOpenId(null);
    setDismissed(true);
  };

  const turnMonth = (delta: -1 | 1) => {
    const next = addMonths(month, delta);
    const current = parseYmd(today)!;
    setMonth(next);
    // today when the month has it, its first day otherwise
    setSelected(current.year === next.year && current.month === next.month ? today : ymdOf(next.year, next.month, 1));
  };

  const goToday = () => {
    setMonth(monthOf(today));
    setSelected(today);
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold leading-[30px]">Календарь</h1>
        <div className="-mr-2 flex items-center gap-1">
          {selected !== today ? (
            <button
              type="button"
              onClick={goToday}
              className="flex h-9 items-center rounded-full border border-border px-3 text-[14px] font-medium leading-5 text-text active:bg-surface-2"
            >
              Сегодня
            </button>
          ) : null}
          {isDirector ? (
            <button
              type="button"
              aria-label="Новое мероприятие"
              onClick={() => setCreating(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-accent active:bg-surface-2"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <MonthGrid
        month={month}
        selected={selected}
        today={today}
        counts={counts}
        onPick={setSelected}
        onMonth={turnMonth}
        now={now}
      />

      {calendar.isLoading ? (
        <CalendarListBone />
      ) : (
        <div className="mt-5">
          {agenda.map((group, index) => (
            <section key={group.ymd} className={index ? "mt-5" : ""}>
              <h2
                className={`text-[13px] font-semibold uppercase leading-4 tracking-[0.04em] ${index ? "text-muted" : "text-text"}`}
              >
                {group.label}
              </h2>
              {group.events.length > 0 ? (
                <div className="mt-2 flex flex-col gap-2">
                  {group.events.map((event) => (
                    <EventRow key={event.id} event={event} now={now} meId={meId} onOpen={(e) => setOpenId(e.id)} />
                  ))}
                </div>
              ) : (
                <FreeDay
                  past={compareYmd(group.ymd, today) < 0}
                  isDirector={Boolean(isDirector)}
                  onAdd={() => setCreating(true)}
                />
              )}
            </section>
          ))}

          {/* an empty month teaches the director the shorter way in */}
          {events.length === 0 && isDirector ? (
            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <Mascot state="sleeping" size={64} />
              <p className="text-[15px] leading-[21px] text-muted">
                Скажи маскоту: «планёрка завтра в 10 со всеми» — или нажми +
              </p>
            </div>
          ) : null}
        </div>
      )}

      <EventSheet event={open} onClose={closeSheet} meId={meId} isDirector={Boolean(isDirector)} onSaved={follow} />

      {isDirector ? (
        <EventEditor
          open={creating}
          onClose={() => setCreating(false)}
          event={null}
          // a meeting is made for a day ahead: from a past day the form starts at today
          day={compareYmd(selected, today) < 0 ? today : selected}
          meId={meId}
          now={now}
          onSaved={follow}
        />
      ) : null}
    </main>
  );
}

/** The chosen day with nothing on it: said once, and for the director — a way to fill it. */
function FreeDay({ past, isDirector, onAdd }: { past: boolean; isDirector: boolean; onAdd: () => void }) {
  if (past) return <p className="mt-2 text-[15px] leading-5 text-muted">Ничего не было</p>;
  if (!isDirector) return <p className="mt-2 text-[15px] leading-5 text-muted">Ничего не запланировано</p>;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="mt-2 flex min-h-[52px] w-full items-center gap-3 rounded-[16px] border border-dashed border-border px-3 text-left text-[15px] leading-5 text-muted active:bg-surface-2"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      Свободно — добавить мероприятие
    </button>
  );
}
