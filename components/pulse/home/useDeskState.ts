"use client";

import { useEffect, useMemo, useState } from "react";

import { useDeskFocus } from "@/components/secretary/useDeskFocus";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { setDeskAbsence, usePendingErrands } from "@/lib/errands/pending";
import { isActive, useErrandReceipt, useErrands, useSecretaries, useSecretaryActions, useSecretarySetup } from "@/lib/errands/queries";
import { absenceLine, isAway, sceneOfAction } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

const NO_ACTIONS: SecretaryAction[] = [];
/** A meeting without an end is taken as an hour long. */
const HOUR_MS = 60 * 60_000;

/**
 * The secretary's desk next to the director's face (D-85) and what stands round it: the requests
 * and what the secretaries are doing about them, the cup brought over after «Готово» (D-97), who of
 * them is at the desk (D-99), «не беспокоить» offered while a meeting is on (D-99), the visitor at
 * the door and the secretary's words on the wall (D-96, D-116). It exists only when the company has
 * somebody to ask (D-79 §4); `hydrated` — the rows are read after hydration, as the server drew none.
 */
export function useDeskState({
  people,
  hydrated,
  now,
  events,
}: {
  people: readonly { role: string; is_active: boolean }[] | undefined;
  hydrated: boolean;
  now: Date;
  events: readonly CalendarEvent[];
}) {
  const hasSecretary = (people ?? []).some((p) => p.role === "secretary" && p.is_active);
  const errands = useErrands(hasSecretary);
  const errandsData = hydrated ? errands.data : undefined;
  const errandRows = useMemo(() => errandsData ?? [], [errandsData]);
  const catalogue = useSecretaryActions(hasSecretary);
  const actions = catalogue.data ?? NO_ACTIONS;
  // what the secretaries are doing about the requests, for the small secretary at the desk:
  // the job in its hands, the picture on its monitor, the cup brought over after «Готово» (D-97)
  const deskStage = useDeskFocus(errandRows, null, actions, now);
  // the request nobody has taken yet: has the secretary opened it? The desk nods (D-106 §8)
  const askedErrand = deskStage.phase === "asked" ? deskStage.errand : null;
  const askedReceipt = useErrandReceipt(askedErrand?.id ?? null, askedErrand !== null);
  // null while the receipt of this request is still loading: a screen opened after «увидел» does not nod
  const deskSeen =
    askedErrand === null ? false : askedReceipt.isSuccess ? Boolean(askedReceipt.data?.seen_at || askedReceipt.data?.acted_at) : null;
  const secretarySetup = useSecretarySetup(hasSecretary);
  // who of the secretaries is at the desk (D-99): all away — an empty chair and «до 14:00»
  const secretaryPeople = useSecretaries(hasSecretary);
  const awayUntil = useMemo(() => {
    const list = secretaryPeople.data ?? [];
    if (list.length === 0 || !list.every((p) => isAway(p, now))) return null;
    return list.map((p) => p.away_until as string).sort()[0] ?? null;
  }, [secretaryPeople.data, now]);
  // the toast of a request that went says who is away — the request waits for them (D-106)
  const absence = useMemo(() => absenceLine(secretaryPeople.data ?? [], now), [secretaryPeople.data, now]);
  useEffect(() => {
    setDeskAbsence(absence);
    return () => setDeskAbsence(null);
  }, [absence]);
  // requests kept on the phone without network (D-106): the desk says they wait
  const waitingErrands = usePendingErrands((state) => state.pending.filter((p) => p.waiting).length);
  // the director is in a meeting right now: «не беспокоить до конца встречи?» (D-99)
  const meetingNow = useMemo(() => {
    const at = now.getTime();
    return (
      events.find((e) => {
        const start = new Date(e.starts_at).getTime();
        const end = e.ends_at ? new Date(e.ends_at).getTime() : start + HOUR_MS;
        return !e.cancelled_at && start <= at && at < end;
      }) ?? null
    );
  }, [events, now]);
  const meetingEndsAt = meetingNow ? (meetingNow.ends_at ?? new Date(new Date(meetingNow.starts_at).getTime() + HOUR_MS).toISOString()) : null;
  const dndAction = actions.find((a) => sceneOfAction(a) === "dnd") ?? null;
  const dndLive = errandRows.some((e) => isActive(e) && e.kind === dndAction?.code);
  const [dndOffered, setDndOffered] = useState<string | null>(null);
  const offerDnd = meetingNow !== null && dndAction !== null && !dndLive && dndOffered !== meetingNow.id;
  // «К вам посетитель» (D-96): somebody at the secretary's desk waits for an answer — the card
  // sits under the face even on the waiting screen, a person is standing there
  const visits = useVisits(hasSecretary);
  const visitsData = hydrated ? visits.data : undefined;
  const visitRows = useMemo(() => visitsData ?? [], [visitsData]);
  return {
    hasSecretary,
    /** the requests as the board's speech hears them — not held back for hydration */
    errandsData: errands.data,
    refetchErrands: errands.refetch,
    errandRows,
    /** the secretaries' buttons (`settings.secretary_actions`) */
    actions,
    deskStage,
    deskSeen,
    escalateAfterMin: secretarySetup.data?.escalateAfterMin ?? 3,
    secretaries: secretaryPeople.data,
    awayUntil,
    waitingErrands,
    meetingNow,
    meetingEndsAt,
    dndAction,
    offerDnd,
    setDndOffered,
    visitRows,
    visitorsWaiting: awaitingDirector(visitRows).length > 0,
    // the secretary's words on the wall (D-116): the same words under the face, «Понятно» clears both
    messagesWaiting: unreadMessages(visitRows).length > 0,
  };
}
