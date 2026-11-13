"use client";

import { Check, CloudOff, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { useErrandLink } from "@/lib/errands/mutations";
import { cancelAsked, usePendingErrands, type PendingErrand } from "@/lib/errands/pending";
import { useErrandReceipt, type Errand } from "@/lib/errands/queries";
import { atLine, isPlanned, sceneOf, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { receiptLine } from "@/lib/tasks/receipts";

import { ErrandTile, PersonFace, SceneTile } from "./look";
import { canNudge, clockOf, isDoor, stageOf, towardDone, tripFigure } from "./pult";
import { canCancel, cancelWord } from "./words";

/*
 * «В пути» of the director's «Пульт» (D-175): every request on its way as a tracker card — what
 * (the scene's tile, the note), the biggest figure the promise or the wait, the track «Попросили →
 * <Имя> → Готово» with the taker's face on its node, the push's receipt only while nobody has it
 * (принцип 8), «Напомнить ещё раз» after two minutes, «Отменить» to who asked. Cards keep the order
 * they were asked in: a card never jumps when its state changes.
 */

/** A card's arrival: drops 12 px into its place with a short spring; the rest make room. */
const ARRIVE = { type: "spring", stiffness: 560, damping: 36, mass: 0.7 } as const;

/** The track moved on while the screen looks: its line draws and the face pops on (once). */
function useAdvanced(stage: number): boolean {
  const was = useRef(stage);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (stage <= was.current) {
      was.current = stage;
      return;
    }
    was.current = stage;
    setAdvanced(true);
    const timer = setTimeout(() => setAdvanced(false), 900);
    return () => clearTimeout(timer);
  }, [stage]);
  return advanced;
}

/** Asked → taken → done, the reached nodes in the pen, «Готово» in green; the next one waits ringed. */
export function Track({ errand, now, finished = false, alarm = false }: { errand: Errand; now: Date; finished?: boolean; alarm?: boolean }) {
  const stage = finished ? 2 : stageOf(errand);
  const advanced = useAdvanced(stage);
  const fill = stage === 0 ? 0 : stage === 1 ? 0.5 + towardDone(errand, now) * 0.5 : 1;
  const who = shortName(errand.claimed?.full_name ?? "");
  const done = errand.done_at ?? (finished ? now.toISOString() : null);
  const nodes = [
    { word: alarm ? "Подняли" : "Попросили", time: clockOf(errand.created_at, now), state: "done" },
    { word: stage >= 1 && who ? (alarm ? `${who} вызывает` : who) : "Взяли", time: errand.accepted_at ? clockOf(errand.accepted_at, now) : "", state: stage >= 1 ? "done" : "now" },
    { word: alarm ? "Охрана на месте" : "Готово", time: done ? clockOf(done, now) : errand.eta_at ? `к ${clockOf(errand.eta_at, now)}` : "", state: stage >= 2 ? "end" : stage === 1 ? "now" : "todo" },
  ] as const;
  const label = `${nodes[0].word} ${nodes[0].time} → ${stage >= 1 ? `взято${who ? ` · ${who}` : ""}` : "ещё никто не взял"} → ${stage >= 2 ? "готово" : "ещё не готово"}`;
  return (
    <div className="pult-track" role="img" aria-label={label} data-stage={stage} data-alarm={alarm ? "" : undefined} data-advanced={advanced ? "" : undefined}>
      <span aria-hidden className="pult-track-line">
        <i style={{ transform: `scaleX(${fill})` } as CSSProperties} />
      </span>
      {nodes.map((node, index) => (
        <span key={index} aria-hidden className="pult-node" data-state={node.state} data-at={index}>
          <span className="pult-node-dot">
            {index === 1 && stage >= 1 && errand.claimed_by ? (
              <PersonFace id={errand.claimed_by} name={errand.claimed?.full_name ?? who} size={28} />
            ) : node.state === "done" || node.state === "end" ? (
              <Check size={14} strokeWidth={3} />
            ) : null}
            {/* a request nobody has taken: the one live dot of the card (frozen after quiet minutes) */}
            {index === 1 && stage === 0 ? <span className="pult-live" /> : null}
          </span>
          <span className="pult-node-word">{node.word}</span>
          <span className="pult-node-time nums">{node.time || " "}</span>
        </span>
      ))}
    </div>
  );
}

