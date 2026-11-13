"use client";

import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/Button";
import { dayLineOf, wallHm, type BusySpan, type Door, type DoorHold } from "@/lib/desk/busy";
import { useErrandActions } from "@/lib/errands/mutations";
import { shortName } from "@/lib/people/names";

/*
 * «Дверь директора» on the secretary's «Стойка» (D-175): the one thing she watches between
 * requests — a lamp (green free, amber in a meeting, violet «не беспокоить»), the state in words,
 * and the working day as a line with his busy hours hatched and a mark of now. When work comes
 * the card folds into a 56 px strip in one layout animation and the queue takes the room.
 */

/** The fold of the card: one layout move, the words fading in after it. */
const FOLD = { type: "spring", stiffness: 520, damping: 46, mass: 0.9 } as const;

const TITLE: Record<Door["state"], string> = {
  free: "Директор свободен",
  busy: "Директор на встрече",
  dnd: "Не беспокоить",
};

/** «ещё 21 мин», «ещё 1 ч 5 мин». */
function leftWords(until: string, now: Date): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - now.getTime()) / 60_000));
  if (minutes < 60) return `ещё ${minutes} мин`;
  const rest = minutes % 60;
  return `ещё ${Math.floor(minutes / 60)} ч${rest ? ` ${rest} мин` : ""}`;
}

/** What comes after this state, today: «потом занят до 16:10», «потом занят 15:00–16:10». */
function nextWords(next: BusySpan | null, after: number | null): string | null {
  if (!next) return null;
  if (after !== null && Date.parse(next.starts_at) <= after) return `потом занят до ${wallHm(next.ends_at)}`;
  return `потом занят ${wallHm(next.starts_at)}–${wallHm(next.ends_at)}`;
}

/** The line under the title: until when, how long still, who holds the door, what comes next. */
export function doorWords(door: Door, now: Date, meId: string): string {
  if (door.state === "dnd") {
    const holder = door.holder && door.holder.id !== meId && door.holder.name ? `держит ${shortName(door.holder.name)}` : null;
    const until = door.until ? `до ${wallHm(door.until)} · ${leftWords(door.until, now)}` : "пока не снимут";
    return [until, holder, nextWords(door.next, door.until ? Date.parse(door.until) : now.getTime())].filter(Boolean).join(" · ");
  }
  if (door.state === "busy") {
    const until = door.until ? `до ${wallHm(door.until)}` : null;
    return [until, door.next ? `потом снова занят ${wallHm(door.next.starts_at)}–${wallHm(door.next.ends_at)}` : "потом свободен"].filter(Boolean).join(" · ");
  }
  if (!door.until) return "до конца дня";
  // free until the next busy span: it starts where «до» ends, so only its end is news
  return [`до ${wallHm(door.until)}`, door.next ? `потом занят до ${wallHm(door.next.ends_at)}` : null].filter(Boolean).join(" · ");
}

/** The working day as a line: busy hatched, the past dimmed, the closed door violet, now marked. */
function DayLineView({ spans, now, dndUntil }: { spans: readonly BusySpan[]; now: Date; dndUntil: string | null }) {
  const line = dayLineOf(spans, now);
  const span = line.to - line.from;
  const at = (minute: number) => `${(Math.max(0, Math.min(span, minute - line.from)) / span) * 100}%`;
  const hours: number[] = [];
  for (let minute = line.from; minute <= line.to; minute += 60) hours.push(minute);
  const dndEnd = dndUntil ? line.now + Math.max(0, Math.round((Date.parse(dndUntil) - now.getTime()) / 60_000)) : null;
  const busyWords = line.blocks.map((block) => `${hm(block.start)}–${hm(block.end)}`).join(", ");
  return (
    <div className="stoika-dayline" role="img" aria-label={busyWords ? `Занят сегодня: ${busyWords}` : "Сегодня занятых часов нет"} data-testid="stoika-dayline">
      <span className="stoika-dayline-track" />
      <span className="stoika-dayline-past" style={{ width: at(line.now) }} />
      {line.blocks.map((block) => (
        <span key={block.start} className="stoika-dayline-busy" style={{ left: at(block.start), width: `calc(${at(block.end)} - ${at(block.start)})` }} />
      ))}
      {dndEnd !== null ? <span className="stoika-dayline-dnd" style={{ left: at(line.now), width: `calc(${at(dndEnd)} - ${at(line.now)})` }} /> : null}
      <span className="stoika-dayline-now" style={{ left: at(line.now) }}>
        <b className="nums">{hm(line.now)}</b>
      </span>
      <span className="stoika-dayline-hours nums" aria-hidden>
        {hours.map((minute) => (
          <span key={minute} style={{ left: at(minute) }}>
            {String(Math.floor(minute / 60) % 24).padStart(2, "0")}
          </span>
        ))}
      </span>
    </div>
  );
}

