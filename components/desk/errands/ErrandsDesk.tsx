"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { QuickErrands } from "@/components/desk/ui/QuickErrands";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { MessageAsk } from "@/components/visits/MessageAsk";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useErrandActions, useErrandLink, useSetAway } from "@/lib/errands/mutations";
import { STALE_MS } from "@/lib/errands/pending";
import {
  isActive,
  useErrandHistory,
  useErrands,
  useSecretaries,
  useSecretaryActions,
  waitedFor,
  type Errand,
} from "@/lib/errands/queries";
import { absenceLine, atLine, AWAY_SPANS, awayUntil, deskFocus, etaLeftMin, etaLine, isAway, sceneOf, untilLine } from "@/lib/errands/scene";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount, type ErrandTally } from "@/lib/errands/stats";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, reception, unreadMessages } from "@/lib/visits/text";

import { DeskHero, HeroBone, HeroFacts } from "../team/Hero";
import { ErrandCard, ErrandDetails, ThankButton } from "./ErrandCard";
import { ETAS } from "./ErrandLink";
import { STATUS_TONE, STATUS_WORD, canThank, today } from "./words";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];

/** «Кофе» → «кофе» inside a sentence. */
const lower = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** A request in a table cell: the label, the note after it, the time it is needed by. */
function What({ errand, now }: { errand: Errand; now: Date }) {
  return (
    <span className="block truncate" title={[errand.label, errand.note].filter(Boolean).join(" · ")}>
      {errand.label}
      {errand.due_at ? <span style={{ color: "var(--accent)" }}> · {atLine(errand.due_at, now)}</span> : null}
      {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
    </span>
  );
}

function Word({ errand }: { errand: Errand }) {
  const who = shortName(errand.claimed?.full_name ?? "");
  // the secretary asked and waits for the director: the row says so, the panel answers (D-99)
  const asks = Boolean(errand.question && !errand.answer) && (errand.status === "sent" || errand.status === "accepted");
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[asks ? "accent" : STATUS_TONE[errand.status]] }} />
      <span className="truncate">
        {asks ? <span style={{ color: "var(--accent)" }}>спрашивает</span> : STATUS_WORD[errand.status]}
        {who ? <span className="text-muted"> · {who}</span> : null}
      </span>
    </span>
  );
}

