"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, CircleHelp, Clock, CloudOff, ConciergeBell, LoaderCircle, Siren } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";

import { useCancelErrand } from "@/components/desk/errands/cancel";
import { SCENE_ICON, SCENE_INK } from "@/components/desk/errands/look";
import { isAlarmErrand, isDoor } from "@/components/desk/errands/pult";
import { ALARM_HOLD_MS, isAlarmAction, isDndAction, useDeskAsk, useHold } from "@/components/desk/errands/useAsk";
import { cancelWord } from "@/components/desk/errands/words";
import { useHeldCodes } from "@/components/desk/today/home/ask";
import { Mark as SheetMark } from "@/components/desk/today/home/look";
import { BlockNote, Quiet, RowsBone } from "@/components/desk/today/home/parts";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { hmAt } from "@/lib/datetime/calendar";
import { asksDirector, GRACE_MS, myErrandsOf } from "@/lib/desk/home";
import { loadStateOf, worstLoad } from "@/lib/desk/tasks";
import { orderFor } from "@/lib/errands/habits";
import { useErrandLink } from "@/lib/errands/mutations";
import { cancelAsked, usePendingErrands, type PendingErrand } from "@/lib/errands/pending";
import { errandKeys, useErrandReceipt, useErrands, useSecretaries, useSecretaryActions, waitedFor, type Errand, type SecretaryPerson } from "@/lib/errands/queries";
import { absenceLine, atLine, etaLeftMin, isAway, isYesNo, sceneOf, sceneOfAction, untilLine, type DeskScene } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import type { Me } from "@/lib/tasks/queries";
import { receiptLine } from "@/lib/tasks/receipts";
import { flyInto } from "@/lib/ui/flyAway";
import { useNow } from "@/lib/useNow";

import { Bar, Card, DayList, Head, INK, LiveDot, Person, Unfold } from "./kit";

/*
 * «Заявки» on the right side of «Сегодня» as a keypad (D-196, after HomeSecretary of D-164): every
 * request of the company's catalogue a key of one size in the order of the director's habits; a
 * press is held five seconds with «Отменить» in the toast (the key shows its window running out);
 * when it goes, the key says «Отправлено» and its copy flies into the new row — the row is in the
 * list before the copy leaves (principle 1a). The rows live in place: «отправляю…» → «ждёт, никто
 * не взял» with the push's receipt (principle 8) → «несёт Сауле · ~3 мин» with the way to the
 * promised time; the secretary's question with «Да / Нет». «Охрана» is a bar of its own, sent by a
 * hold of two seconds; while an alarm is up it says so and cannot go again. «Своими словами» is a
 * field with its send inside. The ask itself is the one of «Заявки» (useDeskAsk).
 */

/** The sign of a request: the scene's icon in its ink (one map with «Заявки», D-174); a request of the company's own keeps its emoji. */
export function ActionSign({ action }: { action: SecretaryAction }) {
  const scene = sceneOfAction(action);
  if (scene === "other" && action.icon) {
    return (
      <span aria-hidden className="self-center text-[13px] leading-none">
        {action.icon}
      </span>
    );
  }
  return <SheetMark icon={SCENE_ICON[scene]} ink={SCENE_INK[scene] ?? "ok"} size={15} />;
}

/** How many of the director's requests stand before «…ещё N». */
const SHOWN = 5;
/** Where the catalogue is set: «Секретарь → Кнопки» (D-197). */
const CATALOGUE_HREF = "/desk/errands?view=buttons";
/** How long a key says «Отправлено» once its request has gone. */
const SENT_FLASH_MS = 1_300;
/** A line older than this when it shows was not asked here just now (kept from a reload): nothing flies. */
const FRESH_MS = 2_000;
/** The longest a landed request keeps its «отправляю…» line while the list brings its row. */
const LANDING_MS = 4_000;
/** The code of a request in the director's own words (freeAction). */
const FREE = "free";
const SWAP = { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] } as const;

