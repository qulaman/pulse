"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DECLINE_REASONS, useErrandActions, useErrandLink } from "@/lib/errands/mutations";
import { isActive, waitedFor, type Errand } from "@/lib/errands/queries";
import { etaLeftMin, etaLine, QUESTIONS, RESULTS, sceneOf, untilLine, type DeskScene } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { firstNameOf } from "@/lib/text/normalize";

/** «Принял · через …»: the promise, one tap, optional (D-99). */
const ETAS = [
  { label: "Сейчас", min: 0 },
  { label: "5 мин", min: 5 },
  { label: "15 мин", min: 15 },
  { label: "30 мин", min: 30 },
];

/**
 * Заявки глазами секретаря (D-79): стопка карточек, у каждой две кнопки — «Принял»
 * и «Не могу» (причины чипами), после принятия одна — «Готово». Чужая принятая
 * заявка гаснет по Realtime сама, поэтому список не прячет ничего руками.
 * Второй слой (D-99): «Уточнить» — вопрос директору чипами, после «Принял» — «через 5 мин»,
 * ответ директора — прямо на карточке; тревога («Охрана») — красная, «Вызываю охрану».
 */
export function ErrandCards({
  errands,
  meId,
  now,
  catalogue = [],
}: {
  errands: readonly Errand[];
  meId: string;
  now: Date;
  catalogue?: readonly SecretaryAction[];
}) {
  const mine = errands.filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId));

  if (mine.length === 0) {
    return <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Заявок нет. Появится — разбужу.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="errand-cards">
      {mine.map((errand) => (
        <ErrandCard key={errand.id} errand={errand} meId={meId} now={now} scene={sceneOf(errand, catalogue)} />
      ))}
    </div>
  );
}

