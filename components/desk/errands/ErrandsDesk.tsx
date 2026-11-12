"use client";

import { ArrowLeft, BellRing, CheckCheck, Clock, CloudOff, History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import type { Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { MessageAsk } from "@/components/visits/MessageAsk";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { Button } from "@/components/ui/Button";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { useErrandLink, useSetAway } from "@/lib/errands/mutations";
import { STALE_MS, usePendingErrands } from "@/lib/errands/pending";
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
import { shortName, useNamesKey } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import { useMe } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, reception, unreadMessages } from "@/lib/visits/text";

import { writeParams } from "../tasks/flow";
import { HeroBone } from "../team/Hero";
import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { useCancelErrand } from "./cancel";
import { ErrandDetails } from "./ErrandCard";
import { ErrandHistory } from "./ErrandHistory";
import { DeskFaces, ErrandsHero } from "./Hero";
import { LiveBoard } from "./Live";
import { AlarmGlyph, ErrandTile, PersonFace, useArrivals } from "./look";
import { QuickAsk } from "./Quick";
import { KeyCap, QueueList, WordField, resultsOf } from "./Queue";
import { ErrandStats } from "./Stats";
import { STATUS_WORD, canCancel, cancelWord, lower, today } from "./words";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];

/* ---- the secretary ----------------------------------------------------------------------- */

/**
 * «На месте» / «Не на месте до 14:00» (D-99) as a card: her own circle ringed green while she is
 * there, dimmed with a dashed ring while away; «Отойти» in four chips; who of the others is there.
 */
