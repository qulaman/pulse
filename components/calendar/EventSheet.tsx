"use client";

import { useState } from "react";

import { EventEditor } from "@/components/calendar/EventEditor";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Row, RowGroup } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { humanYmd } from "@/lib/datetime/calendar";
import { isOver, myStatus, rsvpSummary, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { useDeleteEvent, useRespondEvent } from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";

type Props = {
  event: CalendarEvent | null;
  onClose: () => void;
  meId: string;
  isDirector: boolean;
  /** The director saved the form — with the start as it is now (the month may follow it). */
  onSaved?: (startsAt: string) => void;
};

/** Причины «Не смогу» — те же чипы, что у задачи: короткие и правдивые. */
const REASONS = ["Занят срочным", "Буду в отъезде", "Болею"];

const DOT: Record<string, string> = {
  going: "var(--ok)",
  declined: "var(--danger)",
  invited: "var(--text-muted)",
};

/**
 * One meeting, opened from the ribbon or from a push (`/calendar?e=…`). A participant has
 * exactly two buttons — «Буду» and «Не смогу» (principle 2 counted in its own way: a
 * meeting is not a task, so there is no «Уточнить»); the director gets «Изменить» — the
 * whole form of the meeting — and «Удалить» (D-94).
 */
export function EventSheet({ event, onClose, meId, isDirector, onSaved }: Props) {
  return (
    <Sheet open={Boolean(event)} onClose={onClose} title={event?.title ?? ""}>
      {event ? (
        <EventBody event={event} onClose={onClose} meId={meId} isDirector={isDirector} onSaved={onSaved} />
      ) : null}
    </Sheet>
  );
}

function EventBody({ event, onClose, meId, isDirector, onSaved }: { event: CalendarEvent } & Omit<Props, "event">) {
  const respond = useRespondEvent(meId);
  const remove = useDeleteEvent();

  const [declining, setDeclining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = myStatus(event, meId);
  const canAnswer = mine !== null && event.author_id !== meId;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <>
      <p className="text-[16px] leading-[22px]">
        {/* «завтра · 14:00–15:30» — the start is said once, whether or not there is an end */}
        {event.ends_at
          ? `${humanYmd(ymdOfEvent(event))} · ${timeRange(event)}`
          : humanAqtobe(new Date(event.starts_at))}
      </p>
      {event.location ? <p className="mt-1 text-[15px] leading-5 text-muted">{event.location}</p> : null}
      {event.body ? <p className="mt-2 text-[15px] leading-5">{event.body}</p> : null}
      {event.audio_path ? (
        <div className="mt-3">
          <AudioOriginal path={event.audio_path} />
        </div>
      ) : null}

      <p className="mt-4 text-[13px] leading-4 text-muted">{rsvpSummary(event)}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {event.participants.map((person) => (
          <li key={person.user_id} className="flex items-center gap-2 text-[15px] leading-5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: DOT[person.status] ?? "var(--text-muted)" }}
            />
            <span className="min-w-0 truncate">{person.person?.full_name ?? "Сотрудник"}</span>
            {person.status === "declined" && person.reason ? (
              <span className="min-w-0 truncate text-[13px] leading-4 text-muted">
                — {person.reason.toLowerCase()}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {canAnswer ? (
        <div className="mt-4">
          {declining ? (
            <>
              <p className="text-[13px] leading-4 text-muted">Почему не сможешь?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REASONS.map((reason) => (
                  <Chip key={reason} tone="neutral" onClick={() => answer("declined", reason)}>
                    {reason}
                  </Chip>
                ))}
                <Chip tone="muted" onClick={() => answer("declined")}>
                  Без причины
                </Chip>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mine === "going" ? "primary" : "secondary"}
                onClick={() => answer("going")}
                disabled={respond.isPending}
              >
                {mine === "going" ? "Буду ✓" : "Буду"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDeclining(true)}
                disabled={respond.isPending}
              >
                {mine === "declined" ? "Не смогу ✓" : "Не смогу"}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {isDirector ? (
        <RowGroup className="mt-4">
          <Row icon={<PencilIcon />} title="Изменить" onClick={() => setEditing(true)} />
          <Row
            icon={<TrashIcon />}
            title="Удалить мероприятие"
            tone="danger"
            onClick={() => setConfirmDelete(true)}
          />
        </RowGroup>
      ) : null}

      {isDirector ? (
        <EventEditor
          open={editing}
          onClose={() => setEditing(false)}
          event={event}
          meId={meId}
          onSaved={onSaved}
        />
      ) : null}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить мероприятие?">
        <p className="text-[15px] leading-5 text-muted">
          {/* who already knew gets «Отмена»; a past meeting just leaves the calendar */}
          {!isOver(event, new Date()) && event.participants.some((p) => p.user_id !== event.author_id)
            ? "Оно исчезнет из календаря у всех. Кто уже знает о нём, получит уведомление об отмене."
            : "Оно исчезнет из календаря у всех."}
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              remove.mutate({ eventId: event.id });
              setConfirmDelete(false);
              onClose();
            }}
          >
            Удалить
          </Button>
          <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>
            Оставить
          </Button>
        </div>
      </Sheet>
    </>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}
