"use client";

import { CircleHelp, Clock, ConciergeBell, LoaderCircle, Siren } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";

import { useCancelErrand } from "@/components/desk/errands/cancel";
import { ALARM_HOLD_MS, isAlarmAction, useDeskAsk, useHold } from "@/components/desk/errands/useAsk";
import { cancelWord } from "@/components/desk/errands/words";
import { MiniButton } from "@/components/desk/tasks/RowMoves";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { asksDirector, myErrandsOf } from "@/lib/desk/home";
import { loadStateOf, worstLoad } from "@/lib/desk/tasks";
import { orderFor } from "@/lib/errands/habits";
import { useErrandLink } from "@/lib/errands/mutations";
import { cancelAsked, usePendingErrands, type PendingErrand } from "@/lib/errands/pending";
import { useErrandReceipt, useErrands, useSecretaries, useSecretaryActions, waitedFor, type Errand, type SecretaryPerson } from "@/lib/errands/queries";
import { absenceLine, atLine, etaLeftMin, etaLine, isAway, isYesNo, sceneOfAction, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import type { SecretaryAction } from "@/lib/settings";
import type { Me } from "@/lib/tasks/queries";
import { receiptLine } from "@/lib/tasks/receipts";

import { SCENE_ICON, SCENE_INK } from "@/components/desk/errands/look";

import { INK, Live, Mark, Titled } from "./look";
import { Aside, BlockLink, BlockNote, DAY_ROW_END, Quiet, RowsBone } from "./parts";

/** The sign of a request: the scene's icon in its ink (one map with «Заявки», D-174); a request of the company's own keeps its emoji. */
function ActionSign({ action }: { action: SecretaryAction }) {
  const scene = sceneOfAction(action);
  if (scene === "other" && action.icon) {
    return (
      <span aria-hidden className="self-center text-[13px] leading-none">
        {action.icon}
      </span>
    );
  }
  return <Mark icon={SCENE_ICON[scene]} ink={SCENE_INK[scene] ?? "ok"} size={15} />;
}

/** How many of the director's requests stand before «…ещё N». */
const SHOWN = 5;
/** Where the catalogue is set: «Настройки → Программа → Кнопки секретаря». */
const CATALOGUE_HREF = "/desk/settings?tab=app";

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];
const isAlarm = isAlarmAction;

/**
 * «Секретарь» on the desk's home (D-164): the phone's secretary desk — the company's whole catalogue
 * of requests, «своими словами», the director's own requests with where they stand; a click goes
 * after 5 s with «Отменить». Contract frozen with TodayScreen.
 *
 * The phone's card over the face (`SecretaryPanel`) for a mouse: every button of the catalogue as a
 * word in the order of the director's habits (`orderFor`), the usual note with it; a click is held
 * five seconds with «Отменить» in the toast (./ask.ts) instead of the phone's two-second hold —
 * except «Охрана», which keeps the hold and goes at once (D-99, D-101). «Не беспокоить» asks for
 * how long, and offers the end of the meeting going on. «Своими словами» is the phone's request
 * said into the desk (D-99), typed. Under them — what the director asked and where it stands: who
 * took it, how long it waits, the secretary's question with «Да / Нет», «Отменить».
 */
export function HomeSecretary({ me }: { me: Me }) {
  const secretaries = useSecretaries();
  const errands = useErrands();
  const there = (secretaries.data ?? []).length > 0;
  const now = useNow(30_000);
  const load = loadStateOf(secretaries);
  // a request of the director's nobody has taken yet: the block's tile beats until somebody does
  const waiting = useMemo(() => myErrandsOf(errands.data ?? NO_ERRANDS, me.userId).some((errand) => errand.status === "sent"), [errands.data, me.userId]);

  return (
    <Aside testId="home-secretary">
      <SectionLabel action={<BlockLink href="/desk/errands" testId="home-secretary-errands">Заявки →</BlockLink>}>
        <Titled icon={ConciergeBell} ink="ok" live={there && waiting}>
          Секретарь
        </Titled>
      </SectionLabel>
      <BlockNote state={load} failed="Секретари не загрузились" now={now} onRetry={() => void secretaries.refetch()} />
      {load.kind === "loading" ? (
        <RowsBone rows={3} />
      ) : load.kind === "failed" && !there ? null : !there ? (
        <div className="desk-list">
          <Quiet testId="home-secretary-none">
            Секретаря в компании нет — просьбы передать некому.{" "}
            <Link href="/desk/team" prefetch className="text-text underline-offset-2 hover:underline">
              Добавить в «Команде»
            </Link>
          </Quiet>
        </div>
      ) : (
        <Desk me={me} people={secretaries.data ?? []} now={now} />
      )}
    </Aside>
  );
}