function Presence({ meId, now }: { meId: string; now: Date }) {
  const secretaries = useSecretaries();
  const setAway = useSetAway(meId);
  const list = secretaries.data ?? [];
  const me = list.find((p) => p.id === meId) ?? null;
  const away = me !== null && isAway(me, now);
  const others = list.filter((p) => p.id !== meId);

  return (
    <section className="errands-card flex flex-col gap-3" data-testid="desk-presence" data-away={away ? "1" : "0"}>
      <div className="flex items-center gap-3">
        <span className="relative inline-flex">
          <PersonFace id={meId} name={me?.full_name ?? ""} size={40} ring={away ? null : "ok"} away={away} />
          {away ? null : <span aria-hidden className="errands-presence" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-5">{away && me?.away_until ? `Не на месте ${untilLine(me.away_until)}` : "На месте"}</p>
          <p className="text-[12px] leading-4 text-muted">{away ? "просьбы уходят тем, кто на месте" : "просьбы директора приходят вам"}</p>
        </div>
        {away ? (
          <Button size="sm" variant="secondary" className="desk-move !min-h-8" onClick={() => setAway.mutate(null)}>
            Я на месте
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-5">
        <span className="mr-0.5 inline-flex items-center gap-1 text-muted">
          <Clock size={13} strokeWidth={2.25} aria-hidden />
          Отойти
        </span>
        {AWAY_SPANS.map((span) => (
          <button key={span.label} type="button" onClick={() => setAway.mutate(awayUntil(span.min))} className="desk-word desk-focus">
            {span.label.replace(/^На /, "")}
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
      {others.length > 0 ? (
        <ul className="errands-card-rows">
          {others.map((person) => {
            const gone = isAway(person, now);
            return (
              <li key={person.id} className="flex min-h-[36px] items-center gap-2.5 text-[13px] leading-[18px]">
                <PersonFace id={person.id} name={person.full_name} size={24} ring={gone ? null : "ok"} away={gone} />
                <span className="min-w-0 flex-1 truncate font-medium">{shortName(person.full_name)}</span>
                <span className="shrink-0 text-muted">{gone ? `не на месте ${untilLine(person.away_until as string)}` : "на месте"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** What she closed today: the request's icon, what was passed back, how it ended, when. */
function ClosedToday({ rows, now, catalogue, openId, onOpen }: { rows: readonly Errand[]; now: Date; catalogue: readonly SecretaryAction[]; openId: string | null; onOpen: (id: string) => void }) {
  return (
    <section className="errands-card flex flex-col gap-2" data-testid="desk-errands-today">
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="desk-label text-[13px] font-semibold leading-[18px]">Сегодня закрыто</h2>
        {rows.length > 0 ? <span className="nums text-[12px] leading-4 text-muted">{rows.length}</span> : null}
        <button type="button" onClick={() => writeParams({ view: "history" })} className="desk-word desk-focus ml-auto inline-flex items-center gap-1 text-[12px] leading-4" data-testid="desk-errands-all">
          <History size={13} strokeWidth={2.25} aria-hidden />
          Вся история
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-1 text-[13px] leading-5 text-muted">Пока ничего.</p>
      ) : (
        <ul className="errands-card-rows">
          {rows.map((errand) => (
            <li key={errand.id}>
              <button
                type="button"
                onClick={() => onOpen(errand.id)}
                aria-current={openId === errand.id ? "true" : undefined}
                className="errands-closed desk-focus"
                data-status={errand.status}
              >
                <ErrandTile errand={errand} catalogue={catalogue} size={24} muted={errand.status !== "done"} />
                <span className="min-w-0 flex-1 truncate">
                  {errand.label}
                  {errand.result ? <span className="text-muted"> · «{errand.result}»</span> : null}
                </span>
                <span className="errands-closed-word">{STATUS_WORD[errand.status]}</span>
                <When className="nums shrink-0 text-[12px] text-muted">{humanAqtobe(new Date(errand.done_at ?? errand.created_at), now).replace(/^сегодня /, "")}</When>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The requests did not come: the total says so in words, never «всё спокойно» over nothing. */
function LoadFailedHero({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <ErrandsHero
      tone="warn"
      lead={
        <span className="errands-figure-tile" data-tone="warn">
          <CloudOff size={24} strokeWidth={2.25} aria-hidden />
        </span>
      }
      title="Заявки не загрузились"
      sub="Проверьте связь — экран обновится сам, как только она будет"
      aside={
        <Button size="sm" variant="secondary" loading={busy} onClick={onRetry} data-testid="desk-errands-retry">
          Повторить
        </Button>
      }
    />
  );
}

/** The secretary's total: how many wait for her as a figure, a tick when it is calm, the siren at an alarm. */
function QueueFigure({ alarm, value }: { alarm: boolean; value: number }) {
  if (alarm) {
    return (
      <span className="errands-figure-tile" data-tone="danger">
        <AlarmGlyph size={24} />
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className="errands-figure-tile" data-tone="ok">
        <CheckCheck size={24} strokeWidth={2.25} aria-hidden />
      </span>
    );
  }
  return (
    <span className="errands-figure-tile" data-tone="wait">
      <RollingNumber value={value} className="nums desk-figure text-[28px] leading-none" />
    </span>
  );
}

/**
 * The secretary's desk (tasks/022 B.4, D-154; wave 3, D-158; D-174): the total — how many wait for
 * her and how many are in her hands, the alarm in the red pencil; the queue — the visitors still at
 * her desk and the live requests, nobody's and her own, as a board of cards worked from the keyboard
 * (QueueList); «Что передать директору?» after «Готово» stays at its top; her presence and what was
 * closed today on the right. Her own history is a second view, on an explicit word
 * (`?view=history`): the queue stays the screen's main business and the total stays over both.
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
  // held by the screen, not the list: the first request into an empty queue arrives too
  const fresh = useArrivals(
    queue.map((errand) => errand.id),
    !errands.isLoading,
  );
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
      ) : errands.isError && !errands.data ? (
        <LoadFailedHero busy={errands.isFetching} onRetry={() => void errands.refetch()} />
      ) : (
        <ErrandsHero
          lead={<QueueFigure alarm={alarm} value={waiting > 0 ? waiting : mine} />}
          tone={alarm ? "danger" : null}
          title={
            alarm
              ? "Директор: вызови охрану!"
              : waiting > 0
                ? `${pluralRu(waiting, ["ждёт", "ждут", "ждут"])} ответа`
                : mine > 0
                  ? `${pluralRu(mine, ["заявка", "заявки", "заявок"])} в работе`
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
                <ArrowLeft size={14} strokeWidth={2.25} aria-hidden className="mr-1.5" />К очереди
              </Button>
            ) : null
          }
        />
      )}
      {history ? (
        <ErrandHistory viewer="secretary" meId={meId} openId={openId} onOpen={onOpen} now={now} pointsOn={false} catalogue={actions} />
      ) : (
        /* two columns while the screen's own width allows — the panel takes 440 px of the window */
        <div className="@container">
          <div className="grid items-start gap-x-6 gap-y-6 @min-[900px]:grid-cols-[minmax(0,1fr)_312px]">
            <section className="flex min-w-0 flex-col gap-2" data-testid="desk-errand-queue">
              <SectionLabel count={errands.isLoading ? undefined : queue.length + guests.length}>Очередь</SectionLabel>
              {guests.length > 0 ? (
                <div className="errands-reception">
                  <ReceptionCards visits={visits.data ?? []} now={now} />
                </div>
              ) : null}
              {errands.isLoading ? (
                <SkeletonGroup grow className="errands-card flex flex-col gap-px">
                  <Bone h={58} />
                  <Bone h={58} />
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
                  fresh={fresh}
                  onOpen={onOpen}
                  onDismiss={(id) => setDismissed((was) => new Set(was).add(id))}
                />
              ) : null}
            </section>

            <aside className="flex min-w-0 flex-col gap-4">
              <Presence meId={meId} now={now} />
              <ClosedToday rows={closedToday} now={now} catalogue={actions} openId={openId} onOpen={onOpen} />
            </aside>
          </div>
        </div>
      )}
      <ErrandPanel rows={rows} openId={openId} viewer="secretary" meId={meId} now={now} catalogue={actions} pointsOn={false} />
    </DeskPage>
  );
}

/* ---- the director ------------------------------------------------------------------------ */

type Moment = { tone: Tone | null; title: string; sub: string; asking?: Errand; nudge?: Errand; busyId?: string | null };

/**
 * What is going on at the secretary's desk, in one line for the director's hero: a question that
 * waits for him first, then visitors, then the request in hand or the one nobody has taken yet,
 * else who is there to ask.
 */
function momentOf(active: readonly Errand[], guests: number, catalogue: readonly SecretaryAction[], secretaries: readonly { full_name: string; away_until?: string | null }[], now: Date): Moment {
  const asking = active.find((e) => e.question && !e.answer);
  if (asking) {
    const who = shortName(asking.claimed?.full_name ?? "") || "Секретарь";
    return { tone: "accent", title: `${who} спрашивает: «${asking.question}»`, sub: `${asking.label} · ${waitedFor(asking, now)}`, asking, busyId: asking.claimed_by };
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
    const who = shortName(focus.errand.claimed?.full_name ?? "") || "Секретарь";
    const eta = etaLine(etaLeftMin(focus.errand, now));
    return {
      tone: "ok",
      title: `Сейчас у секретаря: ${lower(focus.errand.label)}`,
      // who has it and since when, no guessed gender (docs/DESIGN.md): «Марат · взято в 17:04»
      sub: [who, focus.errand.accepted_at ? `взято ${humanAqtobe(new Date(focus.errand.accepted_at), now).replace(/^сегодня /, "в ")}` : null, eta]
        .filter(Boolean)
        .join(" · "),
      busyId: focus.errand.claimed_by,
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
  const actions = catalogue.data ?? NO_ACTIONS;
  const pending = usePendingErrands((state) => state.pending.length);
  const guests = awaitingDirector(visitRows).length + unreadMessages(visitRows).length;
  const moment = momentOf(active, guests, actions, secretaries.data ?? [], now);
  // held by the screen, not the board: the first request onto an empty board arrives too
  const fresh = useArrivals(
    active.map((errand) => errand.id),
    !history.isLoading,
  );

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

  return (
    <DeskPage>
      <PageTitle title="Заявки" />
      {history.isLoading ? (
        <HeroBone />
      ) : history.isError && !history.data ? (
        <LoadFailedHero busy={history.isFetching} onRetry={() => void history.refetch()} />
      ) : (
        <ErrandsHero
          lead={<DeskFaces people={secretaries.data ?? []} busyId={moment.busyId ?? null} now={now} />}
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
                  <BellRing size={14} strokeWidth={2.25} aria-hidden className="mr-1.5" />
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
          <div className="errands-hero-ask flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="desk-errands-quick">
            <span className="text-[13px] font-medium leading-[18px] text-muted">Попросить</span>
            <QuickAsk limit={6} />
            {/* the order line's errand matcher (D-79 §9): a short phrase of a catalogue button, no name in it */}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
              или строкой: «чай без сахара» <Kbd>Ctrl K</Kbd>
            </span>
          </div>
        </ErrandsHero>
      )}

      {active.length > 0 || guests > 0 || pending > 0 ? (
        <section className="@container flex flex-col gap-2" data-testid="desk-errands-now">
          <SectionLabel count={active.length + guests}>Сейчас</SectionLabel>
          {guests > 0 ? (
            <div className="errands-guests">
              <VisitAsk visits={visitRows} now={now} />
              <MessageAsk visits={visitRows} now={now} />
            </div>
          ) : null}
          <LiveBoard active={active} meId={meId} now={now} catalogue={actions} openId={openId} fresh={fresh} onOpen={onOpen} onCancel={cancel} />
        </section>
      ) : null}

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-6 @min-[980px]:grid-cols-[minmax(0,1fr)_312px]">
          <ErrandHistory viewer="director" meId={meId} openId={openId} onOpen={onOpen} now={now} pointsOn={pointsEnabled} catalogue={actions} />
          {/* a failed read shows no zeros: the hero above says it in words */}
          {history.isLoading ? <StatsBone /> : history.isError && !history.data ? null : <ErrandStats rows={rows} now={now} catalogue={actions} />}
        </div>
      </div>
      <ErrandPanel rows={rows} openId={openId} viewer="director" meId={meId} now={now} catalogue={actions} pointsOn={pointsEnabled} />
    </DeskPage>
  );
}

/** The thirty days' card while the history loads: its height, nothing jumps when it lands. */
function StatsBone() {
  return (
    <div className="errands-card flex flex-col gap-4" aria-hidden>
      <Bone h={18} w="40%" />
      <div className="grid grid-cols-3 gap-2">
        <Bone h={52} />
        <Bone h={52} />
        <Bone h={52} />
      </div>
      <Bone h={64} />
      <Bone h={96} />
    </div>
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