/** The card's own small moves: «Напомнить ещё раз», «Отменить» — always there, never under a hover. */
function Moves({ errand, now, meId, onCancel }: { errand: Errand; now: Date; meId: string; onCancel: (errand: Errand) => void }) {
  const link = useErrandLink();
  const nudge = canNudge(errand, now);
  const busy = link.isPending && link.variables?.id === errand.id;
  return (
    <span className="pult-moves">
      {nudge ? (
        <button
          type="button"
          className="pult-move desk-focus"
          disabled={busy}
          onClick={() => link.mutate({ fn: "errand_nudge", id: errand.id })}
          title="Секретарям уйдёт ещё один пуш"
          data-testid="desk-errand-nudge"
        >
          Напомнить ещё раз
        </button>
      ) : null}
      {canCancel(errand, meId) ? (
        <button type="button" className="pult-move desk-focus" onClick={() => onCancel(errand)} title="Отменить заявку · клавиша X, когда она открыта" data-testid="desk-errand-cancel">
          {cancelWord(errand)}
        </button>
      ) : null}
    </span>
  );
}

type CardProps = {
  errand: Errand;
  now: Date;
  meId: string;
  catalogue: readonly SecretaryAction[];
  chosen: boolean;
  fresh: boolean;
  finished: boolean;
  onOpen: (id: string) => void;
  onCancel: (errand: Errand) => void;
};

const openBy = (id: string, onOpen: (id: string) => void) => (event: MouseEvent<HTMLElement>) => {
  if ((event.target as HTMLElement).closest("button, a, input")) return;
  onOpen(id);
};