const NO_ACTIONS: SecretaryAction[] = [];
const NO_ERRANDS: Errand[] = [];
const NO_PEOPLE: SecretaryPerson[] = [];
const NO_PENDING: readonly PendingErrand[] = [];
/** Scenes the secretary carries to the director: «несёт Сауле»; anything else is «взято · Сауле» (no gender in it). */
const BRINGS: ReadonlySet<DeskScene> = new Set<DeskScene>(["coffee", "tea", "water", "lunch", "print", "courier"]);

const sceneInk = (scene: DeskScene): string =>
  scene === "security" ? INK.pencil : scene === "dnd" ? INK.violet : scene === "coffee" || scene === "tea" ? INK.gold : INK.ok;

/** The scene's glyph, or the emoji of a request of the company's own. */
function Sign({ scene, icon, size }: { scene: DeskScene; icon: string | null | undefined; size: number }) {
  if (scene === "other" && icon) {
    return (
      <span aria-hidden className="leading-none" style={{ fontSize: size }}>
        {icon}
      </span>
    );
  }
  const Glyph = SCENE_ICON[scene];
  return <Glyph size={size} strokeWidth={2.25} aria-hidden />;
}

/** «Сегодня» → «Заявки»: the secretary's keypad and the director's requests on their way. */
export function DayPult({ me, index }: { me: Me; index: number }) {
  const secretaries = useSecretaries();
  const errands = useErrands();
  const now = useNow(30_000);
  const people = secretaries.data ?? NO_PEOPLE;
  const there = people.length > 0;
  const load = loadStateOf(secretaries);
  const mine = useMemo(() => myErrandsOf(errands.data ?? NO_ERRANDS, me.userId), [errands.data, me.userId]);
  // a request of the director's nobody has taken yet: a still dot on the plate's corner until somebody does
  const waiting = there && mine.some((errand) => errand.status === "sent");

  return (
    <Card ink="ok" index={index} testId="home-secretary" className="day-pult">
      {/* the head's name is the way into «Заявки» */}
      <div data-testid="home-secretary-errands">
        <Head icon={ConciergeBell} title="Заявки" href="/desk/errands" corner={waiting ? "state" : null}>
          {there ? <Presence people={people} now={now} /> : null}
        </Head>
      </div>
      <BlockNote state={load} failed="Секретари не загрузились" now={now} onRetry={() => void secretaries.refetch()} />
      {load.kind === "loading" ? (
        <RowsBone rows={3} />
      ) : load.kind === "failed" && !there ? null : !there ? (
        <Quiet testId="home-secretary-none">
          Секретаря в компании нет — просьбы передать некому.{" "}
          <Link href="/desk/team" prefetch className="text-text underline-offset-2 hover:underline">
            Добавить в «Команде»
          </Link>
        </Quiet>
      ) : (
        <Desk mine={mine} now={now} />
      )}
    </Card>
  );
}

/** The secretary's circle with a still dot: green at the desk, orange stepped away. */
function Seat({ person, away }: { person: SecretaryPerson; away: boolean }) {
  return (
    <span className="day-pult-face">
      <Person id={person.id} name={person.full_name} size={20} />
      <LiveDot ink={away ? "warn" : "ok"} mode="state" />
    </span>
  );
}

/** Who is at the desk (D-99), in the head: the circle and «Сауле на месте»; all away — when the first is back, and that the request waits. */
function Presence({ people, now }: { people: readonly SecretaryPerson[]; now: Date }) {
  const absence = absenceLine(people, now);
  if (absence) {
    const back = [...people].sort((a, b) => (a.away_until ?? "").localeCompare(b.away_until ?? ""))[0];
    const at = hmAt(new Date(back.away_until as string));
    return (
      <p className="day-pult-who" title={`${absence} — просьба дождётся`} data-testid="home-secretary-away">
        <Seat person={back} away />
        <span className="day-pult-who-text inline-flex items-center gap-1" style={{ color: INK.warn }}>
          <Clock size={12} strokeWidth={2.25} aria-hidden className="shrink-0" />
          <span className="truncate">
            {people.length === 1 ? `вернётся в ${at}` : `никого нет до ${at}`} · просьба дождётся
          </span>
        </span>
      </p>
    );
  }
  const here = people.filter((person) => !isAway(person, now));
  const away = people.filter((person) => isAway(person, now));
  const names = here.map((person) => shortName(person.full_name)).join(", ");
  const gone = away.map((person) => `${shortName(person.full_name)} ${untilLine(person.away_until as string)}`).join(", ");
  return (
    <p className="day-pult-who" title={[`${names} на месте`, ...away.map((person) => `${shortName(person.full_name)} не на месте ${untilLine(person.away_until as string)}`)].join(" · ")} data-testid="home-secretary-presence">
      <Seat person={here[0]} away={false} />
      <span className="day-pult-who-text day-muted">
        {names} на месте
        {gone ? <span className="day-faint"> · {gone}</span> : null}
      </span>
    </p>
  );
}

