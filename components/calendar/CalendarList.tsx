"use client";

import Link from "next/link";

import { EventHead } from "@/components/calendar/EventCard";
import { dayGroups, isOver } from "@/lib/calendar/agenda";
import type { CalendarEvent } from "@/lib/calendar/queries";

type Props = {
  events: CalendarEvent[];
  now: Date;
  meId: string;
  onOpen: (event: CalendarEvent) => void;
  /** «compact» — the panel on Пульс and in Ленте: today and tomorrow, then a link to the screen. */
  variant?: "page" | "compact";
};

/**
 * The calendar as a ribbon of days (D-78) — the panel of Пульс and Ленты. Every meeting is
 * the same line the cards of /calendar wear (D-94); a tap opens it in a sheet.
 */
export function CalendarList({ events, now, meId, onOpen, variant = "page" }: Props) {
  const groups = dayGroups(events, now);
  const shown = variant === "compact" ? groups.slice(0, 2) : groups;

  if (shown.length === 0) return null;

  return (
    <div className={variant === "compact" ? "" : "mt-4"}>
      {shown.map((group) => (
        <section key={group.ymd} className="mt-4 first:mt-0">
          <h2 className="px-1 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">
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

/** One meeting as a row that opens elsewhere (a sheet) — the head of the /calendar card. */
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
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      data-closed={isOver(event, now) || undefined}
      className="task-card flex w-full items-start gap-3 px-3.5 pb-3 pt-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
      style={{ borderRadius: 18 }}
    >
      <EventHead event={event} now={now} meId={meId} link />
    </button>
  );
}
