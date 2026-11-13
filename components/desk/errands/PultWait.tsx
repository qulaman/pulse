"use client";

import { DoorOpen, MessageSquareText } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { useErrandLink } from "@/lib/errands/mutations";
import { waitedFor, type Errand } from "@/lib/errands/queries";
import { choicesOf, isYesNo } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { useAnswerVisit } from "@/lib/visits/mutations";
import type { Visit } from "@/lib/visits/queries";
import { waitedSince } from "@/lib/visits/text";

import { Track } from "./Live";
import { ErrandTile, SceneTile } from "./look";
import { clockOf } from "./pult";
import { PultField } from "./Quick";
import { canCancel, cancelWord } from "./words";

/*
 * «Ждут вас» of the director's «Пульт» (D-175): what waits for his word, on an amber rail — the
 * alarm first (red, «Ложная тревога»), then the secretary's questions and the visitors as they
 * came, the messages last. Each one answered right in its card, and only there: «Да / Нет» (Y / N)
 * for a yes-or-no, two buttons for «X или Y?», a word of his own for the rest. The first card's
 * main answer is the screen's one white button.
 */

export type WaitItem =
  | { kind: "alarm"; errand: Errand; at: string }
  | { kind: "ask"; errand: Errand; at: string }
  | { kind: "visit"; visit: Visit; at: string }
  | { kind: "message"; visit: Visit; at: string };

export const waitKey = (item: WaitItem) => (item.kind === "visit" || item.kind === "message" ? item.visit.id : item.errand.id);