function ErrandCard({ errand, meId, now, scene }: { errand: Errand; meId: string; now: Date; scene: DeskScene }) {
  const transition = useErrandActions();
  const link = useErrandLink();
  const [reasons, setReasons] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  // «не беспокоить» is a state of the director's door, not a job: it is lifted, not done (D-87)
  const guard = scene === "dnd";
  const alarm = scene === "security";
  const eta = etaLine(etaLeftMin(errand, now));
  const ask = (text: string) => {
    link.mutate({ fn: "errand_ask", id: errand.id, text });
    setAsking(false);
    setQuestion("");
  };

  return (
    <article
      className="relative overflow-hidden card px-4 py-3"
      style={alarm ? { borderColor: "color-mix(in srgb, var(--danger) 65%, var(--border))", background: "color-mix(in srgb, var(--danger) 10%, var(--surface))" } : undefined}
      data-testid="errand-card"
      data-status={errand.status}
      data-alarm={alarm ? "1" : undefined}
    >
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ background: alarm ? "var(--danger)" : taken ? "var(--ok)" : "var(--accent)" }}
      />
      <p className="pl-2 text-[13px] leading-4 text-muted">
        {firstNameOf(errand.author?.full_name ?? "Директор")} · {waitedFor(errand, now)}
        {errand.until_at ? ` · ${untilLine(errand.until_at)}` : ""}
      </p>
      <p className="mt-0.5 pl-2 text-[17px] font-semibold leading-[22px]" style={alarm ? { color: "var(--danger)" } : undefined}>
        {alarm ? "Вызови охрану!" : errand.label}
      </p>
      {errand.note ? <p className="mt-0.5 pl-2 text-[15px] leading-5 text-muted">{errand.note}</p> : null}
      {taken && eta ? <p className="mt-0.5 pl-2 text-[13px] leading-4 text-muted">Обещано: {eta}</p> : null}

      {/* the question to the director and the answer, right on the card (D-99) */}
      {errand.question ? (
        <p className="mt-1.5 pl-2 text-[14px] leading-[18px]" data-testid="errand-answer">
          <span className="text-muted">{errand.question} — </span>
          {errand.answer ? (
            <span className="font-semibold" style={{ color: "var(--ok)" }}>
              Директор: {errand.answer}
            </span>
          ) : (
            <span className="text-muted">ждём ответа</span>
          )}
        </p>
      ) : null}

      {taken ? (
        <div className="mt-3 flex flex-col gap-2">
          {!errand.eta_at && !guard && !alarm ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="errand-eta">
              <span className="text-[13px] leading-4 text-muted">Будет:</span>
              {ETAS.map((option) => (
                <Chip key={option.min} disabled={link.isPending} onClick={() => link.mutate({ fn: "errand_eta", id: errand.id, min: option.min })}>
                  {option.label}
                </Chip>
              ))}
            </div>
          ) : null}
          <Button block loading={transition.isPending} onClick={() => transition.mutate({ id: errand.id, to: "done" })}>
            {guard ? "Снять «не беспокоить»" : alarm ? "Охрана на месте" : "Готово"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            loading={transition.isPending}
            onClick={() => transition.mutate({ id: errand.id, to: "accepted" })}
            className={alarm ? "col-span-2" : ""}
          >
            {alarm ? "Вызываю охрану" : "Принял"}
          </Button>
          {alarm ? null : (
            <Button variant="secondary" disabled={transition.isPending} onClick={() => setReasons((v) => !v)}>
              Не могу
            </Button>
          )}
        </div>
      )}

      {reasons && !taken ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {DECLINE_REASONS.map((reason) => (
            <Chip
              key={reason}
              tone="warn"
              onClick={() => {
                setReasons(false);
                transition.mutate({ id: errand.id, to: "declined", reason });
              }}
            >
              {reason}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* «Уточнить» — the second layer: a ready question in one tap, or a word of one's own */}
      {!errand.question || errand.answer ? (
        asking ? (
          <div className="mt-2 flex flex-col gap-2" data-testid="errand-ask">
            <div className="flex flex-wrap gap-2">
              {QUESTIONS[scene].map((text) => (
                <Chip key={text} disabled={link.isPending} onClick={() => ask(text)}>
                  {text}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="min-h-[40px] min-w-0 flex-1 field px-3 text-[15px] leading-5 outline-none focus:border-accent"
                placeholder="Свой вопрос…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && question.trim()) ask(question.trim());
                }}
              />
              {question.trim() ? (
                <button type="button" className="min-h-[40px] text-[14px] font-semibold text-accent" onClick={() => ask(question.trim())}>
                  Спросить
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button type="button" className="mt-1 min-h-[36px] pl-2 text-[13px] font-semibold text-muted" onClick={() => setAsking(true)} data-testid="errand-ask-open">
            Уточнить у директора
          </button>
        )
      ) : null}
    </article>
  );
}

/**
 * Just closed by this secretary (D-99): what to pass back to the director — «Врач будет в
 * 15:00», «Такси у входа». A chip or a word; «Не нужно» puts the card away.
 */
export function ResultCard({ errand, scene, onSkip }: { errand: Errand; scene: DeskScene; onSkip: () => void }) {
  const link = useErrandLink();
  const [text, setText] = useState("");
  const send = (value: string) => link.mutate({ fn: "errand_result", id: errand.id, text: value });
  return (
    <article className="card-in card px-4 py-3" data-testid="result-card">
      <p className="text-[13px] leading-4 text-muted">Готово · {errand.label}</p>
      <p className="mt-0.5 text-[16px] font-semibold leading-[22px]">Что передать директору?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {RESULTS[scene].map((option) => (
          <Chip key={option} disabled={link.isPending} onClick={() => send(option)}>
            {option}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="min-h-[40px] min-w-0 flex-1 field px-3 text-[15px] leading-5 outline-none focus:border-accent"
          placeholder="Врач будет в 15:00…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) send(text.trim());
          }}
        />
        {text.trim() ? (
          <button type="button" className="min-h-[40px] text-[14px] font-semibold text-accent" onClick={() => send(text.trim())}>
            Передать
          </button>
        ) : (
          <button type="button" className="min-h-[40px] text-[14px] text-muted" onClick={onSkip}>
            Не нужно
          </button>
        )}
      </div>
    </article>
  );
}
