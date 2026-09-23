"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "framer-motion";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { EventCard } from "@/components/calendar/EventCard";
import { EventEditor } from "@/components/calendar/EventEditor";
import { MonthGrid, type DayMark } from "@/components/calendar/MonthGrid";
import { Mascot } from "@/components/brand/Mascot";
import { CARD_SPRING, useRevealOpen } from "@/components/tasks/list/TaskList";
import { CalendarListBone, CalendarSkeleton } from "@/components/ui/PageSkeletons";
import { hhmm, isOver, ymdOfEvent, agendaFrom } from "@/lib/calendar/agenda";
import { awaitingAnswer, calendarScreen } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { compareYmd, daysBetween, parseYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { haptic } from "@/lib/haptics";

import { CalendarStatus } from "./CalendarStatus";
import type { CalendarNav } from "./useCalendarNav";

const noSubscribe = () => () => {};

/** Cards drawn at once: a busy month must not become a hundred animated nodes on a Redmi. */
const PAGE = 40;

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });
const DAY_TITLE = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

/** «Сегодня · чт, 24 сентября», «Завтра · пт, 25 сентября», «пн, 28 сентября». */
function dayTitle(ymd: Ymd, today: Ymd): string {
  const { year, month, day } = parseYmd(ymd)!;
  const date = DAY_TITLE.format(new Date(Date.UTC(year, month - 1, day)));
  const diff = daysBetween(today, ymd);
  if (diff === 0) return `Сегодня · ${date}`;
  if (diff === 1) return `Завтра · ${date}`;
  if (diff === -1) return `Вчера · ${date}`;
  return date;
}

type Props = {
  nav: CalendarNav;
  now: Date;
  meId: string;
  isDirector: boolean;
  /** Yesterday and the month ahead — the status screen speaks of now, whatever month is shown. */
  upcoming: readonly CalendarEvent[];
  /** The month on screen and the one after it (the ribbon runs past the month's end). */
  events: readonly CalendarEvent[];
  loading: boolean;
  openId: string | null;
  onOpenId: (id: string | null) => void;
  /** Buttons of the head that live elsewhere — «на стену» of the TV (D-96). */
  headExtra?: ReactNode;
};

type Row =
  | { kind: "head"; key: string; ymd: Ymd; count: number; first: boolean }
  | { kind: "card"; key: string; event: CalendarEvent }
  | { kind: "now"; key: string }
  | { kind: "free"; key: string; ymd: Ymd }
  | { kind: "more"; key: string; left: number };

/**
 * «Календарь» (D-78, D-94, D-100) in the language of «Задачи» (D-83): the date and the title, the
 * status screen of the moment, the month (or the folded week), and under it the ribbon from
 * the chosen day on — the day itself even when it is free, then every day ahead that has
 * something — as cards that open in place. The line of «now» runs through today. The
 * director's «+» (and a free day) opens the meeting form on the chosen day.
 */