/** A click on a row of a desk table: its key, or nothing. */
function rowKeyOf(event: MouseEvent<HTMLElement>): string | null {
  if ((event.target as HTMLElement).closest("button")) return null;
  return (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey ?? null;
}

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
    <section className="card flex flex-col gap-3 p-4" data-testid="desk-presence" data-away={away ? "1" : "0"}>
      <p className="flex items-center gap-2 font-display text-[15px] font-semibold leading-5" style={{ color: away ? "var(--warn)" : undefined }}>
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: away ? "var(--warn)" : "var(--ok)" }} />
        {away && me?.away_until ? `Не на месте ${untilLine(me.away_until)}` : "На месте"}
      </p>
      <div className="flex flex-wrap gap-2">
        {away ? (
          <Button size="sm" onClick={() => setAway.mutate(null)}>
            Я на месте
          </Button>
        ) : null}
        {AWAY_SPANS.map((span) => (
          <Button key={span.label} size="sm" variant="secondary" onClick={() => setAway.mutate(awayUntil(span.min))}>
            {span.label}
          </Button>
        ))}
      </div>
      <p className="text-[12px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
      {others.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-border/60 pt-2 text-[13px] leading-[18px]">
          {others.map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{shortName(person.full_name)}</span>
              <span className="shrink-0" style={{ color: isAway(person, now) ? "var(--warn)" : "var(--text-muted)" }}>
                {isAway(person, now) ? `не на месте ${untilLine(person.away_until as string)}` : "на месте"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type Chosen = { id: string; index: number } | null;

/**
 * The queue from the keyboard (D-154): the first request is chosen; ↑/↓ — another; Enter — its
 * next step («Принял», then «Готово»); 1–4 — «Будет: сейчас / 5 / 15 / 30 мин» once it is hers;
 * N — «Не могу» with its reasons. By the physical key, so a Russian layout works; never while a
 * field, a dialog or a button has the key (a focused button's Enter is the button's).
 */
function useQueueKeys(queue: readonly Errand[], current: Errand | null, meId: string, catalogue: readonly SecretaryAction[], choose: (next: Chosen) => void, decline: (id: string) => void) {
  const transition = useErrandActions();
  const link = useErrandLink();
  const latest = useRef({ queue, current, meId, catalogue, transition, link, choose, decline });
  useLayoutEffect(() => {
    latest.current = { queue, current, meId, catalogue, transition, link, choose, decline };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      const { queue, current, meId, catalogue, transition, link, choose, decline } = latest.current;
      if (!current) return;
      const code = event.code;
      const at = queue.indexOf(current);
      if (code === "ArrowDown" || code === "ArrowUp") {
        event.preventDefault();
        const next = Math.max(0, Math.min(queue.length - 1, at + (code === "ArrowDown" ? 1 : -1)));
        choose({ id: queue[next].id, index: next });
        return;
      }
      const scene = sceneOf(current, catalogue);
      const taken = current.status === "accepted" && current.claimed_by === meId;
      if (code === "Enter" || code === "NumpadEnter") {
        if ((event.target as Element | null)?.closest?.("button, a, [role=button], [role=dialog]")) return;
        if (transition.isPending && transition.variables?.id === current.id) return;
        if (current.status === "sent") {
          event.preventDefault();
          transition.mutate({ id: current.id, to: "accepted" });
        } else if (taken) {
          event.preventDefault();
          transition.mutate({ id: current.id, to: "done" });
        }
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-4])$/.exec(code);
      if (digit && taken && !current.eta_at && scene !== "dnd" && scene !== "security") {
        event.preventDefault();
        if (!(link.isPending && link.variables?.id === current.id)) link.mutate({ fn: "errand_eta", id: current.id, min: ETAS[Number(digit[1]) - 1].min });
        return;
      }
      if (code === "KeyN" && current.status === "sent" && scene !== "security") {
        event.preventDefault();
        decline(current.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The keys that do something for the chosen request — a hint never names a dead key. */
function QueueKeys({ current, meId, catalogue }: { current: Errand; meId: string; catalogue: readonly SecretaryAction[] }) {
  const scene = sceneOf(current, catalogue);
  const taken = current.status === "accepted" && current.claimed_by === meId;
  return (
    <p className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] leading-4 text-muted" data-testid="desk-keys-hint">
      <span>
        <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
      </span>
      {current.status === "sent" ? (
        <span>
          <Kbd>Enter</Kbd> {scene === "security" ? "вызываю охрану" : "принял"}
        </span>
      ) : taken ? (
        <span>
          <Kbd>Enter</Kbd> готово
        </span>
      ) : null}
      {taken && !current.eta_at && scene !== "dnd" && scene !== "security" ? (
        <span>
          <Kbd>1</Kbd>–<Kbd>4</Kbd> будет через
        </span>
      ) : null}
      {current.status === "sent" && scene !== "security" ? (
        <span>
          <Kbd>N</Kbd> не могу
        </span>
      ) : null}
    </p>
  );
}

/**
 * The secretary's desk (tasks/022 B.4, D-154): the hero — how many wait for her and how many are
 * in her hands; the queue — the visitors still at her desk and the live requests, nobody's and
 * her own, worked from the keyboard; her presence and what was closed today on the right.
 */
function SecretaryErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const now = useNow(30_000);
  const errands = useErrands();
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const rows = errands.data ?? NO_ERRANDS;
  const actions = catalogue.data ?? NO_ACTIONS;

  // the queue: nobody's and hers; somebody else's taken request goes out by itself (Realtime).
  // Her move first: the alarm, then what nobody has answered yet, then what is in her hands —
  // each the oldest first
  const queue = useMemo(() => {
    const rank = (e: Errand) => (e.status === "sent" ? (sceneOf(e, actions) === "security" ? 0 : 1) : 2);
    return rows
      .filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId))
      .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
  }, [rows, meId, actions]);
  const closedToday = rows.filter((e) => !isActive(e) && today(e.created_at, now));
  const guests = reception(visits.data ?? []);
  const waiting = queue.filter((e) => e.status === "sent").length;
  const mine = queue.length - waiting;
  const alarm = queue.some((e) => e.status === "sent" && sceneOf(e, actions) === "security");

  // the request in hand from the keyboard: the chosen one, else the one now in its place, else the first
  const [chosen, setChosen] = useState<Chosen>(null);
  const at = chosen ? queue.findIndex((e) => e.id === chosen.id) : -1;
  const current = at >= 0 ? queue[at] : (queue[Math.min(chosen?.index ?? 0, queue.length - 1)] ?? null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  useQueueKeys(queue, current, meId, actions, setChosen, setDeclineFor);
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    document.querySelector(`[data-errand-id="${CSS.escape(currentId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  const tone: Tone | null = alarm ? "danger" : waiting > 0 ? "accent" : mine > 0 ? "ok" : null;
  const closedLine = closedToday.length > 0 ? `закрыто сегодня ${closedToday.length}` : null;
  const guestsLine = guests.length > 0 ? `${guests.length} ${pluralRu(guests.length, ["посетитель", "посетителя", "посетителей"])} в приёмной` : null;

  return (
    <DeskPage>
      <PageTitle title="Заявки" light={errands.isLoading ? null : tone} />
      {errands.isLoading ? (
        <HeroBone />
      ) : (
        <DeskHero
          testId="desk-errands-hero"
          value={waiting > 0 ? waiting : mine > 0 ? mine : undefined}
          tone={tone}
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
        />
      )}
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-6 @min-[860px]:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col gap-2" data-testid="desk-errand-queue">
            <SectionLabel count={errands.isLoading ? undefined : queue.length + guests.length} className="px-1">
              Очередь
            </SectionLabel>
            {guests.length > 0 ? <ReceptionCards visits={visits.data ?? []} now={now} /> : null}
            {errands.isLoading ? (
              <SkeletonGroup grow>
                <Bone h={92} className="rounded-[16px]" />
              </SkeletonGroup>
            ) : queue.length === 0 && guests.length === 0 ? (
              <EmptyState tone="ok" title="Новая просьба встанет сюда сама" hint="С кнопками «Принял» и «Не могу» — и с клавиатуры: Enter принять, N не могу, ↑ ↓ выбор" />
            ) : (
              queue.map((errand) => (
                <ErrandCard
                  key={errand.id}
                  errand={errand}
                  meId={meId}
                  now={now}
                  catalogue={actions}
                  selected={openId === errand.id}
                  chosen={current?.id === errand.id}
                  onOpen={() => {
                    setChosen({ id: errand.id, index: queue.indexOf(errand) });
                    onOpen(errand.id);
                  }}
                  declineOpen={declineFor === errand.id}
                  onDeclineOpen={(open) => setDeclineFor(open ? errand.id : null)}
                />
              ))
            )}
            {current ? <QueueKeys current={current} meId={meId} catalogue={actions} /> : null}
          </section>

          <aside className="flex min-w-0 flex-col gap-6">
            <Presence meId={meId} now={now} />
            <section className="flex flex-col gap-2" data-testid="desk-errands-today">
              <SectionLabel count={closedToday.length} className="px-1">
                Сегодня закрыто
              </SectionLabel>
              {closedToday.length === 0 ? (
                <p className="px-1 text-[13px] leading-[18px] text-muted">Пока ничего.</p>
              ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
                  {closedToday.map((errand) => (
                    <li key={errand.id} className="border-t border-border/50 first:border-t-0">
                      <button
                        type="button"
                        onClick={() => onOpen(errand.id)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] leading-[18px] transition-colors duration-[120ms] hover:bg-surface-2/50 ${openId === errand.id ? "bg-accent/5" : ""}`}
                      >
                        <span className="min-w-0 truncate">{errand.label}</span>
                        <span className="shrink-0 text-muted">
                          {STATUS_WORD[errand.status]} · {humanAqtobe(new Date(errand.created_at), now).replace(/^сегодня /, "")}
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
      <ErrandPanel rows={rows} openId={openId} viewer="secretary" meId={meId} now={now} catalogue={actions} pointsOn={false} />
    </DeskPage>
  );
}

/* ---- the director ------------------------------------------------------------------------ */

type Moment = { tone: Tone | null; title: string; sub: string; answer?: string };

/**
 * What is going on at the secretary's desk, in one line for the director's hero: a question that
 * waits for him first, then visitors, then the request in hand or the one nobody has taken yet,
 * else who is there to ask.
 */
function momentOf(active: readonly Errand[], guests: number, catalogue: readonly SecretaryAction[], secretaries: readonly { full_name: string; away_until?: string | null }[], now: Date): Moment {
  const asking = active.find((e) => e.question && !e.answer);
  if (asking) {
    const who = shortName(asking.claimed?.full_name ?? "") || "Секретарь";
    return { tone: "accent", title: `${who} спрашивает: «${asking.question}»`, sub: `${asking.label} · ответ — в один клик`, answer: asking.id };
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
 * The director's errands (tasks/022 B.4, D-154): the hero — what is going on at the secretary's
 * desk now and the usual requests in one click each; then what waits (visitors, live requests),
 * thirty days in numbers — how fast, by whom, what nobody took — and the closed list with
 * «спасибо».
 */
function DirectorErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const { pointsEnabled } = useDeskScope();
  const now = useNow(30_000);
  const history = useErrandHistory(30);
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const secretaries = useSecretaries();
  const rows = history.data ?? NO_ERRANDS;
  const visitRows = visits.data ?? [];
  const active = rows.filter(isActive).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const closed = rows.filter((e) => !isActive(e));
  const tally = tallyByPerson(rows);
  const unclaimed = unclaimedCount(rows);
  const average = averageDoneMinutes(rows);
  const guests = awaitingDirector(visitRows).length + unreadMessages(visitRows).length;
  const moment = momentOf(active, guests, catalogue.data ?? NO_ACTIONS, secretaries.data ?? [], now);

  const select = (event: MouseEvent<HTMLElement>) => {
    const key = rowKeyOf(event);
    if (key) onOpen(key);
  };

  const liveColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "200px", render: (e) => <Word errand={e} /> },
    { key: "waited", title: "Ждёт", width: "100px", align: "right", render: (e) => <span className="nums">{waitedFor(e, now)}</span> },
  ];
  const historyColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "200px", sort: (a, b) => a.status.localeCompare(b.status), render: (e) => <Word errand={e} /> },
    {
      key: "at",
      title: "Когда",
      width: "150px",
      sort: (a, b) => a.created_at.localeCompare(b.created_at),
      render: (e) => <span className="nums text-muted">{humanAqtobe(new Date(e.created_at), now)}</span>,
    },
    {
      key: "thanks",
      title: "",
      width: "120px",
      align: "right",
      render: (e) =>
        canThank(e, now, pointsEnabled) ? <ThankButton errand={e} /> : e.thanked_at ? <span className="text-[13px] text-muted" title="Спасибо отправлено">♥</span> : null,
    },
  ];
  const tallyColumns: Column<ErrandTally>[] = [
    { key: "name", title: "Секретарь", render: (t) => t.name },
    { key: "taken", title: "Взято", width: "96px", align: "right", sort: (a, b) => a.taken - b.taken, render: (t) => <span className="nums">{t.taken}</span> },
    { key: "done", title: "Готово", width: "96px", align: "right", sort: (a, b) => a.done - b.done, render: (t) => <span className="nums">{t.done}</span> },
    {
      key: "declined",
      title: "Отказ",
      width: "96px",
      align: "right",
      sort: (a, b) => a.declined - b.declined,
      render: (t) => <span className={`nums ${t.declined ? "" : "text-muted/60"}`} style={{ color: t.declined ? "var(--danger)" : undefined }}>{t.declined}</span>,
    },
  ];

  return (
    <DeskPage>
      <PageTitle title="Заявки" light={history.isLoading ? null : moment.tone} />
      {history.isLoading ? (
        <HeroBone />
      ) : (
        <DeskHero
          testId="desk-errands-hero"
          tone={moment.tone}
          title={moment.title}
          sub={moment.sub}
          aside={
            moment.answer ? (
              <Button size="sm" onClick={() => onOpen(moment.answer as string)} data-testid="desk-errands-answer">
                Ответить
              </Button>
            ) : null
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3" data-testid="desk-errands-quick">
            <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Попросить</span>
            <QuickErrands limit={5} />
            {/* the order line's errand matcher (D-79 §9): a short phrase of a catalogue button, no name in it */}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
              или строкой поручения: «чай без сахара» <Kbd>Ctrl K</Kbd>
            </span>
          </div>
        </DeskHero>
      )}

      {active.length > 0 || guests > 0 ? (
        <section className="@container flex flex-col gap-2" data-testid="desk-errands-now">
          <SectionLabel count={active.length + guests} className="px-1">
            Сейчас
          </SectionLabel>
          {guests > 0 ? (
            <div className="grid max-w-[1000px] gap-2 @min-[720px]:grid-cols-2">
              <VisitAsk visits={visitRows} now={now} />
              <MessageAsk visits={visitRows} now={now} />
            </div>
          ) : null}
          {active.length > 0 ? (
            <div onClick={select}>
              <DataGrid aria-label="Заявки сейчас" columns={liveColumns} rows={active} rowKey={(e) => e.id} selectedKey={openId} onSelect={(e) => onOpen(e.id)} empty={null} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3" data-testid="desk-errands-stats">
        <SectionLabel className="px-1">За 30 дней</SectionLabel>
        {history.isLoading ? null : (
          <div className="flex flex-wrap items-start gap-6">
            <HeroFacts
              className="-ml-3"
              facts={[
                { key: "count", value: rows.length, label: pluralRu(rows.length, ["заявка", "заявки", "заявок"]) },
                { key: "average", value: average ?? 0, text: average === null ? "—" : humanMinutes(average), label: "попросил → готово, в среднем" },
                { key: "unclaimed", value: unclaimed, label: "никто не взял", tone: "warn" },
              ]}
            />
            {tally.length > 0 ? (
              <DataGrid aria-label="Кто сколько взял" columns={tallyColumns} rows={tally} rowKey={(t) => t.name} empty={null} className="min-w-[420px] max-w-[560px] flex-1" />
            ) : null}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="desk-errands-history">
        <SectionLabel count={history.isLoading ? undefined : closed.length} className="px-1">
          Закрытые
        </SectionLabel>
        {history.isLoading ? null : (
          <div onClick={select}>
            <DataGrid
              aria-label="Закрытые заявки"
              columns={historyColumns}
              rows={closed}
              rowKey={(e) => e.id}
              selectedKey={openId}
              onSelect={(e) => onOpen(e.id)}
              empty={<EmptyState title="Заявок ещё не было" hint="«Кофе», «Чай», «Не беспокоить» — в один клик сверху" />}
            />
          </div>
        )}
      </section>
      <ErrandPanel rows={rows} openId={openId} viewer="director" meId={meId} now={now} catalogue={catalogue.data ?? NO_ACTIONS} pointsOn={pointsEnabled} />
    </DeskPage>
  );
}

/* ---- the panel --------------------------------------------------------------------------- */

/**
 * `?e=<id>` in the right-hand panel — where the push about a request leads (via /secretary). A
 * request older than the screen's list is looked up in the thirty days.
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
  const router = useRouter();
  const inList = openId ? rows.find((e) => e.id === openId) : undefined;
  const older = useErrandHistory(30, Boolean(openId) && !inList && viewer === "secretary");
  const errand = inList ?? (openId ? older.data?.find((e) => e.id === openId) : undefined);
  const searching = !inList && older.isLoading && viewer === "secretary";
  if (!openId) return null;
  return (
    <InPanel panelKey={`errand:${openId}`} onClose={() => router.replace("/desk/errands", { scroll: false })}>
      {errand ? (
        <ErrandDetails errand={errand} viewer={viewer} meId={meId} now={now} catalogue={catalogue} pointsOn={pointsOn} />
      ) : searching || rows.length === 0 ? (
        <SkeletonGroup>
          <Bone h={24} w="70%" />
          <Bone h={120} className="mt-4" />
        </SkeletonGroup>
      ) : (
        <p className="pr-8 text-[14px] leading-5 text-muted">Заявка не найдена — она старше тридцати дней или её отозвали.</p>
      )}
    </InPanel>
  );
}

/** `/desk/errands` (D-153): the secretary's queue or the director's view, `?e=` in the panel. */
export function ErrandsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { role } = useDeskScope();
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("e");
  const onOpen = (id: string) => router.replace(`/desk/errands?e=${id}`, { scroll: false });
  const meId = me.data?.userId ?? "";
  return role === "secretary" ? (
    <SecretaryErrands meId={meId} openId={openId} onOpen={onOpen} />
  ) : (
    <DirectorErrands meId={meId} openId={openId} onOpen={onOpen} />
  );
}
