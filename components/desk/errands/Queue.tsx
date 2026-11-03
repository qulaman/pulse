"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Menu } from "@/components/desk/ui/Menu";
import { Popover } from "@/components/desk/ui/Popover";
import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Button } from "@/components/ui/Button";
import { DECLINE_REASONS, useErrandActions, useErrandLink } from "@/lib/errands/mutations";
import { waitedFor, type Errand } from "@/lib/errands/queries";
import { atLine, etaLeftMin, etaLine, QUESTIONS, RESULTS, sceneOf, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { ETAS } from "./ErrandLink";

/** How long a request done by her keeps asking «Что передать директору?» at the top of the queue. */
const RESULT_FOR_MS = 15 * 60_000;

/** The key of a button, inside it: dark on the accent fill, quiet on a plain one. */
export function KeyCap({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={`ml-2 inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-display text-[10px] font-bold leading-none ${muted ? "bg-surface-2 text-muted" : "bg-black/20 text-bg/80"}`}
    >
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
        <p className="px-1.5 pt-1 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Уточнить у директора</p>
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

/** One line under the request: who asked, the promise, the question and the director's answer. */
function Meta({ errand, now, mine }: { errand: Errand; now: Date; mine: boolean }) {
  const eta = mine && errand.status === "accepted" ? etaLine(etaLeftMin(errand, now)) : null;
  // the note first: it is what the request means («в аэропорт»), the row's first line keeps the label
  const parts: ReactNode[] = [];
  if (errand.note) parts.push(<span key="note" className="text-text/80">{errand.note}</span>);
  parts.push(shortName(errand.author?.full_name ?? "Директор"));
  if (errand.until_at) parts.push(untilLine(errand.until_at));
  if (eta) parts.push(<span key="eta">обещано: {eta}</span>);
  if (errand.question) {
    parts.push(
      errand.answer ? (
        <span key="q">
          {errand.question} — <span style={{ color: "var(--ok)" }}>директор: {errand.answer}</span>
        </span>
      ) : (
        <span key="q">
          спросили: {errand.question} — <span style={{ color: "var(--accent)" }}>ждём ответа</span>
        </span>
      ),
    );
  }
  return (
    <p className="truncate text-[12px] leading-4 text-muted">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? " · " : ""}
          {part}
        </span>
      ))}
    </p>
  );
}

type RowMoves = {
  accept: () => void;
  done: () => void;
  eta: (min: number) => void;
  decline: (anchor: HTMLElement) => void;
  ask: (anchor: HTMLElement) => void;
};

/**
 * A request in the secretary's queue (wave 3): a record in one flat plane, not a phone card —
 * how long it waits, what (by when, the note), who asked and what was said about it; on the right
 * her moves with their keys while the row is chosen. A click on the row (not a button) chooses
 * it and opens it in the panel.
 */
