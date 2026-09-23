"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DECLINE_REASONS, useErrandActions } from "@/lib/errands/mutations";
import { isActive, waitedFor, type Errand } from "@/lib/errands/queries";
import { sceneOf } from "@/lib/errands/scene";
import { firstNameOf } from "@/lib/text/normalize";

/**
 * Заявки глазами секретаря (D-79): стопка карточек, у каждой две кнопки — «Принял»
 * и «Не могу» (причины чипами), после принятия одна — «Готово». Чужая принятая
 * заявка гаснет по Realtime сама, поэтому список не прячет ничего руками.
 */
export function ErrandCards({ errands, meId, now }: { errands: readonly Errand[]; meId: string; now: Date }) {
  const mine = errands.filter((e) => isActive(e) && (e.status === "sent" || e.claimed_by === meId));

  if (mine.length === 0) {
    return <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Заявок нет. Появится — разбужу.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="errand-cards">
      {mine.map((errand) => (
        <ErrandCard key={errand.id} errand={errand} meId={meId} now={now} />
      ))}
    </div>
  );
}

function ErrandCard({ errand, meId, now }: { errand: Errand; meId: string; now: Date }) {
  const transition = useErrandActions();
  const [reasons, setReasons] = useState(false);
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  // «не беспокоить» is a state of the director's door, not a job: it is lifted, not done (D-87)
  const guard = sceneOf(errand) === "dnd";

  return (
    <article className="relative overflow-hidden card px-4 py-3" data-testid="errand-card" data-status={errand.status}>
      <span
        aria-hidden
        className="absolute inset-y-3 left-0 w-[3px] rounded-r-full"
        style={{ background: taken ? "var(--ok)" : "var(--accent)" }}
      />
      <p className="pl-2 text-[13px] leading-4 text-muted">
        {firstNameOf(errand.author?.full_name ?? "Директор")} · {waitedFor(errand, now)}
      </p>
      <p className="mt-0.5 pl-2 text-[17px] font-semibold leading-[22px]">{errand.label}</p>
      {errand.note ? <p className="mt-0.5 pl-2 text-[15px] leading-5 text-muted">{errand.note}</p> : null}

      {taken ? (
        <div className="mt-3">
          <Button block loading={transition.isPending} onClick={() => transition.mutate({ id: errand.id, to: "done" })}>
            {guard ? "Снять «не беспокоить»" : "Готово"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            loading={transition.isPending}
            onClick={() => transition.mutate({ id: errand.id, to: "accepted" })}
          >
            Принял
          </Button>
          <Button variant="secondary" disabled={transition.isPending} onClick={() => setReasons((v) => !v)}>
            Не могу
          </Button>
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
    </article>
  );
}