export function CalendarView({ nav, now, meId, isDirector, upcoming, events, loading, openId, onOpenId, headExtra }: Props) {
  const [creating, setCreating] = useState(false);
  const today = todayYmd(now);

  const screen = useMemo(() => calendarScreen(upcoming, meId, now), [upcoming, meId, now]);
  const marks = useMemo(() => {
    const answer = new Set(awaitingAnswer(events, meId, now).map((event) => event.id));
    const map = new Map<Ymd, DayMark>();
    for (const event of events) {
      const ymd = ymdOfEvent(event);
      const mark = map.get(ymd) ?? { count: 0, answer: false };
      map.set(ymd, { count: mark.count + 1, answer: mark.answer || answer.has(event.id) });
    }
    return map;
  }, [events, meId, now]);

  // «показать ещё» counts from the chosen day: another day starts from one page again
  const [page, setPage] = useState({ day: nav.selected, limit: PAGE });
  const limit = page.day === nav.selected ? page.limit : PAGE;

  const rows = useMemo(() => {
    const groups = agendaFrom(events, nav.selected, now);
    const total = groups.reduce((sum, group) => sum + group.events.length, 0);
    const list: Row[] = [];
    let drawn = 0;
    groups.forEach((group, index) => {
      if (drawn >= limit) return;
      list.push({ kind: "head", key: `head-${group.ymd}`, ymd: group.ymd, count: group.events.length, first: index === 0 });
      if (group.events.length === 0) {
        list.push({ kind: "free", key: `free-${group.ymd}`, ymd: group.ymd });
        return;
      }
      // today: the line of now runs where the past ends and the rest of the day begins
      const nowAt = group.ymd === today ? group.events.findIndex((event) => !isOver(event, now)) : -2;
      group.events.forEach((event, at) => {
        if (drawn >= limit) return;
        if (at === nowAt && at > 0) list.push({ kind: "now", key: "now" });
        list.push({ kind: "card", key: event.id, event });
        drawn += 1;
      });
      if (nowAt === -1 && drawn < limit) list.push({ kind: "now", key: "now" });
    });
    if (total > drawn) list.push({ kind: "more", key: "more", left: total - drawn });
    return list;
  }, [events, nav.selected, now, today, limit]);

  useRevealOpen(openId, true);

  const toggle = (id: string) => {
    if (openId !== id) haptic(8);
    onOpenId(openId === id ? null : id);
  };

  // «ближайшее» may live in another month: the grid goes there, then its card opens
  const showNearest = (id: string) => {
    const event = upcoming.find((row) => row.id === id) ?? events.find((row) => row.id === id);
    if (event) nav.follow(event.starts_at);
    onOpenId(id);
  };

  const onSaved = (startsAt: string, id?: string | null) => {
    nav.follow(startsAt);
    if (id) onOpenId(id);
  };

  const past = compareYmd(nav.selected, today) < 0;

  // the screen is made of «now» (the hand on the strip, the line through today, «через 12
  // мин»): the server's second is not the phone's, so the server draws the bones and the
  // phone draws the rest — the data arrives on the phone anyway
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!hydrated) return <CalendarSkeleton />;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-4 text-muted first-letter:uppercase">{DATE_LINE.format(now)}</p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-[36px]">Календарь</h1>
        </div>
        <div className="mb-0.5 flex items-center gap-1.5">
          {headExtra}
          {isDirector ? (
            <button
              type="button"
              aria-label="Новое мероприятие"
              data-testid="event-new"
              onClick={() => setCreating(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/60 bg-accent/15 text-accent transition-transform duration-[120ms] active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <CalendarStatus screen={screen} onNearest={showNearest} />
      </div>

      <MonthGrid nav={nav} today={today} marks={marks} now={now} />

      {loading ? (
        <CalendarListBone />
      ) : (
        <MotionConfig reducedMotion="user">
          <LayoutGroup>
            <div className="relative mt-1 flex flex-col gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {rows.map((row) => (
                  <motion.div
                    key={row.key}
                    layout="position"
                    transition={CARD_SPRING}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.14 } }}
                  >
                    {row.kind === "head" ? (
                      <DayHead
                        title={dayTitle(row.ymd, today)}
                        count={row.count}
                        first={row.first}
                        today={row.ymd === today}
                        onToday={row.first && row.ymd !== today ? nav.goToday : undefined}
                      />
                    ) : row.kind === "card" ? (
                      <EventCard
                        event={row.event}
                        now={now}
                        meId={meId}
                        isDirector={isDirector}
                        open={openId === row.event.id}
                        onToggle={() => toggle(row.event.id)}
                        onSaved={onSaved}
                      />
                    ) : row.kind === "now" ? (
                      <NowLine time={hhmm(now.toISOString())} />
                    ) : row.kind === "more" ? (
                      <button
                        type="button"
                        onClick={() => setPage({ day: nav.selected, limit: limit + PAGE })}
                        className="mt-1 min-h-[44px] w-full rounded-[14px] border border-border/70 text-[14px] font-medium leading-5 text-muted active:bg-surface"
                      >
                        Показать ещё · {row.left}
                      </button>
                    ) : (
                      <FreeDay
                        past={compareYmd(row.ymd, today) < 0}
                        isDirector={isDirector}
                        hint={isDirector && events.length === 0}
                        onAdd={() => setCreating(true)}
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </MotionConfig>
      )}

      {isDirector ? (
        <EventEditor
          open={creating}
          onClose={() => setCreating(false)}
          event={null}
          // a meeting is made for a day ahead: from a past day the form starts at today
          day={past ? today : nav.selected}
          meId={meId}
          now={now}
          onSaved={onSaved}
        />
      ) : null}
    </main>
  );
}

/** The day over its cards: the chosen one in the accent, the rest quiet; «к сегодня» when away. */
function DayHead({
  title,
  count,
  first,
  today,
  onToday,
}: {
  title: string;
  count: number;
  first: boolean;
  today: boolean;
  onToday?: () => void;
}) {
  const tone = first ? "var(--accent)" : "var(--text-muted)";
  return (
    <div className={`flex min-h-[32px] items-end justify-between gap-3 px-1 ${first ? "pt-3" : "pt-4"}`}>
      <h2 className="flex min-w-0 items-center gap-2 pb-0.5 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]">
        {first ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone, boxShadow: today ? `0 0 8px ${tone}` : undefined }} /> : null}
        <span className="truncate" style={{ color: tone }}>
          {title}
        </span>
        {count > 0 ? <span className="nums text-muted">{count}</span> : null}
      </h2>
      {onToday ? (
        <button
          type="button"
          onClick={onToday}
          data-testid="go-today"
          className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border/80 bg-surface px-3 text-[13px] font-medium leading-4 text-text transition-transform duration-[120ms] active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 6-6 6 6 6" />
          </svg>
          Сегодня
        </button>
      ) : null}
    </div>
  );
}

/** Now, between what is over and what is still ahead today. */
function NowLine({ time }: { time: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5" aria-label={`Сейчас ${time}`}>
      <span className="nums text-[12px] font-semibold leading-4 text-accent">{time}</span>
      <span aria-hidden className="h-2 w-2 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} />
      <span aria-hidden className="h-px flex-1" style={{ background: "linear-gradient(90deg, var(--accent), transparent)" }} />
    </div>
  );
}

/** The chosen day with nothing on it: said once, and for the director — a way to fill it. */
function FreeDay({ past, isDirector, hint, onAdd }: { past: boolean; isDirector: boolean; hint: boolean; onAdd: () => void }) {
  if (past || !isDirector) {
    return (
      <p className="rounded-[18px] border border-dashed border-border/80 px-4 py-4 text-center text-[15px] leading-5 text-muted">
        {past ? "Ничего не было" : "Ничего не запланировано"}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      data-testid="free-day-add"
      className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-border/80 px-3.5 py-3 text-left transition-[transform,background-color] duration-[120ms] active:scale-[0.99] active:bg-surface"
    >
      {hint ? (
        <Mascot state="sleeping" size={40} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-display text-[15px] font-semibold leading-5">Свободный день</span>
        <span className="block text-[13px] leading-[18px] text-muted">
          {hint ? "Маскоту можно сказать: «планёрка завтра в 10 со всеми» — или добавить здесь" : "Добавить мероприятие"}
        </span>
      </span>
    </button>
  );
}
