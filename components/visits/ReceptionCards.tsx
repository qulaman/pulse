"use client";

import { Button } from "@/components/ui/Button";
import { useCloseVisit } from "@/lib/visits/mutations";
import type { Visit } from "@/lib/visits/queries";
import { closeLabel, isMessage, reception, statusLine, statusTone, waitedSince, wallLine, type VisitTone } from "@/lib/visits/text";

const TONE: Record<VisitTone, string> = {
  accent: "var(--accent)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

/**
 * Посетители и сообщения на экран глазами секретаря (D-96, D-116): карточка на каждого, кто
 * ещё не убран. Сверху — что ответил директор («Директор прочитал» — у сообщения), под ним
 * квитанция стены («На экране у директора»), одна кнопка — «Отменить», пока не решено,
 * «Готово», когда вошёл, «Понятно» — иначе. Ответ приходит по Realtime, карточка меняется
 * без перезагрузки.
 */
export function ReceptionCards({ visits, now }: { visits: readonly Visit[]; now: Date }) {
  const close = useCloseVisit();
  const live = reception(visits);
  if (live.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="reception-cards">
      {live.map((visit) => {
        const tone = TONE[statusTone(visit)];
        const wall = wallLine(visit);
        return (
          <article
            key={visit.id}
            className="card-in relative overflow-hidden card px-4 py-3"
            data-testid="visit-card"
            data-kind={visit.kind}
            data-status={visit.status}
          >
            <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: tone }} />
            <p className="pl-2 text-[13px] leading-4 text-muted">
              {isMessage(visit) ? "Сообщение на экран" : "Посетитель"} · {waitedSince(visit.created_at, now)}
            </p>
            <p className="mt-0.5 pl-2 text-[17px] font-semibold leading-[22px] [overflow-wrap:anywhere]">
              {visit.note?.trim() || "Без имени"}
            </p>
            <p className="mt-1 pl-2 text-[15px] font-semibold leading-5" style={{ color: tone }}>
              {statusLine(visit)}
            </p>
            {wall ? <p className="mt-0.5 pl-2 text-[13px] leading-4 text-muted">{wall}</p> : null}
            <div className="mt-3">
              <Button
                block
                variant={visit.status === "invited" ? "primary" : "secondary"}
                disabled={close.isPending && close.variables === visit.id}
                onClick={() => close.mutate(visit.id)}
              >
                {closeLabel(visit)}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
