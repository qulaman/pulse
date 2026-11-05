"use client";

import type { ReactNode } from "react";

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
import { STATUS_TONE, STATUS_WORD, canCancel, canThank } from "./words";

/** The request itself: who asked and how long ago, what, by when, the note, the question and its answer. */
function ErrandBody({ errand, now, catalogue, big = false }: { errand: Errand; now: Date; catalogue: readonly SecretaryAction[]; big?: boolean }) {
  // a namesake gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const alarm = sceneOf(errand, catalogue) === "security";
  const eta = errand.claimed_by ? etaLine(etaLeftMin(errand, now)) : null;
  const late = Boolean(errand.due_at) && isActive(errand) && new Date(errand.due_at as string) < now;
  return (
    <>
      <p className="text-[12px] leading-4 text-muted">
        {shortName(errand.author?.full_name ?? "Директор")} · {isActive(errand) ? waitedFor(errand, now) : humanAqtobe(new Date(errand.created_at), now)}
        {errand.until_at ? ` · ${untilLine(errand.until_at)}` : ""}
      </p>
      <p className={`mt-0.5 ${big ? "desk-figure text-[22px] leading-7" : "text-[16px] font-semibold leading-[22px]"}`} style={alarm ? { color: "var(--danger)" } : undefined}>
        {alarm && isActive(errand) ? "Вызови охрану!" : errand.label}
        {/* «к 18:00» (D-106 §8): the time it is needed by, beside the request itself */}
        {!alarm && errand.due_at ? (
          <span className="text-[15px]" data-testid="errand-due">
            {" · "}
            <When overdue={late}>{atLine(errand.due_at, now)}</When>
          </span>
        ) : null}
      </p>
      {errand.note ? <p className="mt-0.5 text-[14px] leading-5 text-muted">{errand.note}</p> : null}
      {eta && errand.status === "accepted" ? <p className="mt-0.5 text-[12px] leading-4 text-muted">Обещано: {eta}</p> : null}
      {errand.question ? (
        <p className="mt-1 text-[13px] leading-[18px]">
          <span className="text-muted">{errand.question} — </span>
          {errand.answer ? (
            <span className="font-semibold">Директор: {errand.answer}</span>
          ) : (
            <span className="text-muted">ждём ответа</span>
          )}
        </p>
      ) : null}
    </>
  );
}

/** «Спасибо ♥» — a reaction, not a state; the RPC keeps the first one (D-97). */
export function ThankButton({ errand }: { errand: Errand }) {
  const thank = useThankErrand();
  return (
    <button
      type="button"
      className="text-[13px] leading-4 text-muted hover:text-text disabled:opacity-40"
      disabled={thank.isPending}
      onClick={() => thank.mutate(errand.id)}
      data-testid="desk-errand-thank"
    >
      Спасибо ♥
    </button>
  );
}

/** The push to the secretaries and what became of it (принцип 8): «увидел 09:14», «не открывал с 09:14». */
function Receipt({ errand, now }: { errand: Errand; now: Date }) {
  const receipt = useErrandReceipt(errand.id, isActive(errand));
  const line = receiptLine(receipt.data, now);
  if (!line) return null;
  return (
    <p className={`text-[13px] leading-4 ${line.tone === "muted" ? "text-muted" : ""}`}>Секретарю: {line.text}</p>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-baseline gap-3 py-[7px]">
      <dt className="w-28 shrink-0 text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-5">{children}</dd>
    </div>
  );
}

/**
 * A request in the right-hand panel (`?e=`, where a push leads): everything about it — its
 * state, who took it, the reason, what was passed back — and the viewer's own actions: the
 * secretary's buttons, the director's «спасибо», «Отменить» for the one who asked.
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
  const who = shortName(errand.claimed?.full_name ?? "");
  return (
    <div className="flex flex-col gap-4 pr-8" data-testid="desk-errand-details">
      <div>
        <ErrandBody errand={errand} now={now} catalogue={catalogue} big />
      </div>
      <dl className="desk-list">
        <Fact label="Статус">
          <span style={{ color: TONE_VAR[STATUS_TONE[errand.status]] }}>{STATUS_WORD[errand.status]}</span>
          {who ? ` · ${who}` : ""}
          {errand.decline_reason ? ` · ${errand.decline_reason}` : ""}
        </Fact>
        <Fact label="Попросили">
          <When>{humanAqtobe(new Date(errand.created_at), now)}</When>
        </Fact>
        {errand.accepted_at ? (
          <Fact label="Взяли">
            <When>{humanAqtobe(new Date(errand.accepted_at), now)}</When>
          </Fact>
        ) : null}
        {errand.done_at ? (
          <Fact label="Готово">
            <When>{humanAqtobe(new Date(errand.done_at), now)}</When>
          </Fact>
        ) : null}
        {errand.result ? <Fact label="Передали">{errand.result}</Fact> : null}
      </dl>
      {viewer === "director" ? <DirectorLink errand={errand} now={now} /> : null}
      {viewer === "director" ? <Receipt errand={errand} now={now} /> : null}
      {canCancel(errand, meId) ? <CancelErrandButton errand={errand} /> : null}
      {viewer === "secretary" ? (
        <>
          <ErrandActions errand={errand} meId={meId} catalogue={catalogue} />
          <SecretaryLink errand={errand} meId={meId} catalogue={catalogue} />
        </>
      ) : canThank(errand, now, pointsOn) ? (
        <ThankButton errand={errand} />
      ) : errand.thanked_at ? (
        <p className="text-[13px] leading-4 text-muted">Спасибо отправлено ♥</p>
      ) : null}
    </div>
  );
}
