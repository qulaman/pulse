"use client";

import { AlarmClock, BellRing, CalendarClock, Check, Flag, Timer, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { humanAqtobe } from "@/lib/ai/time";
import { isOver, peopleCount, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { todayYmd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, pluralRu } from "@/lib/tasks/status-text";

import { Card, DayList, Head, Mark, Person, Pill, Unfold } from "./kit";

/** How many of today's deadlines stand before «ещё N в задачах». */
const DUE_SHOWN = 4;

/** The day's meetings and deadlines worth a line here; none — the block is a capsule (TodayScreen). */
export function agendaOf(events: readonly CalendarEvent[], now: Date, band: CalendarEvent | null): CalendarEvent[] {
  const today = todayYmd(now);
  return events
    .filter((event) => ymdOfEvent(event) === today && event.id !== band?.id)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * «Встречи и сроки» (D-164, D-196): the day's meetings in order — the past ones quiet and struck
 * through, the one of «Сейчас» left to its card — then the deadlines of the director's tasks that
 * fall today, each its own line that opens the task, and «Напомню сегодня · N».
 */
export function DayAgenda({
  events,
  due,
  reminders,
  onOpenTask,
  now,
  note,
  index,
}: {
  /** today's meetings without the one «Сейчас» shows (`agendaOf`) */
  events: readonly CalendarEvent[];
  /** the director's open tasks due today, the earliest first */
  due: readonly TaskWithPeople[];
  reminders: { count: number; next: Date | null } | null;
  onOpenTask: (id: string) => void;
  now: Date;
  /** the meetings did not load, or are an old copy */
  note: ReactNode;
  index: number;
}) {
  const reminding = reminders && reminders.count > 0 ? reminders : null;
  return (
    <Card ink="sky" index={index} testId="today-agenda">
      <Head icon={CalendarClock} title="Встречи и сроки" href="/desk/calendar" />
      {note}
      <DayList>
        {events.map((event) => {
          const over = isOver(event, now);
          const ahead = Math.ceil((new Date(event.starts_at).getTime() - now.getTime()) / 60_000);
          const soon = !over && ahead > 0 && ahead <= 30;
          return (
            <Unfold key={event.id}>
              <Link href={`/desk/calendar?e=${encodeURIComponent(event.id)}`} prefetch={false} className={`day-row desk-focus ${over ? "day-faint" : ""}`} data-testid="today-meeting">
                <span className="day-when" title={timeRange(event)}>{humanAqtobe(new Date(event.starts_at), now).replace(/^сегодня /, "")}</span>
                <span className="flex min-w-0 items-center gap-2">
                  {over ? <Mark icon={Check} ink="muted" /> : <Mark icon={CalendarClock} ink="sky" />}
                  <span className={`truncate ${over ? "line-through decoration-[var(--rule)]" : ""}`} title={event.title}>
                    {event.title}
                  </span>
                </span>
                {soon ? (
                  <Pill ink="sky" icon={Timer}>
                    через {ahead} мин
                  </Pill>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] day-faint" title={`Участников: ${peopleCount(event)}`}>
                    <Users size={12} strokeWidth={2.25} aria-hidden />
                    <span className="nums">{peopleCount(event)}</span>
                  </span>
                )}
              </Link>
            </Unfold>
          );
        })}
        {due.slice(0, DUE_SHOWN).map((task) => {
          const late = isOverdue(task, now);
          const who = task.assignee?.full_name ?? "";
          return (
            <Unfold key={task.id}>
              <button type="button" onClick={() => onOpenTask(task.id)} className="day-row desk-focus" data-testid="today-due" data-overdue={late ? "" : undefined}>
                <span className="day-when" data-late={late ? "" : undefined}>
                  {task.deadline ? `до ${humanAqtobe(new Date(task.deadline), now).replace(/^сегодня /, "")}` : "сегодня"}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Mark icon={late ? AlarmClock : Flag} ink={late ? "pencil" : "pen"} title={late ? "Срок прошёл" : "Срок сегодня"} />
                  <Person id={task.assignee_id} name={who || "?"} size={20} />
                  <span className="min-w-0 truncate" title={task.title}>
                    {shortName(who) || "Без исполнителя"}
                    <span className="day-muted"> · {task.title}</span>
                  </span>
                </span>
                {late ? <Pill ink="pencil">просрочено</Pill> : <span />}
              </button>
            </Unfold>
          );
        })}
        {due.length > DUE_SHOWN ? (
          <Unfold key="due-more">
            <Link href="/desk/tasks?due=today" prefetch className="day-row desk-focus day-muted" style={{ gridTemplateColumns: "1fr" }} data-testid="today-due-more">
              ещё {due.length - DUE_SHOWN} {pluralRu(due.length - DUE_SHOWN, ["срок", "срока", "сроков"])} — в «Задачах» →
            </Link>
          </Unfold>
        ) : null}
        {reminding ? (
          <Unfold key="reminders">
            {/* a quiet line, not a list (D-177): the thoughts are private, «Заметки» shows them */}
            <Link href="/desk/notes" prefetch className="day-row desk-focus day-muted" data-testid="today-reminders">
              <span className="day-when">{reminding.next ? humanAqtobe(reminding.next, now).replace(/^сегодня /, "") : "сегодня"}</span>
              <span className="flex min-w-0 items-center gap-2">
                <Mark icon={BellRing} ink="warn" />
                <span className="truncate">
                  Напомню сегодня · <span className="nums">{reminding.count}</span>
                </span>
              </span>
              <span />
            </Link>
          </Unfold>
        ) : null}
      </DayList>
    </Card>
  );
}
