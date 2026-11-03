"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useErrandLink } from "@/lib/errands/mutations";
import { STALE_MS } from "@/lib/errands/pending";
import { isActive, type Errand } from "@/lib/errands/queries";
import { isYesNo, QUESTIONS, RESULTS, sceneOf } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";

/** «Будет:» — the promise the phone's card offers once a request is taken (D-99). */
const ETAS = [
  { label: "Сейчас", min: 0 },
  { label: "5 мин", min: 5 },
  { label: "15 мин", min: 15 },
  { label: "30 мин", min: 30 },
];

/** A word field with its button: Enter sends, the button shows once there is a word. */
function WordField({ placeholder, action, busy, onSend }: { placeholder: string; action: string; busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText("");
  };
  return (
    <div className="flex items-center gap-2">
      <input
        className="field h-9 min-w-0 flex-1 px-3 text-[14px] leading-5"
        placeholder={placeholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") send();
        }}
      />
      <Button size="sm" variant="secondary" disabled={!text.trim() || busy} onClick={send}>
        {action}
      </Button>
    </div>
  );
}

/**
 * The secretary's second layer of a request (D-99), the phone's `ErrandCards` in desk controls:
 * once hers — «Будет: сейчас / 5 / 15 / 30 мин»; «Уточнить у директора» — a ready question of the
 * scene or a word of her own; done by her and nothing passed back yet — «Что передать директору?».
 */
export function SecretaryLink({ errand, meId, catalogue }: { errand: Errand; meId: string; catalogue: readonly SecretaryAction[] }) {
  const link = useErrandLink();
  const [asking, setAsking] = useState(false);
  const scene = sceneOf(errand, catalogue);
  const guard = scene === "dnd";
  const alarm = scene === "security";
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  const busy = link.isPending && link.variables?.id === errand.id;

  if (errand.status === "done" && errand.claimed_by === meId && !errand.result) {
    const send = (text: string) => link.mutate({ fn: "errand_result", id: errand.id, text });
    return (
      <section className="flex flex-col gap-2" data-testid="desk-errand-result">
        <p className="text-[14px] font-semibold leading-5">Что передать директору?</p>
        <div className="flex flex-wrap gap-2">
          {RESULTS[scene].map((text) => (
            <Button key={text} size="sm" variant="secondary" disabled={busy} onClick={() => send(text)}>
              {text}
            </Button>
          ))}
        </div>
        <WordField placeholder="Своими словами…" action="Передать" busy={busy} onSend={send} />
      </section>
    );
  }

  if (!isActive(errand) || (errand.status === "accepted" && !taken)) return null;
  const ask = (text: string) => {
    link.mutate({ fn: "errand_ask", id: errand.id, text });
    setAsking(false);
  };

  return (
    <section className="flex flex-col gap-2" data-testid="desk-errand-link">
      {taken && !errand.eta_at && !guard && !alarm ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="desk-errand-eta">
          <span className="text-[13px] leading-4 text-muted">Будет:</span>
          {ETAS.map((option) => (
            <Button key={option.min} size="sm" variant="secondary" disabled={busy} onClick={() => link.mutate({ fn: "errand_eta", id: errand.id, min: option.min })}>
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {/* a question is asked once; after the director's answer another one may go */}
      {!errand.question || errand.answer ? (
        asking ? (
          <div className="flex flex-col gap-2" data-testid="desk-errand-ask">
            <div className="flex flex-wrap gap-2">
              {QUESTIONS[scene].map((text) => (
                <Button key={text} size="sm" variant="secondary" disabled={busy} onClick={() => ask(text)}>
                  {text}
                </Button>
              ))}
            </div>
            <WordField placeholder="Свой вопрос…" action="Спросить" busy={busy} onSend={ask} />
          </div>
        ) : (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setAsking(true)} data-testid="desk-errand-ask-open">
              Уточнить у директора
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}

/**
 * The director's side of the second layer (D-99), as on Пульс's secretary desk: the secretary's
 * question answered here — «Да / Нет» for a yes-or-no one, or a word; a request nobody has taken
 * for a while — «Напомнить ещё раз».
 */
export function DirectorLink({ errand, now }: { errand: Errand; now: Date }) {
  const link = useErrandLink();
  const busy = link.isPending && link.variables?.id === errand.id;
  const asking = Boolean(errand.question && !errand.answer);
  const stale = errand.status === "sent" && now.getTime() - new Date(errand.created_at).getTime() >= STALE_MS;
  const answer = (text: string) => link.mutate({ fn: "errand_answer", id: errand.id, text });
  const who = shortName(errand.claimed?.full_name ?? "");

  if (asking && isActive(errand)) {
    return (
      <section className="flex flex-col gap-2" data-testid="desk-errand-question">
        <p className="text-[14px] leading-5">
          <span className="text-muted">{who || "Секретарь"} спрашивает: </span>
          <span className="font-semibold">{errand.question}</span>
        </p>
        {isYesNo(errand.question ?? "") ? (
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => answer("Да")}>
              Да
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => answer("Нет")}>
              Нет
            </Button>
          </div>
        ) : null}
        <WordField placeholder="Ответить…" action="Ответить" busy={busy} onSend={answer} />
      </section>
    );
  }
  if (errand.question && errand.answer) {
    return (
      <p className="text-[13px] leading-4 text-muted">
        {errand.question} — вы ответили: {errand.answer}
      </p>
    );
  }
  if (stale) {
    return (
      <div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => link.mutate({ fn: "errand_nudge", id: errand.id })} data-testid="desk-errand-nudge">
          Напомнить ещё раз
        </Button>
      </div>
    );
  }
  return null;
}