function Desk({ me, people, now }: { me: Me; people: readonly SecretaryPerson[]; now: Date }) {
  const catalogue = useSecretaryActions();
  const errands = useErrands();
  const pending = usePendingErrands((state) => state.pending);
  // the ask of the desk, one with the keypad of «Заявки» (D-175): the window, the spans, the hold
  const asks = useDeskAsk();
  const actions = catalogue.data ?? NO_ACTIONS;
  // the order of this part of the day, decided once per part (D-106): a word never jumps under the mouse
  const ordered = useMemo(() => orderFor(actions, isAlarm), [actions]);
  const mine = useMemo(() => myErrandsOf(errands.data ?? NO_ERRANDS, me.userId), [errands.data, me.userId]);
  const shown = mine.slice(0, SHOWN);
  const more = mine.length - shown.length;
  const load = worstLoad([loadStateOf(catalogue), loadStateOf(errands)]);

  return (
    <>
      <BlockNote
        state={load}
        failed={catalogue.data === undefined ? "Кнопки секретаря не загрузились" : "Заявки не загрузились"}
        now={now}
        onRetry={() => {
          void catalogue.refetch();
          void errands.refetch();
        }}
      />
      <div className="desk-list">
        <Presence people={people} now={now} />
        {catalogue.isPending ? (
          <SkeletonGroup className="flex h-[66px] items-center gap-4">
            <Bone h={14} w="18%" />
            <Bone h={14} w="14%" />
            <Bone h={14} w="16%" />
            <Bone h={14} w="28%" />
          </SkeletonGroup>
        ) : catalogue.data === undefined ? null : actions.length === 0 ? (
          <Quiet testId="home-secretary-empty">
            Кнопок у секретаря пока нет —{" "}
            <Link href={CATALOGUE_HREF} prefetch className="text-text underline-offset-2 hover:underline">
              задать в «Настройках»
            </Link>
          </Quiet>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5" data-testid="home-secretary-catalogue">
            {ordered.map((action) =>
              isAlarm(action) ? (
                // the phone's alarm: at once, «Отменить» in the toast, «Ложная тревога» in its row (D-99)
                <AlarmWord key={action.code} action={action} onSend={() => asks.alarm(action)} />
              ) : (
                <button
                  key={action.code}
                  type="button"
                  onClick={(event) => asks.press(action, event.currentTarget)}
                  title={sceneOfAction(action) === "dnd" ? "Выбрать, на сколько" : `Отправлю через 5 с — успеете отменить${asks.usual(action.code) ? ` · как обычно: ${asks.usual(action.code)}` : ""}`}
                  aria-haspopup={sceneOfAction(action) === "dnd" ? "menu" : undefined}
                  className="desk-word desk-focus inline-flex max-w-full items-baseline gap-1.5 text-[14px] leading-5"
                  data-testid="home-secretary-ask"
                  data-code={action.code}
                >
                  <ActionSign action={action} />
                  <span className="truncate">{action.label}</span>
                  {asks.usual(action.code) ? <span className="truncate text-[12px] text-muted">· {asks.usual(action.code)}</span> : null}
                </button>
              ),
            )}
          </div>
        )}
        <OwnWords onSend={asks.own} />
        {pending.map((row) => (
          <PendingRow key={row.id} row={row} />
        ))}
        {shown.map((errand) => (
          <ErrandRow key={errand.id} errand={errand} now={now} />
        ))}
        {more > 0 ? (
          <Link href="/desk/errands" prefetch className="desk-row flex items-center text-[13px] leading-4 text-muted hover:text-text" data-testid="home-secretary-more">
            …ещё {more} — в «Заявках»
          </Link>
        ) : null}
      </div>
      {asks.menu}
    </>
  );
}

