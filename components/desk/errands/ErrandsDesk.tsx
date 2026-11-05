"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Num } from "@/components/desk/ui/Num";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { QuickErrands } from "@/components/desk/ui/QuickErrands";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import type { Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { MessageAsk } from "@/components/visits/MessageAsk";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { useErrandLink, useSetAway } from "@/lib/errands/mutations";
import { STALE_MS } from "@/lib/errands/pending";
import {
  isActive,
  useErrand,
  useErrandHistory,
  useErrands,
  useSecretaries,
  useSecretaryActions,
  waitedFor,
  type Errand,
} from "@/lib/errands/queries";
import { absenceLine, AWAY_SPANS, awayUntil, deskFocus, etaLeftMin, etaLine, isAway, isYesNo, sceneOf, untilLine } from "@/lib/errands/scene";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount, type ErrandTally } from "@/lib/errands/stats";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, reception, unreadMessages } from "@/lib/visits/text";

import { writeParams } from "../tasks/flow";
import { DeskHero, HeroBone } from "../team/Hero";
import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { useCancelErrand } from "./cancel";
import { ErrandDetails } from "./ErrandCard";
import { ErrandHistory, ErrandWhat, ErrandWord } from "./ErrandHistory";
import { KeyCap, QueueList, WordField, resultsOf } from "./Queue";
import { STATUS_WORD, canCancel, cancelWord, lower, today } from "./words";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];

/* ---- the secretary ----------------------------------------------------------------------- */

