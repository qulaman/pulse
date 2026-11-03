"use client";

import { useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { DECLINE_REASONS, useErrandActions } from "@/lib/errands/mutations";
import { isActive, type Errand } from "@/lib/errands/queries";
import { sceneOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

/** The key of a button, inside it: dark on the accent fill, quiet on a plain one. */
function KeyCap({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={`ml-2 inline-flex h-[18px] items-center rounded-[5px] px-1.5 font-display text-[10px] font-bold leading-none ${muted ? "bg-surface-2 text-muted" : "bg-black/20 text-bg/80"}`}
    >
      {children}
    </span>
  );
}

/**
 * The secretary's buttons on a request (D-79, D-99) — the phone's `ErrandCards` transitions,
 * no others: «Принял» and «Не могу» while nobody has it (the reasons in a dialog here, chips
 * on the phone), «Готово» once it is hers. «Не беспокоить» is lifted, not done; the alarm is
 * taken at once and has no «Не могу». Somebody else's request shows no buttons.
 */
export function ErrandActions({
  errand,
  meId,
  catalogue,
  hints = false,
  declineOpen,
  onDeclineOpen,
}: {
  errand: Errand;
  meId: string;
  catalogue: readonly SecretaryAction[];
  /** The request chosen from the keyboard: its buttons show their keys. */
  hints?: boolean;
  /** The reasons' dialog held by the queue (its «N»); without them the card holds it. */
  declineOpen?: boolean;
  onDeclineOpen?: (open: boolean) => void;
}) {
  const transition = useErrandActions();
  const [ownDeclining, setOwnDeclining] = useState(false);
  const declining = declineOpen ?? ownDeclining;
  const setDeclining = onDeclineOpen ?? setOwnDeclining;
  if (!isActive(errand)) return null;

  const scene = sceneOf(errand, catalogue);
  const guard = scene === "dnd";
  const alarm = scene === "security";
  const taken = errand.status === "accepted" && errand.claimed_by === meId;
  const busy = transition.isPending && transition.variables?.id === errand.id;

  if (errand.status === "accepted" && !taken) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="desk-errand-actions">
      {taken ? (
        <Button size="sm" loading={busy} onClick={() => transition.mutate({ id: errand.id, to: "done" })} data-testid="desk-errand-done">
          {guard ? "Снять «не беспокоить»" : alarm ? "Охрана на месте" : "Готово"}
          {hints ? <KeyCap>Enter</KeyCap> : null}
        </Button>
      ) : (
        <>
          <Button size="sm" loading={busy} onClick={() => transition.mutate({ id: errand.id, to: "accepted" })} data-testid="desk-errand-accept">
            {alarm ? "Вызываю охрану" : "Принял"}
            {hints ? <KeyCap>Enter</KeyCap> : null}
          </Button>
          {alarm ? null : (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDeclining(true)} data-testid="desk-errand-decline">
              Не могу
              {hints ? <KeyCap muted>N</KeyCap> : null}
            </Button>
          )}
        </>
      )}

      <Dialog open={declining} onClose={() => setDeclining(false)} title={`Не могу · ${errand.label}`} width="sm">
        <div className="flex flex-col gap-2">
          {DECLINE_REASONS.map((reason, index) => (
            <Button
              key={reason}
              size="sm"
              variant="secondary"
              block
              // the first reason takes the caret: «N», then Enter or Tab — no mouse needed
              data-autofocus={index === 0 ? "" : undefined}
              onClick={() => {
                setDeclining(false);
                transition.mutate({ id: errand.id, to: "declined", reason });
              }}
            >
              {reason}
            </Button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
