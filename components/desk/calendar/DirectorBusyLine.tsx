"use client";

import { useSettled } from "@/components/desk/ui/SideNav";
import { shiftDay } from "@/lib/calendar/agenda";
import { todayYmd } from "@/lib/datetime/calendar";
import { busyLine } from "@/lib/desk/busy";
import { useNow } from "@/lib/pulse/queries";

import { useDirectorBusy } from "./useDirectorBusy";

/**
 * One quiet line by the secretary's «Посетитель» (owner, 2026-11-04): whether the director can be
 * called in now and for how long — no more than that. Nothing is drawn until the server answers.
 */
export function DirectorBusyLine() {
  const settled = useSettled();
  const now = useNow(30_000);
  const today = todayYmd(now);
  const spans = useDirectorBusy(today, shiftDay(today, 1), settled);
  if (!spans.data) return null;
  const line = busyLine(spans.data, now);
  return (
    <span className="ml-1 min-w-0 truncate text-[13px] leading-4 text-muted" title={line.text} data-testid="desk-director-busy-line" data-busy={line.busy ? "1" : "0"}>
      {line.text}
    </span>
  );
}