function QueueRow({
  errand,
  meId,
  now,
  catalogue,
  chosen,
  busy,
  moves,
  onOpen,
}: {
  errand: Errand;
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  chosen: boolean;
  busy: boolean;
  moves: RowMoves;
  onOpen: () => void;
}) {
  const scene = sceneOf(errand, catalogue);
  const alarm = scene === "security";
  const guard = scene === "dnd";
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  const asking = Boolean(errand.question && !errand.answer);
  const rail = alarm ? "var(--danger)" : taken ? "var(--ok)" : "var(--accent)";
  const open = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, [role=dialog]")) return;
    onOpen();
  };
  return (
    <div
      role="row"
      aria-selected={chosen}
      className="desk-row relative grid min-h-[56px] cursor-default grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border/50 py-2 pl-4 pr-3 first:border-t-0"
      style={alarm ? { background: "color-mix(in srgb, var(--danger) 10%, transparent)" } : undefined}
      onClick={open}
      data-testid="desk-errand-card"
      data-status={errand.status}
      data-chosen={chosen ? "" : undefined}
      data-errand-id={errand.id}
    >
      <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: rail }} />
      <span className="nums text-[13px] leading-5 text-muted" title="Сколько ждёт">
        {waitedFor(errand, now)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-[15px] font-semibold leading-5" style={alarm ? { color: "var(--danger)" } : undefined}>
          {alarm ? "Вызови охрану!" : errand.label}
          {!alarm && errand.due_at ? (
            <span style={{ color: "var(--accent)" }} data-testid="errand-due">
              {" "}
              · {atLine(errand.due_at, now)}
            </span>
          ) : null}
        </p>
        <Meta errand={errand} now={now} mine={taken} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5" data-testid="desk-errand-actions">
        {taken && !errand.eta_at && !guard && !alarm ? (
          <div className="mr-1 flex items-center gap-1" data-testid="desk-errand-eta">
            <span className="mr-0.5 text-[12px] leading-4 text-muted">Будет:</span>
            {ETAS.map((option, index) => (
              <button
                key={option.min}
                type="button"
                disabled={busy}
                onClick={() => moves.eta(option.min)}
                className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-border bg-surface-2/60 px-2 text-[12px] font-semibold leading-4 transition-colors hover:border-muted/50 disabled:opacity-40"
              >
                {option.label}
                {chosen ? <span className="nums text-[10px] font-bold text-muted">{index + 1}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {!asking && !alarm ? (
          <button
            type="button"
            onClick={(event) => moves.ask(event.currentTarget)}
            className="inline-flex h-8 items-center rounded-[8px] px-2 text-[12px] font-medium leading-4 text-muted transition-colors hover:bg-surface-2 hover:text-text"
            data-testid="desk-errand-ask-open"
            data-ask-for={errand.id}
            title="Уточнить у директора (Q)"
          >
            Уточнить
            {chosen ? <KeyCap muted>Q</KeyCap> : null}
          </button>
        ) : null}
        {taken ? (
          <Button size="sm" loading={busy} onClick={moves.done} data-testid="desk-errand-done">
            {guard ? "Снять «не беспокоить»" : alarm ? "Охрана на месте" : "Готово"}
            {chosen ? <KeyCap>Enter</KeyCap> : null}
          </Button>
        ) : (
          <>
            <Button size="sm" loading={busy} onClick={moves.accept} data-testid="desk-errand-accept">
              {alarm ? "Вызываю охрану" : "Принял"}
              {chosen ? <KeyCap>Enter</KeyCap> : null}
            </Button>
            {alarm ? null : (
              <Button size="sm" variant="secondary" disabled={busy} onClick={(event) => moves.decline(event.currentTarget)} data-testid="desk-errand-decline" data-decline-for={errand.id}>
                Не могу
                {chosen ? <KeyCap muted>N</KeyCap> : null}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Done by her, nothing passed back yet (D-99): «Что передать директору?» stays at the top of the
 * queue for a while — the scene's ready words with their digits, a word of her own, «Не нужно».
 */
function ResultRow({ errand, catalogue, chosen, busy, onSend, onDismiss, onOpen }: { errand: Errand; catalogue: readonly SecretaryAction[]; chosen: boolean; busy: boolean; onSend: (text: string) => void; onDismiss: () => void; onOpen: () => void }) {
  const results = RESULTS[sceneOf(errand, catalogue)];
  // a word of her own opens a field in place of the ready ones
  const [typing, setTyping] = useState(false);
  return (
    <div
      role="row"
      aria-selected={chosen}
      className="desk-row relative grid min-h-[56px] cursor-default grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-4 border-t border-border/50 py-2 pl-4 pr-3 first:border-t-0"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button, input")) onOpen();
      }}
      data-testid="desk-errand-result"
      data-chosen={chosen ? "" : undefined}
      data-errand-id={errand.id}
    >
      <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-muted/40" />
      <span className="text-[13px] leading-5" style={{ color: "var(--ok)" }}>
        готово
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-[15px] font-semibold leading-5">{errand.label}</p>
        <p className="truncate text-[12px] leading-4 text-muted">что передать?</p>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {typing ? (
          <div className="w-[280px]">
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
              <Button key={text} size="sm" variant="secondary" className="!min-h-8" disabled={busy} onClick={() => onSend(text)}>
                {text}
                {chosen ? <KeyCap muted>{String(index + 1)}</KeyCap> : null}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="!min-h-8" onClick={() => setTyping(true)}>
              Своими словами…
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" className="!min-h-8" onClick={onDismiss} data-testid="desk-errand-result-skip">
          Не нужно
          {chosen ? <KeyCap muted>Esc</KeyCap> : null}
        </Button>
      </div>
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

/**
 * The secretary's queue from the keyboard and the mouse (D-154, wave 3): one plane of records,
 * the chosen one ringed — ↑/↓ choose; Enter — its next step («Принял», then «Готово»); 1–4 —
 * «Будет: сейчас / 5 / 15 / 30 мин» once it is hers; N — «Не могу» with its reasons (1–3); Q — a
 * question to the director. «Готово» leaves «Что передать директору?» at the top: 1–2 — the
 * ready words, Esc — «Не нужно». By the physical key, so a Russian layout works.
 */
export function QueueList({
  queue,
  results,
  meId,
  now,
  catalogue,
  openId,
  onOpen,
  onDismiss,
}: {
  queue: readonly Errand[];
  results: readonly Errand[];
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  openId: string | null;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const transition = useErrandActions();
  const link = useErrandLink();
  const panel = useDeskPanel();
  const items: Item[] = [...results.map((errand) => ({ kind: "result" as const, errand })), ...queue.map((errand) => ({ kind: "errand" as const, errand }))];
  const [chosen, setChosen] = useState<{ id: string; index: number } | null>(null);
  const at = chosen ? items.findIndex((item) => item.errand.id === chosen.id) : -1;
  const current = at >= 0 ? items[at] : (items[Math.min(chosen?.index ?? 0, items.length - 1)] ?? null);
  const [decline, setDecline] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [ask, setAsk] = useState<{ errand: Errand; anchor: HTMLElement } | null>(null);
  const choose = (id: string) => setChosen({ id, index: Math.max(0, items.findIndex((item) => item.errand.id === id)) });
  const busyOf = (id: string) => (transition.isPending && transition.variables?.id === id) || (link.isPending && link.variables?.id === id);

  const movesOf = (errand: Errand): RowMoves => ({
    accept: () => {
      choose(errand.id);
      transition.mutate({ id: errand.id, to: "accepted" });
    },
    done: () => {
      // the choice stays on it: done, it comes back at the top asking what to pass on
      choose(errand.id);
      transition.mutate({ id: errand.id, to: "done" });
    },
    eta: (min) => link.mutate({ fn: "errand_eta", id: errand.id, min }),
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

  const currentId = current?.errand.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    document.querySelector(`[data-errand-id="${CSS.escape(currentId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

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
      const results = RESULTS[sceneOf(errand, catalogue)];
      if (digit && digit <= results.length) {
        if (!busyOf(errand.id)) sendResult(errand.id, results[digit - 1]);
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

  return (
    <>
      <div role="grid" aria-label="Очередь заявок" className="overflow-hidden rounded-[12px] border border-border bg-surface/40">
        {items.map((item) =>
          item.kind === "result" ? (
            <ResultRow
              key={`r-${item.errand.id}`}
              errand={item.errand}
              catalogue={catalogue}
              chosen={current?.errand.id === item.errand.id}
              busy={busyOf(item.errand.id)}
              onSend={(text) => sendResult(item.errand.id, text)}
              onDismiss={() => onDismiss(item.errand.id)}
              onOpen={() => {
                choose(item.errand.id);
                onOpen(item.errand.id);
              }}
            />
          ) : (
            <QueueRow
              key={item.errand.id}
              errand={item.errand}
              meId={meId}
              now={now}
              catalogue={catalogue}
              chosen={current?.errand.id === item.errand.id || (current === null && openId === item.errand.id)}
              busy={busyOf(item.errand.id)}
              moves={movesOf(item.errand)}
              onOpen={() => {
                choose(item.errand.id);
                onOpen(item.errand.id);
              }}
            />
          ),
        )}
      </div>
      {current ? <QueueKeys item={current} meId={meId} catalogue={catalogue} /> : null}
      <ReasonMenu
        anchor={decline?.anchor ?? null}
        onClose={() => setDecline(null)}
        onPick={(reason) => {
          if (decline) transition.mutate({ id: decline.id, to: "declined", reason });
          setDecline(null);
        }}
      />
      {ask ? <AskPopover anchor={ask.anchor} errand={ask.errand} catalogue={catalogue} onClose={() => setAsk(null)} /> : null}
    </>
  );
}

/** The keys that do something for the chosen line — a hint never names a dead key. */
function QueueKeys({ item, meId, catalogue }: { item: Item; meId: string; catalogue: readonly SecretaryAction[] }) {
  const errand = item.errand;
  const scene = sceneOf(errand, catalogue);
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  const parts: ReactNode[] = [
    <span key="arrows">
      <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор
    </span>,
  ];
  if (item.kind === "result") {
    parts.push(
      <span key="digits">
        <Kbd>1</Kbd>–<Kbd>{String(RESULTS[scene].length)}</Kbd> передать
      </span>,
      <span key="esc">
        <Kbd>Esc</Kbd> не нужно
      </span>,
    );
  } else {
    if (errand.status === "sent") {
      parts.push(
        <span key="enter">
          <Kbd>Enter</Kbd> {scene === "security" ? "вызываю охрану" : "принял"}
        </span>,
      );
    } else if (taken) {
      parts.push(
        <span key="enter">
          <Kbd>Enter</Kbd> готово
        </span>,
      );
    }
    if (taken && !errand.eta_at && scene !== "dnd" && scene !== "security") {
      parts.push(
        <span key="eta">
          <Kbd>1</Kbd>–<Kbd>4</Kbd> будет через
        </span>,
      );
    }
    if (errand.status === "sent" && scene !== "security") {
      parts.push(
        <span key="decline">
          <Kbd>N</Kbd> не могу
        </span>,
      );
    }
    if (!(errand.question && !errand.answer) && scene !== "security") {
      parts.push(
        <span key="ask">
          <Kbd>Q</Kbd> уточнить
        </span>,
      );
    }
  }
  return (
    <p className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] leading-4 text-muted" data-testid="desk-keys-hint">
      {parts}
    </p>
  );
}
