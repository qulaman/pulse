"use client";

import { useMemo, useState } from "react";

import { useDeskFocus } from "@/components/secretary/useDeskFocus";
import { useErrandActions, useSetAway } from "@/lib/errands/mutations";
import { useErrands, useSecretaries, useSecretaryActions, useSecretarySetup } from "@/lib/errands/queries";
import { daypartOf, isAway, quickStreak, sceneOf, todayTally, urgencyOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { useVisits } from "@/lib/visits/queries";

const NO_ACTIONS: SecretaryAction[] = [];
const OFFICE_HOURS = { from: "08:00", to: "21:00" };

/**
 * The secretary's Лента (D-87): the requests — nobody's yet and its own taken ones (another
 * secretary's taken request goes out by itself) — the one its face acts out, the finish after
 * «Готово», the nod on «Принял» and the hearts of a thank-you (D-97), «не на месте до 14:00»
 * (D-99), the visitor let in (D-96), the lamp of the director's door and the day's tally. Only the
 * secretary reads the requests: RLS gives the other roles not a row (D-79 §8).
 */
export function useSecretaryHome({ isSecretary, meId, now, pointsEnabled }: { isSecretary: boolean; meId: string; now: Date; pointsEnabled: boolean }) {
  const errands = useErrands(isSecretary);
  const errandRows = useMemo(() => errands.data ?? [], [errands.data]);
  const mineErrands = useMemo(
    () => errandRows.filter((e) => e.status === "sent" || (e.status === "accepted" && e.claimed_by === meId)),
    [errandRows, meId],
  );
  const catalogue = useSecretaryActions(isSecretary);
  const actions = catalogue.data ?? NO_ACTIONS;
  const secretarySetup = useSecretarySetup(isSecretary);
  const errandActions = useErrandActions();
  // «не на месте до 14:00» (D-99): the secretary's own row among the secretaries
  const secretaryPeople = useSecretaries(isSecretary);
  const meAtDesk = (secretaryPeople.data ?? []).find((p) => p.id === meId) ?? null;
  const away = meAtDesk !== null && isAway(meAtDesk, now);
  const setAway = useSetAway(meId);
  const [presenceOpen, setPresenceOpen] = useState(false);
  // what to pass back after «Готово» (D-99): this secretary's jobs of the last ten minutes
  const [skipped, setSkipped] = useState<string[]>([]);
  const errandDesk = useDeskFocus(errandRows, meId, actions, now);
  // «К вам посетитель» (D-96): the reception's own cards, and the director's «пусть заходит»
  // plays the guest scene — the door opens — unless a new request is ringing
  const visits = useVisits(isSecretary);
  const visitRows = useMemo(() => visits.data ?? [], [visits.data]);
  const letIn = visitRows.find((v) => v.status === "invited" && !v.closed_at) ?? null;
  const showsGuest = letIn !== null && errandDesk.phase !== "asked";
  const desk = showsGuest ? { ...errandDesk, scene: "guest" as const, phase: "doing" as const } : errandDesk;
  const urgency = urgencyOf(desk.phase === "asked" ? desk.errand : null, now, secretarySetup.data?.escalateAfterMin ?? 3);
  const daypart = daypartOf(now, secretarySetup.data?.window ?? OFFICE_HOURS);
  // «не беспокоить», whoever of the secretaries took it: the whole screen says so
  const guarded = useMemo(() => errandRows.find((e) => e.status === "accepted" && sceneOf(e, actions) === "dnd") ?? null, [errandRows, actions]);
  const tally = useMemo(() => todayTally(errandRows, meId, now, actions), [errandRows, meId, now, actions]);
  // the game feel waits for the adaptation gate — the same switch as the points (D-40, D-48)
  const streak = pointsEnabled && desk.phase === "done" ? quickStreak(errandRows, meId, now) : 0;
  return {
    /** the requests as the board's speech hears them */
    errandsData: errands.data,
    errandRows,
    mineErrands,
    actions,
    errandActions,
    meAtDesk,
    away,
    setAway,
    presenceOpen,
    setPresenceOpen,
    skipped,
    setSkipped,
    desk,
    visitRows,
    showsGuest,
    urgency,
    daypart,
    guarded,
    tally,
    streak,
  };
}
