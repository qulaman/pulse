"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { QuickErrands } from "@/components/desk/ui/QuickErrands";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
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
  useErrandHistory,
  useErrands,
  useSecretaries,
  useSecretaryActions,
  waitedFor,
  type Errand,
  type ErrandStatus,
} from "@/lib/errands/queries";
import { absenceLine, atLine, AWAY_SPANS, awayUntil, deskFocus, etaLeftMin, etaLine, isAway, isYesNo, sceneOf, untilLine } from "@/lib/errands/scene";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount, type ErrandTally } from "@/lib/errands/stats";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, reception, unreadMessages } from "@/lib/visits/text";

import { DeskHero, HeroBone } from "../team/Hero";
import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { ErrandDetails, ThankButton } from "./ErrandCard";
import { KeyCap, QueueList, WordField, resultsOf } from "./Queue";
import { STATUS_TONE, STATUS_WORD, canThank, today } from "./words";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];

/** «Кофе» → «кофе» inside a sentence. */
const lower = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const normalise = (text: string) => text.toLowerCase().replace(/ё/g, "е").trim();

/** A request in a table cell: the label, the note after it, the time it is needed by. */
function What({ errand, now }: { errand: Errand; now: Date }) {
  return (
    <span className="block truncate" title={[errand.label, errand.note, errand.result ? `передано: ${errand.result}` : null].filter(Boolean).join(" · ")}>
      {errand.label}
      {errand.due_at ? <span style={{ color: "var(--accent)" }}> · {atLine(errand.due_at, now)}</span> : null}
      {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
      {errand.result ? <span className="text-muted"> · «{errand.result}»</span> : null}
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
        {errand.decline_reason ? <span className="text-muted"> · {lower(errand.decline_reason)}</span> : null}
      </span>
    </span>
  );
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
    <section className="flex flex-col gap-2" data-testid="desk-presence" data-away={away ? "1" : "0"}>
      <SectionLabel className="px-1">Я</SectionLabel>
      <div className="rounded-[12px] border border-border bg-surface/40">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="flex min-w-0 flex-1 items-center gap-2 font-display text-[15px] font-semibold leading-5" style={{ color: away ? "var(--warn)" : undefined }}>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: away ? "var(--warn)" : "var(--ok)" }} />
            {away && me?.away_until ? `Не на месте ${untilLine(me.away_until)}` : "На месте"}
          </p>
          {away ? (
            <Button size="sm" onClick={() => setAway.mutate(null)}>
              Я на месте
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-2.5">
          <span className="mr-1 text-[12px] leading-4 text-muted">Отойти:</span>
          {AWAY_SPANS.map((span) => (
            <button
              key={span.label}
              type="button"
              onClick={() => setAway.mutate(awayUntil(span.min))}
              className="inline-flex h-7 items-center rounded-[8px] border border-border bg-surface-2/60 px-2 text-[12px] font-semibold leading-4 transition-colors hover:border-muted/50"
            >
              {span.label.replace(/^На /, "")}
            </button>
          ))}
        </div>
        <p className="border-t border-border/60 px-4 py-2 text-[12px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
        {others.length > 0 ? (
          <ul className="flex flex-col gap-1 border-t border-border/60 px-4 py-2 text-[13px] leading-[18px]">
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
      </div>
    </section>
  );
}

/**
 * The secretary's desk (tasks/022 B.4, D-154; wave 3): the hero — how many wait for her and how
 * many are in her hands; the queue — the visitors still at her desk and the live requests,
 * nobody's and her own, as one plane of records worked from the keyboard (QueueList); «Что
 * передать директору?» after «Готово» stays at its top; her presence and what was closed today on
 * the right.
 */
function SecretaryErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
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

  const tone: Tone | null = alarm ? "danger" : waiting > 0 ? "accent" : mine > 0 ? "ok" : null;
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
        <div className="grid items-start gap-6 @min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-w-0 flex-col gap-2" data-testid="desk-errand-queue">
            <SectionLabel count={errands.isLoading ? undefined : queue.length + guests.length} className="px-1">
              Очередь
            </SectionLabel>
            {guests.length > 0 ? <ReceptionCards visits={visits.data ?? []} now={now} /> : null}
            {errands.isLoading ? (
              <SkeletonGroup grow>
                <Bone h={56} className="rounded-[12px]" />
                <Bone h={56} className="mt-px rounded-[12px]" />
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
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px] leading-[18px] transition-colors duration-[120ms] hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${openId === errand.id ? "bg-accent/5" : ""}`}
                      >
                        <span className="min-w-0 truncate">
                          {errand.label}
                          {errand.result ? <span className="text-muted"> · «{errand.result}»</span> : null}
                        </span>
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

/** The secretary's question answered right in the hero: «Да» / «Нет» (Y / N) for a yes-or-no one, or a word. */
function HeroAnswer({ errand, onOpen }: { errand: Errand; onOpen: () => void }) {
  const link = useErrandLink();
  const busy = link.isPending && link.variables?.id === errand.id;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="desk-errands-answer">
      {isYesNo(errand.question ?? "") ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => answer("Да")} data-testid="desk-errands-yes">
            Да
            <KeyCap>Y</KeyCap>
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer("Нет")}>
            Нет
            <KeyCap muted>N</KeyCap>
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

type Show = "all" | Extract<ErrandStatus, "done" | "declined" | "cancelled">;
const NOBODY = "__nobody";

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
      render: (t) => <span className={`nums ${t.declined ? "" : "text-muted/60"}`} style={{ color: t.declined ? "var(--danger)" : undefined }}>{t.declined}</span>,
    },
  ];
  const line = (label: string, value: string, tone?: Tone) => (
    <div className="flex items-baseline justify-between gap-3 border-t border-border/60 px-4 py-2 first:border-t-0">
      <dt className="text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="nums font-display text-[17px] font-semibold leading-6" style={tone ? { color: TONE_VAR[tone] } : value === "0" || value === "—" ? { color: "var(--text-muted)" } : undefined}>
        {value}
      </dd>
    </div>
  );
  return (
    <aside className="flex min-w-0 flex-col gap-2" data-testid="desk-errands-stats">
      <SectionLabel className="px-1">За 30 дней</SectionLabel>
      <dl className="rounded-[12px] border border-border bg-surface/40">
        {line(pluralRu(rows.length, ["Заявка", "Заявки", "Заявок"]), String(rows.length))}
        {line("Попросил → готово, в среднем", average === null ? "—" : humanMinutes(average))}
        {line("Никто не взял", String(unclaimed), unclaimed > 0 ? "warn" : undefined)}
      </dl>
      {tally.length > 0 ? <DataGrid aria-label="Кто сколько взял" columns={tallyColumns} rows={tally} rowKey={(t) => t.name} empty={null} /> : null}
    </aside>
  );
}

/**
 * The director's errands (tasks/022 B.4, D-154; wave 3): the hero — what is going on at the
 * secretary's desk now, the secretary's question answered right there (Y / N or a word), «Напомнить
 * ещё раз» for a request nobody took, and the usual requests in one click each; «Сейчас» — the
 * visitors and the live requests; «История» — thirty days with filters by state, by who and by
 * words, the numbers beside it. ↑/↓ walk the rows with the panel following, F — the search.
 */
function DirectorErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const { pointsEnabled } = useDeskScope();
  const now = useNow(30_000);
  const history = useErrandHistory(30);
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const secretaries = useSecretaries();
  const link = useErrandLink();
  const rows = history.data ?? NO_ERRANDS;
  const visitRows = visits.data ?? [];
  const active = rows.filter(isActive).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const closed = rows.filter((e) => !isActive(e));
  const tally = tallyByPerson(rows);
  const unclaimed = unclaimedCount(rows);
  const average = averageDoneMinutes(rows);
  const guests = awaitingDirector(visitRows).length + unreadMessages(visitRows).length;
  const moment = momentOf(active, guests, catalogue.data ?? NO_ACTIONS, secretaries.data ?? [], now);

  const [show, setShow] = useState<Show>("all");
  const [who, setWho] = useState("");
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const takers = useMemo(() => [...new Set(closed.map((e) => e.claimed?.full_name).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "ru")), [closed]);
  const countOf = (status: Show) => (status === "all" ? closed.length : closed.filter((e) => e.status === status).length);
  const words = normalise(query);
  const shownClosed = closed.filter(
    (e) =>
      (show === "all" || e.status === show) &&
      (!who || (who === NOBODY ? !e.claimed_by : e.claimed?.full_name === who)) &&
      (!words || normalise([e.label, e.note ?? "", e.result ?? "", e.claimed?.full_name ?? "", e.decline_reason ?? ""].join(" ")).includes(words)),
  );
  const narrowed = show !== "all" || Boolean(who) || Boolean(query);

  useScreenKeys((event) => {
    const arrow = arrowOf(event);
    if (arrow) {
      const keys = [...document.querySelectorAll<HTMLElement>('[data-testid="desk-errands-now"] [data-row-key], [data-testid="desk-errands-history"] [data-row-key]')].map((row) => row.dataset.rowKey ?? "");
      const next = stepKey(keys, openId, arrow === "down");
      if (next) onOpen(next);
      return Boolean(next);
    }
    if (event.code === "KeyF") {
      search.current?.focus();
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
    { keys: ["F"], label: "Поиск по истории" },
    { keys: ["Y", "N"], label: "Ответить секретарю «Да» / «Нет»" },
    { keys: ["Ctrl K"], label: "Попросить строкой: «чай без сахара»" },
  ]);

  const liveColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "minmax(160px,220px)", render: (e) => <Word errand={e} /> },
    { key: "waited", title: "Ждёт", width: "100px", align: "right", render: (e) => <span className="nums">{waitedFor(e, now)}</span> },
  ];
  const historyColumns: Column<Errand>[] = [
    { key: "what", title: "Что", sort: (a, b) => a.label.localeCompare(b.label, "ru"), render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "minmax(150px,220px)", sort: (a, b) => a.status.localeCompare(b.status), render: (e) => <Word errand={e} /> },
    {
      key: "at",
      title: "Когда",
      width: "128px",
      sort: (a, b) => a.created_at.localeCompare(b.created_at),
      render: (e) => <span className="nums text-muted">{humanAqtobe(new Date(e.created_at), now)}</span>,
    },
    {
      key: "thanks",
      title: "",
      width: "104px",
      align: "right",
      render: (e) =>
        canThank(e, now, pointsEnabled) ? <ThankButton errand={e} /> : e.thanked_at ? <span className="text-[13px] text-muted" title="Спасибо отправлено">♥</span> : null,
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
            moment.nudge ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={link.isPending && link.variables?.id === moment.nudge.id}
                onClick={() => moment.nudge && link.mutate({ fn: "errand_nudge", id: moment.nudge.id })}
                data-testid="desk-errand-nudge"
              >
                Напомнить ещё раз
              </Button>
            ) : null
          }
        >
          {moment.asking ? <HeroAnswer errand={moment.asking} onOpen={() => moment.asking && onOpen(moment.asking.id)} /> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3" data-testid="desk-errands-quick">
            <span className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Попросить</span>
            <QuickErrands limit={5} />
            {/* the order line's errand matcher (D-79 §9): a short phrase of a catalogue button, no name in it */}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
              или строкой: «чай без сахара» <Kbd>Ctrl K</Kbd>
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
        <div className="grid items-start gap-6 @min-[980px]:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-w-0 flex-col gap-2" data-testid="desk-errands-history">
            <SectionLabel count={history.isLoading ? undefined : closed.length} className="px-1">
              История
            </SectionLabel>
            <Toolbar end={<span className="nums text-[13px] leading-4 text-muted">{history.isLoading ? " " : `${shownClosed.length} из ${closed.length}`}</span>}>
              <SegmentTabs<Show>
                aria-label="Чем закончилась"
                value={show}
                onChange={setShow}
                items={[
                  { value: "all", label: "Все", count: countOf("all") },
                  { value: "done", label: "Готово", count: countOf("done") },
                  { value: "declined", label: "Отказ", count: countOf("declined") },
                  { value: "cancelled", label: "Отменено", count: countOf("cancelled") },
                ]}
              />
              <Select aria-label="Кто" value={who} onChange={(event) => setWho(event.target.value)} className="w-[164px]" data-testid="desk-errands-who">
                <option value="">Все секретари</option>
                {takers.map((name) => (
                  <option key={name} value={name}>
                    {shortName(name)}
                  </option>
                ))}
                <option value={NOBODY}>Никто не взял</option>
              </Select>
              <SearchField ref={search} value={query} onChange={setQuery} placeholder="Что просили  ·  F" width={200} aria-label="Поиск по заявкам" />
            </Toolbar>
            {history.isLoading ? null : (
              <DataGrid
                aria-label="Закрытые заявки"
                columns={historyColumns}
                rows={shownClosed}
                rowKey={(e) => e.id}
                selectedKey={openId}
                onSelect={(e) => onOpen(e.id)}
                empty={
                  narrowed ? (
                    <EmptyState
                      title="Таких заявок не нашлось"
                      hint="Фильтры — над таблицей"
                      action={
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setShow("all");
                            setWho("");
                            setQuery("");
                          }}
                        >
                          Показать все
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState title="Заявок ещё не было" hint="«Кофе», «Чай», «Не беспокоить» — в один клик сверху" />
                  )
                }
              />
            )}
          </section>
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
