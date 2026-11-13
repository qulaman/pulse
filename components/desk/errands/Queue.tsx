"use client";

import { Check, CheckCheck, Clock3, MessageCircleQuestion, PenLine, Siren, Timer } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Menu } from "@/components/desk/ui/Menu";
import { Popover } from "@/components/desk/ui/Popover";
import { When } from "@/components/desk/ui/When";
import { Button } from "@/components/ui/Button";
import { DECLINE_REASONS, useErrandActions, useErrandLink } from "@/lib/errands/mutations";
import { useSecretaries, useSecretarySetup, waitedFor, type Errand } from "@/lib/errands/queries";
import { wallHm } from "@/lib/desk/busy";
import { atLine, etaLeftMin, etaLine, QUESTIONS, RESULTS, sceneOf, untilLine, urgencyOf } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { ETAS } from "./ErrandLink";
import { PersonFace, SceneTile, useArrivals } from "./look";
import { flyToToday } from "./StoikaDay";
import { useBackOnTake } from "./StoikaHead";

/** How long a request done by her keeps asking «Что передать директору?» at the top of the queue. */
const RESULT_FOR_MS = 15 * 60_000;

/** The key of a button, inside it: a quiet letter of the mono voice, no plate (D-158). */
export function KeyCap({ children }: { children: string }) {
  return (
    <span aria-hidden className="nums ml-1.5 text-[11px] leading-none opacity-70">
      {children}
    </span>
  );
}

/** A digit key, by the physical key: 1–9 from the row or the numpad; null — another key. */
function digitOf(event: KeyboardEvent): number | null {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  return match ? Number(match[1]) : null;
}

/** While a little list is open over the queue, its digits pick — before the queue's own 1–4 hear them. */
function useDigits(open: boolean, count: number, pick: (index: number) => void) {
  const latest = useRef(pick);
  useEffect(() => {
    latest.current = pick;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const digit = digitOf(event);
      if (!digit || digit > count) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current(digit - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, count]);
}

/**
 * «Не могу» on the desk (D-79, wave 3): the three reasons as a menu under the button, not a
 * phone's sheet of wide buttons — 1–3 pick at once, ↑/↓ and Enter too, Esc closes.
 */
export function ReasonMenu({ anchor, onClose, onPick }: { anchor: HTMLElement | null; onClose: () => void; onPick: (reason: string) => void }) {
  useDigits(Boolean(anchor), DECLINE_REASONS.length, (index) => {
    onClose();
    onPick(DECLINE_REASONS[index]);
  });
  return (
    <Menu
      open={Boolean(anchor)}
      onClose={onClose}
      anchor={anchor}
      align="end"
      width={232}
      label="Почему не можете?"
      items={DECLINE_REASONS.map((reason, index) => ({ key: reason, label: reason, hint: String(index + 1), onSelect: () => onPick(reason) }))}
    />
  );
}

/** A word field with its button: Enter sends. */
export function WordField({ placeholder, action, busy, onSend, testId, autoFocus }: { placeholder: string; action: string; busy: boolean; onSend: (text: string) => void; testId?: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        className="field h-8 min-w-0 flex-1 px-2.5 text-[13px] leading-5"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            send();
          }
        }}
        data-testid={testId}
      />
      <Button size="sm" variant="secondary" className="!min-h-8" disabled={!text.trim() || busy} onClick={send}>
        {action}
      </Button>
    </div>
  );
}

/**
 * «Уточнить у директора» on the desk (D-99): the scene's ready questions with their digits, and a
 * word of her own under them — in a popover at the button, the queue stays in sight.
 */
