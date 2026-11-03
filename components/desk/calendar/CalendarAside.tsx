"use client";

import { useState } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { dayGroups, hhmm, isOver, nextEvent, rsvpSummary, startsSoon, timeRange } from "@/lib/calendar/agenda";
import { useRespondEvent } from "@/lib/calendar/mutations";
import { awaitingAnswer, isRunning, toneAhead, whenAhead } from "@/lib/calendar/overview";
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
  onOpen: (event: CalendarEvent) => void;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * «Ближайшее» beside the grid: the nearest meeting, the invitations that wait for this person's
 * answer with «Буду / Не смогу» in place, and the days ahead. The moment in a sentence is the
 * screen's own state line (D-154) — not repeated here.
 */
export function CalendarAside({ upcoming, now, meId, onOpen }: Props) {
  const next = nextEvent(upcoming, now);
  const running = next ? isRunning(next, now) : false;
  const soon = !running && startsSoon(next, now);
  const unanswered = awaitingAnswer(upcoming, meId, now);
  const owed = new Set(unanswered.map((event) => event.id));
  const ahead = upcoming.filter((event) => !isOver(event, now) && event.id !== next?.id && !owed.has(event.id)).slice(0, AHEAD);

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Ближайшее" data-testid="desk-calendar-aside">
      <section>
        <SectionLabel className="mb-1.5">Ближайшее</SectionLabel>
        {next ? (
          <button
            type="button"
            onClick={() => onOpen(next)}
            data-testid="desk-calendar-next"
            className="card relative flex w-full flex-col gap-0.5 overflow-hidden py-3 pl-4 pr-3.5 text-left transition-[border-color] duration-[120ms] hover:border-muted/50"
            style={running || soon ? { borderColor: `color-mix(in srgb, var(--${running ? "accent" : "warn"}) 50%, var(--border))` } : undefined}
          >
            <span aria-hidden className="absolute inset-y-3 left-1.5 w-[3px] rounded-full" style={{ background: TONE_VAR[toneAhead(next, now)] }} />
            <span className="nums text-[13px] font-semibold leading-[18px]" style={{ color: TONE_VAR[toneAhead(next, now)] }}>
              {capitalize(whenAhead(next, now))}
            </span>
            <span className="font-display text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{next.title}</span>
            <span className="truncate text-[12px] leading-4 text-muted">
              {timeRange(next)}
              {next.location ? ` · ${next.location}` : ""}
              {next.participants.length > 1 ? ` · ${rsvpSummary(next)}` : ""}
            </span>
          </button>
        ) : (
          <p className="text-[13px] leading-[18px] text-muted">На месяц вперёд встреч нет</p>
        )}
      </section>

      {unanswered.length > 0 ? (
        <section data-testid="desk-calendar-answers">
          <SectionLabel className="mb-1.5" count={unanswered.length}>
            Ждут вашего ответа
          </SectionLabel>
          <div className="flex flex-col gap-2">
            {unanswered.map((event) => (
              <Invitation key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ) : null}

      {ahead.length > 0 ? (
        <section>
          <SectionLabel className="mb-1">Дальше</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {dayGroups(ahead, now).map((group) => (
              <div key={group.ymd}>
                <p className="text-[12px] font-semibold leading-4 text-muted">{capitalize(group.label)}</p>
                <ul className="mt-0.5 flex flex-col">
                  {group.events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(event)}
                        className="-mx-1.5 flex w-[calc(100%+12px)] items-baseline gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors duration-[120ms] hover:bg-surface-2/70"
                      >
                        <span className="nums w-10 shrink-0 text-[13px] leading-[18px] text-muted">{hhmm(event.starts_at)}</span>
                        <span className="min-w-0 truncate text-[13px] leading-[18px]">{event.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

/** An invitation still without this person's answer: «Буду», or «Не смогу» with a reason. */
function Invitation({ event, now, meId, onOpen }: { event: CalendarEvent; now: Date; meId: string; onOpen: (event: CalendarEvent) => void }) {
  const respond = useRespondEvent(meId);
  const [declining, setDeclining] = useState(false);
  const going = event.participants.filter((p) => p.status === "going").length;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="card px-3.5 py-2.5" data-testid="desk-invitation">
      <button type="button" onClick={() => onOpen(event)} className="flex w-full flex-col text-left">
        <span className="nums text-[12px] font-semibold leading-4 text-muted">{capitalize(whenAhead(event, now))}</span>
        <span className="text-[14px] font-medium leading-5 [overflow-wrap:anywhere]">{event.title}</span>
        <span className="text-[12px] leading-4 text-muted">
          {going} {pluralRu(going, ["будет", "будут", "будут"])} из {event.participants.length}
        </span>
      </button>
      {declining ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {REASONS.map((reason) => (
            <Chip key={reason} tone="neutral" onClick={() => answer("declined", reason)}>
              {reason}
            </Chip>
          ))}
          <Chip tone="muted" onClick={() => answer("declined")}>
            Без причины
          </Chip>
          <Chip tone="muted" onClick={() => setDeclining(false)}>
            Назад
          </Chip>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => answer("going")} disabled={respond.isPending} data-testid="desk-event-going">
            Буду
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setDeclining(true)} disabled={respond.isPending} data-testid="desk-event-declined">
            Не смогу
          </Button>
        </div>
      )}
    </div>
  );
}
