"use client";

import { CalendarClock, Check, DoorOpen, StickyNote, Timer } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { isOver, peopleCount, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { isRunning } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import type { Visit, VisitAnswer } from "@/lib/visits/queries";
import { waitedSince } from "@/lib/visits/text";

import { Bar, Card, DayList, Ghost, Head, INK, LiveDot, Mark, Person, Pill, Unfold } from "./kit";

/*
 * «Сейчас» (D-196): what is about this very moment, on top of the right side and lit from its
 * corner — who waits at the door with the phone's three answers (D-96) and what the secretary
 * wrote to the screen; the meeting on now, or the one that starts within half an hour.
 */

/** How soon a meeting counts as «now»: it starts within this many minutes. */
const SOON_MIN = 30;

/** The meeting the band is about: on now, else the next one of today within half an hour. */
export function meetingNow(events: readonly CalendarEvent[], now: Date): CalendarEvent | null {
  const today = todayYmd(now);
  const todays = events.filter((event) => ymdOfEvent(event) === today && !isOver(event, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const running = todays.find((event) => isRunning(event, now));
  if (running) return running;
  const ahead = todays.find((event) => {
    const minutes = (new Date(event.starts_at).getTime() - now.getTime()) / 60_000;
    return minutes > 0 && minutes <= SOON_MIN;
  });
  return ahead ?? null;
}

const ANSWERS: { value: VisitAnswer; label: string; main?: boolean }[] = [
  { value: "invited", label: "Пусть заходит", main: true },
  { value: "wait", label: "Подождёт" },
  { value: "declined", label: "Не приму" },
];

/**
 * «У двери»: the visitors waiting for the director's word and the secretary's notes. Nobody — the
 * band does not draw it. A visitor just come rings out of their circle; told to wait — still.
 */
export function DoorCard({
  visitors,
  messages,
  now,
  onAnswer,
  busyId,
  note,
  index,
}: {
  visitors: readonly Visit[];
  messages: readonly Visit[];
  now: Date;
  onAnswer: (visit: Visit, answer: VisitAnswer) => void;
  busyId: string | null;
  /** the visitors did not load, or are an old copy */
  note: ReactNode;
  index: number;
}) {
  const waiting = visitors.some((visit) => visit.status === "waiting");
  return (
    <Card ink="warn" now index={index} testId="today-reception">
      <Head icon={DoorOpen} title="У двери" corner={waiting ? "news" : "state"} swing={waiting} count={visitors.length + messages.length} />
      {note}
      <DayList className="day-list-flush">
        {visitors.map((visit) => {
          const fresh = visit.status === "waiting";
          const name = visit.note?.trim() || "Без имени";
          return (
            <Unfold key={visit.id}>
              <div data-testid="today-visitor">
                <div className="day-visitor">
                  <span className="day-face-wrap" style={{ "--tone": INK.warn } as CSSProperties}>
                    <Person id={null} name={name} size={36} />
                    {fresh ? <span aria-hidden className="day-face-ring" data-mode="now" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[12px] leading-4" style={{ color: fresh ? "var(--warn-ink)" : "var(--ink-2)" }}>
                      {fresh ? <LiveDot ink="warn" mode="now" /> : null}
                      {fresh ? "К вам посетитель" : "Ждёт в приёмной"}
                    </span>
                    <span className="block text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{name}</span>
                  </span>
                  <span className="day-when">ждёт {waitedSince(visit.created_at, now)}</span>
                </div>
                <div className="day-answers">
                  {ANSWERS.map((option) =>
                    option.value === "wait" && !fresh ? null : (
                      <button
                        key={option.value}
                        type="button"
                        className={`${option.main ? "btn-primary" : "btn-secondary"} day-btn`}
                        disabled={busyId === visit.id}
                        onClick={() => onAnswer(visit, option.value)}
                        data-testid={`visit-${option.value}`}
                      >
                        {option.label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </Unfold>
          );
        })}
        {messages.map((visit) => (
          <Unfold key={visit.id}>
            <div className="day-row" style={{ gridTemplateColumns: "20px minmax(0,1fr) auto" }} data-testid="today-message">
              <Mark icon={StickyNote} ink="warn" />
              <span className="min-w-0">
                <span className="block text-[12px] leading-4 day-muted">Секретарь · {waitedSince(visit.created_at, now)}</span>
                <span className="block leading-5 [overflow-wrap:anywhere]">{visit.note?.trim() || "Без текста"}</span>
              </span>
              <Ghost icon={Check} disabled={busyId === visit.id} onPress={() => onAnswer(visit, "read")} testId="visit-read">
                Понятно
              </Ghost>
            </div>
          </Unfold>
        ))}
      </DayList>
    </Card>
  );
}

/**
 * The meeting of the moment: on now — the head says «Идёт встреча» with a still green dot, how much
 * of it has gone as a bar and how much is left; within half an hour — «через N мин» in sky. Who comes, as a
 * stack of circles. The name leads to the meeting in «Календарь».
 */
export function MeetingCard({ event, now, index }: { event: CalendarEvent; now: Date; index: number }) {
  const live = isRunning(event, now);
  const start = new Date(event.starts_at).getTime();
  const end = event.ends_at ? new Date(event.ends_at).getTime() : null;
  const ahead = Math.max(1, Math.ceil((start - now.getTime()) / 60_000));
  const length = end ? Math.max(1, Math.round((end - start) / 60_000)) : 0;
  const gone = end ? Math.max(0, Math.min(length, Math.round((now.getTime() - start) / 60_000))) : 0;
  const people = event.participants.filter((person) => person.status !== "declined");
  return (
    <Card ink={live ? "ok" : "sky"} now index={index} testId="today-meeting">
      <Head icon={CalendarClock} title={live ? "Идёт встреча" : "Скоро встреча"} href={`/desk/calendar?e=${encodeURIComponent(event.id)}`} corner={live ? "state" : null}>
        {live ? null : (
          <Pill ink="sky" icon={Timer}>
            через {ahead} мин
          </Pill>
        )}
      </Head>
      <div className="flex flex-col gap-2 pb-1 pt-1" data-live={live ? "" : undefined}>
        <span className="text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{event.title}</span>
        <span className="flex items-center gap-3 text-[12px]">
          <span className="nums day-muted">{timeRange(event)}</span>
          <span className="day-stack-faces ml-auto" title={`Участников: ${peopleCount(event)}`}>
            {people.slice(0, 4).map((person) => (
              <Person key={person.user_id} id={person.user_id} name={person.person?.full_name ?? "?"} size={22} />
            ))}
            {people.length > 4 ? <span className="nums day-faint pl-2.5 text-[12px]">+{people.length - 4}</span> : null}
          </span>
        </span>
        {live && end ? (
          <span className="flex items-center gap-3">
            <Bar value={gone} of={length} ink="ok" className="flex-1" label={`Прошло ${gone} мин из ${length}`} />
            <span className="nums whitespace-nowrap text-[12px] day-muted">осталось {Math.max(0, length - gone)} мин</span>
          </span>
        ) : null}
      </div>
    </Card>
  );
}