export function AskPopover({ anchor, errand, catalogue, onClose }: { anchor: HTMLElement | null; errand: Errand; catalogue: readonly SecretaryAction[]; onClose: () => void }) {
  const link = useErrandLink();
  const questions = QUESTIONS[sceneOf(errand, catalogue)];
  const busy = link.isPending && link.variables?.id === errand.id;
  const ask = (text: string) => {
    onClose();
    link.mutate({ fn: "errand_ask", id: errand.id, text });
  };
  useDigits(Boolean(anchor), questions.length, (index) => ask(questions[index]));
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (anchor) requestAnimationFrame(() => list.current?.querySelector("button")?.focus({ preventScroll: true }));
  }, [anchor]);
  return (
    <Popover open={Boolean(anchor)} onClose={onClose} anchor={anchor} align="end" width={300} label="Уточнить у директора">
      <div ref={list} className="flex flex-col gap-2 p-2" data-testid="desk-errand-ask">
        <p className="desk-label px-1.5 pt-1 uppercase">Уточнить у директора</p>
        <div className="flex flex-col">
          {questions.map((question, index) => (
            <button
              key={question}
              type="button"
              disabled={busy}
              onClick={() => ask(question)}
              className="flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] leading-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{question}</span>
              <Kbd>{String(index + 1)}</Kbd>
            </button>
          ))}
        </div>
        <WordField placeholder="Свой вопрос…" action="Спросить" busy={busy} onSend={ask} />
      </div>
    </Popover>
  );
}

/*
 * The queue of «Стойка» (D-175): what waits for her as tickets — the alarm first, then the oldest —
 * and what is in her hands as rows, «Что передать директору?» on top of them. The chosen item wears
 * the pen's ring and holds the screen's one white button, its keys in its buttons; nothing on the
 * page moves under the mouse: every move is laid out always, second-rank ones fade in by opacity.
 */

/** A request nobody has taken beats its live dot this long; then the dot stands still (the D-168 rule). */
const LIVE_MS = 3 * 60_000;

/** A key in a button of the queue: always laid out, shown on the chosen item only — a choice never moves a word. */
function Cap({ children }: { children: string }) {
  return (
    <span aria-hidden className="stoika-cap nums">
      {children}
    </span>
  );
}

export type PillTone = "sky" | "warn" | "pencil" | "quiet" | "ok";

/** How long the director has waited, as a clock: fresh blue, amber once he waits, the red pencil after the repeat push. */
export function WaitPill({ text, tone, title = "Сколько ждёт директор" }: { text: string; tone: PillTone; title?: string }) {
  return (
    <span className="stoika-wait nums" data-tone={tone} title={title}>
      <Timer size={12} strokeWidth={2.5} aria-hidden />
      {/* «только что» is the list's word; the pill wants the short one */}
      {text === "только что" ? "сейчас" : text}
    </span>
  );
}

/** The alarm's tile: the siren in the red pencil — still; the page's alarm (DeskAlarm) does the ringing. */
function AlarmTile({ size }: { size: number }) {
  return (
    <span aria-hidden className="errands-tile stoika-alarm-tile" style={{ width: size, height: size }}>
      <Siren size={Math.round(size * 0.5)} strokeWidth={2.25} />
    </span>
  );
}

/** The question she asked about it, and the director's answer once it comes — the answer is the news. */
function Asked({ errand }: { errand: Errand }) {
  if (!errand.question) return null;
  return errand.answer ? (
    <span className="stoika-asked" data-answered="">
      «{errand.question}» — <b>директор: {errand.answer}</b>
    </span>
  ) : (
    <span className="stoika-asked">спросили «{errand.question}» — ждём ответа</span>
  );
}

type Moves = {
  accept: () => void;
  done: () => void;
  etaMenu: (anchor: HTMLElement) => void;
  decline: (anchor: HTMLElement) => void;
  ask: (anchor: HTMLElement) => void;
};

/** A click on the card's body (not a button) chooses it and opens it in the panel. */
function onBody(open: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, [role=dialog]")) return;
    open();
  };
}