/** Who is at the desk (D-99): the names; all away — when the first is back, and that the request waits. */
function Presence({ people, now }: { people: readonly SecretaryPerson[]; now: Date }) {
  const absence = absenceLine(people, now);
  if (absence) {
    return (
      <p className="flex items-center gap-1.5 py-[7px] text-[12px] leading-4 text-accent" data-testid="home-secretary-away">
        <Clock size={13} strokeWidth={2.25} aria-hidden />
        {absence} — просьба дождётся
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 truncate py-[7px] text-[12px] leading-4 text-muted" data-testid="home-secretary-presence">
      {/* somebody is at the desk: a green dot breathes, as a status online */}
      <Live ink="ok" />
      <span className="truncate">
      {people.map((person, index) => (
        <span key={person.id}>
          {index > 0 ? ", " : ""}
          {shortName(person.full_name)}
          {isAway(person, now) ? ` · не на месте ${untilLine(person.away_until as string)}` : ""}
        </span>
      ))}
      {people.every((person) => !isAway(person, now)) ? " на месте" : ""}
      </span>
    </p>
  );
}

/** «Своими словами» (D-99): the phone's request said into the desk, typed — it goes as the director's words. */
function OwnWords({ onSend }: { onSend: (words: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    const words = text.trim();
    if (!words) return;
    onSend(words);
    setText("");
  };
  return (
    <div className="flex items-center gap-1.5 py-2">
      <input
        className="field h-8 min-w-0 flex-1 px-2.5 text-[13px] leading-5"
        placeholder="Своими словами…"
        title="Например: принеси воду в переговорную"
        aria-label="Просьба секретарю своими словами"
        value={text}
        maxLength={300}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            send();
          }
        }}
        data-testid="home-secretary-words"
      />
      <Button size="sm" variant="secondary" className="!min-h-8" disabled={!text.trim()} onClick={send} data-testid="home-secretary-words-send">
        Попросить
      </Button>
    </div>
  );
}

/**
 * «Охрана» (D-99): the red pencil's word, sent by a hold of two seconds — the line under it fills
 * as the phone's button does; a click or a key alone only says how.
 */
function AlarmWord({ action, onSend }: { action: SecretaryAction; onSend: () => void }) {
  const { holding, handlers } = useHold(onSend, action.label);
  return (
    <button
      type="button"
      {...handlers}
      title="Удержите 2 секунды — уйдёт сразу"
      aria-label={`${action.label}: удержите две секунды, чтобы отправить`}
      className="desk-focus relative inline-flex select-none items-baseline gap-1.5 text-[14px] font-medium leading-5"
      style={{ color: "var(--danger)" }}
      data-testid="home-secretary-alarm"
      data-holding={holding ? "1" : "0"}
    >
      <span className="self-center" style={{ color: INK.pencil }}>
        <Siren size={15} strokeWidth={2.25} aria-hidden />
      </span>
      <span>{action.label}</span>
      {/* the hold fills the line under the word from the left; transform only */}
      <span aria-hidden className="absolute inset-x-0 -bottom-0.5 h-px" style={{ background: "color-mix(in srgb, var(--danger) 35%, transparent)" }} />
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left"
        style={
          {
            background: "var(--danger)",
            transform: holding ? "scaleX(1)" : "scaleX(0)",
            transition: holding ? `transform ${ALARM_HOLD_MS}ms linear` : "transform 150ms var(--ease-out)",
          } as CSSProperties
        }
      />
    </button>
  );
}