/** One line of the list: a request on its way from this computer, or one of the director's live requests. */
type Line = { kind: "pending"; key: string; row: PendingErrand } | { kind: "errand"; key: string; errand: Errand };

const errandLine = (errand: Errand): Line => ({ kind: "errand", key: errand.client_request_id ?? errand.id, errand });

function Desk({ mine, now }: { mine: readonly Errand[]; now: Date }) {
  const client = useQueryClient();
  const catalogue = useSecretaryActions();
  const errands = useErrands();
  const pending = usePendingErrands((state) => state.pending);
  // the ask of the desk, one with the keypad of «Заявки» (D-175): the window, the spans, the hold
  const asks = useDeskAsk();
  const held = useHeldCodes();
  const actions = catalogue.data ?? NO_ACTIONS;
  const all = errands.data ?? NO_ERRANDS;
  // the order of this part of the day, decided once per part (D-106): a key never jumps under the mouse
  const ordered = useMemo(() => orderFor(actions, isAlarmAction), [actions]);
  const plain = ordered.filter((action) => !isAlarmAction(action));
  const alarm = ordered.find(isAlarmAction) ?? null;
  const load = worstLoad([loadStateOf(catalogue), loadStateOf(errands)]);

  const keys = useRef(new Map<string, HTMLElement>());
  const icons = useRef(new Map<string, HTMLElement>());
  const field = useRef<HTMLDivElement>(null);
  const flown = useRef(new Set<string>());

  // what came into the outbox and what left it since the last render
  const [seen, setSeen] = useState(pending);
  const [came, setCame] = useState(NO_PENDING);
  const [landing, setLanding] = useState(NO_PENDING);
  const [flash, setFlash] = useState<{ code: string; n: number } | null>(null);
  if (seen !== pending) {
    setSeen(pending);
    const fresh = pending.filter((row) => !seen.some((one) => one.id === row.id));
    const gone = seen.filter((row) => !pending.some((one) => one.id === row.id));
    setCame(fresh);
    // the window is over and the request is on its way: its key says so (kept without network — it did not go yet)
    const sent = fresh.find((row) => !row.waiting && row.code !== FREE);
    if (sent) setFlash((last) => ({ code: sent.code, n: (last?.n ?? 0) + 1 }));
    // a request that landed refreshes the lists at once: while that read runs, its line stays put, so
    // «отправляю…» turns into its row in place instead of folding and unfolding again
    if (gone.length > 0 && client.isFetching({ queryKey: errandKeys.list() }) > 0) {
      setLanding((list) => [...list.filter((row) => !gone.some((one) => one.id === row.id)), ...gone.map((row) => ({ ...row, waiting: false }))]);
    }
  }

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), SENT_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    if (landing.length === 0) return;
    const timer = window.setTimeout(() => setLanding(NO_PENDING), LANDING_MS);
    return () => clearTimeout(timer);
  }, [landing]);
  // the copy of the key (or of the field) flies into the new row's sign; the row is already there
  useLayoutEffect(() => {
    for (const row of came) {
      if (flown.current.has(row.id)) continue;
      flown.current.add(row.id);
      if (Date.now() - row.at > FRESH_MS) continue;
      const from = row.code === FREE ? field.current : (keys.current.get(row.code) ?? null);
      const icon = icons.current.get(row.id);
      if (!from || !icon) continue;
      flyInto(from, icon, {
        duration: 440,
        lifted: false,
        onLand: () => void icon.animate([{ transform: "scale(0.6)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 320, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" }),
      });
    }
  }, [came]);

  // the key minted at the press is the row's client_request_id: a line on its way and its row are one line
  const asked = useMemo(() => new Set(all.flatMap((errand) => (errand.client_request_id ? [errand.client_request_id] : []))), [all]);
  const shown = mine.slice(0, SHOWN);
  const more = mine.length - shown.length;
  const going = [...landing.filter((row) => !pending.some((one) => one.id === row.id)), ...pending]
    .filter((row) => !asked.has(row.id))
    .sort((a, b) => a.at - b.at);
  // the secretary's questions, what nobody has taken, what is on its way from here, what is in hand:
  // a request that lands becomes the newest of «nobody has taken» — the place its line already stands
  const lines: Line[] = [
    ...shown.filter((errand) => asksDirector(errand)).map(errandLine),
    ...shown.filter((errand) => !asksDirector(errand) && errand.status === "sent").map(errandLine),
    ...going.map((row): Line => ({ kind: "pending", key: row.id, row })),
    ...shown.filter((errand) => !asksDirector(errand) && errand.status !== "sent").map(errandLine),
  ];

  // an alarm up anywhere in the company (as «Заявки» count it), or one on its way from here: «Охрана» waits
  const alarmErrand = all.find((errand) => isAlarmErrand(errand, actions)) ?? null;
  // …and one that has just landed, until the list brings its row: the bar never wakes in between
  const alarmGoing = alarm ? ([...pending, ...landing].find((row) => row.code === alarm.code && !asked.has(row.id)) ?? null) : null;
  const alarmHint = alarmErrand
    ? alarmErrand.status === "accepted"
      ? `взято · ${shortName(alarmErrand.claimed?.full_name ?? "") || "секретарь"}`
      : "ещё никто не взял"
    : alarmGoing?.waiting
      ? "ждёт связи"
      : "отправляю…";
  // the director's door is closed while the secretary holds his «Не беспокоить» and its time is not out
  const door = mine.find((errand) => errand.status === "accepted" && isDoor(errand, actions) && (!errand.until_at || new Date(errand.until_at).getTime() > now.getTime())) ?? null;

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
      <div className="flex flex-col gap-1.5 pb-1 pt-1">
        {catalogue.isPending ? (
          <SkeletonGroup className="day-pad">
            {[0, 1, 2, 3].map((slot) => (
              <Bone key={slot} h={42} />
            ))}
          </SkeletonGroup>
        ) : catalogue.data === undefined ? null : actions.length === 0 ? (
          <Quiet testId="home-secretary-empty">
            Кнопок у секретаря пока нет —{" "}
            <Link href={CATALOGUE_HREF} prefetch className="text-text underline-offset-2 hover:underline">
              задать в «Секретаре»
            </Link>
          </Quiet>
        ) : plain.length > 0 ? (
          <div className="day-pad" role="group" aria-label="Просьбы секретарю" data-testid="home-secretary-catalogue">
            {plain.map((action) => {
              const scene = sceneOfAction(action);
              const dnd = isDndAction(action);
              const state = held.includes(action.code) ? "held" : flash?.code === action.code ? "sent" : dnd && door ? "on" : undefined;
              const usual = dnd ? null : asks.usual(action.code);
              const until = door?.until_at ? untilLine(door.until_at) : null;
              const note =
                state === "held" ? "уйдёт через 5 с" : state === "sent" ? null : state === "on" ? (until ?? "дверь закрыта") : dnd ? "на сколько?" : usual;
              const title =
                state === "held"
                  ? "Уйдёт через 5 с — «Отменить» в подсказке внизу"
                  : state === "on"
                    ? `Дверь закрыта${until ? ` ${until}` : ""} — открыть: «Отменить» в строке ниже · нажмите, чтобы выбрать новый срок`
                    : dnd
                      ? "Выбрать, на сколько"
                      : `Уйдёт через 5 с — успеете отменить${usual ? ` · как обычно: ${usual}` : ""}`;
              return (
                <button
                  key={action.code}
                  ref={(node) => {
                    if (node) keys.current.set(action.code, node);
                    else keys.current.delete(action.code);
                  }}
                  type="button"
                  className="day-key desk-focus"
                  data-state={state}
                  onClick={(event) => asks.press(action, event.currentTarget)}
                  title={title}
                  aria-haspopup={dnd ? "menu" : undefined}
                  data-testid="home-secretary-ask"
                  data-code={action.code}
                >
                  <span className="day-key-icon" style={state === "sent" ? undefined : { color: sceneInk(scene) }}>
                    {state === "sent" ? <Check size={16} strokeWidth={2.5} aria-hidden /> : <Sign scene={scene} icon={action.icon} size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="day-key-word">{state === "sent" ? "Отправлено" : action.label}</span>
                    {note ? <span className="day-key-note">{note}</span> : null}
                  </span>
                  {state === "held" ? (
                    <span aria-hidden className="day-key-window" style={{ "--window": `${GRACE_MS}ms` } as CSSProperties}>
                      <i />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {alarm ? <AlarmBar action={alarm} live={Boolean(alarmErrand || alarmGoing)} hint={alarmHint} onSend={() => asks.alarm(alarm)} /> : null}
        <AskField boxRef={field} onSend={asks.own} />
      </div>
      <DayList>
        {lines.map((line) => (
          <Unfold key={line.key}>
            <PultLine
              line={line}
              actions={actions}
              now={now}
              iconRef={(node) => {
                if (node) icons.current.set(line.key, node);
                else icons.current.delete(line.key);
              }}
            />
          </Unfold>
        ))}
      </DayList>
      {more > 0 ? (
        <Link href="/desk/errands" prefetch className="day-pult-more desk-focus" data-testid="home-secretary-more">
          …ещё {more} — в «Заявках»
        </Link>
      ) : null}
      {asks.menu}
    </>
  );
}

/**
 * «Охрана» (D-99): a bar of its own, sent by a hold of two seconds that fills it like a fuse; a click
 * or a key alone only says how. While an alarm is up it says so and is off — never a second alarm.
 */
function AlarmBar({ action, live, hint, onSend }: { action: SecretaryAction; live: boolean; hint: string; onSend: () => void }) {
  const { holding, handlers } = useHold(onSend, action.label, ALARM_HOLD_MS, live);
  return (
    <button
      type="button"
      className="day-alarm desk-focus"
      {...(live ? {} : handlers)}
      disabled={live}
      title={live ? "Охрана уже вызвана — отменить: «Ложная тревога» в её строке" : "Удержите 2 секунды — уйдёт сразу"}
      aria-label={live ? `${action.label}: уже вызвана` : `${action.label}: удержите две секунды, чтобы отправить`}
      data-holding={holding ? "" : undefined}
      data-gone={live ? "" : undefined}
      style={{ "--hold": `${ALARM_HOLD_MS}ms` } as CSSProperties}
      data-testid="home-secretary-alarm"
    >
      <span aria-hidden className="day-alarm-fill" />
      <span className="day-alarm-siren">
        <Siren size={15} strokeWidth={2.25} aria-hidden />
      </span>
      <span>{live ? "Охрана вызвана" : holding ? "Держите…" : action.label}</span>
      <span className="day-alarm-hint">{live ? hint : "удерживайте 2 с"}</span>
    </button>
  );
}

/** «Своими словами» (D-99): the request typed in the director's words; the send sits in the field and wakes when there are words. */
function AskField({ onSend, boxRef }: { onSend: (words: string) => void; boxRef: Ref<HTMLDivElement> }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  const send = () => {
    const words = text.trim();
    if (!words) return;
    onSend(words);
    setText("");
  };
  return (
    <div ref={boxRef} className="day-ask" data-ready={ready ? "" : undefined}>
      <input
        className="day-ask-input"
        placeholder="Своими словами…"
        title="Например: принеси воду в переговорную — уйдёт через 5 с, успеете отменить"
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
      <button type="button" className="day-ask-send desk-focus" disabled={!ready} onClick={send} aria-label="Попросить" title="Попросить" data-testid="home-secretary-words-send">
        <ArrowUp size={15} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}

/** «Принеси воду в переговорную» asked in words: the label is its first words — the words alone then. */
function wordsOf(label: string, note: string | null | undefined): { head: string; tail: string | null } {
  const words = note && note !== label ? note : null;
  if (words && words.toLowerCase().startsWith(label.toLowerCase())) return { head: words, tail: null };
  return { head: label, tail: words };
}

/**
 * One line: how long it waits in the margin; the scene's sign, what, and where it stands — words
 * that change in place. A line on its way from here says «отправляю…» (or «ждёт связи» with
 * «Отменить»); one of the director's live requests opens in «Заявки», shows who took it and the way
 * to the promised time, the secretary's question with «Да / Нет», «Отменить» on hover (an alarm's
 * «Ложная тревога» always).
 */
function PultLine({ line, actions, now, iconRef }: { line: Line; actions: readonly SecretaryAction[]; now: Date; iconRef: (node: HTMLSpanElement | null) => void }) {
  const cancel = useCancelErrand();
  const link = useErrandLink();
  const errand = line.kind === "errand" ? line.errand : null;
  const row = line.kind === "pending" ? line.row : null;
  const receiptQuery = useErrandReceipt(errand?.id ?? null, errand?.status === "sent");

  const kind = errand ? errand.kind : (row?.code ?? FREE);
  const label = errand ? errand.label : (row?.label ?? "");
  const scene = sceneOf({ kind, label }, actions);
  const icon = row ? row.icon : actions.find((action) => action.code === kind)?.icon;
  const { head, tail } = wordsOf(label, errand ? errand.note : row?.note);
  const dueAt = errand ? errand.due_at : (row?.dueAt ?? null);
  const untilAt = errand?.until_at ?? null;
  const ago = errand ? waitedFor(errand, now) : "сейчас";
  const asks = errand ? asksDirector(errand) : false;
  const who = shortName(errand?.claimed?.full_name ?? "") || "секретарь";
  const busy = Boolean(errand) && link.isPending && link.variables?.id === errand?.id;
  const receipt = errand?.status === "sent" ? receiptLine(receiptQuery.data, now) : null;

  let stateKey: string;
  let state: ReactNode;
  let eta: ReactNode = null;
  if (row) {
    stateKey = row.waiting ? "waiting" : "going";
    state = row.waiting ? (
      <>
        <CloudOff size={12} strokeWidth={2.5} aria-hidden className="shrink-0" style={{ color: INK.warn }} />
        <span className="truncate" style={{ color: INK.warn }}>
          ждёт связи — уйдёт сама
        </span>
      </>
    ) : (
      <>
        <LoaderCircle size={12} strokeWidth={2.5} aria-hidden className="desk-spin day-muted shrink-0" />
        <span className="day-muted">отправляю…</span>
      </>
    );
  } else if (errand && asks) {
    stateKey = "ask";
    state = (
      <>
        <CircleHelp size={12} strokeWidth={2.5} aria-hidden className="shrink-0" style={{ color: INK.violet }} />
        <span className="truncate" style={{ color: INK.violet }} title={`${who} спрашивает: ${errand.question}`}>
          вопрос: {errand.question}
        </span>
      </>
    );
  } else if (errand?.status === "accepted") {
    stateKey = "accepted";
    const left = etaLeftMin(errand, now);
    const late = left !== null && left < -1;
    const doing = scene === "dnd" ? `держит ${who}` : BRINGS.has(scene) ? `несёт ${who}` : `взято · ${who}`;
    state = (
      <>
        {/* in hand is a state, not news: a still dot */}
        <LiveDot ink="ok" mode="state" />
        <span className="truncate" style={{ color: INK.ok }}>
          {doing}
          {left === null ? null : left > 0 ? ` · ~${left} мин` : late ? null : " · вот-вот"}
        </span>
        {late ? <span style={{ color: INK.warn }}>· опаздывает на {-left} мин</span> : null}
      </>
    );
    if (errand.eta_at) {
      const start = new Date(errand.accepted_at ?? errand.created_at).getTime();
      const span = Math.max(60_000, new Date(errand.eta_at).getTime() - start);
      const past = Math.min(span, Math.max(0, now.getTime() - start));
      eta = <Bar value={past} of={span} ink={late ? "warn" : "ok"} className="day-eta" />;
    }
  } else {
    stateKey = "sent";
    state = (
      <>
        <LiveDot ink="sky" mode="news" />
        <span className="day-muted">ждёт, никто не взял</span>
        {/* the receipt of the push while nobody has taken it (principle 8): «не открывал с 9:14», never «не получил» */}
        {receipt ? <span className="truncate" style={{ color: receipt.tone === "warn" ? INK.warn : INK.muted }}>· {receipt.text}</span> : null}
      </>
    );
  }

  const answer = (text: string) => {
    if (errand) link.mutate({ fn: "errand_answer", id: errand.id, text });
  };
  let end: ReactNode = <span />;
  if (row?.waiting) {
    end = (
      <button type="button" className="day-ghost desk-focus" onClick={() => cancelAsked(row.id)}>
        Отменить
      </button>
    );
  } else if (errand && asks && isYesNo(errand.question ?? "")) {
    end = (
      <span className="flex items-center gap-1">
        <button type="button" className="btn-primary day-btn" style={{ height: 26, padding: "0 10px" }} disabled={busy} onClick={() => answer("Да")} data-testid="home-secretary-yes">
          Да
        </button>
        <button type="button" className="btn-secondary day-btn" style={{ height: 26, padding: "0 10px" }} disabled={busy} onClick={() => answer("Нет")} data-testid="home-secretary-no">
          Нет
        </button>
      </span>
    );
  } else if (errand) {
    end = (
      <span className={errand.urgent ? "" : "opacity-0 transition-opacity duration-[120ms] focus-within:opacity-100 group-hover/err:opacity-100"}>
        <button type="button" className="day-ghost desk-focus" style={errand.urgent ? { color: INK.pencil } : undefined} onClick={() => cancel(errand)} data-testid="home-secretary-cancel">
          {cancelWord(errand)}
        </button>
      </span>
    );
  }

  return (
    <div
      className="day-row group/err"
      data-press=""
      data-testid={row ? "home-secretary-pending" : "home-secretary-errand"}
      data-waiting={row ? (row.waiting ? "1" : "0") : undefined}
      data-status={errand?.status}
      data-asks={asks ? "" : undefined}
    >
      {/* one element for the line's life: «отправляю…» becomes its row in place */}
      <Link
        href={errand ? `/desk/errands?e=${encodeURIComponent(errand.id)}` : "/desk/errands"}
        prefetch={false}
        className="col-span-2 grid grid-cols-subgrid items-center desk-focus"
        title={[label, errand ? errand.note : row?.note].filter(Boolean).join(" · ")}
      >
        <span className="day-when">{ago === "только что" ? "сейчас" : ago}</span>
        <span className="flex min-w-0 items-center gap-2.5">
          <span ref={iconRef} className="day-errand-icon" style={{ color: sceneInk(scene) }}>
            <Sign scene={scene} icon={icon} size={15} />
          </span>
          <span className="relative flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] leading-5">
              {errand?.urgent ? <span style={{ color: INK.pencil }}>{head}</span> : head}
              {tail ? <span className="day-muted"> · {tail}</span> : null}
              {dueAt ? <span className="font-medium"> · {atLine(dueAt, now)}</span> : null}
              {untilAt ? <span className="day-muted"> · {untilLine(untilAt)}</span> : null}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={stateKey}
                className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] leading-4"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={SWAP}
              >
                {state}
              </motion.span>
            </AnimatePresence>
            {eta}
          </span>
        </span>
      </Link>
      {end}
    </div>
  );
}
