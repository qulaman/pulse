"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, type MouseEvent } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { StatTile } from "@/components/desk/ui/StatTile";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { MessageAsk } from "@/components/visits/MessageAsk";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { useSetAway } from "@/lib/errands/mutations";
import {
  isActive,
  useErrandHistory,
  useErrands,
  useSecretaries,
  useSecretaryActions,
  waitedFor,
  type Errand,
} from "@/lib/errands/queries";
import { atLine, AWAY_SPANS, awayUntil, isAway, untilLine } from "@/lib/errands/scene";
import { averageDoneMinutes, humanMinutes, tallyByPerson, unclaimedCount, type ErrandTally } from "@/lib/errands/stats";
import { shortName, useNamesKey } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, reception, unreadMessages } from "@/lib/visits/text";

import { ErrandCard, ErrandDetails, ThankButton } from "./ErrandCard";
import { STATUS_TONE, STATUS_WORD, canThank, today } from "./words";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];


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
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[asks ? "warn" : STATUS_TONE[errand.status]] }} />
      <span className="truncate">
        {asks ? <span style={{ color: "var(--warn)" }}>спрашивает</span> : STATUS_WORD[errand.status]}
        {who ? <span className="text-muted"> · {who}</span> : null}
      </span>
    </span>
  );
}