/** A request on its way from this computer (D-106): «отправляю…», or kept without network with «Отменить». */
function PendingRow({ row }: { row: PendingErrand }) {
  return (
    <div className={DAY_ROW_END} data-testid="home-secretary-pending" data-waiting={row.waiting ? "1" : "0"}>
      <When className="text-muted">сейчас</When>
      <span className="min-w-0 truncate">
        {row.label}
        {row.waiting ? <span className="text-accent"> · ждёт связи — уйдёт сама</span> : <span className="text-muted"> · отправляю…</span>}
      </span>
      {row.waiting ? (
        <button type="button" className="desk-focus text-[13px] font-semibold leading-4 text-muted hover:text-text" onClick={() => cancelAsked(row.id)}>
          Отменить
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/**
 * One of the director's requests: how long it waits (or when it is promised) in the margin; what,
 * then who took it — or the secretary's question; «Да / Нет» for a yes-or-no one, «Отменить» on
 * hover (an alarm's «Ложная тревога» always). The row opens it in «Заявки».
 */
function ErrandRow({ errand, now }: { errand: Errand; now: Date }) {
  const cancel = useCancelErrand();
  const link = useErrandLink();
  const who = shortName(errand.claimed?.full_name ?? "");
  const asks = asksDirector(errand);
  const eta = etaLine(etaLeftMin(errand, now));
  const busy = link.isPending && link.variables?.id === errand.id;
  const receiptQuery = useErrandReceipt(errand.id, errand.status === "sent");
  const receipt = errand.status === "sent" ? receiptLine(receiptQuery.data, now) : null;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  const state = asks ? (
    // the question is what matters in a narrow column: who asks is in the hint
    <span className="text-accent" title={`${who || "Секретарь"} спрашивает: ${errand.question}`}>
      <span className="mr-1 inline-flex translate-y-[2px]" style={{ color: INK.violet }}>
        <CircleHelp size={12} strokeWidth={2.5} aria-hidden />
      </span>
      вопрос: {errand.question}
    </span>
  ) : errand.status === "accepted" ? (
    <>
      <span style={{ color: "var(--ok)" }}>
        <span className="mr-1 inline-flex translate-y-[2px]">
          <LoaderCircle size={12} strokeWidth={2.5} className="desk-spin" aria-hidden />
        </span>
        в работе{who ? ` · ${who}` : ""}
      </span>
      {eta ? <span className={eta.startsWith("опаздывает") ? "text-accent" : "text-muted"}> · {eta}</span> : null}
    </>
  ) : (
    <>
      <span className="mr-1.5 inline-flex">
        <Live ink="sky" />
      </span>
      <span className="text-muted">ждёт, никто не взял</span>
      {/* the receipt of the push while nobody has taken it (principle 8): «не открывал с 9:14», never «не получил» */}
      {receipt ? <span className={receipt.tone === "warn" ? "text-accent" : "text-muted"}> · {receipt.text}</span> : null}
    </>
  );
  return (
    <div className="desk-row group/row grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-x-3 py-[5px] text-[13px] leading-5" data-testid="home-secretary-errand" data-status={errand.status} data-asks={asks ? "" : undefined}>
      <Link href={`/desk/errands?e=${encodeURIComponent(errand.id)}`} prefetch={false} className="col-span-2 grid grid-cols-subgrid items-baseline" title={[errand.label, errand.note].filter(Boolean).join(" · ")}>
        <When className="text-muted">{waitedFor(errand, now)}</When>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px]">
            {errand.urgent ? <span style={{ color: "var(--danger)" }}>{errand.label}</span> : errand.label}
            {errand.note && errand.note !== errand.label ? <span className="text-muted"> · {errand.note}</span> : null}
            {errand.due_at ? <span className="font-medium"> · {atLine(errand.due_at, now)}</span> : null}
            {errand.until_at ? <span className="text-muted"> · {untilLine(errand.until_at)}</span> : null}
          </span>
          <span className={`text-[12px] leading-4 ${asks ? "line-clamp-2 [overflow-wrap:anywhere]" : "truncate"}`}>{state}</span>
        </span>
      </Link>
      {asks && isYesNo(errand.question ?? "") ? (
        <span className="flex items-center gap-1">
          <MiniButton label="Да" main disabled={busy} onPress={() => answer("Да")} testId="home-secretary-yes" />
          <MiniButton label="Нет" disabled={busy} onPress={() => answer("Нет")} testId="home-secretary-no" />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => cancel(errand)}
          className={`desk-focus text-[13px] font-semibold leading-4 transition-opacity duration-[120ms] ${errand.urgent ? "" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"}`}
          style={{ color: errand.urgent ? "var(--danger)" : "var(--text-muted)" }}
          data-testid="home-secretary-cancel"
        >
          {cancelWord(errand)}
        </button>
      )}
    </div>
  );
}
