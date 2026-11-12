"use client";

import { BellRing, CircleHelp, Heart } from "lucide-react";

import { TONE_VAR } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { humanAqtobe } from "@/lib/ai/time";
import { useThankErrand } from "@/lib/errands/mutations";
import { isActive, useErrandReceipt, waitedFor, type Errand } from "@/lib/errands/queries";
import { atLine, etaLeftMin, etaLine, sceneOf, untilLine } from "@/lib/errands/scene";
import { shortName, useNamesKey } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { receiptLine } from "@/lib/tasks/receipts";

import { CancelErrandButton } from "./cancel";
import { ErrandActions } from "./ErrandActions";
import { DirectorLink, SecretaryLink } from "./ErrandLink";
import { AlarmGlyph, ErrandTile, PersonFace } from "./look";
import { STATUS_TONE, STATUS_WORD, canCancel, canThank } from "./words";

/** The request itself: its scene's tile, what, by when, the note; who asked and how long ago; the question and its answer. */
function ErrandBody({ errand, now, catalogue }: { errand: Errand; now: Date; catalogue: readonly SecretaryAction[] }) {
  // a namesake gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const alarm = sceneOf(errand, catalogue) === "security";
  const late = Boolean(errand.due_at) && isActive(errand) && new Date(errand.due_at as string) < now;
  return (
    <div className="flex items-start gap-3.5">
      {alarm && isActive(errand) ? (
        <span aria-hidden className="errands-tile errands-alarm-tile" style={{ width: 44, height: 44 }}>
          <AlarmGlyph size={22} />
        </span>
      ) : (
        <ErrandTile errand={errand} catalogue={catalogue} size={44} muted={errand.status === "cancelled"} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-4 text-muted">
          {shortName(errand.author?.full_name ?? "Директор")} · {isActive(errand) ? waitedFor(errand, now) : humanAqtobe(new Date(errand.created_at), now)}
          {errand.until_at ? ` · ${untilLine(errand.until_at)}` : ""}
        </p>
        <p className="desk-figure mt-0.5 text-[22px] leading-7 [overflow-wrap:anywhere]" style={alarm ? { color: "var(--danger)" } : undefined}>
          {alarm && isActive(errand) ? "Вызови охрану!" : errand.label}
          {/* «к 18:00» (D-106 §8): the time it is needed by, beside the request itself */}
          {!alarm && errand.due_at ? (
            <span className="text-[15px] font-medium" data-testid="errand-due">
              {" · "}
              <When overdue={late}>{atLine(errand.due_at, now)}</When>
            </span>
          ) : null}
        </p>
        {errand.note ? <p className="mt-0.5 text-[14px] leading-5 text-muted">{errand.note}</p> : null}
        <p className="mt-2">
          <span className="errands-status" data-status={errand.status} style={{ color: TONE_VAR[STATUS_TONE[errand.status]] }}>
            {STATUS_WORD[errand.status]}
          </span>
          {errand.decline_reason ? <span className="text-[13px] text-muted"> · {errand.decline_reason}</span> : null}
        </p>
      </div>
    </div>
  );
}

/** «Спасибо» — a reaction, not a state; the RPC keeps the first one (D-97). */
export function ThankButton({ errand }: { errand: Errand }) {
  const thank = useThankErrand();
  return (
    <button type="button" className="errands-thank desk-focus" disabled={thank.isPending} onClick={() => thank.mutate(errand.id)} data-testid="desk-errand-thank">
      <Heart size={13} strokeWidth={2.25} aria-hidden />
      Спасибо
    </button>
  );
}

/** The push to the secretaries and what became of it (принцип 8): «увидел 09:14», «не открывал с 09:14». */
function Receipt({ errand, now }: { errand: Errand; now: Date }) {
  const receipt = useErrandReceipt(errand.id, isActive(errand));
  const line = receiptLine(receipt.data, now);
  if (!line) return null;
  return (
    <p className="errands-receipt" data-tone={line.tone}>
      <BellRing size={14} strokeWidth={2.25} aria-hidden />
      <span>Секретарю: {line.text}</span>
    </p>
  );
}

type Step = { key: string; word: string; at: string | null; who?: { id: string | null; name: string } | null; note?: string | null; state: "done" | "now" | "next" | "off" };

/** The request's way as steps: asked, taken, done — or where it stopped (declined, cancelled). */
function stepsOf(errand: Errand, now: Date): Step[] {
  const author = { id: errand.author_id, name: errand.author?.full_name ?? "Директор" };
  const taker = errand.claimed_by ? { id: errand.claimed_by, name: errand.claimed?.full_name ?? "Секретарь" } : null;
  const asked: Step = { key: "asked", word: "Попросили", at: errand.created_at, who: author, state: "done" };
  if (errand.status === "declined") {
    return [asked, { key: "declined", word: "Не смогли", at: errand.updated_at, who: taker, note: errand.decline_reason, state: "off" }];
  }
  if (errand.status === "cancelled") {
    return [asked, ...(errand.accepted_at ? [{ key: "taken", word: "Взяли", at: errand.accepted_at, who: taker, state: "done" as const }] : []), { key: "cancelled", word: "Отменили", at: errand.updated_at, state: "off" }];
  }
  const eta = etaLine(etaLeftMin(errand, now));
  return [
    asked,
    errand.status === "sent"
      ? { key: "taken", word: "Взяли", at: null, note: "ещё никто не взял", state: "now" }
      : { key: "taken", word: "Взяли", at: errand.accepted_at, who: taker, state: "done" },
    errand.status === "done"
      ? { key: "done", word: "Готово", at: errand.done_at, note: errand.result ? `передали: «${errand.result}»` : null, state: "done" }
      : { key: "done", word: "Готово", at: null, note: errand.status === "accepted" ? (eta ?? "в работе") : null, state: errand.status === "accepted" ? "now" : "next" },
  ];
}

/** The way of a request as a vertical line of steps, each with its time and whose hand. */
function Steps({ errand, now }: { errand: Errand; now: Date }) {
  const steps = stepsOf(errand, now);
  return (
    <ol className="errands-steps" aria-label="Как шла заявка">
      {steps.map((step, index) => (
        <li key={step.key} data-state={step.state} style={{ animationDelay: `${index * 60}ms` }}>
          <span aria-hidden className="errands-step-dot" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-medium leading-5">{step.word}</span>
              {step.at ? <When className="nums shrink-0 text-[12px] text-muted">{humanAqtobe(new Date(step.at), now)}</When> : null}
            </span>
            {step.who || step.note ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted">
                {step.who ? (
                  <>
                    <PersonFace id={step.who.id} name={step.who.name} size={16} />
                    <span className="truncate">{shortName(step.who.name)}</span>
                  </>
                ) : null}
                {step.who && step.note ? " · " : null}
                {step.note ? <span className="min-w-0 truncate">{step.note}</span> : null}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * A request in the right-hand panel (`?e=`, where a push leads; D-174): what it is, its way as
 * steps — asked, taken, done, each with its time and whose hand, the promise and what was passed
 * back — the push's receipt, and the viewer's own moves: the secretary's buttons, the director's
 * «спасибо», «Отменить» for the one who asked.
 */
export function ErrandDetails({
  errand,
  viewer,
  meId,
  now,
  catalogue,
  pointsOn,
}: {
  errand: Errand;
  viewer: "director" | "secretary";
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  pointsOn: boolean;
}) {
  return (
    <div className="errands-details flex flex-col gap-5 pr-8" data-testid="desk-errand-details">
      <ErrandBody errand={errand} now={now} catalogue={catalogue} />
      {/* the director's side answers the question itself (DirectorLink); the secretary reads it here */}
      {viewer === "secretary" && errand.question ? (
        <p className="errands-qa">
          <CircleHelp size={14} strokeWidth={2.25} aria-hidden />
          <span className="min-w-0">
            <span className="text-muted">{errand.question} — </span>
            {errand.answer ? <span className="font-semibold">директор: {errand.answer}</span> : <span className="text-muted">ждём ответа</span>}
          </span>
        </p>
      ) : null}
      <Steps errand={errand} now={now} />
      {viewer === "director" ? <DirectorLink errand={errand} now={now} /> : null}
      {viewer === "director" ? <Receipt errand={errand} now={now} /> : null}
      {canCancel(errand, meId) ? <CancelErrandButton errand={errand} /> : null}
      {viewer === "secretary" ? (
        <>
          <ErrandActions errand={errand} meId={meId} catalogue={catalogue} />
          <SecretaryLink errand={errand} meId={meId} catalogue={catalogue} />
        </>
      ) : canThank(errand, now, pointsOn) ? (
        <div>
          <ThankButton errand={errand} />
        </div>
      ) : errand.thanked_at ? (
        <p className="errands-thanked">
          <Heart size={13} strokeWidth={2.25} aria-hidden />
          Спасибо отправлено
        </p>
      ) : null}
    </div>
  );
}
