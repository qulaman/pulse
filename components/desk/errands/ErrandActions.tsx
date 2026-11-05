"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useErrandActions } from "@/lib/errands/mutations";
import { isActive, type Errand } from "@/lib/errands/queries";
import { sceneOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

import { ReasonMenu } from "./Queue";

/**
 * The secretary's buttons on a request in the panel (D-79, D-99) — the phone's `ErrandCards`
 * transitions, no others: «Принял» and «Не могу» while nobody has it (the reasons as a menu
 * under the button, 1–3), «Готово» once it is hers. «Не беспокоить» is lifted, not done; the
 * alarm is taken at once and has no «Не могу». Somebody else's request shows no buttons.
 */
export function ErrandActions({ errand, meId, catalogue }: { errand: Errand; meId: string; catalogue: readonly SecretaryAction[] }) {
  const transition = useErrandActions();
  const [declineAt, setDeclineAt] = useState<HTMLElement | null>(null);
  if (!isActive(errand)) return null;

  const scene = sceneOf(errand, catalogue);
  const guard = scene === "dnd";
  const alarm = scene === "security";
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  const busy = transition.isPending && transition.variables?.id === errand.id;

  if (errand.status === "accepted" && !taken) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="desk-errand-panel-actions">
      {taken ? (
        <Button size="sm" variant="secondary" className="desk-move" loading={busy} onClick={() => transition.mutate({ id: errand.id, to: "done" })}>
          {guard ? "Снять «не беспокоить»" : alarm ? "Охрана на месте" : "Готово"}
        </Button>
      ) : (
        <>
          <Button size="sm" variant="secondary" className="desk-move" loading={busy} onClick={() => transition.mutate({ id: errand.id, to: "accepted" })}>
            {alarm ? "Вызываю охрану" : "Принял"}
          </Button>
          {alarm ? null : (
            <Button size="sm" variant="secondary" disabled={busy} onClick={(event) => setDeclineAt(event.currentTarget)}>
              Не могу
            </Button>
          )}
        </>
      )}
      <ReasonMenu anchor={declineAt} onClose={() => setDeclineAt(null)} onPick={(reason) => transition.mutate({ id: errand.id, to: "declined", reason })} />
    </div>
  );
}