function TripCard({ errand, now, meId, catalogue, chosen, fresh, finished, onOpen, onCancel }: CardProps) {
  const waiting = errand.status === "sent";
  const receiptQuery = useErrandReceipt(errand.id, waiting);
  // the push's receipt only while nobody has it (принцип 8): «не открывал с 13:20», never «не получил»
  const receipt = waiting ? receiptLine(receiptQuery.data, now) : null;
  const figure: { big: string; caption: string; tone: string } = finished ? { big: "Готово", caption: shortName(errand.claimed?.full_name ?? ""), tone: "ok" } : tripFigure(errand, now);
  // a time far ahead is the card's big figure already: the note does not say it twice
  const note = [errand.note && errand.note !== errand.label ? errand.note : null, errand.due_at && !isPlanned(errand, now) ? atLine(errand.due_at, now) : null].filter(Boolean).join(" · ");
  return (
    <motion.article
      initial={fresh ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
      transition={ARRIVE}
      role="listitem"
      aria-current={chosen ? "true" : undefined}
      className="pult-trip desk-focus"
      data-row-key={errand.id}
      data-status={errand.status}
      data-finished={finished ? "" : undefined}
      data-testid="desk-errand-live"
      onClick={openBy(errand.id, onOpen)}
    >
      <header className="pult-trip-head">
        <ErrandTile errand={errand} catalogue={catalogue} size={36} />
        <span className="pult-trip-what">
          <span className="pult-trip-title" title={[errand.label, errand.note].filter(Boolean).join(" · ")}>
            {errand.label}
          </span>
          <span className="pult-trip-note">{note || " "}</span>
        </span>
        <span className="pult-trip-figure">
          <span className="pult-trip-big nums" data-tone={figure.tone}>
            {figure.big}
          </span>
          <span className="pult-trip-caption">{figure.caption}</span>
        </span>
      </header>
      <Track errand={errand} now={now} finished={finished} />
      <footer className="pult-trip-foot">
        <span className="pult-trip-receipt" data-tone={receipt?.tone}>
          {receipt ? receipt.text : ""}
        </span>
        {finished ? null : <Moves errand={errand} now={now} meId={meId} onCancel={onCancel} />}
      </footer>
    </motion.article>
  );
}

/**
 * The director's own «Не беспокоить» on its way (D-175): his door, closed until a time, who holds it,
 * how long is left as a line that runs down — and «Открыть дверь».
 */
function DoorCard({ errand, now, meId, chosen, fresh, onOpen, onCancel }: CardProps) {
  const figure = tripFigure(errand, now);
  const who = shortName(errand.claimed?.full_name ?? "");
  const start = new Date(errand.accepted_at ?? errand.created_at).getTime();
  const end = errand.until_at ? new Date(errand.until_at).getTime() : start;
  const left = end > start ? Math.max(0, Math.min(1, (end - now.getTime()) / (end - start))) : 0;
  return (
    <motion.article
      initial={fresh ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
      transition={ARRIVE}
      role="listitem"
      aria-current={chosen ? "true" : undefined}
      className="pult-trip pult-door desk-focus"
      data-row-key={errand.id}
      data-status={errand.status}
      data-testid="desk-errand-live"
      onClick={openBy(errand.id, onOpen)}
    >
      <header className="pult-trip-head">
        <SceneTile scene="dnd" size={36} />
        <span className="pult-trip-what">
          <span className="pult-trip-title" title={errand.until_at ? `Ваша дверь закрыта ${untilLine(errand.until_at)}` : "Ваша дверь закрыта"}>
            Ваша дверь закрыта
          </span>
          <span className="pult-trip-note">{[errand.until_at ? untilLine(errand.until_at) : null, errand.note && errand.note !== errand.label ? errand.note : "никого не пускают"].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="pult-trip-figure">
          <span className="pult-trip-big nums" data-tone="door">
            {figure.big}
          </span>
          <span className="pult-trip-caption">осталось</span>
        </span>
      </header>
      <span aria-hidden className="pult-door-left" style={{ "--left": left } as CSSProperties}>
        <i />
      </span>
      <footer className="pult-trip-foot">
        <span className="pult-door-holder">
          {errand.claimed_by ? <PersonFace id={errand.claimed_by} name={errand.claimed?.full_name ?? who} size={20} /> : null}
          <span className="truncate">{who ? `держит ${who}` : "держит секретарь"}</span>
        </span>
        {canCancel(errand, meId) ? (
          <span className="pult-moves">
            <button type="button" className="pult-move desk-focus" onClick={() => onCancel(errand)} title="Снять «Не беспокоить» · клавиша X, когда открыта" data-testid="desk-errand-cancel">
              Открыть дверь
            </button>
          </span>
        ) : null}
      </footer>
    </motion.article>
  );
}

/** A request on its way from this computer (D-106): «отправляю…», or kept without network with «Отменить». */
function PendingTrip({ row }: { row: PendingErrand }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={ARRIVE}
      role="listitem"
      className="pult-trip"
      data-pending
      data-testid="desk-errand-pending"
    >
      <header className="pult-trip-head">
        <SceneTile scene={sceneOf({ kind: row.code, label: row.label }, [])} size={36} muted />
        <span className="pult-trip-what">
          <span className="pult-trip-title">{row.label}</span>
          <span className="pult-trip-note">{row.note && row.note !== row.label ? row.note : " "}</span>
        </span>
        <span className="pult-trip-figure">
          <span className="pult-trip-big" data-tone={row.waiting ? "warn" : "muted"}>
            {row.waiting ? <CloudOff size={20} strokeWidth={2.25} aria-hidden /> : <LoaderCircle size={20} strokeWidth={2.25} className="desk-spin" aria-hidden />}
          </span>
          <span className="pult-trip-caption">{row.waiting ? "ждёт связи — уйдёт сама" : "отправляю…"}</span>
        </span>
      </header>
      <footer className="pult-trip-foot">
        <span />
        {row.waiting ? (
          <span className="pult-moves">
            <button type="button" className="pult-move desk-focus" onClick={() => cancelAsked(row.id)}>
              Отменить
            </button>
          </span>
        ) : null}
      </footer>
    </motion.article>
  );
}

/**
 * The cards in the order they were asked, the director's door among them; a request asked from here
 * is on the board at once («отправляю…»), one that arrives drops into place, one just done stays a
 * moment in green and leaves for «Только что» (`leaving`).
 */
export function TripBoard({
  trips,
  leaving,
  now,
  meId,
  catalogue,
  openId,
  fresh,
  onOpen,
  onCancel,
}: {
  trips: readonly Errand[];
  /** Just done while the screen looks: drawn finished for a moment, then gone. */
  leaving: readonly Errand[];
  now: Date;
  meId: string;
  catalogue: readonly SecretaryAction[];
  openId: string | null;
  fresh: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onCancel: (errand: Errand) => void;
}) {
  const pending = usePendingErrands((state) => state.pending);
  const gone = new Set(leaving.map((errand) => errand.id));
  const cards = [...trips.filter((errand) => !gone.has(errand.id)), ...leaving].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (cards.length === 0 && pending.length === 0) return null;
  return (
    <div className="pult-trips" role="list" aria-label="В пути">
      <AnimatePresence initial={false} mode="popLayout">
        {cards.map((errand) => {
          const props: CardProps = {
            errand,
            now,
            meId,
            catalogue,
            chosen: openId === errand.id,
            fresh: fresh.has(errand.id),
            finished: gone.has(errand.id),
            onOpen,
            onCancel,
          };
          return errand.status === "accepted" && isDoor(errand, catalogue) && !props.finished ? <DoorCard key={errand.id} {...props} /> : <TripCard key={errand.id} {...props} />;
        })}
        {[...pending].reverse().map((row) => (
          <PendingTrip key={row.id} row={row} />
        ))}
      </AnimatePresence>
    </div>
  );
}