/** The order of «Ждут вас»: the alarm, then questions and visitors as they came, then messages. */
export function waitsOf(alarms: readonly Errand[], asks: readonly Errand[], visitors: readonly Visit[], messages: readonly Visit[]): WaitItem[] {
  const middle: WaitItem[] = [
    ...asks.map((errand) => ({ kind: "ask" as const, errand, at: errand.asked_at ?? errand.created_at })),
    ...visitors.map((visit) => ({ kind: "visit" as const, visit, at: visit.created_at })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return [
    ...alarms.map((errand) => ({ kind: "alarm" as const, errand, at: errand.created_at })),
    ...middle,
    ...messages.map((visit) => ({ kind: "message" as const, visit, at: visit.created_at })),
  ];
}

/** The first question a «Да» or a «Нет» answers: the keys Y and N go to it. */
export function yesNoOf(items: readonly WaitItem[]): Errand | null {
  for (const item of items) {
    if (item.kind === "ask" && !choicesOf(item.errand.question ?? "") && isYesNo(item.errand.question ?? "")) return item.errand;
  }
  return null;
}

function Card({ id, kind, chosen, fresh, onOpen, children, testId, status }: { id: string; kind: WaitItem["kind"]; chosen?: boolean; fresh: boolean; onOpen?: (id: string) => void; children: ReactNode; testId?: string; status?: string }) {
  return (
    <motion.article
      initial={fresh ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 560, damping: 36, mass: 0.7 }}
      className="pult-wait"
      data-kind={kind}
      data-row-key={onOpen ? id : undefined}
      aria-current={onOpen && chosen ? "true" : undefined}
      data-testid={testId}
      data-status={status}
      onClick={
        onOpen
          ? (event) => {
              if ((event.target as HTMLElement).closest("button, a, input")) return;
              onOpen(id);
            }
          : undefined
      }
    >
      {children}
    </motion.article>
  );
}

/** «Охрана» for the director: where the alarm stands, and «Ложная тревога» if he raised it. */
function AlarmCard({ errand, now, meId, chosen, fresh, onOpen, onCancel }: { errand: Errand; now: Date; meId: string; chosen: boolean; fresh: boolean; onOpen: (id: string) => void; onCancel: (errand: Errand) => void }) {
  const who = shortName(errand.claimed?.full_name ?? "");
  const taken = errand.status === "accepted";
  const since = waitedFor(errand, now);
  return (
    <Card id={errand.id} kind="alarm" chosen={chosen} fresh={fresh} onOpen={onOpen} testId="desk-pult-alarm" status={errand.status}>
      <div className="pult-wait-row">
        <span className="pult-alarm-tile" data-live={taken ? undefined : ""}>
          <SceneTile scene="security" size={48} />
        </span>
        <div className="pult-wait-words">
          <p className="pult-alarm-title">{taken ? `Охрана · ${who || "секретарь"} вызывает` : "Охрана · ещё никто не взял"}</p>
          <p className="pult-wait-over">
            {since === "только что" ? "подняли только что" : `подняли ${since} назад`}
            {taken && errand.accepted_at ? ` · взято в ${clockOf(errand.accepted_at, now)}` : " · пуш ушёл секретарям"}
          </p>
        </div>
        {canCancel(errand, meId) ? (
          <div className="pult-wait-moves">
            <Button size="sm" variant="secondary" onClick={() => onCancel(errand)} data-testid="desk-errand-cancel">
              {cancelWord(errand)}
            </Button>
          </div>
        ) : null}
      </div>
      <Track errand={errand} now={now} alarm />
    </Card>
  );
}

/** The secretary's question, answered here and only here (D-99). */
function AskCard({ errand, now, catalogue, main, chosen, fresh, onOpen }: { errand: Errand; now: Date; catalogue: readonly SecretaryAction[]; main: boolean; chosen: boolean; fresh: boolean; onOpen: (id: string) => void }) {
  const link = useErrandLink();
  const busy = link.isPending && link.variables?.id === errand.id;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  const question = errand.question ?? "";
  const choices = choicesOf(question);
  const yesNo = !choices && isYesNo(question);
  const who = shortName(errand.claimed?.full_name ?? "") || "Секретарь";
  const over = [errand.label, errand.note && errand.note !== errand.label ? errand.note : null, `${who} спрашивает`, errand.asked_at ? waitedFor({ created_at: errand.asked_at }, now) : null].filter(Boolean).join(" · ");
  return (
    <Card id={errand.id} kind="ask" chosen={chosen} fresh={fresh} onOpen={onOpen} testId="desk-errands-answer">
      <div className="pult-wait-row">
        <ErrandTile errand={errand} catalogue={catalogue} size={36} />
        <div className="pult-wait-words">
          <p className="pult-wait-over">{over}</p>
          <p className="pult-wait-title [overflow-wrap:anywhere]">«{question}»</p>
        </div>
        <div className="pult-wait-moves">
          {choices
            ? choices.map((choice, index) => (
                <Button key={choice} size="sm" variant={main && index === 0 ? "primary" : "secondary"} disabled={busy} onClick={() => answer(choice)} data-testid="desk-errands-choice">
                  {choice}
                </Button>
              ))
            : null}
          {yesNo ? (
            <>
              <Button size="sm" variant={main ? "primary" : "secondary"} disabled={busy} onClick={() => answer("Да")} data-testid="desk-errands-yes" title="Клавиша Y">
                Да <span className="pult-cap pult-cap-in">Y</span>
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer("Нет")} data-testid="desk-errands-no" title="Клавиша N">
                Нет <span className="pult-cap pult-cap-in">N</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <div className="pult-wait-word">
        <PultField placeholder={choices || yesNo ? "Или своими словами…" : "Ответить своими словами…"} action="Ответить" busy={busy} onSend={answer} label="Ответ секретарю своими словами" testId="desk-errands-answer-field" />
      </div>
    </Card>
  );
}

/** «К вам посетитель» (D-96) in the desk's language: three answers, the first the main one. */
function VisitCard({ visit, now, main, fresh }: { visit: Visit; now: Date; main: boolean; fresh: boolean }) {
  const answer = useAnswerVisit();
  const busy = answer.isPending && answer.variables?.id === visit.id;
  const waiting = visit.status === "waiting";
  const who = shortName(visit.author?.full_name ?? "");
  return (
    <Card id={visit.id} kind="visit" fresh={fresh} testId="visit-ask-card" status={visit.status}>
      <div className="pult-wait-row">
        <span aria-hidden className="pult-wait-tile" data-ink="warn">
          <DoorOpen size={19} strokeWidth={2.25} />
        </span>
        <div className="pult-wait-words">
          <p className="pult-wait-over">
            {waiting ? "К вам посетитель" : "Посетитель ждёт — вы просили подождать"} · {waitedSince(visit.created_at, now)}
            {who ? ` · ${who}` : ""}
          </p>
          <p className="pult-wait-title [overflow-wrap:anywhere]">{visit.note?.trim() || "Без имени"}</p>
        </div>
        <div className="pult-wait-moves">
          <Button size="sm" variant={main ? "primary" : "secondary"} disabled={busy} onClick={() => answer.mutate({ id: visit.id, answer: "invited" })}>
            Пусть заходит
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !waiting} onClick={() => answer.mutate({ id: visit.id, answer: "wait" })}>
            Подождёт
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer.mutate({ id: visit.id, answer: "declined" })}>
            Не приму
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** A message from the secretary (D-116): the words, and «Понятно» takes it off the wall. */
function MessageCard({ visit, now, main, fresh }: { visit: Visit; now: Date; main: boolean; fresh: boolean }) {
  const answer = useAnswerVisit();
  const busy = answer.isPending && answer.variables?.id === visit.id;
  const who = shortName(visit.author?.full_name ?? "");
  return (
    <Card id={visit.id} kind="message" fresh={fresh} testId="message-ask-card" status={visit.status}>
      <div className="pult-wait-row">
        <span aria-hidden className="pult-wait-tile" data-ink="sky">
          <MessageSquareText size={19} strokeWidth={2.25} />
        </span>
        <div className="pult-wait-words">
          <p className="pult-wait-over">
            Сообщение · {waitedSince(visit.created_at, now)}
            {who ? ` · ${who}` : ""}
          </p>
          <p className="pult-wait-title [overflow-wrap:anywhere]">{visit.note?.trim()}</p>
        </div>
        <div className="pult-wait-moves">
          <Button size="sm" variant={main ? "primary" : "secondary"} disabled={busy} onClick={() => answer.mutate({ id: visit.id, answer: "read" })}>
            Понятно
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function WaitList({
  items,
  now,
  meId,
  catalogue,
  openId,
  fresh,
  onOpen,
  onCancel,
}: {
  items: readonly WaitItem[];
  now: Date;
  meId: string;
  catalogue: readonly SecretaryAction[];
  openId: string | null;
  fresh: ReadonlySet<string>;
  onOpen: (id: string) => void;
  onCancel: (errand: Errand) => void;
}) {
  if (items.length === 0) return null;
  // the screen's one white button: the main answer of the first card the director can answer
  const first = items.find((item) => item.kind !== "alarm");
  const main = first ? waitKey(first) : null;
  return (
    <section className="pult-section" data-testid="desk-errands-waits" aria-label="Ждут вас">
      <SectionLabel count={items.length}>Ждут вас</SectionLabel>
      <div className="pult-waits">
        {items.map((item) => {
          const key = waitKey(item);
          const isMain = key === main;
          if (item.kind === "alarm") return <AlarmCard key={key} errand={item.errand} now={now} meId={meId} chosen={openId === key} fresh={fresh.has(key)} onOpen={onOpen} onCancel={onCancel} />;
          if (item.kind === "ask") return <AskCard key={key} errand={item.errand} now={now} catalogue={catalogue} main={isMain} chosen={openId === key} fresh={fresh.has(key)} onOpen={onOpen} />;
          if (item.kind === "visit") return <VisitCard key={key} visit={item.visit} now={now} main={isMain} fresh={fresh.has(key)} />;
          return <MessageCard key={key} visit={item.visit} now={now} main={isMain} fresh={fresh.has(key)} />;
        })}
      </div>
    </section>
  );
}
