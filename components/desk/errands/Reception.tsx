"use client";

import { DoorOpen } from "lucide-react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { useCloseVisit } from "@/lib/visits/mutations";
import type { Visit } from "@/lib/visits/queries";
import { closeLabel, isMessage, reception, statusLine, statusTone, waitedSince, wallLine, type VisitTone } from "@/lib/visits/text";

/** A visit's state as an ink: not answered yet — fresh blue; «подождать» — amber; let in, read — green. */
const INK: Record<VisitTone, string> = {
  accent: "var(--sky, var(--accent))",
  warn: "var(--warn-ink, var(--warn))",
  ok: "var(--ok-ink, var(--ok))",
  muted: "var(--ink-3, var(--text-muted))",
};
/** The same ink for words: a deeper one where the light sheet needs it. */
const WORD: Record<VisitTone, string> = {
  accent: "var(--sky, var(--accent))",
  warn: "var(--warn-deep, var(--warn-ink, var(--warn)))",
  ok: "var(--ok-deep, var(--ok-ink, var(--ok)))",
  muted: "var(--ink-2, var(--text-muted))",
};

/**
 * «Приёмная» on «Стойка» (D-96, D-116, D-175): who waits at her desk for the director's answer and
 * the messages she put on his wall — one line each, the director's answer in its ink as it comes
 * (Realtime), the wall's receipt (principle 8), one word on the right: «Отменить» while nothing is
 * decided, «Готово» once he lets the visitor in, «Понятно» otherwise. The desk's words for the
 * phone's `ReceptionCards`.
 */
export function ReceptionCard({ visits, now, loading = false }: { visits: readonly Visit[]; now: Date; loading?: boolean }) {
  const close = useCloseVisit();
  const live = loading ? [] : reception(visits);
  return (
    <section className="stoika-card stoika-reception" data-testid="stoika-reception" aria-label="Приёмная">
      <header className="stoika-card-head">
        <DoorOpen size={15} strokeWidth={2.25} aria-hidden className="text-muted" />
        <h2>Приёмная</h2>
        {!loading && live.length > 0 ? <span className="nums text-muted">{live.length}</span> : null}
      </header>
      {loading ? (
        <SkeletonGroup>
          <Bone h={18} w="60%" />
        </SkeletonGroup>
      ) : live.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-muted">Никого нет</p>
      ) : (
        <ul className="stoika-visits">
          {live.map((visit) => {
            const tone = statusTone(visit);
            const wall = wallLine(visit);
            const label = closeLabel(visit);
            const pending = visit.status === "waiting" || visit.status === "wait";
            return (
              <li key={visit.id} className="stoika-visit" style={{ "--tone": INK[tone] } as CSSProperties} data-testid="stoika-visit" data-kind={visit.kind} data-status={visit.status}>
                <span aria-hidden className="stoika-visit-dot" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{visit.note?.trim() || "Без имени"}</p>
                  <p className="nums text-[12px] leading-4 text-muted">
                    {isMessage(visit) ? "сообщение на экран" : "посетитель"} · {waitedSince(visit.created_at, now)}
                    {wall ? ` · ${wall.charAt(0).toLowerCase()}${wall.slice(1)}` : ""}
                  </p>
                  <p className="mt-0.5 text-[13px] font-medium leading-[18px]" style={{ color: WORD[tone] }}>
                    {statusLine(visit)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={pending ? "ghost" : "secondary"}
                  className="!min-h-8 shrink-0"
                  disabled={close.isPending && close.variables === visit.id}
                  onClick={() => close.mutate(visit.id)}
                  data-testid="stoika-visit-close"
                >
                  {label}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
