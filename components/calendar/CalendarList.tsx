"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EventHead } from "@/components/calendar/EventCard";
import { InviteAnswer } from "@/components/calendar/InviteAnswer";
import { dayGroups, isOver, myStatus } from "@/lib/calendar/agenda";
import { awaitsMyAnswer } from "@/lib/calendar/invites";
import { useRespondEvent } from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { springs } from "@/lib/design/tokens";

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
 * the same line the cards of /calendar wear (D-94); a tap opens it in a sheet, and an
 * invitation is answered right on its line (D-167).
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
        <Link href="/calendar" className="mt-1 flex min-h-[44px] items-center text-[15px] leading-5 text-accent">
          Весь календарь ›
        </Link>
      ) : null}
    </div>
  );
}

/** Under the head: the time column, the rail and their gaps — the answer lines up with the title. */
const UNDER_TITLE = "pl-[85px] pr-3.5";

/** What leaves goes faster than what comes (D-166): the buttons fold away under the line. */
const LEAVE = { duration: 0.16, ease: [0.4, 0, 1, 1] } as const;

/**
 * One meeting as a row that opens elsewhere (a sheet) — the head of the /calendar card. An
 * invitation that waits for me carries «Буду / Не смогу» under the head (D-167): «Буду» in
 * one tap, «Не смогу» with the reasons the sheet asks for; the answer is written at the tap
 * and the line says it quietly. Changing it is the sheet's business, as before. The whole
 * card still opens the meeting — the head stretches over it, the answer sits above.
 */
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
  const respond = useRespondEvent(meId);
  const still = useReducedMotion();
  // answered on this row: the quiet line stays while the panel is open; the server saying no
  // puts the invitation back (the mutation restores it), and the buttons with it
  const [answered, setAnswered] = useState(false);

  const asks = awaitsMyAnswer(event, meId, now);
  const mine = myStatus(event, meId);
  const said = answered && !asks && (mine === "going" || mine === "declined") ? mine : null;
  const reason = event.participants.find((person) => person.user_id === meId)?.reason;

  // the second tap of a double tap finds the first answer on its way (the buttons leave a frame
  // later, with the cache); a failed one lets the next tap try again
  const sending = useRef(false);
  const answer = (status: "going" | "declined", why?: string) => {
    if (sending.current) return;
    sending.current = true;
    setAnswered(true);
    respond.mutate(
      { eventId: event.id, status, reason: why },
      {
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };

  const arrive = still ? { duration: 0 } : springs.object;
  const leave = still ? { duration: 0 } : LEAVE;

  return (
    <div
      data-closed={isOver(event, now) || undefined}
      data-testid="event-row"
      data-asks={asks || undefined}
      className="task-card relative transition-transform duration-[120ms] has-[[data-row-head]:active]:scale-[0.99]"
      style={{ borderRadius: 18 }}
    >
      <button
        type="button"
        data-row-head
        onClick={() => onOpen(event)}
        className="flex w-full items-start gap-3 px-3.5 pb-3 pt-3.5 text-left after:absolute after:inset-0 after:rounded-[18px] after:content-['']"
      >
        <EventHead event={event} now={now} meId={meId} link />
      </button>

      <AnimatePresence initial={false}>
        {asks ? (
          <motion.div
            key="ask"
            // above the stretched head: a tap between the buttons does not open the meeting
            className="relative z-[1] overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: arrive }}
            exit={{ height: 0, opacity: 0, transition: leave }}
          >
            <div className={`${UNDER_TITLE} pb-3.5`}>
              <InviteAnswer mine={mine} onAnswer={answer} testId="invite" folds />
            </div>
          </motion.div>
        ) : said ? (
          <motion.p
            key="said"
            className={`${UNDER_TITLE} overflow-hidden text-[14px] font-semibold leading-5`}
            style={{ color: said === "going" ? "var(--ok)" : "var(--text-muted)" }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: arrive }}
            exit={{ height: 0, opacity: 0, transition: leave }}
            data-testid="invite-said"
          >
            <span className="block truncate pb-3">
              {said === "going" ? "Буду ✓" : "Не смогу"}
              {/* the reason the director will read, so the line says what was sent */}
              {said === "declined" && reason ? <span className="font-normal"> · {reason}</span> : null}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
