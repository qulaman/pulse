"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { useDirectorDoor } from "@/components/desk/calendar/DirectorBusyLine";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { useSettled } from "@/components/desk/ui/SideNav";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { isActive, useErrands, useSecretaries, useSecretaryActions, waitedFor, type Errand } from "@/lib/errands/queries";
import { etaLeftMin, etaLine, sceneOf } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useVisits } from "@/lib/visits/queries";

import { DoorCard } from "./Door";
import { ErrandHistory } from "./ErrandHistory";
import { PersonFace, SceneTile, useArrivals } from "./look";
import { QueueList, resultsOf, StoikaLabel, WaitPill } from "./Queue";
import { ReceptionCard } from "./Reception";
import { ErrandPanel, LoadFailedHero, NO_ACTIONS, NO_ERRANDS } from "./Shared";
import { dayClosedOf, DayJournal, DayTally } from "./StoikaDay";
import { AwayBand, StoikaHead, useThanksToast } from "./StoikaHead";

/* ---- the secretary: «Стойка» (D-175) ------------------------------------------------------- */

/** One colleague's work, seen and never touched (owner Q7): her face, what she has, no buttons. */
function Colleague({ id, name, rows, now, catalogue, onOpen }: { id: string; name: string; rows: readonly Errand[]; now: Date; catalogue: readonly SecretaryAction[]; onOpen: (id: string) => void }) {
  return (
    <section className="stoika-section stoika-colleague" aria-label={`В работе у коллеги: ${shortName(name)}`} data-testid="stoika-colleague">
      <StoikaLabel count={rows.length} face={<PersonFace id={id} name={name} size={20} />}>
        {shortName(name)} · в работе
      </StoikaLabel>
      <div className="stoika-card stoika-rows">
        {rows.map((errand) => {
          const promise = etaLine(etaLeftMin(errand, now));
          return (
            <button key={errand.id} type="button" className="stoika-row stoika-row-muted desk-focus" onClick={() => onOpen(errand.id)} data-errand-id={errand.id}>
              <WaitPill text={waitedFor(errand, now)} tone="quiet" />
              <span className="stoika-row-tile">
                <SceneTile scene={sceneOf(errand, catalogue)} size={30} muted />
              </span>
              <span className="min-w-0 text-left">
                <span className="stoika-row-title block">
                  <b>{errand.label}</b>
                  {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
                </span>
                <span className="stoika-who">{promise ? `обещано: ${promise}` : "взято"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The page's place while the first read comes: the door, one slot — the shapes of a quiet desk. */
function StoikaBone() {
  return (
    <SkeletonGroup grow className="flex flex-col gap-4">
      <Bone h={168} className="!rounded-[14px]" />
      <Bone h={44} className="!rounded-[12px]" />
    </SkeletonGroup>
  );
}

/**
 * The secretary's desk, «Стойка» (tasks/022 B.4, D-154, D-158, D-174, D-175): her home all day,
 * quiet most of it. The director's door on top — a card with his day while nothing waits, a strip
 * once work comes; the requests that wait for her as tickets, the alarm first; what is in her hands
 * as rows with «Что передать директору?» on top; a colleague's work muted; «Приёмная» on the right;
 * «Сегодня» — her journal, or one tally line while she is busy. Presence is a control in the head,
 * an away band says when she is gone. Her history is the second view (`?view=history`).
 */
export function SecretaryErrands({ meId, openId, onOpen, history }: { meId: string; openId: string | null; onOpen: (id: string) => void; history: boolean }) {
  const now = useNow(30_000);
  const errands = useErrands();
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const secretaries = useSecretaries();
  const still = useReducedMotion();
  const rows = errands.data ?? NO_ERRANDS;
  const actions = catalogue.data ?? NO_ACTIONS;
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const settled = useSettled();
  // read once the screen has hydrated, as the top bar's line and the side navigation do (D-143)
  const door = useDirectorDoor(settled, now);
  // the closed door she holds is the door's, with its «Снять»; an expired one stays a row to close
  const doorErrand = door.door?.state === "dnd" ? door.hold?.errandId : null;
  useThanksToast(errands.data, meId);

  // the queue: nobody's and hers; somebody else's taken request goes to the colleague's block.
  // The alarm first, then what nobody has answered yet, then what is in her hands — each the oldest first
  const queue = useMemo(() => {
    const rank = (e: Errand) => (e.status === "sent" ? (sceneOf(e, actions) === "security" ? 0 : 1) : 2);
    return rows
      .filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId) && e.id !== doorErrand)
      .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
  }, [rows, meId, actions, doorErrand]);
  const results = resultsOf(rows, meId, now, actions, dismissed);
  // held by the screen, not the list: the first request into an empty queue arrives too
  const fresh = useArrivals(
    queue.map((errand) => errand.id),
    !errands.isLoading,
  );
  const people = secretaries.data ?? [];
  // two secretaries and more (owner Q7): the colleague's work is seen, muted, never touched
  const colleagues = people
    .filter((person) => person.id !== meId)
    .map((person) => ({
      person,
      rows: rows
        .filter((e) => e.status === "accepted" && e.claimed_by === person.id && e.id !== doorErrand)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    .filter((entry) => entry.rows.length > 0);
  const day = dayClosedOf(rows, meId, now, actions);
  const busy = settled && (queue.length > 0 || results.length > 0);

  useShortcuts("Заявки", [
    { keys: ["↑", "↓"], label: "Выбрать заявку" },
    { keys: ["Enter"], label: "Принял / Готово" },
    { keys: ["1", "4"], label: "«Будет через…» — когда заявка у вас" },
    { keys: ["N"], label: "Не могу — причины (1–3)" },
    { keys: ["Q"], label: "Уточнить у директора" },
    { keys: ["1", "2"], label: "После «Готово»: что передать директору" },
    { keys: ["Esc"], label: "«Не нужно» передавать / закрыть панель" },
  ]);

  // the server drew the page without data: the first client frame does too, whatever the side
  // navigation's count put into the cache meanwhile (D-143) — the data lands a frame later
  const loading = !settled || errands.isLoading;
  const failed = settled && errands.isError && !errands.data;

  return (
    <DeskPage>
      <StoikaHead meId={meId} history={history} count={loading ? 0 : queue.length} now={now} settled={settled} />
      {settled ? <AwayBand meId={meId} now={now} /> : null}
      {history ? (
        <ErrandHistory viewer="secretary" meId={meId} openId={openId} onOpen={onOpen} now={now} pointsOn={false} catalogue={actions} />
      ) : (
        /* two columns while the screen's own width allows — the panel takes 440 px of the window */
        <div className="@container">
          <div className="stoika-grid">
            <section className="stoika-column" data-testid="desk-errand-queue" data-busy={busy ? "" : undefined}>
              <DoorCard door={settled ? door.door : null} spans={door.spans} hold={door.hold} pending={!settled || door.pending} now={now} meId={meId} compact={busy} />
              {loading ? (
                <StoikaBone />
              ) : failed ? (
                <LoadFailedHero busy={errands.isFetching} onRetry={() => void errands.refetch()} />
              ) : (
                <QueueList
                  queue={queue}
                  results={results}
                  meId={meId}
                  now={now}
                  catalogue={actions}
                  openId={openId}
                  fresh={fresh}
                  onOpen={onOpen}
                  onDismiss={(id) => setDismissed((was) => new Set(was).add(id))}
                />
              )}
              {(loading ? [] : colleagues).map(({ person, rows: theirs }) => (
                <Colleague key={person.id} id={person.id} name={person.full_name} rows={theirs} now={now} catalogue={actions} onOpen={onOpen} />
              ))}
              {loading || failed ? null : (
                <motion.div layout={still ? false : "position"} className="stoika-today-slot">
                  {busy ? <DayTally day={day} /> : <DayJournal day={day} now={now} catalogue={actions} openId={openId} onOpen={onOpen} />}
                </motion.div>
              )}
            </section>

            <aside className="stoika-side">
              <ReceptionCard visits={visits.data ?? []} now={now} loading={!settled || visits.isLoading} />
            </aside>
          </div>
        </div>
      )}
      <ErrandPanel rows={rows} openId={openId} viewer="secretary" meId={meId} now={now} catalogue={actions} pointsOn={false} />
    </DeskPage>
  );
}
