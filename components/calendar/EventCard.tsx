"use client";

import { EventDetails, PinIcon } from "@/components/calendar/EventDetails";
import { CardShell, Face } from "@/components/tasks/list/TaskList";
import { hhmm, isOver, myStatus } from "@/lib/calendar/agenda";
import { isRunning, toneAhead, whenAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { TONE_VAR } from "@/lib/tasks/tone";

type Props = {
  event: CalendarEvent;
  now: Date;
  meId: string;
  isDirector: boolean;
  open: boolean;
  onToggle: () => void;
  onSaved?: (startsAt: string) => void;
};

/**
 * A meeting in the ribbon of /calendar (D-100) — a card of «Задачи» (D-83): the head reads
 * like a schedule line and opens the details in place, one card at a time.
 */
export function EventCard({ event, now, meId, isDirector, open, onToggle, onSaved }: Props) {
  return (
    <CardShell
      id={event.id}
      open={open}
      closed={isOver(event, now)}
      onToggle={onToggle}
      testId="event-card"
      head={<EventHead event={event} now={now} meId={meId} open={open} />}
    >
      <EventDetails
        event={event}
        meId={meId}
        isDirector={isDirector}
        now={now}
        onSaved={onSaved}
        onDeleted={onToggle}
        variant="card"
      />
    </CardShell>
  );
}

/**
 * The line of a meeting: the time as a column (the start, the end under it), a rail in the
 * colour of the moment, what and where at full width, then who is coming as faces and —
 * in place of the count — the one word that matters now: «идёт», «через 12 мин», or the
 * answer this person owes.
 */
export function EventHead({
  event,
  now,
  meId,
  open = false,
  link = false,
}: {
  event: CalendarEvent;
  now: Date;
  meId: string;
  open?: boolean;
  /** A row that opens a sheet elsewhere: the chevron points on, not down. */
  link?: boolean;
}) {
  const over = isOver(event, now);
  const tone = toneAhead(event, now);
  const mine = myStatus(event, meId);
  const author = event.author_id === meId;
  const going = event.participants.filter((p) => p.status === "going").length;
  const total = event.participants.length;
  const when = whenAhead(event, now);

  // the word that matters now: the moment when it is close, else my own answer
  const flag =
    !over && (isRunning(event, now) || when.startsWith("через"))
      ? { text: when, color: TONE_VAR[tone] }
      : !over && !author && mine === "invited"
        ? { text: "нужен ответ", color: "var(--warn)" }
        : !author && mine === "going"
          ? { text: "буду", color: over ? "var(--text-muted)" : "var(--ok)" }
          : !author && mine === "declined"
            ? { text: "не смогу", color: "var(--text-muted)" }
            : null;

  const names = event.participants
    .filter((p) => p.status !== "declined")
    .map((p) => p.person?.full_name ?? "Сотрудник");
  const count = total <= 1 ? (author ? "только вы" : "1 участник") : `${going} из ${total} будут`;

  return (
    <>
      <span className="flex w-[44px] shrink-0 flex-col pt-px">
        <span className={`nums text-[16px] font-semibold leading-[21px] ${over ? "text-muted" : ""}`}>{hhmm(event.starts_at)}</span>
        {event.ends_at ? <span className="nums mt-0.5 text-[13px] leading-4 text-muted">{hhmm(event.ends_at)}</span> : null}
      </span>
      <span
        aria-hidden
        className="w-[3px] shrink-0 self-stretch rounded-full"
        style={{ background: TONE_VAR[tone], opacity: over ? 0.35 : 1 }}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] ${open ? "" : "line-clamp-2"} ${over ? "text-muted" : ""}`}
        >
          {event.title}
        </span>
        {event.location ? (
          <span className="mt-1 flex items-center gap-1 text-[13px] leading-4 text-muted">
            <PinIcon size={13} />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
        {/* who is coming, and the one word that matters now in place of the count */}
        <span className="mt-1.5 flex items-center gap-2 text-[13px] leading-4">
          <span className="flex shrink-0 gap-0.5">
            {names.slice(0, 3).map((name, index) => (
              <Face key={`${name}-${index}`} name={name} size={18} />
            ))}
          </span>
          {flag ? (
            <span className="nums min-w-0 truncate font-semibold" style={{ color: flag.color }}>
              {flag.text}
            </span>
          ) : (
            <span className="nums min-w-0 truncate text-muted">{count}</span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`ml-auto shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d={link ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"} />
          </svg>
        </span>
      </span>
    </>
  );
}
