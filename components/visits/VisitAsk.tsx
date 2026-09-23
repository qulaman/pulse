"use client";

import { Button } from "@/components/ui/Button";
import { useAnswerVisit } from "@/lib/visits/mutations";
import type { Visit, VisitAnswer } from "@/lib/visits/queries";
import { awaitingDirector, waitedSince } from "@/lib/visits/text";
import { firstNameOf } from "@/lib/text/normalize";

/**
 * «К вам посетитель» на Пульсе директора (D-96): человек у стола секретаря ждёт ответа —
 * три кнопки, как три кнопки сотрудника (принцип 2): «Пусть заходит» / «Подождёт» /
 * «Не приму». После «Подождёт» карточка остаётся тише — человек всё ещё там, и решить
 * можно позже. Одно нажатие — ответ секретарю пушем и надпись на стене меняется.
 */
export const ANSWERS: { value: VisitAnswer; label: string }[] = [
  { value: "invited", label: "Пусть заходит" },
  { value: "wait", label: "Подождёт" },
  { value: "declined", label: "Не приму" },
];

export function VisitAsk({ visits, now }: { visits: readonly Visit[]; now: Date }) {
  const answer = useAnswerVisit();
  const open = awaitingDirector(visits);
  if (open.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="visit-ask">
      {open.map((visit) => {
        const waiting = visit.status === "waiting";
        const busy = answer.isPending && answer.variables?.id === visit.id;
        const who = firstNameOf(visit.author?.full_name ?? "");
        return (
          <article
            key={visit.id}
            className="card-in relative overflow-hidden rounded-[20px] border px-4 py-3"
            style={{
              borderColor: waiting ? "color-mix(in srgb, var(--accent) 55%, var(--border))" : "var(--border)",
              background: waiting ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
            }}
            data-testid="visit-ask-card"
            data-status={visit.status}
          >
            <p className="text-[13px] leading-4 text-muted">
              {waiting ? "К вам посетитель" : "Посетитель ждёт"} · {waitedSince(visit.created_at, now)}
              {who ? ` · ${who}` : ""}
            </p>
            <p className="mt-0.5 text-[17px] font-semibold leading-[22px]">{visit.note?.trim() || "Без имени"}</p>
            {/* the main answer across the card, the two others under it: one thumb, no wrapped labels */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {ANSWERS.map((option) => (
                <Button
                  key={option.value}
                  variant={option.value === "invited" ? "primary" : "secondary"}
                  disabled={busy || (option.value === "wait" && !waiting)}
                  onClick={() => answer.mutate({ id: visit.id, answer: option.value })}
                  className={option.value === "invited" ? "col-span-2" : ""}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}
