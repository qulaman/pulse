"use client";

import { History, Radio } from "lucide-react";
import { MotionConfig } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Bone } from "@/components/ui/Skeleton";
import { useErrandLink } from "@/lib/errands/mutations";
import { usePendingErrands } from "@/lib/errands/pending";
import { isActive, useErrandHistory, useSecretaries, useSecretaryActions, type Errand } from "@/lib/errands/queries";
import { medianDoneMinutes, outcomesOf, spanWords } from "@/lib/errands/stats";
import { useNow } from "@/lib/pulse/queries";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { writeParams } from "../tasks/flow";
import type { HeroFact } from "../team/Hero";
import { arrowOf, stepKey, useScreenKeys } from "../team/keys";
import { useCancelErrand } from "./cancel";
import { ErrandHistory } from "./ErrandHistory";
import { PultBand, PultBandBone } from "./Hero";
import { TripBoard } from "./Live";
import { useArrivals } from "./look";
import { asksMe, bandOf, closedToday, isAlarmErrand, isRecent } from "./pult";
import { DoneList } from "./PultRecent";
import { WaitList, waitKey, waitsOf, yesNoOf } from "./PultWait";
import { Keypad } from "./Quick";
import { ErrandStats } from "./Stats";
import { useDeskAsk } from "./useAsk";
import { canCancel, today } from "./words";
import { ErrandPanel, LoadFailedHero, NO_ACTIONS, NO_ERRANDS } from "./Shared";

type View = "now" | "history";

/** A finished request stays on its card this long — green, the track drawn to «Готово» — then leaves for «Только что». */
const LINGER_MS = 1_100;
/** Nothing changed for this long: the live dots stand still (the D-168 rule — a quiet desk does not twitch). */
const QUIET_MS = 3 * 60_000;
/** «Сегодня» shows this many of the day's earlier rows; the rest are in «История». */
const DAY_ROWS = 6;
/** The day's journal is quiet: its rows never arrive, they age into it. */
const NOTHING_NEW: ReadonlySet<string> = new Set();

/**
 * The cards that were on their way and are done now, kept a moment so the eye sees them finish.
 * Worked out while rendering (React's «state from the previous render»), not in an effect: the
 * frame that brings the new rows already holds the card — it never blinks into «Только что» first.
 */
function useLeaving(trips: readonly Errand[], rows: readonly Errand[], ready: boolean): Errand[] {
  const key = trips.map((errand) => errand.id).join(",");
  const [seen, setSeen] = useState<{ key: string; ids: readonly string[] } | null>(null);
  const [leaving, setLeaving] = useState<Errand[]>([]);
  if (ready && seen?.key !== key) {
    const next = key ? key.split(",") : [];
    if (seen) {
      const done = seen.ids
        .filter((id) => !next.includes(id))
        .map((id) => rows.find((row) => row.id === id))
        .filter((row): row is Errand => row?.status === "done");
      if (done.length > 0) setLeaving((list) => [...list.filter((row) => !done.some((one) => one.id === row.id)), ...done]);
    }
    setSeen({ key, ids: next });
  }
  // they all leave together, a moment after the last one finished
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), LINGER_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return leaving;
}

/** True once `key` has stayed the same for `QUIET_MS`. */
function useQuiet(key: string): boolean {
  const [quietKey, setQuietKey] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQuietKey(key), QUIET_MS);
    return () => clearTimeout(timer);
  }, [key]);
  return quietKey === key;
}

/**
 * The director's «Заявки» — «Пульт» (D-175): a remote and an order tracker. «Сейчас»: the band —
 * what the secretary is doing in one sentence; «Ждут вас» — what waits for his word, answered in its
 * card and only there; «В пути» — every request as a tracker card; «Только что» and «Сегодня» — what
 * was closed, with «Спасибо ♥» and «Попросить снова»; on the right a keypad that never moves, the
 * same ask as «Сегодня» (./useAsk.tsx). «История» (`?view=history`): the closed requests by the
 * server and the thirty days. ↑/↓ walk the cards with the panel following, X takes the open request
 * back, Y / N answer a yes-or-no, 1–7 press the keys.
 */
