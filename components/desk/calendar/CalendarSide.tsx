"use client";

import Link from "next/link";
import { AlignLeft, CalendarClock, Diamond, MapPin, Pencil, Repeat, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Morph } from "@/components/desk/ui/Morph";
import { IconButton } from "@/components/desk/ui/IconButton";
import { Kbd } from "@/components/desk/ui/Kbd";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { keysTaken } from "@/components/desk/ui/layers";
import { DECLINE_REASONS } from "@/components/calendar/InviteAnswer";
import { ruleLine, ruleState } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { draftOf, endMs, extendedEnd, hhmm, isOver, myStatus, RSVP_DESK, rsvpSummary, runningEvent, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { pendingInvites } from "@/lib/calendar/invites";
import { DESK_WORDS, useDeleteEvent, useEditEvent, useRespondEvent } from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { meetingReceipts, useMeetingReceipts, type MeetingReceipt } from "@/lib/calendar/receipts";
import { daysBetween, humanYmd, parseYmd, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { wallOf } from "@/lib/desk/when";
import { shortName } from "@/lib/people/names";
import { useRecurrenceRules, useUpdateRule } from "@/lib/recurrence/queries";
import { pluralRu } from "@/lib/tasks/status-text";

import type { DeadlineMark } from "./deadlines";
import { Face, Faces } from "./Faces";
import { lengthRu } from "./slots";
import { answersOf, meetingState, type MeetingState } from "./state";

/** People in the open meeting before «Ещё N». */
const SHOWN = 8;
/** The director's own meetings whose answers the day lists, and how far ahead it looks. */
const ANSWERS_SHOWN = 3;
const ANSWERS_DAYS = 7;
/** «Через 25 мин» counts down within this; further on the clock says it. */
const COUNTDOWN_MS = 12 * 60 * 60 * 1000;
/** The exceptions first — who will not come, then who has not answered, then the rest. */
const ORDER: Record<string, number> = { declined: 0, invited: 1, going: 2 };
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type Open = { id: string; event: CalendarEvent | null; missing: boolean };

type Props = {
  /** The focused day, else today. */
  day: Ymd;
  /** The meetings the screen has read — the days on screen and the month ahead (`useCalendar`). */
  upcoming: readonly CalendarEvent[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  now: Date;
  meId: string;
  isDirector: boolean;
  /** The deadlines of `day` while the layer is on; null — the layer is off. */
  deadlines: DeadlineMark[] | null;
  /** The meeting open in the column; null — the day. */
  open: Open | null;
  onOpen: (event: CalendarEvent) => void;
  onClose: () => void;
  onEdit: () => void;
};

/**
 * The column beside the week (D-180): the day, or the meeting opened on it — in the same place, so
 * the week stays whole in sight. The day: «Идёт» (the one place on the screen that says «сейчас»),
 * the invitations waiting for this person's answer, «Ответы» to the director's own invitations,
 * what is left of the day, the deadlines of the day while their layer is on. The meeting: what,
 * when, where and why, who comes with their answers and — here only — whether the notice reached
 * them; «+15 / +30 мин» for one that runs over, «Изменить» (E), «Удалить» (Del, asked here), the
 * series, the voice it was set with. Esc goes back to the day. Hidden while the desk's right panel
 * is open (`html[data-desk-panel]`, cal-side.css).
 */
export function CalendarSide({ day, upcoming, status, onRetry, now, meId, isDirector, deadlines, open, onOpen, onClose, onEdit }: Props) {
  return (
    <aside className="cal-side no-bar flex min-w-0 flex-col" aria-label={open ? "Встреча" : "День"} data-testid="cal-side" data-mode={open ? "meeting" : "day"}>
      {open ? (
        <MeetingPanel key={open.id} open={open} now={now} meId={meId} isDirector={isDirector} onClose={onClose} onEdit={onEdit} />
      ) : (
        <DayPanel day={day} upcoming={upcoming} status={status} onRetry={onRetry} now={now} meId={meId} deadlines={deadlines} onOpen={onOpen} />
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* the day                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** «Сегодня · вторник, 17 ноября», «Четверг, 19 ноября». */
function dayHead(day: Ymd, now: Date): string {
  const parts = parseYmd(day);
  const full = parts ? WEEKDAY.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day))) : day;
  const human = humanYmd(day, now);
  return ["сегодня", "завтра", "вчера"].includes(human) ? `${capitalize(human)} · ${full}` : capitalize(full);
}

/** Taken by this person: made by them, or on their list and not refused. */
const isMine = (event: CalendarEvent, meId: string) => event.author_id === meId || event.participants.some((p) => p.user_id === meId && p.status !== "declined");

/** Minutes of the day under this person's meetings, overlaps counted once. */
function busyMinutes(events: readonly CalendarEvent[]): number {
  const spans = events.map((event) => [new Date(event.starts_at).getTime(), endMs(event)] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let edge = -Infinity;
  for (const [start, end] of spans) {
    const from = Math.max(start, edge);
    if (end > from) total += end - from;
    edge = Math.max(edge, end);
  }
  return Math.round(total / 60_000);
}

/** «через 25 мин», «через 1 ч 10 мин» — within the next twelve hours; null further out or past. */
function countdown(iso: string, now: Date): string | null {
  const left = new Date(iso).getTime() - now.getTime();
  if (left <= 0 || left > COUNTDOWN_MS) return null;
  return `через ${lengthRu(Math.max(1, Math.round(left / 60_000)))}`;
}

function DayPanel({
  day,
  upcoming,
  status,
  onRetry,
  now,
  meId,
  deadlines,
  onOpen,
}: {
  day: Ymd;
  upcoming: readonly CalendarEvent[];
  status: Props["status"];
  onRetry: () => void;
  now: Date;
  meId: string;
  deadlines: DeadlineMark[] | null;
  onOpen: (event: CalendarEvent) => void;
}) {
  const today = todayYmd(now);
  const isToday = day === today;
  const past = daysBetween(today, day) < 0;
  const dayEvents = useMemo(() => upcoming.filter((event) => ymdOfEvent(event) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [upcoming, day]);
  const mine = dayEvents.filter((event) => isMine(event, meId));
  const running = isToday ? runningEvent(mine, now) : null;
  const owed = pendingInvites(upcoming, meId, now);
  const owedIds = new Set(owed.map((event) => event.id));
  const replies = upcoming
    .filter((event) => event.author_id === meId && !isOver(event, now) && daysBetween(today, ymdOfEvent(event)) <= ANSWERS_DAYS)
    .filter((event) => event.participants.some((p) => p.user_id !== meId && p.status !== "going"))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // what the rest of the day holds: today — what is not over and not on now, the others — all of it
  const rest = dayEvents.filter((event) => event.id !== running?.id && !owedIds.has(event.id) && (!isToday || !isOver(event, now)));
  const gone = isToday ? dayEvents.filter((event) => isOver(event, now)).length : 0;
  const busy = busyMinutes(mine);
  const lastEnd = mine.length > 0 ? Math.max(...mine.map(endMs)) : null;

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Bone h={16} w="60%" />
        <Bone h={44} w="45%" />
        <Bone h={6} />
        <Bone h={72} />
        <Bone h={28} />
        <Bone h={28} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="cal-side-error">
        <p className="text-[14px] font-semibold leading-5">Не удалось загрузить встречи</p>
        <p className="text-[13px] leading-[18px] text-muted">Встреч может быть больше, чем видно. Проверьте связь.</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <p className="cal-side-eyebrow flex items-center gap-1.5 text-[12px] font-medium leading-4 text-muted">
          <CalendarClock aria-hidden size={13} strokeWidth={2} className="cal-side-icon" />
          {dayHead(day, now)}
        </p>
        <div className="flex items-baseline gap-2.5">
          <span className="cal-side-figure desk-figure nums text-[28px] font-semibold leading-8">{dayEvents.length}</span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold leading-5">
              {pluralRu(dayEvents.length, ["встреча", "встречи", "встреч"])}
              {isToday ? " сегодня" : ""}
            </span>
            {busy > 0 ? (
              <span className="text-[12px] leading-4 text-muted">
                занято {lengthRu(busy)}
                {lastEnd !== null && (!isToday || lastEnd > now.getTime()) ? ` · свободно с ${hhmm(new Date(lastEnd).toISOString())}` : ""}
              </span>
            ) : null}
          </span>
        </div>
        {dayEvents.length > 0 ? <DayStrip events={dayEvents} meId={meId} now={now} isToday={isToday} /> : null}
      </header>

      {running ? <Running event={running} now={now} onOpen={onOpen} /> : null}

      {owed.length > 0 ? (
        <section data-testid="desk-calendar-answers">
          <SectionLabel count={owed.length}>Ждут вашего ответа</SectionLabel>
          <div className="mt-1 flex flex-col gap-2">
            {owed.map((event, index) => (
              <Invitation key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {replies.length > 0 ? (
        <section data-testid="cal-side-replies">
          <SectionLabel count={replies.length}>Ответы</SectionLabel>
          <div className="mt-1 flex flex-col">
            {replies.slice(0, ANSWERS_SHOWN).map((event) => (
              <Replies key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />
            ))}
            {replies.length > ANSWERS_SHOWN ? <p className="px-1.5 pt-1 text-[12px] leading-4 text-muted">и ещё {replies.length - ANSWERS_SHOWN} — в их карточках</p> : null}
          </div>
        </section>
      ) : null}

      <section data-testid="cal-side-rest">
        <SectionLabel>{isToday ? "Дальше сегодня" : past ? "Встречи дня" : "Встречи"}</SectionLabel>
        {rest.length > 0 ? (
          <div className="mt-1 flex flex-col">
            {rest.map((event) => (
              <Row key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <p className="mt-1 px-1.5 text-[13px] leading-[18px] text-muted">
            {dayEvents.length === 0 ? "Встреч нет" : isToday && gone > 0 && !running ? `На сегодня всё — ${gone} ${pluralRu(gone, ["встреча позади", "встречи позади", "встреч позади"])}` : "Больше ничего"}
          </p>
        )}
      </section>

      {deadlines ? (
        <section data-testid="cal-side-deadlines">
          <SectionLabel count={deadlines.length}>{isToday ? "Сроки сегодня" : "Сроки дня"}</SectionLabel>
          {deadlines.length > 0 ? (
            <div className="mt-1 flex flex-col">
              {deadlines.map((mark) => (
                <Link key={mark.id} href={`/desk/tasks?id=${mark.id}`} className="cal-side-row cal-side-deadline flex h-8 items-center gap-2 px-1.5" data-tone={mark.tone} data-testid="cal-side-deadline">
                  <Diamond aria-hidden size={11} strokeWidth={2.4} className="cal-side-diamond shrink-0" />
                  <When className="nums w-10 shrink-0 text-[13px] leading-[18px]">{mark.time}</When>
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px]">{mark.title}</span>
                  <span className="max-w-[40%] shrink-0 truncate text-[12px] leading-4 text-muted">{mark.who ? shortName(mark.who) : `${mark.count} чел.`}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-1 px-1.5 text-[13px] leading-[18px] text-muted">Сроков нет</p>
          )}
        </section>
      ) : null}

      <p className="mt-auto flex flex-wrap items-center gap-1 pt-2 text-[12px] leading-4 text-muted">
        Клик по дате — день крупно
        <span className="ml-1 inline-flex items-center gap-0.5">
          <Kbd>Shift</Kbd>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </span>
      </p>
    </div>
  );
}

/** The day as a strip 08–20 (wider when a meeting lies outside): a block a meeting, the hand of now. */
function DayStrip({ events, meId, now, isToday }: { events: readonly CalendarEvent[]; meId: string; now: Date; isToday: boolean }) {
  const wallHours = (ms: number) => {
    const wall = wallOf(new Date(ms));
    return wall.h + wall.min / 60;
  };
  let from = 8;
  let to = 20;
  for (const event of events) {
    const start = wallHours(new Date(event.starts_at).getTime());
    const end = wallHours(endMs(event));
    from = Math.min(from, Math.floor(start));
    to = Math.max(to, end < start ? 24 : Math.min(24, Math.ceil(end)));
  }
  const pct = (hours: number) => Math.min(100, Math.max(0, ((hours - from) / (to - from)) * 100));
  const hand = isToday ? wallHours(now.getTime()) : null;
  const ticks = [from, ...[12, 16].filter((tick) => tick > from && tick < to), to];
  return (
    <div className="mt-2" aria-hidden>
      <div className="cal-side-track">
        {events.map((event) => {
          const start = wallHours(new Date(event.starts_at).getTime());
          const raw = wallHours(endMs(event));
          const end = raw < start ? 24 : raw;
          const state = isOver(event, now) ? "over" : new Date(event.starts_at).getTime() <= now.getTime() ? "running" : "ahead";
          return <i key={event.id} data-state={state} data-mine={isMine(event, meId) ? "" : undefined} style={{ left: `${pct(start)}%`, width: `max(4px, ${pct(end) - pct(start)}%)` }} />;
        })}
        {hand !== null && hand >= from && hand <= to ? <b style={{ left: `${pct(hand)}%` }} /> : null}
      </div>
      <div className="cal-side-ticks nums">
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${pct(tick)}%` }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The meeting on now: until when, how much is left, who is in it — the time gone drawn under it. */
function Running({ event, now, onOpen }: { event: CalendarEvent; now: Date; onOpen: (event: CalendarEvent) => void }) {
  const start = new Date(event.starts_at).getTime();
  const end = endMs(event);
  const left = Math.max(1, Math.round((end - now.getTime()) / 60_000));
  const gone = Math.min(100, Math.max(0, ((now.getTime() - start) / Math.max(1, end - start)) * 100));
  const many = event.participants.length > 1;
  return (
    <section data-testid="cal-side-running">
      <button type="button" onClick={() => onOpen(event)} className="cal-side-running flex w-full flex-col gap-1 text-left">
        <span className="cal-side-live text-[12px] font-semibold leading-4">
          Идёт · до {hhmm(new Date(end).toISOString())} · ещё {lengthRu(left)}
        </span>
        <span className="text-[16px] font-semibold leading-[22px] [overflow-wrap:anywhere]">{event.title}</span>
        <span className="flex min-w-0 items-center gap-2 text-[12px] leading-4 text-muted">
          {many ? <Faces event={event} size={20} max={5} className="cal-side-faces" /> : null}
          {many ? <span className="nums shrink-0">{rsvpSummary(event, RSVP_DESK)}</span> : null}
          {event.location ? <span className="min-w-0 truncate">{event.location}</span> : null}
        </span>
        <span aria-hidden className="cal-side-progress">
          <i style={{ width: `${gone}%` }} />
        </span>
      </button>
    </section>
  );
}

/** A line of the day: the hour, the dot of its state, the title, a countdown or how many come. */
function Row({ event, now, meId, onOpen }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void }) {
  const soon = countdown(event.starts_at, now);
  const count = event.participants.filter((p) => p.status !== "declined").length;
  return (
    <button type="button" onClick={() => onOpen(event)} data-state={meetingState(event, meId, now)} className="cal-side-row flex h-8 w-full items-center gap-2 px-1.5 text-left" data-testid="cal-side-row">
      <When className="nums w-10 shrink-0 text-[13px] leading-[18px] text-muted">{hhmm(event.starts_at)}</When>
      <span aria-hidden className="cal-side-dot" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-[18px]">{event.title}</span>
      <span className="nums shrink-0 text-[12px] leading-4 text-muted">{soon && new Date(event.starts_at).getTime() - now.getTime() < 60 * 60_000 ? soon : count > 1 ? `${count} чел.` : ""}</span>
    </button>
  );
}

/** One of the director's own meetings: who will not come and why, who has not answered yet. */
function Replies({ event, now, meId, onOpen }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void }) {
  const others = event.participants.filter((p) => p.user_id !== meId);
  const declined = others.filter((p) => p.status === "declined");
  const silent = others.filter((p) => p.status === "invited");
  const names = (list: typeof others) => list.map((p) => shortName(p.person?.full_name ?? "Сотрудник"));
  return (
    <button type="button" onClick={() => onOpen(event)} className="cal-side-reply flex w-full flex-col gap-0.5 px-1.5 py-2 text-left" data-testid="cal-side-reply">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-[18px]">{event.title}</span>
        <When className="nums shrink-0 text-[12px] leading-4 text-muted">{capitalize(humanYmd(ymdOfEvent(event), now))} {hhmm(event.starts_at)}</When>
      </span>
      {declined.length > 0 ? (
        <span className="cal-side-no text-[12px] leading-4">
          {pluralRu(declined.length, ["Не сможет", "Не смогут", "Не смогут"])}:{" "}
          {declined
            .slice(0, 3)
            .map((p) => `${shortName(p.person?.full_name ?? "Сотрудник")}${p.reason ? ` (${p.reason.toLowerCase()})` : ""}`)
            .join(", ")}
          {declined.length > 3 ? ` и ещё ${declined.length - 3}` : ""}
        </span>
      ) : null}
      {silent.length > 0 ? (
        <span className="text-[12px] leading-4 text-muted">
          {silent.length > 3 ? `${silent.length} ${pluralRu(silent.length, ["не ответил", "не ответили", "не ответили"])}` : `${pluralRu(silent.length, ["Не ответил", "Не ответили", "Не ответили"])}: ${names(silent).join(", ")}`}
        </span>
      ) : null}
    </button>
  );
}

/** An invitation still without this person's answer: «Буду», or «Не смогу» with a reason. */
function Invitation({ event, now, meId, onOpen, index }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void; index: number }) {
  const respond = useRespondEvent(meId, DESK_WORDS);
  const [declining, setDeclining] = useState(false);
  const author = event.participants.find((p) => p.user_id === event.author_id)?.person?.full_name ?? null;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="cal-side-ask" data-testid="desk-invitation" style={{ "--i": index } as CSSProperties}>
      <button type="button" onClick={() => onOpen(event)} className="flex w-full flex-col text-left">
        <When className="text-[12px] leading-4 text-muted">
          {capitalize(humanYmd(ymdOfEvent(event), now))} {timeRange(event)}
          {author ? ` · зовёт ${shortName(author)}` : ""}
        </When>
        <span className="mt-0.5 text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{event.title}</span>
      </button>
      {declining ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1" data-testid="cal-side-reasons">
          {DECLINE_REASONS.map((reason) => (
            <button key={reason} type="button" className="desk-choice" onClick={() => answer("declined", reason)}>
              {reason}
            </button>
          ))}
          <button type="button" className="desk-choice" onClick={() => answer("declined")}>
            Без причины
          </button>
          <button type="button" className="desk-choice" onClick={() => setDeclining(false)}>
            Назад
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="secondary" className="cal-side-going" onClick={() => answer("going")} disabled={respond.isPending} data-testid="desk-event-going">
            Буду
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeclining(true)} disabled={respond.isPending} data-testid="desk-event-declined">
            Не смогу
          </Button>
          {event.participants.length > 1 ? <Faces event={event} size={20} max={4} className="cal-side-faces ml-auto" /> : null}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* the open meeting                                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** The chip's word for what the meeting is to this person; the time words come from the clock. */
const STATE_CHIP: Partial<Record<MeetingState, string>> = {
  over: "Прошла",
  owes: "Нужен ваш ответ",
  declined: "Вы не сможете",
};

function MeetingPanel({ open, now, meId, isDirector, onClose, onEdit }: { open: Open; now: Date; meId: string; isDirector: boolean; onClose: () => void; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const event = open.event && !open.event.cancelled_at ? open.event : null;
  const gone = open.missing || Boolean(open.event?.cancelled_at);

  // Esc — back to the day (or out of the question «Удалить?»); Delete — the question. In the capture
  // phase, so the screen's own keys see it handled; never under a layer, in a field or behind the panel.
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (key) => {
      if (key.key === "Escape") {
        if (confirming) setConfirming(false);
        else onClose();
        return true;
      }
      if ((key.code === "Delete" || key.code === "Backspace") && isDirector && event && !confirming) {
        setConfirming(true);
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const onKey = (key: KeyboardEvent) => {
      if (key.defaultPrevented || !isPlainKey(key) || key.shiftKey || isTypingTarget(key.target) || keysTaken()) return;
      if (document.documentElement.hasAttribute("data-desk-panel")) return;
      if (keys.current(key)) key.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  if (gone) {
    return (
      <div className="cal-side-meeting flex flex-col gap-3" data-testid="desk-event-card" data-event-id={open.id} data-state="gone">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[16px] font-semibold leading-[22px]">Этой встречи уже нет</p>
          <IconButton label="К дню" keys={["Esc"]} icon={<X aria-hidden size={16} strokeWidth={2} />} onClick={onClose} testId="desk-event-close" />
        </div>
        <p className="text-[13px] leading-[18px] text-muted">Её удалили — из календаря она исчезла у всех.</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            К дню
          </Button>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="cal-side-meeting flex flex-col gap-3" data-testid="desk-event-card" data-event-id={open.id} aria-busy="true">
        <Bone h={22} w="40%" />
        <Bone h={26} w="80%" />
        <Bone h={16} w="60%" />
        <Bone h={120} />
      </div>
    );
  }

  return <Meeting event={event} now={now} meId={meId} isDirector={isDirector} onClose={onClose} onEdit={onEdit} confirming={confirming} onConfirming={setConfirming} />;
}

function Meeting({
  event,
  now,
  meId,
  isDirector,
  onClose,
  onEdit,
  confirming,
  onConfirming,
}: {
  event: CalendarEvent;
  now: Date;
  meId: string;
  isDirector: boolean;
  onClose: () => void;
  onEdit: () => void;
  confirming: boolean;
  onConfirming: (on: boolean) => void;
}) {
  const respond = useRespondEvent(meId, DESK_WORDS);
  const remove = useDeleteEvent(DESK_WORDS);
  const extend = useEditEvent(DESK_WORDS);
  const rules = useRecurrenceRules(Boolean(event.recurrence_rule_id));
  const updateRule = useUpdateRule();
  const rule = event.recurrence_rule_id ? (rules.data?.find((row) => row.id === event.recurrence_rule_id) ?? null) : null;
  const receiptRows = useMeetingReceipts(event, isDirector);
  const receipts = useMemo(() => (receiptRows.data ? meetingReceipts(receiptRows.data, event, now) : null), [receiptRows.data, event, now]);
  const [declining, setDeclining] = useState(false);
  const [all, setAll] = useState(false);
  const confirmBox = useRef<HTMLDivElement>(null);

  const state = meetingState(event, meId, now);
  const over = state === "over";
  const running = state === "running";
  const mine = myStatus(event, meId);
  const canAnswer = mine !== null && event.author_id !== meId && !over;
  const end = endMs(event);
  const othersKnow = event.participants.some((p) => p.user_id !== event.author_id);

  // the question takes the focus: Enter deletes, Esc steps back out of it
  useEffect(() => {
    if (confirming) confirmBox.current?.querySelector<HTMLButtonElement>("[data-testid=desk-event-delete-confirm]")?.focus({ preventScroll: true });
  }, [confirming]);

  const people = [...event.participants].sort(
    (a, b) =>
      Number(b.user_id === event.author_id) - Number(a.user_id === event.author_id) ||
      (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) ||
      (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? "", "ru"),
  );
  const shown = all ? people : people.slice(0, SHOWN);

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };
  const longer = (minutes: number) => {
    const ends_at = extendedEnd(event, minutes);
    extend.mutate({ eventId: event.id, draft: { ...draftOf(event), ends_at }, toast: `Продлил до ${hhmm(ends_at)}` });
  };

  const left = countdown(event.starts_at, now);
  // the chip says the moment; the line under the title says the hours
  const chip = running ? `Идёт · ещё ${lengthRu(Math.max(1, Math.round((end - now.getTime()) / 60_000)))}` : (STATE_CHIP[state] ?? (left ? capitalize(left) : null));
  const length = event.ends_at ? ` · ${lengthRu(Math.round((end - new Date(event.starts_at).getTime()) / 60_000))}` : " · без конца";

  return (
    <article className="cal-side-meeting flex min-h-0 flex-1 flex-col" data-testid="desk-event-card" data-event-id={event.id} data-state={state}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1">
          {chip ? (
            <span className="cal-side-chip max-w-full" data-state={state} data-testid="cal-side-chip">
              <span className="min-w-0 truncate">{chip}</span>
            </span>
          ) : null}
        </div>
        <div className="-mr-1.5 -mt-0.5 flex shrink-0 items-center">
          {isDirector ? (
            <>
              <IconButton label="Изменить" keys={["E"]} icon={<Pencil aria-hidden size={16} strokeWidth={2} />} onClick={onEdit} testId="desk-event-edit" />
              <IconButton label="Удалить" keys={["Del"]} icon={<Trash2 aria-hidden size={16} strokeWidth={2} />} onClick={() => onConfirming(true)} testId="desk-event-delete" tone="danger" />
            </>
          ) : null}
          <IconButton label="К дню" keys={["Esc"]} icon={<X aria-hidden size={16} strokeWidth={2} />} onClick={onClose} testId="desk-event-close" />
        </div>
      </div>

      {/* the title came from the meeting's block in the week (D-184) */}
      <Morph part="event" id={event.id}>
        <h2 className="mt-2 text-[20px] font-semibold leading-[26px] [overflow-wrap:anywhere]">{event.title}</h2>
      </Morph>
      <p className="cal-side-when mt-1 flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
        <CalendarClock aria-hidden size={14} strokeWidth={2} className="cal-side-icon shrink-0" />
        <When>
          {capitalize(humanYmd(ymdOfEvent(event), now))} · {timeRange(event)}
          {length}
        </When>
      </p>

      {isDirector && running ? (
        <div className="mt-3 flex items-center gap-2" data-testid="desk-event-extend">
          <span className="mr-auto text-[12px] leading-4 text-muted">Затянулась?</span>
          <Button size="sm" variant="secondary" onClick={() => longer(15)} disabled={extend.isPending} data-testid="desk-event-extend-15">
            +15 мин
          </Button>
          <Button size="sm" variant="secondary" onClick={() => longer(30)} disabled={extend.isPending} data-testid="desk-event-extend-30">
            +30 мин
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 text-[13px] leading-[18px]">
        {event.location ? (
          <Fact icon={<MapPin aria-hidden size={14} strokeWidth={2} />} word="Где">
            <span className="[overflow-wrap:anywhere]">{event.location}</span>
          </Fact>
        ) : null}
        {rule ? (
          <Fact icon={<Repeat aria-hidden size={14} strokeWidth={2} />} word="Повтор">
            <span className="min-w-0 flex-1">
              {ruleLine(rule)}
              <span className="text-muted"> · {ruleState(rule).text}</span>
            </span>
            {isDirector ? (
              <button
                type="button"
                className="shrink-0 font-medium underline underline-offset-2"
                onClick={() =>
                  updateRule.mutate({
                    id: rule.id,
                    patch: { is_active: !rule.is_active },
                    toast: rule.is_active ? "Повтор остановлен. Эта встреча остаётся" : "Повтор снова работает",
                  })
                }
              >
                {rule.is_active ? "Остановить" : "Возобновить"}
              </button>
            ) : null}
          </Fact>
        ) : null}
        {event.body ? (
          <Fact icon={<AlignLeft aria-hidden size={14} strokeWidth={2} />} word="Повестка">
            <span className="whitespace-pre-line [overflow-wrap:anywhere]">{event.body}</span>
          </Fact>
        ) : null}
      </div>
      {event.audio_path ? (
        <div className="mt-3">
          <AudioOriginal path={event.audio_path} />
        </div>
      ) : null}

      <section className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Участники</SectionLabel>
          <span className="nums text-[12px] leading-4 text-muted">{rsvpSummary(event, RSVP_DESK)}</span>
        </div>
        {event.participants.length > 1 ? <AnswersBar {...answersOf(event)} /> : null}
        <ul className="mt-1 flex flex-col" data-testid="desk-event-people-list">
          {shown.map((person) => (
            <Person key={person.user_id} person={person} event={event} meId={meId} over={over} receipt={receipts?.get(person.user_id) ?? null} />
          ))}
        </ul>
        {people.length > SHOWN ? (
          <button type="button" onClick={() => setAll((was) => !was)} className="mt-1 text-[12px] font-medium leading-5 underline underline-offset-2">
            {all ? "Свернуть" : `Ещё ${people.length - SHOWN}`}
          </button>
        ) : null}
      </section>

      <div className="mt-auto pt-4">
        {confirming ? (
          <div ref={confirmBox} className="cal-side-confirm" data-testid="desk-event-confirm">
            <p className="text-[14px] font-semibold leading-5">Удалить встречу?</p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              {/* who already knew gets «Отмена»; a past meeting just leaves the calendar */}
              {!over && othersKnow ? "Исчезнет у всех. Кто уже знает о ней, получит «Отмена»." : "Исчезнет из календаря у всех."}
            </p>
            <div className="mt-2.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => onConfirming(false)}>
                Оставить
              </Button>
              <Button
                size="sm"
                variant="danger"
                data-testid="desk-event-delete-confirm"
                onClick={() => {
                  remove.mutate({ eventId: event.id });
                  onClose();
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : canAnswer ? (
          <div className="cal-side-foot">
            {declining ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="cal-side-reasons">
                <span className="text-[12px] leading-4 text-muted">Почему?</span>
                {DECLINE_REASONS.map((reason) => (
                  <button key={reason} type="button" className="desk-choice" onClick={() => answer("declined", reason)}>
                    {reason}
                  </button>
                ))}
                <button type="button" className="desk-choice" onClick={() => answer("declined")}>
                  Без причины
                </button>
                <button type="button" className="desk-choice" onClick={() => setDeclining(false)}>
                  Назад
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="mr-auto min-w-0 truncate text-[13px] leading-[18px] text-muted">{mine === "invited" ? "Придёте?" : "Ваш ответ"}</span>
                <Button size="sm" variant="secondary" className={mine === "going" ? "cal-side-picked" : "cal-side-going"} onClick={() => answer("going")} disabled={respond.isPending} data-testid="desk-event-going">
                  {mine === "going" ? "Буду ✓" : "Буду"}
                </Button>
                <Button size="sm" variant={mine === "declined" ? "danger" : "ghost"} onClick={() => setDeclining(true)} disabled={respond.isPending} data-testid="desk-event-declined">
                  {mine === "declined" ? "Не смогу ✓" : "Не смогу"}
                </Button>
              </div>
            )}
          </div>
        ) : null}
        <p className="mt-3 flex items-center gap-1 text-[12px] leading-4 text-muted">
          <Kbd>Esc</Kbd> к дню
          {isDirector ? (
            <>
              <span className="ml-2" />
              <Kbd>E</Kbd> изменить
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}

/** A participant: the face ringed by the answer, the name to the person's page, why not, the receipt. */
function Person({
  person,
  event,
  meId,
  over,
  receipt,
}: {
  person: CalendarEvent["participants"][number];
  event: CalendarEvent;
  meId: string;
  over: boolean;
  receipt: MeetingReceipt | null;
}) {
  const name = person.person?.full_name ?? "Сотрудник";
  const author = person.user_id === event.author_id;
  const answer = author
    ? { text: "созвал", tone: "muted" }
    : person.status === "going"
      ? { text: "будет", tone: "ok" }
      : person.status === "declined"
        ? { text: "не сможет", tone: "danger" }
        : person.user_id === meId && !over
          ? { text: "нужен ваш ответ", tone: "warn" }
          : { text: "ждём ответа", tone: "wait" };
  return (
    <li className="cal-side-person flex min-h-9 items-center gap-2.5 py-1" data-testid="cal-side-person">
      <Face person={person} size={26} ring author={author} />
      <span className="min-w-0 flex-1">
        <Link href={`/desk/team?p=${person.user_id}`} className="cal-side-name block truncate text-[13px] font-medium leading-[18px]">
          {shortName(name)}
          {person.user_id === meId ? <span className="font-normal text-muted"> · вы</span> : null}
        </Link>
        {person.status === "declined" && person.reason ? <span className="block truncate text-[12px] leading-4 text-muted">{person.reason}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="cal-side-answer text-[12px] font-medium leading-4" data-tone={answer.tone}>
          {answer.text}
        </span>
        {receipt ? (
          <span className="cal-side-receipt nums text-[11px] leading-[14px]" data-tone={receipt.tone} data-testid="cal-side-receipt">
            {receipt.moved ? "перенос: " : ""}
            {receipt.text}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Who comes, who does not, who has not said — three lengths of one thin bar that draws itself. */
function AnswersBar({ going, declined, waiting, total }: { going: number; declined: number; waiting: number; total: number }) {
  if (total === 0) return null;
  const part = (n: number) => ({ flexGrow: n }) as CSSProperties;
  return (
    <span aria-hidden className="cal-side-answers">
      {going > 0 ? <i data-part="going" style={part(going)} /> : null}
      {declined > 0 ? <i data-part="declined" style={part(declined)} /> : null}
      {waiting > 0 ? <i data-part="waiting" style={part(waiting)} /> : null}
    </span>
  );
}

/** A fact of the meeting: its icon in the margin, its value beside it. */
function Fact({ word, icon, children }: { word: string; icon: ReactNode; children: ReactNode }) {
  return (
    <p className="cal-side-fact">
      <span className="cal-side-fact-word desk-label uppercase">{word}</span>
      <span className="cal-side-fact-icon cal-side-icon" aria-hidden>
        {icon}
      </span>
      <span className="flex min-w-0 items-start gap-2">{children}</span>
    </p>
  );
}
