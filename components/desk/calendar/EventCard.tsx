"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Popover, type Anchor } from "@/components/desk/ui/Popover";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { ruleLine, ruleState } from "@/components/recurrence/RecurrenceSection";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { isOver, myStatus, rsvpSummary, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { useDeleteEvent, useRespondEvent } from "@/lib/calendar/mutations";
import { whenAhead } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { humanYmd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { useRecurrenceRules, useUpdateRule } from "@/lib/recurrence/queries";

/** The reasons of «Не смогу» — the phone card's own. */
const REASONS = ["Занят срочным", "Буду в отъезде", "Болею"];
/** People shown before «ещё N». */
const SHOWN = 6;
const WIDTH = 384;
/** The exceptions first — who will not come, then who has not answered, then the rest. */
const ORDER: Record<string, number> = { declined: 0, invited: 1, going: 2 };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A meeting opened on the desk (wave 3): a card beside its block, as a desktop calendar opens
 * one — the grid stays in sight and live. The head says what and when, with «Изменить» (E),
 * «Удалить» (Del) and × (Esc) as icons; below — where, how it repeats, the agenda, the voice it
 * was set with, who comes and why somebody does not. A participant answers «Буду / Не смогу»
 * here; «Удалить» asks once more in the card itself. `confirming` — Delete was pressed on the
 * grid: the card opens already asking.
 */
export function EventCard({
  event,
  anchor,
  onClose,
  meId,
  isDirector,
  now,
  onEdit,
  confirming,
  onConfirming,
}: {
  event: CalendarEvent | null;
  anchor: Anchor;
  onClose: () => void;
  meId: string;
  isDirector: boolean;
  now: Date;
  onEdit: () => void;
  confirming: boolean;
  onConfirming: (on: boolean) => void;
}) {
  return (
    <Popover open={Boolean(event)} onClose={onClose} anchor={anchor} width={WIDTH} label={event?.title ?? "Встреча"}>
      {event ? (
        <CardBody key={event.id} event={event} meId={meId} isDirector={isDirector} now={now} onClose={onClose} onEdit={onEdit} confirming={confirming} onConfirming={onConfirming} />
      ) : null}
    </Popover>
  );
}

function CardBody({
  event,
  meId,
  isDirector,
  now,
  onClose,
  onEdit,
  confirming,
  onConfirming,
}: {
  event: CalendarEvent;
  meId: string;
  isDirector: boolean;
  now: Date;
  onClose: () => void;
  onEdit: () => void;
  confirming: boolean;
  onConfirming: (on: boolean) => void;
}) {
  const respond = useRespondEvent(meId);
  const remove = useDeleteEvent();
  const rules = useRecurrenceRules(Boolean(event.recurrence_rule_id));
  const updateRule = useUpdateRule();
  const rule = event.recurrence_rule_id ? (rules.data?.find((row) => row.id === event.recurrence_rule_id) ?? null) : null;
  const [declining, setDeclining] = useState(false);
  const [all, setAll] = useState(false);
  const confirmBox = useRef<HTMLDivElement>(null);

  const over = isOver(event, now);
  const mine = myStatus(event, meId);
  const canAnswer = mine !== null && event.author_id !== meId && !over;
  const when = whenAhead(event, now);
  const live = !over && (when.startsWith("идёт") || when.startsWith("через"));
  const othersKnow = event.participants.some((p) => p.user_id !== event.author_id);

  // the question takes the focus: Enter deletes, Esc leaves the card
  useEffect(() => {
    if (confirming) confirmBox.current?.querySelector<HTMLButtonElement>("[data-testid=desk-event-delete-confirm]")?.focus({ preventScroll: true });
  }, [confirming]);

  const people = [...event.participants].sort(
    (a, b) =>
      Number(b.user_id === event.author_id) - Number(a.user_id === event.author_id) ||
      (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) ||
      (a.person?.full_name ?? "").localeCompare(b.person?.full_name ?? ""),
  );
  const shown = all ? people : people.slice(0, SHOWN);

  const answer = (status: "going" | "declined", reason?: string) => {
    respond.mutate({ eventId: event.id, status, reason });
    setDeclining(false);
  };

  return (
    <div className="flex max-h-[min(72vh,600px)] flex-col" data-testid="desk-event-card" data-event-id={event.id}>
      <div className="flex items-start gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">{event.title}</h2>
          <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
            <When>
              {capitalize(humanYmd(ymdOfEvent(event), now))} · {timeRange(event)}
            </When>
            {live ? <When className="ml-1.5 text-text">{when}</When> : null}
          </p>
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center">
          {isDirector ? (
            <>
              <IconButton label="Изменить" keys={["E"]} onClick={onEdit} testId="desk-event-edit">
                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </IconButton>
              <IconButton label="Удалить" keys={["Del"]} onClick={() => onConfirming(true)} testId="desk-event-delete" danger>
                <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13" />
                <path d="M10 11v5.5M14 11v5.5" />
              </IconButton>
            </>
          ) : null}
          <IconButton label="Закрыть" keys={["Esc"]} onClick={onClose} testId="desk-event-close">
            <path d="M6 6l12 12M18 6 6 18" />
          </IconButton>
        </div>
      </div>

      <div className="no-bar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
        {event.location || rule ? (
          <div className="flex flex-col gap-1 text-[13px] leading-[18px]">
            {event.location ? (
              <Line word="Где">
                <span className="[overflow-wrap:anywhere]">{event.location}</span>
              </Line>
            ) : null}
            {rule ? (
              <Line word="Повтор">
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
              </Line>
            ) : null}
          </div>
        ) : null}

        {event.body ? <p className="whitespace-pre-line text-[13px] leading-5 [overflow-wrap:anywhere]">{event.body}</p> : null}
        {event.audio_path ? <AudioOriginal path={event.audio_path} /> : null}

        <section>
          <div className="flex items-baseline justify-between gap-3 pb-1">
            <h3 className="desk-label uppercase">Участники</h3>
            <span className="text-[12px] leading-4 text-muted">{rsvpSummary(event)}</span>
          </div>
          <ul className="desk-list" data-testid="desk-event-people-list">
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
                <li key={person.user_id} className="flex min-h-8 items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-[18px]" title={name}>
                      {shortName(name)}
                      {person.user_id === meId ? <span className="text-muted"> · вы</span> : null}
                    </span>
                    {person.status === "declined" && person.reason ? <span className="block truncate text-[12px] leading-4 text-muted">{person.reason}</span> : null}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium leading-4" style={{ color: state.color }}>
                    {state.text}
                  </span>
                </li>
              );
            })}
          </ul>
          {people.length > SHOWN ? (
            <button type="button" onClick={() => setAll((was) => !was)} className="mt-0.5 text-[12px] font-medium leading-5 underline underline-offset-2">
              {all ? "Свернуть" : `Ещё ${people.length - SHOWN}`}
            </button>
          ) : null}
        </section>
      </div>

      {confirming ? (
        <div ref={confirmBox} className="border-t border-text px-4 py-3" data-testid="desk-event-confirm">
          <p className="text-[14px] font-semibold leading-5">Удалить встречу?</p>
          <p className="mt-0.5 text-[12px] leading-4 text-muted">
            {/* who already knew gets «Отмена»; a past meeting just leaves the calendar */}
            {!over && othersKnow ? "Исчезнет у всех. Кто уже знает о нём, получит уведомление об отмене." : "Исчезнет из календаря у всех."}
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
        <div className="border-t border-border px-4 py-3">
          {declining ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] leading-4 text-muted">Почему?</span>
              {REASONS.map((reason) => (
                <Button key={reason} size="sm" variant="secondary" onClick={() => answer("declined", reason)}>
                  {reason}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => answer("declined")}>
                Без причины
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
                Назад
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="mr-auto text-[13px] leading-[18px] text-muted">{mine === "invited" ? "Придёте?" : mine === "going" ? "Вы будете" : "Вы не сможете"}</span>
              <Button size="sm" variant={mine === "declined" ? "ghost" : "secondary"} className={mine === "declined" ? "" : "desk-move"} onClick={() => answer("going")} disabled={respond.isPending} data-testid="desk-event-going">
                {mine === "going" ? "Буду ✓" : "Буду"}
              </Button>
              <Button size="sm" variant={mine === "declined" ? "danger" : "ghost"} onClick={() => setDeclining(true)} disabled={respond.isPending} data-testid="desk-event-declined">
                {mine === "declined" ? "Не смогу ✓" : "Не смогу"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function IconButton({ label, keys, onClick, children, testId, danger = false }: { label: string; keys: string[]; onClick: () => void; children: ReactNode; testId: string; danger?: boolean }) {
  return (
    <Tooltip label={label} keys={keys} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        data-testid={testId}
        className={`flex h-8 w-8 items-center justify-center text-muted transition-colors duration-[120ms] hover:bg-surface-2 ${danger ? "hover:text-danger" : "hover:text-text"}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {children}
        </svg>
      </button>
    </Tooltip>
  );
}

/** A fact of the meeting: its word in the margin, its value beside it. */
function Line({ word, children }: { word: string; children: ReactNode }) {
  return (
    <p className="grid grid-cols-[56px_minmax(0,1fr)] items-baseline gap-2">
      <span className="desk-label uppercase">{word}</span>
      <span className="flex min-w-0 items-start gap-2">{children}</span>
    </p>
  );
}
