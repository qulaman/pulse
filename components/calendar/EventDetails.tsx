"use client";

import { useState, type ReactNode } from "react";

import { EventEditor } from "@/components/calendar/EventEditor";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Face } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { isOver, myStatus, rsvpSummary, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { useDeleteEvent, useRespondEvent } from "@/lib/calendar/mutations";
import { toneAhead, whenAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { humanYmd } from "@/lib/datetime/calendar";
import { TONE_VAR } from "@/lib/tasks/tone";

/** Причины «Не смогу» — те же чипы, что у задачи: короткие и правдивые. */
const REASONS = ["Занят срочным", "Буду в отъезде", "Болею"];

/** More than this and the list folds behind «Все участники» — «всем» is fifty rows. */
const SHOWN_PEOPLE = 6;

/** The exceptions first — who will not come and why, then who has not answered, then the rest. */
const ORDER: Record<string, number> = { declined: 0, invited: 1, going: 2 };

type Props = {
  event: CalendarEvent;
  meId: string;
  isDirector: boolean;
  now: Date;
  /** The director saved the form — with the start as it is now (the month may follow it). */
  onSaved?: (startsAt: string) => void;
  /** The meeting is gone — whatever holds these details closes. */
  onDeleted?: () => void;
  /** «card» — under the head of a /calendar card, which already says when and where. */
  variant?: "card" | "sheet";
};

/**
 * Everything a meeting holds, drawn once for both places it opens (D-100): the card of
 * /calendar that grows in place and the sheet of Пульс and Ленты. When and where, what
 * for, the voice it was set with, who is coming and why somebody is not; a participant
 * answers «Буду / Не смогу» (principle 2 counted in its own way — a meeting is not a task),
 * the director changes the meeting or deletes it — the confirmation stays inside, no
 * second sheet over the first.
 */
export function EventDetails({ event, meId, isDirector, now, onSaved, onDeleted, variant = "sheet" }: Props) {
  const respond = useRespondEvent(meId);
  const remove = useDeleteEvent();

  const [declining, setDeclining] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allPeople, setAllPeople] = useState(false);

  const over = isOver(event, now);
  const mine = myStatus(event, meId);
  const canAnswer = mine !== null && event.author_id !== meId && !over;
  const when = whenAhead(event, now);
  const live = !over && (when.startsWith("идёт") || when.startsWith("через"));

  const people = [...event.participants].sort(
    (a, b) =>
      Number(b.user_id === event.author_id) - Number(a.user_id === event.author_id) ||
      (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) ||
      (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? ""),
  );
  const shown = allPeople ? people : people.slice(0, SHOWN_PEOPLE);
  const othersKnow = event.participants.some((p) => p.user_id !== event.author_id);

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {variant === "sheet" ? (
        <div className="flex flex-col gap-2">
          <Line icon={<ClockIcon />}>
            <span>{capitalize(humanYmd(ymdOfEvent(event), now))}</span>
            <span className="text-muted"> · </span>
            <span className="nums">{timeRange(event)}</span>
            {live ? (
              <span className="ml-2 whitespace-nowrap text-[13px] font-semibold" style={{ color: TONE_VAR[toneAhead(event, now)] }}>
                {when}
              </span>
            ) : null}
          </Line>
          {event.location ? <Line icon={<PinIcon />}>{event.location}</Line> : null}
        </div>
      ) : null}

      {event.body ? <p className="whitespace-pre-line text-[15px] leading-[21px]">{event.body}</p> : null}
      {event.audio_path ? <AudioOriginal path={event.audio_path} /> : null}

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Участники</span>
          <span className="nums text-[13px] leading-4 text-muted">{rsvpSummary(event)}</span>
        </div>
        <ul className="mt-1.5 flex flex-col">
          {shown.map((person) => {
            const name = person.person?.full_name ?? "Сотрудник";
            const state =
              person.user_id === event.author_id
                ? { text: "созвал", color: "var(--text-muted)" }
                : person.status === "going"
                  ? { text: "будет", color: "var(--ok)" }
                  : person.status === "declined"
                    ? { text: "не сможет", color: "var(--danger)" }
                    : person.user_id === meId && !over
                      ? { text: "нужен ваш ответ", color: "var(--warn)" }
                      : { text: "ждём ответа", color: "var(--text-muted)" };
            return (
              <li key={person.user_id} className="flex min-h-[36px] items-center gap-2.5 py-1">
                <Face name={name} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5">
                    {name}
                    {person.user_id === meId ? <span className="text-muted"> · вы</span> : null}
                  </span>
                  {person.status === "declined" && person.reason ? (
                    <span className="block truncate text-[13px] leading-4 text-muted">{person.reason}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[13px] font-medium leading-4" style={{ color: state.color }}>
                  {state.text}
                </span>
              </li>
            );
          })}
        </ul>
        {people.length > SHOWN_PEOPLE ? (
          <button
            type="button"
            onClick={() => setAllPeople((was) => !was)}
            className="mt-0.5 min-h-[36px] text-[14px] font-medium leading-5 text-accent"
          >
            {allPeople ? "Свернуть" : `Все участники · ${people.length}`}
          </button>
        ) : null}
      </div>

      {canAnswer ? (
        declining ? (
          <div>
            <p className="text-[13px] leading-4 text-muted">Почему не получится?</p>
            <div className="mt-2 flex flex-wrap gap-2">
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
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button
              // not answered yet: «Буду» is the move, as «Принять» is on a task
              variant={mine === "declined" ? "secondary" : "primary"}
              onClick={() => answer("going")}
              disabled={respond.isPending}
              data-testid="event-going"
            >
              {mine === "going" ? "Буду ✓" : "Буду"}
            </Button>
            <Button
              variant={mine === "declined" ? "danger" : "secondary"}
              onClick={() => setDeclining(true)}
              disabled={respond.isPending}
              data-testid="event-declined"
            >
              {mine === "declined" ? "Не смогу ✓" : "Не смогу"}
            </Button>
          </div>
        )
      ) : null}

      {isDirector ? (
        confirmDelete ? (
          <div
            className="rounded-[14px] border px-3 py-3"
            style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, transparent)", background: "color-mix(in srgb, var(--danger) 7%, transparent)" }}
          >
            <p className="font-display text-[15px] font-semibold leading-5">Удалить мероприятие?</p>
            <p className="mt-1 text-[13px] leading-[18px] text-muted">
              {/* who already knew gets «Отмена»; a past meeting just leaves the calendar */}
              {!over && othersKnow
                ? "Оно исчезнет из календаря у всех. Кто уже знает о нём, получит уведомление об отмене."
                : "Оно исчезнет из календаря у всех."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Оставить
              </Button>
              <Button
                variant="danger"
                data-testid="event-delete-confirm"
                onClick={() => {
                  remove.mutate({ eventId: event.id });
                  setConfirmDelete(false);
                  onDeleted?.();
                }}
              >
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-border/60 pt-3">
            <Button variant="secondary" size="sm" icon={<PencilIcon />} onClick={() => setEditing(true)} data-testid="event-edit">
              Изменить
            </Button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              data-testid="event-delete"
              className="ml-auto flex min-h-[40px] items-center gap-1.5 rounded-[12px] px-3 text-[14px] font-medium leading-5 text-danger active:bg-danger/10"
            >
              <TrashIcon />
              Удалить
            </button>
          </div>
        )
      ) : null}

      {isDirector ? (
        <EventEditor open={editing} onClose={() => setEditing(false)} event={event} meId={meId} onSaved={onSaved} />
      ) : null}
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[15px] leading-[21px]">
      <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ClockIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function PinIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden {...STROKE}>
      <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}