/** Who asked and by when: the director's face, a time the request is needed by, until when. */
function Who({ errand, now }: { errand: Errand; now: Date }) {
  const author = errand.author?.full_name ?? "Директор";
  const late = Boolean(errand.due_at) && Date.parse(errand.due_at as string) < now.getTime();
  return (
    <>
      <PersonFace id={errand.author_id} name={author} size={18} />
      <span className="shrink-0">{shortName(author)}</span>
      {errand.until_at ? <span className="shrink-0">· {untilLine(errand.until_at)}</span> : null}
      {errand.due_at ? (
        <span className="shrink-0 text-text" data-testid="errand-due">
          · <When overdue={late}>{atLine(errand.due_at, now)}</When>
        </span>
      ) : null}
    </>
  );
}

/**
 * A request nobody has taken, as a ticket on the counter: its tile, what (20/26), the note, who
 * asked and by when, how long he waits; «Принял» · «Не могу» · «Уточнить» always in place.
 */
function Ticket({
  errand,
  now,
  catalogue,
  chosen,
  busy,
  arrived,
  escalateMin,
  moves,
  onOpen,
}: {
  errand: Errand;
  now: Date;
  catalogue: readonly SecretaryAction[];
  chosen: boolean;
  busy: boolean;
  arrived: boolean;
  escalateMin: number;
  moves: Moves;
  onOpen: () => void;
}) {
  const scene = sceneOf(errand, catalogue);
  const alarm = scene === "security";
  const asking = Boolean(errand.question && !errand.answer);
  const urgency = alarm ? 2 : urgencyOf(errand, now, escalateMin);
  const live = now.getTime() - Date.parse(errand.created_at) < LIVE_MS;
  return (
    <article
      className="stoika-ticket"
      onClick={onBody(onOpen)}
      aria-current={chosen ? "true" : undefined}
      data-testid="desk-errand-card"
      data-status={errand.status}
      data-errand-id={errand.id}
      data-chosen={chosen ? "" : undefined}
      data-alarm={alarm ? "" : undefined}
      data-arrived={arrived ? "" : undefined}
    >
      <div className="stoika-ticket-top">
        <span className="stoika-ticket-tile" data-live={live ? "on" : "still"}>
          {alarm ? <AlarmTile size={44} /> : <SceneTile scene={scene} size={44} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="stoika-ticket-title">
            {alarm ? "Вызови охрану!" : errand.label}
            {errand.note ? <span className="stoika-ticket-note"> · {errand.note}</span> : null}
          </p>
          <p className="stoika-who">
            <Who errand={errand} now={now} />
          </p>
          {errand.question ? (
            <p className="mt-1 truncate text-[13px] leading-[18px]">
              <Asked errand={errand} />
            </p>
          ) : null}
        </div>
        <WaitPill text={waitedFor(errand, now)} tone={urgency === 2 ? "pencil" : urgency === 1 ? "warn" : "sky"} />
      </div>
      <div className="stoika-ticket-moves" data-testid="desk-errand-actions">
        <Button size="sm" variant={chosen ? "primary" : "secondary"} className="stoika-main" loading={busy} onClick={moves.accept} data-testid="desk-errand-accept">
          {alarm ? "Вызываю охрану" : "Принял"}
          <Cap>Enter</Cap>
        </Button>
        {alarm ? null : (
          <Button size="sm" variant="secondary" className="stoika-move" disabled={busy} onClick={(event) => moves.decline(event.currentTarget)} data-testid="desk-errand-decline" data-decline-for={errand.id}>
            Не могу
            <Cap>N</Cap>
          </Button>
        )}
        {alarm || asking ? null : (
          <button type="button" className="stoika-ghost desk-focus" onClick={(event) => moves.ask(event.currentTarget)} data-testid="desk-errand-ask-open" data-ask-for={errand.id} title="Уточнить у директора (Q)">
            Уточнить
            <Cap>Q</Cap>
          </button>
        )}
      </div>
    </article>
  );
}

/** The row's second line: the promise, by when, until when, the question — or when it was taken. */
function HandLine({ errand, now, promise }: { errand: Errand; now: Date; promise: string | null }) {
  const late = Boolean(errand.due_at) && Date.parse(errand.due_at as string) < now.getTime();
  const parts: ReactNode[] = [];
  if (promise) parts.push(<span className="font-medium text-text">обещано: {promise}</span>);
  if (errand.until_at) parts.push(untilLine(errand.until_at));
  if (errand.due_at) parts.push(<When overdue={late}>{atLine(errand.due_at, now)}</When>);
  if (errand.question) parts.push(<Asked errand={errand} />);
  if (parts.length === 0) parts.push(errand.accepted_at ? `взято в ${wallHm(errand.accepted_at)}` : "взято");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className={index === parts.length - 1 ? "min-w-0 truncate" : "shrink-0"}>
          {index > 0 ? "· " : ""}
          {part}
        </span>
      ))}
    </>
  );
}

