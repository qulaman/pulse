"use client";

import Link from "next/link";

import { Chip } from "@/components/ui/Chip";
import { dayGroups, hhmm, isOver, myStatus, peopleCount, startsSoon } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";

type Props = {
  events: CalendarEvent[];
  now: Date;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
  /** «compact» — the panel on Пульс and in Ленте: today and tomorrow, then a link to the screen. */
  variant?: "page" | "compact";
};

const STATUS_CHIP = {
  going: { label: "буду", tone: "ok" as const },
  declined: { label: "не смогу", tone: "danger" as const },
  invited: { label: "ответить", tone: "accent" as const },
};

/**
 * The calendar as a ribbon of days (D-78; /calendar lays it under a month grid, D-94). One row per meeting:
 * the time on the left, what and where on the right, and — for anybody but the author —
 * the chip of their own answer, because that is the only thing they can do here.
 */
export function CalendarList({ events, now, meId, onOpen, variant = "page" }: Props) {
  const groups = dayGroups(events, now);
  const shown = variant === "compact" ? groups.slice(0, 2) : groups;

  if (shown.length === 0) return null;

  return (
    <div className={variant === "compact" ? "" : "mt-4"}>
      {shown.map((group) => (
        <section key={group.ymd} className="mt-4 first:mt-0">
          <h2 className="text-[13px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted">
            {group.label}
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} now={now} meId={meId} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}

      {variant === "compact" ? (
        <Link href="/calendar" className="mt-3 block text-[15px] leading-5 text-accent">
          Весь календарь ›
        </Link>
      ) : null}
    </div>
  );
}

/** One meeting in a ribbon — here, and under the month grid of /calendar (D-94). */
export function EventRow({
  event,
  now,
  meId,
  onOpen,
}: {
  event: CalendarEvent;
  now: Date;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
}) {
  const mine = myStatus(event, meId);
  const over = isOver(event, now);
  const soon = !over && startsSoon(event, now);
  const count = peopleCount(event);
  // the author called the meeting: he is going by definition, the chip is for the invited;
  // a meeting that is over asks nobody for an answer any more
  const chip = mine && event.author_id !== meId && !(over && mine === "invited") ? STATUS_CHIP[mine] : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`card flex w-full items-start gap-3 p-3 text-left active:bg-surface-2 ${over ? "opacity-60" : ""}`}
    >
      {/* the start carries the row; the end, when there is one, sits under it quietly */}
      <span className="flex w-[52px] shrink-0 flex-col tabular-nums">
        <span className="text-[15px] font-semibold leading-[22px]">{hhmm(event.starts_at)}</span>
        {event.ends_at ? (
          <span className="mt-0.5 text-[13px] leading-4 text-muted">{hhmm(event.ends_at)}</span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[22px]">{event.title}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-4 text-muted">
          {[event.location, `${count} ${count === 1 ? "человек" : count < 5 ? "человека" : "человек"}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {soon ? (
          <Chip tone="warn" interactive={false}>
            скоро
          </Chip>
        ) : null}
        {chip ? (
          <Chip tone={chip.tone} interactive={false}>
            {chip.label}
          </Chip>
        ) : null}
      </span>
    </button>
  );
}