export function DirectorErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const { pointsEnabled } = useDeskScope();
  const params = useSearchParams();
  const view: View = params.get("view") === "history" ? "history" : "now";
  const now = useNow(30_000);
  const history = useErrandHistory(30);
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const secretaries = useSecretaries();
  const link = useErrandLink();
  const cancel = useCancelErrand();
  const asks = useDeskAsk();
  const pending = usePendingErrands((state) => state.pending.length);

  const rows = history.data ?? NO_ERRANDS;
  const actions = catalogue.data ?? NO_ACTIONS;
  const people = secretaries.data ?? [];
  const loading = history.isLoading;
  const failed = history.isError && !history.data;
  const ready = !loading && !failed;

  const active = useMemo(() => rows.filter(isActive), [rows]);
  const alarms = useMemo(() => active.filter((errand) => isAlarmErrand(errand, actions)), [active, actions]);
  const asking = useMemo(() => active.filter((errand) => asksMe(errand, actions)), [active, actions]);
  const trips = useMemo(() => active.filter((errand) => !alarms.includes(errand) && !asking.includes(errand)), [active, alarms, asking]);
  const waits = waitsOf(alarms, asking, awaitingDirector(visits.data ?? []), unreadMessages(visits.data ?? []));
  const leaving = useLeaving(trips, rows, ready);
  const leavingIds = new Set(leaving.map((errand) => errand.id));
  const closed = closedToday(rows, today, now);
  const recent = closed.filter((errand) => isRecent(errand, now) && !leavingIds.has(errand.id));
  const earlier = closed.filter((errand) => !isRecent(errand, now));
  const band = bandOf(people, active, actions, now);
  const live = waits.length + trips.length;

  // what arrived while the screen looks: drops into place (the first read only stands)
  const fresh = useArrivals([...waits.map(waitKey), ...trips.map((errand) => errand.id)], ready);
  // «Только что» on its own: a card that finished here was known on the board, and still arrives in the list
  const freshDone = useArrivals(recent.map((errand) => errand.id), ready);
  // the live dots freeze once nothing has changed for three minutes
  const still = useQuiet([...waits.map(waitKey), ...active.map((errand) => `${errand.id}:${errand.status}`)].join(","));

  const outcomes = outcomesOf(rows);
  const usual = medianDoneMinutes(rows);
  // a desk with no request in thirty days has no facts to tell: no row of zeros
  const facts: HeroFact[] | null =
    band.calm && outcomes.asked > 0
      ? [
          { key: "month", value: outcomes.asked, label: "за 30 дней", href: "/desk/errands?view=history", title: "Все заявки — в «Истории»" },
          { key: "usual", value: usual === null ? 0 : 1, text: spanWords(usual), label: "обычно до «готово»", title: "Медиана «попросил → готово» за 30 дней" },
          { key: "unclaimed", value: outcomes.unclaimed, label: "не взяли", tone: "warn", title: "Просьбы за 30 дней, которые никто не взял" },
        ]
      : null;

  const switchView = (next: View) => writeParams({ view: next === "history" ? "history" : null });
  const yesNo = yesNoOf(waits);

  useScreenKeys((event) => {
    const arrow = arrowOf(event);
    if (arrow) {
      const scope = view === "history" ? '[data-testid="desk-errands-history"] [data-row-key]' : ".pult-main [data-row-key]";
      const keys = [...document.querySelectorAll<HTMLElement>(scope)].map((row) => row.dataset.rowKey ?? "");
      const next = stepKey(keys, openId, arrow === "down");
      if (next) onOpen(next);
      return Boolean(next);
    }
    if (event.code === "KeyX") {
      const open = active.find((errand) => errand.id === openId);
      if (!open || !canCancel(open, meId)) return false;
      cancel(open);
      return true;
    }
    if (yesNo && view === "now" && (event.code === "KeyY" || event.code === "KeyN")) {
      if (!(link.isPending && link.variables?.id === yesNo.id)) link.mutate({ fn: "errand_answer", id: yesNo.id, text: event.code === "KeyY" ? "Да" : "Нет" });
      return true;
    }
    return false;
  });
  useShortcuts("Заявки", [
    { keys: ["↑", "↓"], label: "Соседняя заявка в панели" },
    { keys: ["Y", "N"], label: "Ответить секретарю «Да» / «Нет»" },
    { keys: ["X"], label: "Отменить открытую заявку" },
    { keys: ["Ctrl K"], label: "Попросить строкой: «чай без сахара»" },
  ]);

  return (
    <MotionConfig reducedMotion="user">
      <DeskPage>
        <PageTitle
          title="Заявки"
          actions={
            <SegmentTabs<View>
              aria-label="Вид"
              value={view}
              onChange={switchView}
              items={[
                {
                  value: "now",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Radio size={14} strokeWidth={2.25} aria-hidden />
                      Сейчас
                    </span>
                  ),
                  count: live > 0 ? live : undefined,
                },
                {
                  value: "history",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <History size={14} strokeWidth={2.25} aria-hidden />
                      История
                    </span>
                  ),
                },
              ]}
            />
          }
        />
        {view === "now" ? (
          <div className="pult-frame">
            <div className="pult" data-still={still ? "" : undefined} data-testid="desk-errands-pult">
              <div className="pult-main">
                {loading ? <PultBandBone /> : failed ? <LoadFailedHero busy={history.isFetching} onRetry={() => void history.refetch()} /> : <PultBand band={band} facts={facts} />}
                {/* a failed read says it once, in the band: no section, no zero under it — the visitors still wait */}
                {loading ? null : <WaitList items={waits} now={now} meId={meId} catalogue={actions} openId={openId} fresh={fresh} onOpen={onOpen} onCancel={cancel} />}
                {ready ? (
                  <>
                    {trips.length > 0 || leaving.length > 0 || pending > 0 ? (
                      <section className="pult-section" data-testid="desk-errands-now" aria-label="В пути">
                        <SectionLabel count={trips.length + pending}>В пути</SectionLabel>
                        <TripBoard trips={trips} leaving={leaving} now={now} meId={meId} catalogue={actions} openId={openId} fresh={fresh} onOpen={onOpen} onCancel={cancel} />
                      </section>
                    ) : null}
                    <DoneList title="Только что" rows={recent} now={now} catalogue={actions} pointsOn={pointsEnabled} openId={openId} fresh={freshDone} onOpen={onOpen} onAgain={asks.again} testId="desk-errands-recent" />
                    <DoneList
                      title="Сегодня"
                      rows={earlier.slice(0, DAY_ROWS)}
                      more={earlier.length - Math.min(earlier.length, DAY_ROWS)}
                      quiet
                      now={now}
                      catalogue={actions}
                      pointsOn={pointsEnabled}
                      openId={openId}
                      fresh={NOTHING_NEW}
                      onOpen={onOpen}
                      onAgain={asks.again}
                      onHistory={() => switchView("history")}
                      testId="desk-errands-today"
                    />
                  </>
                ) : loading ? (
                  <TripsBone />
                ) : null}
              </div>
              <div className="pult-side">
                <Keypad asks={asks} alarmLive={alarms.length > 0} />
              </div>
            </div>
          </div>
        ) : (
          <div className="pult-frame">
            <ErrandHistory
              viewer="director"
              meId={meId}
              openId={openId}
              onOpen={onOpen}
              now={now}
              pointsOn={pointsEnabled}
              catalogue={actions}
              // a failed read shows no zeros: the thirty days are not drawn over nothing
              aside={loading ? <StatsBone /> : failed ? null : <ErrandStats rows={rows} now={now} catalogue={actions} several={people.length > 1} />}
            />
          </div>
        )}
        <ErrandPanel rows={rows} openId={openId} viewer="director" meId={meId} now={now} catalogue={actions} pointsOn={pointsEnabled} />
      </DeskPage>
    </MotionConfig>
  );
}

/** «В пути» while the requests load: two cards' height, nothing jumps when they land. */
function TripsBone() {
  return (
    <div className="pult-trips" aria-hidden>
      <Bone h={168} />
      <Bone h={168} />
    </div>
  );
}

/** The thirty days' card while the history loads: its height, nothing jumps when it lands. */
function StatsBone() {
  return (
    <div className="pult-card pult-month" aria-hidden>
      <Bone h={18} w="40%" />
      <div className="grid grid-cols-2 gap-2">
        <Bone h={52} />
        <Bone h={52} />
      </div>
      <Bone h={64} />
      <Bone h={96} />
    </div>
  );
}