/** «Будет через…» of a row (D-99): the four promises as a menu at the button, 1–4 pick at once. */
function EtaMenu({ anchor, onClose, onPick }: { anchor: HTMLElement | null; onClose: () => void; onPick: (min: number) => void }) {
  useDigits(Boolean(anchor), ETAS.length, (index) => {
    onClose();
    onPick(ETAS[index].min);
  });
  return (
    <Menu
      open={Boolean(anchor)}
      onClose={onClose}
      anchor={anchor}
      align="end"
      width={200}
      label="Когда будет"
      items={ETAS.map((option, index) => ({ key: String(option.min), label: option.min ? `Через ${option.label}` : "Сейчас", hint: String(index + 1), onSelect: () => onPick(option.min) }))}
    />
  );
}

/**
 * A request in her hands, as a row: how long the director waits, what, the promise or the question;
 * «Будет: сейчас · 5 · 15 · 30 мин» and «Уточнить» laid out always and lit on the chosen row (or under
 * the mouse), «Готово» on the right.
 */
function HandRow({
  errand,
  now,
  catalogue,
  chosen,
  busy,
  came,
  moves,
  onOpen,
}: {
  errand: Errand;
  now: Date;
  catalogue: readonly SecretaryAction[];
  chosen: boolean;
  busy: boolean;
  came: boolean;
  moves: Moves;
  onOpen: () => void;
}) {
  const scene = sceneOf(errand, catalogue);
  const alarm = scene === "security";
  const guard = scene === "dnd";
  const asking = Boolean(errand.question && !errand.answer);
  const left = etaLeftMin(errand, now);
  const promise = etaLine(left);
  return (
    <div
      className="stoika-row"
      onClick={onBody(onOpen)}
      aria-current={chosen ? "true" : undefined}
      data-testid="desk-errand-card"
      data-status={errand.status}
      data-errand-id={errand.id}
      data-chosen={chosen ? "" : undefined}
      data-alarm={alarm ? "" : undefined}
      data-came={came ? "" : undefined}
    >
      <WaitPill text={waitedFor(errand, now)} tone={left !== null && left < -1 ? "warn" : "quiet"} />
      <span className="stoika-row-tile">{alarm ? <AlarmTile size={30} /> : <SceneTile scene={scene} size={30} />}</span>
      <div className="min-w-0">
        <p className="stoika-row-title">
          <b>{alarm ? "Охрана" : errand.label}</b>
          {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
        </p>
        <p className="stoika-who">
          <HandLine errand={errand} now={now} promise={promise} />
        </p>
      </div>
      <div className="stoika-row-moves" data-testid="desk-errand-actions">
        {!errand.eta_at && !guard && !alarm ? (
          <button
            type="button"
            className="stoika-second stoika-ghost desk-focus"
            disabled={busy}
            onClick={(event) => moves.etaMenu(event.currentTarget)}
            data-testid="desk-errand-eta"
            data-eta-for={errand.id}
            title="Сказать директору, когда будет (1–4)"
          >
            <Clock3 size={15} strokeWidth={2.25} aria-hidden />
            <span className="stoika-move-word">Будет через…</span>
            <Cap>1–4</Cap>
          </button>
        ) : null}
        {!asking && !alarm ? (
          <button type="button" className="stoika-second stoika-ghost desk-focus" onClick={(event) => moves.ask(event.currentTarget)} data-testid="desk-errand-ask-open" data-ask-for={errand.id} title="Уточнить у директора (Q)">
            <MessageCircleQuestion size={15} strokeWidth={2.25} aria-hidden />
            <span className="stoika-move-word">Уточнить</span>
            <Cap>Q</Cap>
          </button>
        ) : null}
        <Button size="sm" variant={chosen ? "primary" : "secondary"} className="stoika-main" loading={busy} onClick={moves.done} data-testid="desk-errand-done">
          {guard ? "Снять «не беспокоить»" : alarm ? "Охрана на месте" : "Готово"}
          <Cap>Enter</Cap>
        </Button>
      </div>
    </div>
  );
}

/**
 * Done by her, nothing passed back yet (D-99): «Что передать директору?» stays on top of «У вас»
 * for a while — the scene's ready words with their digits, a word of her own, «Не нужно».
 */
function ResultRow({ errand, catalogue, chosen, busy, onSend, onDismiss, onOpen }: { errand: Errand; catalogue: readonly SecretaryAction[]; chosen: boolean; busy: boolean; onSend: (text: string) => void; onDismiss: () => void; onOpen: () => void }) {
  const scene = sceneOf(errand, catalogue);
  const results = RESULTS[scene];
  // a word of her own opens a field in place of the ready ones
  const [typing, setTyping] = useState(false);
  return (
    <div
      className="stoika-row stoika-result"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, input")) onOpen();
      }}
      aria-current={chosen ? "true" : undefined}
      data-testid="desk-errand-result"
      data-chosen={chosen ? "" : undefined}
      data-errand-id={errand.id}
    >
      <span className="stoika-wait" data-tone="ok">
        <Check size={12} strokeWidth={2.75} aria-hidden />
        готово
      </span>
      <span className="stoika-row-tile">
        <SceneTile scene={scene} size={30} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
        <p className="stoika-row-title">
          <b>{errand.label}</b>
          <span className="text-muted"> · что передать директору?</span>
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] leading-[18px]">
          {typing ? (
            <div className="w-full max-w-[360px]">
              <WordField
                placeholder="Своими словами…"
                action="Передать"
                busy={busy}
                autoFocus
                onSend={(text) => {
                  setTyping(false);
                  onSend(text);
                }}
              />
            </div>
          ) : (
            <>
              {results.map((text, index) => (
                <button key={text} type="button" disabled={busy} onClick={() => onSend(text)} className="desk-word desk-focus">
                  {text}
                  <Cap>{String(index + 1)}</Cap>
                </button>
              ))}
              <button type="button" onClick={() => setTyping(true)} className="stoika-ghost desk-focus">
                <PenLine size={13} strokeWidth={2.25} aria-hidden />
                Своими словами
              </button>
            </>
          )}
        </div>
      </div>
      <div className="stoika-row-moves">
        <button type="button" onClick={onDismiss} className="stoika-ghost desk-focus" data-testid="desk-errand-result-skip">
          Не нужно
          <Cap>Esc</Cap>
        </button>
      </div>
    </div>
  );
}

