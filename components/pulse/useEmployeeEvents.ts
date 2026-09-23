"use client";

import { useState } from "react";

import type { MascotAct } from "@/components/brand/Mascot";
import type { BoardTask } from "@/lib/pulse/board";
import { employeeEvents, etherEvents, weightiest, type EmployeeEvent } from "@/lib/pulse/employee";
import type { EtherPost } from "@/lib/pulse/ether";

/** What the employee's face plays for each thing that has just happened to the work (D-110). */
export const EVENT_ACT: Record<EmployeeEvent, MascotAct> = {
  arrived: "catch",
  insisted: "insist",
  accepted: "nod",
  asked: "raise",
  declined: "shrug",
  handed: "handover",
  approved: "medal",
  rework: "boomerang",
  revoked: "poof",
  moved: "relief",
  message: "letter",
  read: "read",
  announced: "listen",
  acked: "thumb",
};

export type Happened = { event: EmployeeEvent | null; key: number };

/**
 * The events of the person's work (D-110), read off two consecutive boards and two consecutive
 * Эфир feeds — the way the secretary's desk reads its errands (useDeskFocus). The first list is
 * the baseline: a screen opened after the fact plays nothing. `key` moves with every event, so
 * the same event twice in a row still plays twice.
 */
export function useEmployeeEvents(rows: BoardTask[] | undefined, ether: EtherPost[] | undefined, meId: string): Happened {
  const [seenRows, setSeenRows] = useState(rows);
  const [seenEther, setSeenEther] = useState(ether);
  const [happened, setHappened] = useState<Happened>({ event: null, key: 0 });
  // adjusted during render, not in an effect: the act starts in the same paint as the change
  if (rows !== seenRows || ether !== seenEther) {
    const events: EmployeeEvent[] = [];
    if (rows !== seenRows) {
      if (seenRows && rows && meId) events.push(...employeeEvents(seenRows, rows, meId));
      setSeenRows(rows);
    }
    if (ether !== seenEther) {
      if (seenEther && ether && meId) events.push(...etherEvents(seenEther, ether, meId));
      setSeenEther(ether);
    }
    const event = weightiest(events);
    if (event) setHappened((current) => ({ event, key: current.key + 1 }));
  }
  return happened;
}
