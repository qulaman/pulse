"use client";

import { useState } from "react";

import { ParticipantsPicker } from "@/components/confirm/ParticipantsPicker";
import { useRoster } from "@/components/confirm/useRoster";
import { WhenSheet } from "@/components/confirm/WhenSheet";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Row, RowGroup } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { humanAqtobe } from "@/lib/ai/time";
import { myStatus, rsvpSummary, timeRange } from "@/lib/calendar/agenda";
import {
  useCancelEvent,
  useRespondEvent,
  useSetParticipants,
  useUpdateEvent,
} from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";

type Props = {
  event: CalendarEvent | null;
  onClose: () => void;
  meId: string;
  isDirector: boolean;
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
 * meeting is not a task, so there is no «Уточнить»); the director gets the guest list, the
 * new time and the way to call it off.
 */
export function EventSheet({ event, onClose, meId, isDirector }: Props) {
  return (
    <Sheet open={Boolean(event)} onClose={onClose} title={event?.title ?? ""}>
      {event ? <EventBody event={event} onClose={onClose} meId={meId} isDirector={isDirector} /> : null}
    </Sheet>
  );
}

function EventBody({ event, onClose, meId, isDirector }: { event: CalendarEvent } & Omit<Props, "event">) {
  const respond = useRespondEvent(meId);
  const setParticipants = useSetParticipants();
  // «Все сотрудники» on a meeting that already exists: the RPC takes ids, not a flag, so
  // the whole roster the director sees becomes the list to add (the sheet is director-only)
  const roster = useRoster();
  const update = useUpdateEvent();
  const cancel = useCancelEvent();

  const [declining, setDeclining] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whenOpen, setWhenOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const mine = myStatus(event, meId);
  const canAnswer = mine !== null && event.author_id !== meId;

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <>
      <p className="text-[16px] leading-[22px]">
        {humanAqtobe(new Date(event.starts_at))}
        {event.ends_at ? ` · ${timeRange(event)}` : ""}
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
          <Row
            icon={<PeopleIcon />}
            title="Участники"
            value={String(event.participants.length)}
            onClick={() => setWhoOpen(true)}
          />
          <Row icon={<ClockIcon />} title="Перенести" value={timeRange(event)} onClick={() => setWhenOpen(true)} />
          <Row
            icon={<CrossIcon />}
            title="Отменить мероприятие"
            tone="danger"
            onClick={() => setConfirmCancel(true)}
          />
        </RowGroup>
      ) : null}

      <ParticipantsPicker
        open={whoOpen}
        onClose={() => setWhoOpen(false)}
        everyone={event.everyone}
        selectedIds={event.participants.map((p) => p.user_id)}
        onDone={({ everyone, ids }) => {
          const was = event.participants.map((p) => p.user_id);
          // «Все» is the roster itself; either way the RPC gets the difference of two lists
          const next = everyone ? [...new Set([...was, ...(roster.data ?? []).map((u) => u.id)])] : ids;
          setParticipants.mutate({
            eventId: event.id,
            add: next.filter((id) => !was.includes(id)),
            remove: was.filter((id) => !next.includes(id) && id !== event.author_id),
          });
        }}
      />

      <WhenSheet
        open={whenOpen}
        onClose={() => setWhenOpen(false)}
        currentIso={event.starts_at}
        onPick={(iso) => update.mutate({ eventId: event.id, fields: { starts_at: iso } })}
      />

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Отменить мероприятие?">
        <p className="text-[15px] leading-5 text-muted">Участники получат уведомление об отмене.</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              cancel.mutate({ eventId: event.id });
              setConfirmCancel(false);
              onClose();
            }}
          >
            Да, отменить
          </Button>
          <Button variant="ghost" block onClick={() => setConfirmCancel(false)}>
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

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3 2.4 3 4.6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}
