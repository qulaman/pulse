"use client";

import { EventDetails } from "@/components/calendar/EventDetails";
import { Sheet } from "@/components/ui/Sheet";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { useNow } from "@/lib/pulse/queries";

type Props = {
  event: CalendarEvent | null;
  onClose: () => void;
  meId: string;
  isDirector: boolean;
  /** The director saved the form — with the start as it is now. */
  onSaved?: (startsAt: string) => void;
};

/**
 * One meeting opened from the panel of Пульс or Ленты (D-78): the same details the card of
 * /calendar grows into (D-94), in a sheet.
 */
export function EventSheet({ event, onClose, meId, isDirector, onSaved }: Props) {
  const now = useNow();
  return (
    <Sheet open={Boolean(event)} onClose={onClose} title={event?.title ?? ""}>
      {event ? (
        <EventDetails event={event} meId={meId} isDirector={isDirector} now={now} onSaved={onSaved} onDeleted={onClose} />
      ) : null}
    </Sheet>
  );
}