/** The one empty message of the page: where the next request will land, and the keys for it. */
function LandingSlot() {
  return (
    <div className="stoika-slot" data-testid="stoika-slot">
      <CheckCheck size={16} strokeWidth={2.25} aria-hidden />
      <span className="min-w-0 flex-1 truncate">Новых просьб нет — придёт, встанет сюда и прозвенит</span>
      <span className="stoika-slot-keys" aria-label="Клавиши: Enter — принять, N — не могу, Q — уточнить">
        <Kbd>Enter</Kbd>
        <span>принять</span>
        <Kbd>N</Kbd>
        <span>не могу</span>
        <Kbd>Q</Kbd>
        <span>уточнить</span>
      </span>
    </div>
  );
}

type Item = { kind: "result" | "errand"; errand: Errand };

/** Requests done by her within a while, nothing passed back, the scene has words for it. */
export function resultsOf(rows: readonly Errand[], meId: string, now: Date, catalogue: readonly SecretaryAction[], dismissed: ReadonlySet<string>): Errand[] {
  return rows.filter(
    (e) =>
      e.status === "done" &&
      e.claimed_by === meId &&
      !e.result &&
      !dismissed.has(e.id) &&
      RESULTS[sceneOf(e, catalogue)].length > 0 &&
      now.getTime() - new Date(e.done_at ?? e.created_at).getTime() < RESULT_FOR_MS,
  );
}

