"use client";

import { Clock, MapPin } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { dayGroups, hhmm, isOver, nextEvent, rsvpSummary, timeRange } from "@/lib/calendar/agenda";
import { useRespondEvent } from "@/lib/calendar/mutations";
import { awaitingAnswer, isRunning, whenAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { pluralRu } from "@/lib/tasks/status-text";

import { Faces } from "./Faces";
import { answersOf, meetingState } from "./state";

/** The reasons of «Не смогу» — the chips of the meeting's own card (EventDetails). */
const REASONS = ["Занят срочным", "Буду в отъезде", "Болею"];
/** Meetings listed under «Дальше». */
const AHEAD = 8;
/** «Через 25 мин» is close enough to light the card: the meeting is about to begin. */
const SOON_MS = 60 * 60 * 1000;

type Props = {
  /** Yesterday and the month ahead (`useCalendar`), whatever the grid shows. */
  upcoming: readonly CalendarEvent[];
  now: Date;
  meId: string;
  /** A meeting was clicked: its card opens beside `element`. */
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
  /** The meeting whose card is open: its row stays lit. */
  openId: string | null;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * «Ближайшее» beside the grid (D-174): the nearest meeting as a card — when, in words that count
 * down, what, where, the faces of who comes and how the answers stand; then the invitations that
 * wait for this person's answer with «Буду / Не смогу» in place; then the days ahead, a line a
 * meeting with the dot of its state. The moment in a sentence is the screen's own state line
 * (D-154) — not repeated here.
 */
export function CalendarAside({ upcoming, now, meId, onOpen, openId }: Props) {
  const next = nextEvent(upcoming, now);
  const unanswered = awaitingAnswer(upcoming, meId, now);
  const owed = new Set(unanswered.map((event) => event.id));
  const ahead = upcoming.filter((event) => !isOver(event, now) && event.id !== next?.id && !owed.has(event.id)).slice(0, AHEAD);

  return (
    <aside className="cal-aside flex min-w-0 flex-col gap-6" aria-label="Ближайшее" data-testid="desk-calendar-aside">
      <section>
        <SectionLabel className="mb-0.5">Ближайшее</SectionLabel>
        <div className="desk-list cal-next-wrap">
          {next ? <NextCard event={next} now={now} onOpen={onOpen} open={next.id === openId} /> : <p className="cal-next-empty py-2 text-[13px] leading-[18px] text-muted">На месяц вперёд встреч нет</p>}
        </div>
      </section>

      {unanswered.length > 0 ? (
        <section data-testid="desk-calendar-answers">
          <SectionLabel className="mb-0.5" count={unanswered.length}>
            Ждут вашего ответа
          </SectionLabel>
          <div className="desk-list cal-asks">
            {unanswered.map((event, index) => (
              <Invitation key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} index={index} />
            ))}
          </div>
        </section>
      ) : null}

      {ahead.length > 0 ? (
        <section>
          <SectionLabel className="mb-0.5">Дальше</SectionLabel>
          <div className="desk-list cal-agenda">
            {dayGroups(ahead, now).map((group) => (
              <div key={group.ymd} className="cal-agenda-day">
                <p className="pb-0.5 pt-2 text-[12px] leading-4 text-muted">{capitalize(group.label)}</p>
                {group.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(click) => onOpen(event, click.currentTarget)}
                    data-state={meetingState(event, meId, now)}
                    data-open={event.id === openId ? "" : undefined}
                    title={`${timeRange(event)} · ${event.title}${event.location ? ` · ${event.location}` : ""}`}
                    className="cal-agenda-row flex h-7 w-full items-center gap-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/60"
                  >
                    <When className="w-10 shrink-0 text-[13px] leading-[18px] text-muted">{hhmm(event.starts_at)}</When>
                    <span aria-hidden className="cal-agenda-dot" />
                    <span className="min-w-0 truncate text-[13px] leading-[18px]">{event.title}</span>
                    {isRunning(event, now) ? <span className="cal-live ml-auto shrink-0 text-[11px] font-medium leading-4">идёт</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

/**
 * The nearest meeting as a card: the countdown lit while it is close, the title, when and where,
 * the faces of who comes and a thin bar of the answers — green who comes, red who does not, grey
 * who has not said — drawn from the left as the card arrives.
 */
function NextCard({ event, now, onOpen, open }: { event: CalendarEvent; now: Date; onOpen: (event: CalendarEvent, element: HTMLElement) => void; open: boolean }) {
  const running = isRunning(event, now);
  const soon = running || new Date(event.starts_at).getTime() - now.getTime() < SOON_MS;
  const answers = answersOf(event);
  const many = event.participants.length > 1;
  return (
    <button
      type="button"
      onClick={(click) => onOpen(event, click.currentTarget)}
      data-testid="desk-calendar-next"
      data-soon={soon ? "" : undefined}
      data-running={running ? "" : undefined}
      data-open={open ? "" : undefined}
      className="cal-next flex w-full flex-col gap-0.5 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/60"
    >
      <When className="cal-next-when text-[13px] leading-[18px]">{capitalize(whenAhead(event, now))}</When>
      <span className="cal-next-title text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{event.title}</span>
      <span className="cal-next-facts truncate text-[12px] leading-4 text-muted">
        <span className="cal-next-fact">
          <Clock aria-hidden size={12} strokeWidth={2} className="cal-next-icon" />
          {timeRange(event)}
        </span>
        {event.location ? (
          <span className="cal-next-fact">
            <span className="cal-next-sep"> · </span>
            <MapPin aria-hidden size={12} strokeWidth={2} className="cal-next-icon" />
            {event.location}
          </span>
        ) : null}
        {many ? <span className="cal-next-rsvp-words"> · {rsvpSummary(event)}</span> : null}
      </span>
      {many ? (
        <span className="cal-next-people">
          <Faces event={event} size={22} max={5} />
          <span className="cal-next-rsvp nums">{rsvpSummary(event)}</span>
        </span>
      ) : null}
      {many ? <AnswersBar {...answers} /> : null}
    </button>
  );
}

/** Who comes, who does not, who has not said — three lengths of one thin bar that draws itself. */
export function AnswersBar({ going, declined, waiting, total }: { going: number; declined: number; waiting: number; total: number }) {
  if (total === 0) return null;
  const part = (n: number) => ({ flexGrow: n }) as CSSProperties;
  return (
    <span aria-hidden className="cal-answers">
      {going > 0 ? <i data-part="going" style={part(going)} /> : null}
      {declined > 0 ? <i data-part="declined" style={part(declined)} /> : null}
      {waiting > 0 ? <i data-part="waiting" style={part(waiting)} /> : null}
    </span>
  );
}

/** An invitation still without this person's answer: «Буду», or «Не смогу» with a reason. */
function Invitation({ event, now, meId, onOpen, index }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent, element: HTMLElement) => void; index: number }) {
  const respond = useRespondEvent(meId);
  const [declining, setDeclining] = useState(false);
  const going = event.participants.filter((p) => p.status === "going").length;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="cal-ask py-2" data-testid="desk-invitation" style={{ "--i": index } as CSSProperties}>
      <button type="button" onClick={(click) => onOpen(event, click.currentTarget)} className="flex w-full flex-col text-left">
        <When className="text-[12px] leading-4 text-muted">{capitalize(whenAhead(event, now))}</When>
        <span className="text-[14px] font-medium leading-5 [overflow-wrap:anywhere]">{event.title}</span>
        <span className="cal-ask-who flex items-center gap-2 text-[12px] leading-4 text-muted">
          <Faces event={event} size={18} max={4} className="cal-ask-faces" />
          {going} {pluralRu(going, ["будет", "будут", "будут"])} из {event.participants.length}
        </span>
      </button>
      {declining ? (
        <div className="cal-ask-reasons mt-1 flex flex-wrap gap-x-3">
          {REASONS.map((reason) => (
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
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" className="desk-move" onClick={() => answer("going")} disabled={respond.isPending} data-testid="desk-event-going">
            Буду
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeclining(true)} disabled={respond.isPending} data-testid="desk-event-declined">
            Не смогу
          </Button>
        </div>
      )}
    </div>
  );
}