function Heading({ children, count }: { children: string; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 px-1">
      <span className="eyebrow">{children}</span>
      {count !== undefined ? <span className="nums text-[12px] leading-4 text-muted/70">{count}</span> : null}
    </h2>
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

/**
 * The secretary's desk (tasks/022 B.4): on the left the queue — the visitors still at her desk
 * and the live requests, nobody's and her own; on the right her presence and what was closed
 * today. Everything live: the hooks hold their sockets.
 */
function SecretaryErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const now = useNow(30_000);
  const errands = useErrands();
  const visits = useVisits();
  const catalogue = useSecretaryActions();
  const rows = errands.data ?? NO_ERRANDS;
  const actions = catalogue.data ?? NO_ACTIONS;

  // the queue: nobody's and hers; somebody else's taken request goes out by itself (Realtime)
  const queue = useMemo(
    () =>
      rows
        .filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId))
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows, meId],
  );
  const closedToday = rows.filter((e) => !isActive(e) && today(e.created_at, now));
  const guests = reception(visits.data ?? []);
  const waiting = queue.filter((e) => e.status === "sent").length;
  const mine = queue.length - waiting;

  const state: { text: string; tone?: Tone } | null = errands.isLoading
    ? null
    : waiting > 0
      ? { text: `${waiting} ${pluralRu(waiting, ["ждёт", "ждут", "ждут"])} ответа`, tone: "warn" }
      : mine > 0
        ? { text: `${mine} в работе`, tone: "ok" }
        : { text: "Заявок нет" };

  return (
    <DeskPage>
      <PageTitle title="Заявки" state={state} />
      {/* two columns while the screen's own width allows — the panel takes 440 px of the window */}
      <div className="@container">
        <div className="grid items-start gap-6 @min-[860px]:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-w-0 flex-col gap-2" data-testid="desk-errand-queue">
            <Heading count={errands.isLoading ? undefined : queue.length + guests.length}>Очередь</Heading>
            {guests.length > 0 ? <ReceptionCards visits={visits.data ?? []} now={now} /> : null}
            {errands.isLoading ? (
              <SkeletonGroup grow>
                <Bone h={92} className="rounded-[16px]" />
              </SkeletonGroup>
            ) : queue.length === 0 && guests.length === 0 ? (
              <EmptyState title="Заявок нет. Появится — разбужу." hint="Просьба директора встанет сюда сама — с кнопками «Принял» и «Не могу»" />
            ) : (
              queue.map((errand) => (
                <ErrandCard
                  key={errand.id}
                  errand={errand}
                  meId={meId}
                  now={now}
                  catalogue={actions}
                  selected={openId === errand.id}
                  onOpen={() => onOpen(errand.id)}
                />
              ))
            )}
          </section>

          <aside className="flex min-w-0 flex-col gap-6">
            <Presence meId={meId} now={now} />
            <section className="flex flex-col gap-2" data-testid="desk-errands-today">
              <Heading count={closedToday.length}>Сегодня закрыто</Heading>
              {closedToday.length === 0 ? (
                <p className="px-1 text-[13px] leading-[18px] text-muted">Пока ничего.</p>
              ) : (
                <ul className="card overflow-hidden">
                  {closedToday.map((errand) => (
                    <li key={errand.id} className="border-t border-border/60 first:border-t-0">
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

/**
 * The director's errands (tasks/022 B.4): what is happening now — a visitor or a message
 * waiting for an answer, the requests in work — then thirty days: how fast, by whom, what nobody
 * took, and the list itself with «спасибо». A request is asked in the order line («кофе»), not
 * in a form of this screen.
 */
function DirectorErrands({ meId, openId, onOpen }: { meId: string; openId: string | null; onOpen: (id: string) => void }) {
  const { pointsEnabled } = useDeskScope();
  const now = useNow(30_000);
  const history = useErrandHistory(30);
  const visits = useVisits();
  const rows = history.data ?? NO_ERRANDS;
  const visitRows = visits.data ?? [];
  const active = rows.filter(isActive).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const closed = rows.filter((e) => !isActive(e));
  const tally = tallyByPerson(rows);
  const unclaimed = unclaimedCount(rows);
  const guests = awaitingDirector(visitRows).length + unreadMessages(visitRows).length;

  const state: { text: string; tone?: Tone } | null = history.isLoading
    ? null
    : guests > 0
      ? { text: "Вас ждут у секретаря", tone: "accent" }
      : active.length > 0
        ? { text: `${active.length} ${pluralRu(active.length, ["заявка", "заявки", "заявок"])} сейчас`, tone: "ok" }
        : { text: "Ничего не ждёт ответа" };

  const select = (event: MouseEvent<HTMLElement>) => {
    const key = rowKeyOf(event);
    if (key) onOpen(key);
  };

  const liveColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "180px", render: (e) => <Word errand={e} /> },
    { key: "waited", title: "Ждёт", width: "100px", align: "right", render: (e) => <span className="nums">{waitedFor(e, now)}</span> },
  ];
  const historyColumns: Column<Errand>[] = [
    { key: "what", title: "Что", render: (e) => <What errand={e} now={now} /> },
    { key: "state", title: "Статус", width: "180px", sort: (a, b) => a.status.localeCompare(b.status), render: (e) => <Word errand={e} /> },
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
      render: (t) => <span className="nums" style={{ color: t.declined ? "var(--danger)" : undefined }}>{t.declined}</span>,
    },
  ];

  return (
    <DeskPage>
      <PageTitle title="Заявки" state={state} />
      <p className="-mt-2 flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
        {/* the order line's errand matcher (D-79 §9): a short phrase of a catalogue button, no name in it */}
        Попросить секретаря — в строке поручения сверху: «кофе», «чай без сахара» · <Kbd>Ctrl K</Kbd>
      </p>

      <section className="@container flex flex-col gap-2" data-testid="desk-errands-now">
        <Heading count={history.isLoading ? undefined : active.length + guests}>Сейчас</Heading>
        {guests > 0 ? (
          <div className="grid max-w-[1000px] gap-2 @min-[720px]:grid-cols-2">
            <VisitAsk visits={visitRows} now={now} />
            <MessageAsk visits={visitRows} now={now} />
          </div>
        ) : null}
        {history.isLoading ? (
          <SkeletonGroup grow>
            <Bone h={80} className="rounded-[12px]" />
          </SkeletonGroup>
        ) : active.length === 0 ? (
          guests > 0 ? null : <EmptyState title="Ничего не ждёт ответа" hint="Просьба уходит секретарю пушем; здесь видно, кто взял и сколько она ждёт" />
        ) : (
          <div onClick={select}>
            <DataGrid aria-label="Заявки сейчас" columns={liveColumns} rows={active} rowKey={(e) => e.id} selectedKey={openId} onSelect={(e) => onOpen(e.id)} empty={null} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="desk-errands-stats">
        <Heading>За 30 дней</Heading>
        <div className="flex flex-wrap gap-2">
          <StatTile label="Заявок" value={history.isLoading ? "…" : rows.length} />
          <StatTile label="Попросил → готово, в среднем" value={history.isLoading ? "…" : humanMinutes(averageDoneMinutes(rows))} />
          <StatTile label="Никто не взял" value={history.isLoading ? "…" : unclaimed} tone="warn" />
        </div>
        {tally.length > 0 ? (
          <DataGrid aria-label="Кто сколько взял" columns={tallyColumns} rows={tally} rowKey={(t) => t.name} empty={null} className="max-w-[640px]" />
        ) : null}
      </section>

      <section className="flex flex-col gap-2" data-testid="desk-errands-history">
        <Heading count={history.isLoading ? undefined : closed.length}>Закрытые</Heading>
        {history.isLoading ? null : (
          <div onClick={select}>
            <DataGrid
              aria-label="Закрытые заявки"
              columns={historyColumns}
              rows={closed}
              rowKey={(e) => e.id}
              selectedKey={openId}
              onSelect={(e) => onOpen(e.id)}
              empty={<EmptyState title="Заявок ещё не было" />}
            />
          </div>
        )}
      </section>
      <ErrandPanel rows={rows} openId={openId} viewer="director" meId={meId} now={now} catalogue={NO_ACTIONS} pointsOn={pointsEnabled} />
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