/** A section's label of «Стойка»: the words, a face before them when it is somebody's, the count. */
export function StoikaLabel({ children, count, face }: { children: ReactNode; count?: number; face?: ReactNode }) {
  return (
    <div className="stoika-label">
      {face}
      <h2>{children}</h2>
      {count !== undefined && count > 0 ? <span className="nums text-muted">{count}</span> : null}
    </div>
  );
}

/**
 * The secretary's queue from the keyboard and the mouse (D-154, D-175): ↑/↓ choose; Enter — the
 * chosen item's next step («Принял», then «Готово»); 1–4 — «Будет: сейчас / 5 / 15 / 30 мин» once
 * it is hers; N — «Не могу» with its reasons (1–3); Q — a question to the director. «Готово» leaves
 * «Что передать директору?» on top of «У вас»: 1–2 — the ready words, Esc — «Не нужно». A request
 * opened from outside (`?e=`, a push) is the chosen one. By the physical key: a Russian layout works.
 */
export function QueueList({
  queue,
  results,
  meId,
  now,
  catalogue,
  openId,
  fresh,
  onOpen,
  onDismiss,
}: {
  queue: readonly Errand[];
  results: readonly Errand[];
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  openId: string | null;
  /** Requests that arrived while she looks (`useArrivals`): they drop into their place with a ring of the pen. */
  fresh: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const transition = useErrandActions();
  const link = useErrandLink();
  const panel = useDeskPanel();
  const back = useBackOnTake(meId);
  const still = useReducedMotion();
  const secretaries = useSecretaries();
  const myName = secretaries.data?.find((person) => person.id === meId)?.full_name ?? "";
  const alarming = (errand: Errand) => errand.status === "sent" && sceneOf(errand, catalogue) === "security";
  // the alarm before everything; then the rest in the order the screen gave them (the oldest first)
  const tickets = [...queue.filter(alarming), ...queue.filter((errand) => errand.status === "sent" && !alarming(errand))];
  const hands = queue.filter((errand) => errand.status !== "sent");
  const items: Item[] = [
    ...tickets.map((errand) => ({ kind: "errand" as const, errand })),
    ...results.map((errand) => ({ kind: "result" as const, errand })),
    ...hands.map((errand) => ({ kind: "errand" as const, errand })),
  ];
  // what came into her hands while she looks: it slides in, her face pops on the label
  const came = useArrivals(
    hands.map((errand) => errand.id),
    true,
  );

  const [chosen, setChosen] = useState<{ id: string; index: number } | null>(null);
  // a request opened from outside — a push, a link, the panel — waits to be chosen until the list holds it
  const [asked, setAsked] = useState<string | null>(openId);
  const [seenOpen, setSeenOpen] = useState(openId);
  if (openId !== seenOpen) {
    setSeenOpen(openId);
    setAsked(openId);
  }
  if (asked) {
    const index = items.findIndex((item) => item.errand.id === asked);
    if (index >= 0) {
      setAsked(null);
      if (chosen?.id !== asked) setChosen({ id: asked, index });
    }
  }
  const at = chosen ? items.findIndex((item) => item.errand.id === chosen.id) : -1;
  const current = at >= 0 ? items[at] : (items[Math.min(chosen?.index ?? 0, items.length - 1)] ?? null);
  const [decline, setDecline] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [ask, setAsk] = useState<{ errand: Errand; anchor: HTMLElement } | null>(null);
  const [eta, setEta] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const choose = (id: string) => {
    setAsked(null);
    setChosen({ id, index: Math.max(0, items.findIndex((item) => item.errand.id === id)) });
  };
  const busyOf = (id: string) => (transition.isPending && transition.variables?.id === id) || (link.isPending && link.variables?.id === id);
  const escalateMin = useSecretarySetup().data?.escalateAfterMin ?? 3;

  const movesOf = (errand: Errand): Moves => ({
    accept: () => {
      choose(errand.id);
      // taking a request is being at the desk: away, she is marked back at once (D-175)
      back();
      transition.mutate({ id: errand.id, to: "accepted" });
    },
    done: () => {
      // the choice stays on it: done, it comes back on top asking what to pass on
      choose(errand.id);
      flyToToday(document.querySelector(`[data-errand-id="${CSS.escape(errand.id)}"] .stoika-row-tile > *`), sceneOf(errand, catalogue));
      transition.mutate({ id: errand.id, to: "done" });
    },
    etaMenu: (anchor) => {
      choose(errand.id);
      setEta({ id: errand.id, anchor });
    },
    decline: (anchor) => {
      choose(errand.id);
      setDecline({ id: errand.id, anchor });
    },
    ask: (anchor) => {
      choose(errand.id);
      setAsk({ errand, anchor });
    },
  });
  const sendResult = (id: string, text: string) => link.mutate({ fn: "errand_result", id, text });

  // a new choice comes into sight; the page's own first one stays put, one opened from a push does not
  const currentId = current?.errand.id ?? null;
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const before = shown.current;
    shown.current = currentId;
    if (!currentId || (before === null && currentId !== openId)) return;
    document.querySelector(`[data-errand-id="${CSS.escape(currentId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId, openId]);

  useScreenKeys((event) => {
    if (!current) return false;
    const arrow = arrowOf(event);
    if (arrow) {
      const next = stepKey(
        items.map((item) => item.errand.id),
        current.errand.id,
        arrow === "down",
      );
      if (next) choose(next);
      return true;
    }
    const errand = current.errand;
    const digit = digitOf(event);
    if (current.kind === "result") {
      const words = RESULTS[sceneOf(errand, catalogue)];
      if (digit && digit <= words.length) {
        if (!busyOf(errand.id)) sendResult(errand.id, words[digit - 1]);
        return true;
      }
      // Esc closes the panel first when it is open (the desk's own Esc)
      if (event.key === "Escape" && !panel.isOpen) {
        onDismiss(errand.id);
        return true;
      }
      return false;
    }
    const scene = sceneOf(errand, catalogue);
    const taken = errand.status === "accepted" && errand.claimed_by === meId;
    if ((event.code === "Enter" || event.code === "NumpadEnter") && !onControl(event.target)) {
      if (busyOf(errand.id)) return true;
      if (errand.status === "sent") movesOf(errand).accept();
      else if (taken) movesOf(errand).done();
      return true;
    }
    if (digit && digit <= ETAS.length && taken && !errand.eta_at && scene !== "dnd" && scene !== "security") {
      if (!busyOf(errand.id)) link.mutate({ fn: "errand_eta", id: errand.id, min: ETAS[digit - 1].min });
      return true;
    }
    if (event.code === "KeyN" && errand.status === "sent" && scene !== "security") {
      const anchor = document.querySelector<HTMLElement>(`[data-decline-for="${CSS.escape(errand.id)}"]`);
      if (anchor) setDecline({ id: errand.id, anchor });
      return Boolean(anchor);
    }
    if (event.code === "KeyQ" && !(errand.question && !errand.answer) && scene !== "security") {
      const anchor = document.querySelector<HTMLElement>(`[data-ask-for="${CSS.escape(errand.id)}"]`);
      if (anchor) setAsk({ errand, anchor });
      return Boolean(anchor);
    }
    return false;
  });

  const isChosen = (id: string) => current?.errand.id === id;
  const glide = still ? false : ("position" as const);
  const leave = still ? undefined : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } };

  return (
    <>
      {tickets.length > 0 ? (
        <section className="stoika-section" aria-label="Ждут вас" data-testid="stoika-waiting">
          <StoikaLabel count={tickets.length}>Ждут вас</StoikaLabel>
          <div className="stoika-tickets">
            <AnimatePresence initial={false} mode="popLayout">
              {tickets.map((errand) => (
                <motion.div key={errand.id} layout={glide} exit={leave} className="stoika-ticket-slot">
                  <Ticket
                    errand={errand}
                    now={now}
                    catalogue={catalogue}
                    chosen={isChosen(errand.id)}
                    busy={busyOf(errand.id)}
                    arrived={fresh.has(errand.id)}
                    escalateMin={escalateMin}
                    moves={movesOf(errand)}
                    onOpen={() => {
                      choose(errand.id);
                      onOpen(errand.id);
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : (
        <LandingSlot />
      )}
      {results.length + hands.length > 0 ? (
        <section className="stoika-section" aria-label="У вас" data-testid="stoika-hands">
          <StoikaLabel
            count={hands.length}
            face={
              <span className="stoika-label-face" data-pop={came.size > 0 ? "" : undefined}>
                <PersonFace id={meId} name={myName} size={20} />
              </span>
            }
          >
            У вас
          </StoikaLabel>
          <div className="stoika-card stoika-rows">
            <AnimatePresence initial={false} mode="popLayout">
              {results.map((errand) => (
                <motion.div key={`result-${errand.id}`} layout={glide} exit={leave}>
                  <ResultRow
                    errand={errand}
                    catalogue={catalogue}
                    chosen={isChosen(errand.id)}
                    busy={busyOf(errand.id)}
                    onSend={(text) => sendResult(errand.id, text)}
                    onDismiss={() => onDismiss(errand.id)}
                    onOpen={() => {
                      choose(errand.id);
                      onOpen(errand.id);
                    }}
                  />
                </motion.div>
              ))}
              {hands.map((errand) => (
                <motion.div key={`hand-${errand.id}`} layout={glide} exit={leave}>
                  <HandRow
                    errand={errand}
                    now={now}
                    catalogue={catalogue}
                    chosen={isChosen(errand.id)}
                    busy={busyOf(errand.id)}
                    came={came.has(errand.id)}
                    moves={movesOf(errand)}
                    onOpen={() => {
                      choose(errand.id);
                      onOpen(errand.id);
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      ) : null}
      <ReasonMenu
        anchor={decline?.anchor ?? null}
        onClose={() => setDecline(null)}
        onPick={(reason) => {
          if (decline) transition.mutate({ id: decline.id, to: "declined", reason });
          setDecline(null);
        }}
      />
      <EtaMenu
        anchor={eta?.anchor ?? null}
        onClose={() => setEta(null)}
        onPick={(min) => {
          if (eta) link.mutate({ fn: "errand_eta", id: eta.id, min });
          setEta(null);
        }}
      />
      {ask ? <AskPopover anchor={ask.anchor} errand={ask.errand} catalogue={catalogue} onClose={() => setAsk(null)} /> : null}
    </>
  );
}
