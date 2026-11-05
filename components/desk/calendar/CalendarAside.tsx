"use client";

import { useState } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { dayGroups, hhmm, isOver, nextEvent, rsvpSummary, timeRange } from "@/lib/calendar/agenda";
import { useRespondEvent } from "@/lib/calendar/mutations";
import { awaitingAnswer, whenAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** The reasons of «Не смогу» — the chips of the meeting's own card (EventDetails). */
const REASONS = ["Занят срочным", "Буду в отъезде", "Болею"];
/** Meetings listed under «Дальше». */
const AHEAD = 8;

type Props = {
  /** Yesterday and the month ahead (`useCalendar`), whatever the grid shows. */
  upcoming: readonly CalendarEvent[];
  now: Date;
  meId: string;
  /** A meeting was clicked: its card opens beside `element`. */
  onOpen: (event: CalendarEvent, element: HTMLElement) => void;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * «Ближайшее» beside the grid, three ruled lists: the nearest meeting, the invitations that wait
 * for this person's answer with «Буду / Не смогу» in place, and the days ahead. The moment in a
 * sentence is the screen's own state line (D-154) — not repeated here.
 */
export function CalendarAside({ upcoming, now, meId, onOpen }: Props) {
  const next = nextEvent(upcoming, now);
  const unanswered = awaitingAnswer(upcoming, meId, now);
  const owed = new Set(unanswered.map((event) => event.id));
  const ahead = upcoming.filter((event) => !isOver(event, now) && event.id !== next?.id && !owed.has(event.id)).slice(0, AHEAD);

  return (
    <aside className="flex min-w-0 flex-col gap-6" aria-label="Ближайшее" data-testid="desk-calendar-aside">
      <section>
        <SectionLabel className="mb-0.5">Ближайшее</SectionLabel>
        <div className="desk-list">
          {next ? (
            <button
              type="button"
              onClick={(click) => onOpen(next, click.currentTarget)}
              data-testid="desk-calendar-next"
              className="flex w-full flex-col gap-0.5 py-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/60"
            >
              <When className="text-[13px] leading-[18px]">{capitalize(whenAhead(next, now))}</When>
              <span className="text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{next.title}</span>
              <span className="truncate text-[12px] leading-4 text-muted">
                {timeRange(next)}
                {next.location ? ` · ${next.location}` : ""}
                {next.participants.length > 1 ? ` · ${rsvpSummary(next)}` : ""}
              </span>
            </button>
          ) : (
            <p className="py-2 text-[13px] leading-[18px] text-muted">На месяц вперёд встреч нет</p>
          )}
        </div>
      </section>

      {unanswered.length > 0 ? (
        <section data-testid="desk-calendar-answers">
          <SectionLabel className="mb-0.5" count={unanswered.length}>
            Ждут вашего ответа
          </SectionLabel>
          <div className="desk-list">
            {unanswered.map((event) => (
              <Invitation key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ) : null}

      {ahead.length > 0 ? (
        <section>
          <SectionLabel className="mb-0.5">Дальше</SectionLabel>
          <div className="desk-list">
            {dayGroups(ahead, now).map((group) => (
              <div key={group.ymd}>
                <p className="pb-0.5 pt-2 text-[12px] leading-4 text-muted">{capitalize(group.label)}</p>
                {group.events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(click) => onOpen(event, click.currentTarget)}
                    className="flex h-7 w-full items-center gap-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/60"
                  >
                    <When className="w-10 shrink-0 text-[13px] leading-[18px] text-muted">{hhmm(event.starts_at)}</When>
                    <span className="min-w-0 truncate text-[13px] leading-[18px]">{event.title}</span>
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

/** An invitation still without this person's answer: «Буду», or «Не смогу» with a reason. */
function Invitation({ event, now, meId, onOpen }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent, element: HTMLElement) => void }) {
  const respond = useRespondEvent(meId);
  const [declining, setDeclining] = useState(false);
  const going = event.participants.filter((p) => p.status === "going").length;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="py-2" data-testid="desk-invitation">
      <button type="button" onClick={(click) => onOpen(event, click.currentTarget)} className="flex w-full flex-col text-left">
        <When className="text-[12px] leading-4 text-muted">{capitalize(whenAhead(event, now))}</When>
        <span className="text-[14px] font-medium leading-5 [overflow-wrap:anywhere]">{event.title}</span>
        <span className="text-[12px] leading-4 text-muted">
          {going} {pluralRu(going, ["будет", "будут", "будут"])} из {event.participants.length}
        </span>
      </button>
      {declining ? (
        <div className="mt-1 flex flex-wrap gap-x-3">
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
