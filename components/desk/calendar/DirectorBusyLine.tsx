"use client";

import { useMemo } from "react";

import { useSettled } from "@/components/desk/ui/SideNav";
import { shiftDay } from "@/lib/calendar/agenda";
import { todayYmd } from "@/lib/datetime/calendar";
import { doorHoldOf, doorOf, type BusySpan, type Door, type DoorHold } from "@/lib/desk/busy";
import { useErrands, useSecretaryActions } from "@/lib/errands/queries";
import { useNow } from "@/lib/pulse/queries";

import { useDirectorBusy } from "./useDirectorBusy";

export type DirectorDoor = {
  /** The door now; null — the calendar has not answered and the door is open: nothing is said. */
  door: Door | null;
  /** Today's busy spans (and tomorrow's), null until the server answers. */
  spans: BusySpan[] | null;
  hold: DoorHold | null;
  /** The first answer is still on its way: a place is kept, nothing is said yet. */
  pending: boolean;
};

/**
 * The director's door (D-175): his calendar's busy spans (`director_busy`) and a «не беспокоить»
 * one of the secretaries has taken — the closed door wins over a meeting, a meeting over free. The
 * same requests as the side navigation's count, so the line and the queue never disagree.
 */
export function useDirectorDoor(enabled: boolean, now: Date): DirectorDoor {
  const today = todayYmd(now);
  const busy = useDirectorBusy(today, shiftDay(today, 1), enabled);
  const errands = useErrands(enabled);
  const catalogue = useSecretaryActions(enabled);
  const hold = useMemo(() => (errands.data ? doorHoldOf(errands.data, catalogue.data ?? [], now) : null), [errands.data, catalogue.data, now]);
  const spans = busy.data ?? null;
  return { door: doorOf(spans, hold, now), spans, hold, pending: busy.isPending && !hold };
}

/**
 * The director's door by the secretary's «Посетитель» (owner, 2026-11-04; D-175): a pill with the
 * lamp of the door — green free, amber in a meeting, violet «не беспокоить» — and the state in
 * words. Never «свободен» behind a closed door; nothing until the server answers.
 */
export function DirectorBusyLine() {
  const settled = useSettled();
  const now = useNow(30_000);
  const { door } = useDirectorDoor(settled, now);
  if (!door) return null;
  return (
    <span
      className="stoika-door-pill"
      title={door.holder?.name ? `${door.text} · держит ${door.holder.name}` : door.text}
      data-testid="desk-director-busy-line"
      data-busy={door.state === "free" ? "0" : "1"}
      data-state={door.state}
    >
      <span aria-hidden className="stoika-lamp" data-state={door.state} />
      <span className="min-w-0 truncate">{door.text}</span>
    </span>
  );
}