/** «На месте» / «Не на месте до 14:00» (D-99): the secretary's own row, and who of the others is there. */
function Presence({ meId, now }: { meId: string; now: Date }) {
  const secretaries = useSecretaries();
  const setAway = useSetAway(meId);
  const list = secretaries.data ?? [];
  const me = list.find((p) => p.id === meId) ?? null;
  const away = me !== null && isAway(me, now);
  const others = list.filter((p) => p.id !== meId);

  return (
    <section className="flex flex-col gap-1" data-testid="desk-presence" data-away={away ? "1" : "0"}>
      <SectionLabel>Я</SectionLabel>
      <div className="desk-list">
        <div className="flex min-h-[34px] items-center gap-2 py-px">
          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-5">{away && me?.away_until ? `Не на месте ${untilLine(me.away_until)}` : "На месте"}</p>
          {away ? (
            <Button size="sm" variant="secondary" className="desk-move !min-h-8" onClick={() => setAway.mutate(null)}>
              Я на месте
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-[34px] flex-wrap items-baseline gap-x-3 gap-y-1 py-[7px] text-[14px] leading-5">
          <span className="text-muted">Отойти:</span>
          {AWAY_SPANS.map((span) => (
            <button key={span.label} type="button" onClick={() => setAway.mutate(awayUntil(span.min))} className="desk-word desk-focus">
              {span.label.replace(/^На /, "")}
            </button>
          ))}
        </div>
        <p className="py-1.5 text-[12px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
        {others.map((person) => (
          <div key={person.id} className="flex min-h-[34px] items-center justify-between gap-2 text-[14px] leading-5">
            <span className="truncate">{shortName(person.full_name)}</span>
            <span className="shrink-0 text-muted">{isAway(person, now) ? `не на месте ${untilLine(person.away_until as string)}` : "на месте"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The secretary's desk (tasks/022 B.4, D-154; wave 3, D-158): the total — how many wait for her
 * and how many are in her hands; the queue — the visitors still at her desk and the live requests,
 * nobody's and her own, as one ruled list worked from the keyboard (QueueList); «Что передать
 * директору?» after «Готово» stays at its top; her presence and what was closed today on the
 * right. Her own history is a second view, on an explicit word (`?view=history`): the queue stays
 * the screen's main business and the total stays over both, an alarm included.
 */
function SecretaryErrands({ meId, openId, onOpen, history }: { meId: string; openId: string | null; onOpen: (id: string) => void; history: boolean }) {
  const now = useNow(30_000);
  const errands = useErrands();
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const rows = errands.data ?? NO_ERRANDS;
  const actions = catalogue.data ?? NO_ACTIONS;
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  // the queue: nobody's and hers; somebody else's taken request goes out by itself (Realtime).
  // Her move first: the alarm, then what nobody has answered yet, then what is in her hands —
  // each the oldest first
  const queue = useMemo(() => {
    const rank = (e: Errand) => (e.status === "sent" ? (sceneOf(e, actions) === "security" ? 0 : 1) : 2);
    return rows
      .filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId))
      .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
  }, [rows, meId, actions]);
  const results = resultsOf(rows, meId, now, actions, dismissed);
  const closedToday = rows.filter((e) => !isActive(e) && today(e.created_at, now));
  const guests = reception(visits.data ?? []);
  const waiting = queue.filter((e) => e.status === "sent").length;
  const mine = queue.length - waiting;
  const alarm = queue.some((e) => e.status === "sent" && sceneOf(e, actions) === "security");

  const closedLine = closedToday.length > 0 ? `закрыто сегодня ${closedToday.length}` : null;
  const guestsLine = guests.length > 0 ? `${guests.length} ${pluralRu(guests.length, ["посетитель", "посетителя", "посетителей"])} в приёмной` : null;

  useShortcuts("Заявки", [
    { keys: ["↑", "↓"], label: "Выбрать заявку" },
    { keys: ["Enter"], label: "Принял / Готово" },
    { keys: ["1", "4"], label: "«Будет через…» — когда заявка у вас" },
    { keys: ["N"], label: "Не могу — причины (1–3)" },
    { keys: ["Q"], label: "Уточнить у директора" },
    { keys: ["1", "2"], label: "После «Готово»: что передать директору" },
    { keys: ["Esc"], label: "«Не нужно» передавать / закрыть панель" },
  ]);

  return (
    <DeskPage>
      <PageTitle title="Заявки" />
      {errands.isLoading ? (
        <HeroBone />
      ) : (
        <DeskHero
          testId="desk-errands-hero"
          value={waiting > 0 ? waiting : mine > 0 ? mine : undefined}
          tone={alarm ? "danger" : null}
          title={
            alarm
              ? "Директор: вызови охрану!"
              : waiting > 0
                ? `${pluralRu(waiting, ["ждёт", "ждут", "ждут"])} ответа`
                : mine > 0
                  ? "в работе"
                  : "Всё спокойно"
          }
          sub={
            [waiting > 0 && mine > 0 ? `${mine} в работе` : null, waiting === 0 && mine > 0 ? "новых нет" : null, guestsLine, closedLine]
              .filter(Boolean)
              .join(" · ") || "Появится — разбужу"
          }
          aside={
            history ? (
              <Button size="sm" variant="secondary" onClick={() => writeParams({ view: null, from: null, to: null })} data-testid="desk-errands-queue-back">
                К очереди
              </Button>
            ) : null
          }
        />
      )}
      {history ? (
        <ErrandHistory viewer="secretary" meId={meId} openId={openId} onOpen={onOpen} now={now} pointsOn={false} />
      ) : (
        /* two columns while the screen's own width allows — the panel takes 440 px of the window */
        <div className="@container">
          <div className="grid items-start gap-x-10 gap-y-6 @min-[900px]:grid-cols-[minmax(0,1fr)_296px]">
            <section className="flex min-w-0 flex-col gap-1" data-testid="desk-errand-queue">
              <SectionLabel count={errands.isLoading ? undefined : queue.length + guests.length}>Очередь</SectionLabel>
              {guests.length > 0 ? <ReceptionCards visits={visits.data ?? []} now={now} /> : null}
              {errands.isLoading ? (
                <SkeletonGroup grow>
                  <Bone h={34} />
                  <Bone h={34} className="mt-px" />
                </SkeletonGroup>
              ) : queue.length === 0 && results.length === 0 && guests.length === 0 ? (
                <EmptyState tone="ok" title="Новая просьба встанет сюда сама" hint="И с клавиатуры: Enter — принял, N — не могу, Q — уточнить, ↑ ↓ — выбор" />
              ) : queue.length > 0 || results.length > 0 ? (
                <QueueList
                  queue={queue}
                  results={results}
                  meId={meId}
                  now={now}
                  catalogue={actions}
                  openId={openId}
                  onOpen={onOpen}
                  onDismiss={(id) => setDismissed((was) => new Set(was).add(id))}
                />
              ) : null}
            </section>

            <aside className="flex min-w-0 flex-col gap-6">
              <Presence meId={meId} now={now} />
              <section className="flex flex-col gap-1" data-testid="desk-errands-today">
                <SectionLabel
                  count={closedToday.length}
                  action={
                    <button type="button" onClick={() => writeParams({ view: "history" })} className="desk-word desk-focus text-[13px] leading-4" data-testid="desk-errands-all">
                      Вся история
                    </button>
                  }
                >
                  Сегодня закрыто
                </SectionLabel>
                {closedToday.length === 0 ? (
                  <p className="border-t border-text py-[7px] text-[14px] leading-5 text-muted">Пока ничего.</p>
                ) : (
                  <ul className="desk-list">
                    {closedToday.map((errand) => (
                      <li key={errand.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(errand.id)}
                          className={`flex min-h-[34px] w-full items-center justify-between gap-3 text-left text-[14px] leading-5 hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${openId === errand.id ? "bg-accent/5" : ""}`}
                        >
                          <span className="min-w-0 truncate">
                            {errand.label}
                            {errand.result ? <span className="text-muted"> · «{errand.result}»</span> : null}
                          </span>
                          <span className="shrink-0 text-[13px] text-muted">
                            {STATUS_WORD[errand.status]} · <When>{humanAqtobe(new Date(errand.created_at), now).replace(/^сегодня /, "")}</When>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </div>
      )}
      <ErrandPanel rows={rows} openId={openId} viewer="secretary" meId={meId} now={now} catalogue={actions} pointsOn={false} />
    </DeskPage>
  );
}

/* ---- the director ------------------------------------------------------------------------ */

type Moment = { tone: Tone | null; title: string; sub: string; asking?: Errand; nudge?: Errand };

/**
 * What is going on at the secretary's desk, in one line for the director's hero: a question that
 * waits for him first, then visitors, then the request in hand or the one nobody has taken yet,
 * else who is there to ask.
 */
function momentOf(active: readonly Errand[], guests: number, catalogue: readonly SecretaryAction[], secretaries: readonly { full_name: string; away_until?: string | null }[], now: Date): Moment {
  const asking = active.find((e) => e.question && !e.answer);
  if (asking) {
    const who = shortName(asking.claimed?.full_name ?? "") || "Секретарь";
    return { tone: "accent", title: `${who} спрашивает: «${asking.question}»`, sub: `${asking.label} · ${waitedFor(asking, now)}`, asking };
  }
  if (guests > 0) return { tone: "accent", title: "Вас ждут у секретаря", sub: "Посетитель или сообщение — ответ ниже" };
  const focus = deskFocus(active, null, catalogue, now);
  if (focus.errand && focus.phase === "asked") {
    const stale = now.getTime() - new Date(focus.errand.created_at).getTime() >= STALE_MS;
    const taken = active.filter((e) => e.status === "accepted").length;
    return {
      tone: focus.scene === "security" ? "danger" : stale ? "warn" : null,
      title: `Сейчас у секретаря: ${lower(focus.errand.label)}`,
      sub: [`ждёт ${waitedFor(focus.errand, now)}`, "ещё никто не взял", focus.queue > 0 ? `ждут ещё ${focus.queue}` : null, taken > 0 ? `в работе ${taken}` : null]
        .filter(Boolean)
        .join(" · "),
      nudge: stale ? focus.errand : undefined,
    };
  }
  if (focus.errand) {
    const who = shortName(focus.errand.claimed?.full_name ?? "") || "секретарь";
    const eta = etaLine(etaLeftMin(focus.errand, now));
    return {
      tone: "ok",
      title: `Сейчас у секретаря: ${lower(focus.errand.label)}`,
      sub: [`${who} взял${focus.errand.accepted_at ? ` ${humanAqtobe(new Date(focus.errand.accepted_at), now).replace(/^сегодня /, "в ")}` : ""}`, eta]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const absent = absenceLine(secretaries, now);
  if (absent) return { tone: null, title: absent.charAt(0).toUpperCase() + absent.slice(1), sub: "Просьба подождёт — уйдёт, как только кто-то вернётся" };
  return { tone: null, title: "Секретарь свободен", sub: "Попросите в один клик — или строкой поручения сверху" };
}

/**
 * «Отменить» in the row of a live request: quiet until the row is hovered or chosen, as the row
 * buttons of the desk are; a false alarm is not left to be found.
 */
function RowCancel({ errand, onCancel }: { errand: Errand; onCancel: (errand: Errand) => void }) {
  const hidden = errand.urgent ? "" : "opacity-0 [.desk-row:hover_&]:opacity-100 [.desk-row[aria-selected=true]_&]:opacity-100 focus-visible:opacity-100";
  return (
    <button
      type="button"
      className={`text-[13px] font-semibold leading-4 transition-opacity duration-[120ms] ${hidden}`}
      style={{ color: errand.urgent ? "var(--danger)" : "var(--text-muted)" }}
      title="Отменить заявку · клавиша X, когда она открыта"
      onClick={(event) => {
        // the row's click would open the panel for what is leaving the list
        event.stopPropagation();
        onCancel(errand);
      }}
      data-testid="desk-errand-cancel"
    >
      {cancelWord(errand)}
    </button>
  );
}

/** The secretary's question answered right in the hero: «Да» / «Нет» (Y / N) for a yes-or-no one, or a word. */
function HeroAnswer({ errand, onOpen }: { errand: Errand; onOpen: () => void }) {
  const link = useErrandLink();
  const busy = link.isPending && link.variables?.id === errand.id;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  return (
    <div className="desk-fields flex flex-wrap items-center gap-2" data-testid="desk-errands-answer">
      {isYesNo(errand.question ?? "") ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => answer("Да")} data-testid="desk-errands-yes">
            Да
            <KeyCap>Y</KeyCap>
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer("Нет")}>
            Нет
            <KeyCap>N</KeyCap>
          </Button>
        </>
      ) : null}
      <div className="w-[300px]">
        <WordField placeholder="Ответить своими словами…" action="Ответить" busy={busy} onSend={answer} testId="desk-errands-answer-field" />
      </div>
      <Button size="sm" variant="ghost" onClick={onOpen}>
        Подробнее
      </Button>
    </div>
  );
}

/** Thirty days in numbers: how many, how fast, what nobody took, and who did what. */
function Stats({ rows, tally, average, unclaimed }: { rows: readonly Errand[]; tally: ErrandTally[]; average: number | null; unclaimed: number }) {
  const tallyColumns: Column<ErrandTally>[] = [
    { key: "name", title: "Кто", render: (t) => <span className="block truncate">{shortName(t.name)}</span> },
    { key: "taken", title: "Взято", width: "60px", align: "right", sort: (a, b) => a.taken - b.taken, render: (t) => <span className="nums">{t.taken}</span> },
    { key: "done", title: "Готово", width: "68px", align: "right", sort: (a, b) => a.done - b.done, render: (t) => <span className="nums">{t.done}</span> },
    {
      key: "declined",
      title: "Отказ",
      width: "64px",
      align: "right",
      sort: (a, b) => a.declined - b.declined,
      render: (t) => <Num value={t.declined} tone="danger" />,
    },
  ];
  const line = (label: string, value: string) => (
    <div className="flex min-h-[34px] items-baseline justify-between gap-3 py-[7px]">
      <dt className="text-[14px] leading-5 text-muted">{label}</dt>
      <dd className={`nums text-[14px] leading-5 ${value === "0" || value === "—" ? "text-muted" : ""}`}>{value}</dd>
    </div>
  );
  return (
    <aside className="flex min-w-0 flex-col gap-1" data-testid="desk-errands-stats">
      <SectionLabel>За 30 дней</SectionLabel>
      <dl className="desk-list">
        {line(pluralRu(rows.length, ["Заявка", "Заявки", "Заявок"]), String(rows.length))}
        {line("Попросил → готово, в среднем", average === null ? "—" : humanMinutes(average))}
        {line("Никто не взял", String(unclaimed))}
      </dl>
      {tally.length > 0 ? <DataGrid aria-label="Кто сколько взял" className="mt-5" columns={tallyColumns} rows={tally} rowKey={(t) => t.name} empty={null} /> : null}
    </aside>
  );
}

/**
 * The director's errands (tasks/022 B.4, D-154; wave 3): the hero — what is going on at the
 * secretary's desk now, the secretary's question answered right there (Y / N or a word), «Напомнить
 * ещё раз» for a request nobody took, and the usual requests in one click each; «Сейчас» — the
 * visitors and the live requests, «Отменить» in the row of what he asked himself; «История» — all
 * of it by the server (ErrandHistory), the thirty days' numbers beside it. ↑/↓ walk the rows with
 * the panel following, X takes the open request back, F — the search.
 */
function DirectorErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const { pointsEnabled } = useDeskScope();
  const now = useNow(30_000);
  const history = useErrandHistory(30);
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const secretaries = useSecretaries();
  const link = useErrandLink();
  const cancel = useCancelErrand();
  const rows = history.data ?? NO_ERRANDS;
  const visitRows = visits.data ?? [];
  const active = rows.filter(isActive).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const tally = tallyByPerson(rows);
  const unclaimed = unclaimedCount(rows);
  const average = averageDoneMinutes(rows);
  const guests = awaitingDirector(visitRows).length + unreadMessages(visitRows).length;
  const moment = momentOf(active, guests, catalogue.data ?? NO_ACTIONS, secretaries.data ?? [], now);

  useScreenKeys((event) => {
    const arrow = arrowOf(event);
    if (arrow) {
      const keys = [...document.querySelectorAll<HTMLElement>('[data-testid="desk-errands-now"] [data-row-key], [data-testid="desk-errands-history"] [data-row-key]')].map((row) => row.dataset.rowKey ?? "");
      const next = stepKey(keys, openId, arrow === "down");
      if (next) onOpen(next);
      return Boolean(next);
    }
    if (event.code === "KeyX") {
      const open = active.find((e) => e.id === openId);
      if (!open || !canCancel(open, meId)) return false;
      cancel(open);
      return true;
    }
    const asking = moment.asking;
    if (asking && isYesNo(asking.question ?? "") && (event.code === "KeyY" || event.code === "KeyN") && !onControl(event.target)) {
      if (!(link.isPending && link.variables?.id === asking.id)) link.mutate({ fn: "errand_answer", id: asking.id, text: event.code === "KeyY" ? "Да" : "Нет" });
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

  const liveColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <ErrandWhat errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "minmax(160px,220px)", render: (e) => <ErrandWord errand={e} /> },
    { key: "waited", title: "Ждёт", width: "100px", align: "right", render: (e) => <span className="nums">{waitedFor(e, now)}</span> },
    { key: "cancel", title: "", width: "136px", align: "right", render: (e) => (canCancel(e, meId) ? <RowCancel errand={e} onCancel={cancel} /> : null) },
  ];
  return (
    <DeskPage>
      <PageTitle title="Заявки" />
      {history.isLoading ? (
        <HeroBone />
      ) : (
        <DeskHero
          testId="desk-errands-hero"
          tone={moment.tone}
          title={moment.title}
          sub={moment.sub}
          aside={
            moment.nudge ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={link.isPending && link.variables?.id === moment.nudge.id}
                  onClick={() => moment.nudge && link.mutate({ fn: "errand_nudge", id: moment.nudge.id })}
                  data-testid="desk-errand-nudge"
                >
                  Напомнить ещё раз
                </Button>
                {canCancel(moment.nudge, meId) ? (
                  <Button size="sm" variant="ghost" onClick={() => moment.nudge && cancel(moment.nudge)} data-testid="desk-errand-hero-cancel">
                    {cancelWord(moment.nudge)}
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        >
          {moment.asking ? <HeroAnswer errand={moment.asking} onOpen={() => moment.asking && onOpen(moment.asking.id)} /> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="desk-errands-quick">
            <span className="desk-label uppercase">Попросить</span>
            <QuickErrands limit={5} />
            {/* the order line's errand matcher (D-79 §9): a short phrase of a catalogue button, no name in it */}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
              или строкой: «чай без сахара» <Kbd>Ctrl K</Kbd>
            </span>
          </div>
        </DeskHero>
      )}

      {active.length > 0 || guests > 0 ? (
        <section className="@container flex flex-col gap-1" data-testid="desk-errands-now">
          <SectionLabel count={active.length + guests}>Сейчас</SectionLabel>
          {guests > 0 ? (
            <div className="desk-list">
              <VisitAsk visits={visitRows} now={now} />
              <MessageAsk visits={visitRows} now={now} />
            </div>
          ) : null}
          {active.length > 0 ? (
            <DataGrid
              aria-label="Заявки сейчас"
              columns={liveColumns}
              rows={active}
              rowKey={(e) => e.id}
              selectedKey={openId}
              onSelect={(e) => onOpen(e.id)}
              rowTone={(e) => (e.question && !e.answer ? "accent" : null)}
              empty={null}
            />
          ) : null}
        </section>
      ) : null}

      <div className="@container">
        <div className="grid items-start gap-x-10 gap-y-6 @min-[980px]:grid-cols-[minmax(0,1fr)_296px]">
          <ErrandHistory viewer="director" meId={meId} openId={openId} onOpen={onOpen} now={now} pointsOn={pointsEnabled} />
          {history.isLoading ? null : <Stats rows={rows} tally={tally} average={average} unclaimed={unclaimed} />}
        </div>
      </div>
      <ErrandPanel rows={rows} openId={openId} viewer="director" meId={meId} now={now} catalogue={catalogue.data ?? NO_ACTIONS} pointsOn={pointsEnabled} />
    </DeskPage>
  );
}

/* ---- the panel --------------------------------------------------------------------------- */

/**
 * `?e=<id>` in the right-hand panel — where the push about a request leads (via /secretary). A
 * request the screen's list does not hold is read by its id, whatever its age.
 */
function ErrandPanel({
  rows,
  openId,
  viewer,
  meId,
  now,
  catalogue,
  pointsOn,
}: {
  rows: readonly Errand[];
  openId: string | null;
  viewer: "director" | "secretary";
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  pointsOn: boolean;
}) {
  const inList = openId ? rows.find((e) => e.id === openId) : undefined;
  const one = useErrand(openId, !inList);
  const errand = inList ?? one.errand;
  if (!openId) return null;
  return (
    <InPanel panelKey={`errand:${openId}`} onClose={() => writeParams({ e: null })}>
      {errand ? (
        <ErrandDetails errand={errand} viewer={viewer} meId={meId} now={now} catalogue={catalogue} pointsOn={pointsOn} />
      ) : one.isLoading ? (
        <SkeletonGroup>
          <Bone h={24} w="70%" />
          <Bone h={120} className="mt-4" />
        </SkeletonGroup>
      ) : (
        <p className="pr-8 text-[14px] leading-5 text-muted">Заявка не найдена.</p>
      )}
    </InPanel>
  );
}

/** `/desk/errands` (D-153): the secretary's queue or the director's view, `?e=` in the panel, `?from=&to=` over the history. */
export function ErrandsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { role } = useDeskScope();
  const me = useMe();
  const params = useSearchParams();
  const openId = params.get("e");
  // the panel leaves the rest of the address alone: the range and the view stay
  const onOpen = (id: string) => writeParams({ e: id });
  const meId = me.data?.userId ?? "";
  return role === "secretary" ? (
    <SecretaryErrands meId={meId} openId={openId} onOpen={onOpen} history={params.get("view") === "history"} />
  ) : (
    <DirectorErrands meId={meId} openId={openId} onOpen={onOpen} />
  );
}