function hm(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** The lamp of the door: a still dot of its state's ink — it changes, it never blinks. */
export function DoorLamp({ state, size = 14 }: { state: Door["state"] | "unknown"; size?: number }) {
  return <span aria-hidden className="stoika-lamp" data-state={state} style={{ width: size, height: size }} />;
}

/**
 * The card. `compact` — work is on the desk: the strip. `door` null and nothing pending — the
 * calendar did not answer and the door is open: no card, never a wrong «свободен».
 */
export function DoorCard({
  door,
  spans,
  hold,
  pending,
  now,
  meId,
  compact,
}: {
  door: Door | null;
  spans: readonly BusySpan[] | null;
  hold: DoorHold | null;
  pending: boolean;
  now: Date;
  meId: string;
  compact: boolean;
}) {
  const still = useReducedMotion();
  const transition = useErrandActions();
  if (!door) {
    // the first answer is on its way: the card's place is kept, the queue under it does not jump
    return pending ? <div aria-hidden className="stoika-door stoika-door-bone" data-compact={compact ? "" : undefined} /> : null;
  }
  const mine = door.state === "dnd" && hold !== null && door.holder?.id === meId;
  const closing = transition.isPending && transition.variables?.id === hold?.errandId;
  const open = mine ? (
    <Button
      size="sm"
      variant="secondary"
      className="stoika-door-open"
      loading={closing}
      onClick={() => hold && transition.mutate({ id: hold.errandId, to: "done" })}
      data-testid="stoika-door-open"
      title="Снять «не беспокоить» — дверь директора открыта"
    >
      Снять
    </Button>
  ) : null;
  const words = doorWords(door, now, meId);

  return (
    <motion.section
      layout={!still}
      transition={FOLD}
      className="stoika-door"
      data-state={door.state}
      data-compact={compact ? "" : undefined}
      data-testid="stoika-door"
      aria-label="Дверь директора"
      style={{ borderRadius: compact ? 12 : 14 }}
    >
      {compact ? (
        <motion.div key="strip" layout={still ? false : "position"} className="stoika-door-strip" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: 0.08 }}>
          <DoorLamp state={door.state} size={10} />
          <p className="min-w-0 flex-1 truncate">
            <b className="stoika-door-strip-title">{TITLE[door.state]}</b>
            <span className="stoika-door-strip-words nums"> · {words}</span>
          </p>
          {open}
        </motion.div>
      ) : (
        <motion.div key="big" layout={still ? false : "position"} className="stoika-door-big" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, delay: 0.08 }}>
          <div className="stoika-door-head">
            <DoorLamp state={door.state} />
            <div className="min-w-0 flex-1">
              <p className="stoika-door-label">Дверь директора</p>
              <p className="stoika-door-title">{TITLE[door.state]}</p>
              <p className="stoika-door-words nums">{words}</p>
            </div>
            {open}
          </div>
          {spans ? <DayLineView spans={spans} now={now} dndUntil={door.state === "dnd" ? door.until : null} /> : null}
        </motion.div>
      )}
    </motion.section>
  );
}
