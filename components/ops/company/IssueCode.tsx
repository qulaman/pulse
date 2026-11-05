"use client";

import { useRef, useState } from "react";

import { ActionDialog } from "@/components/ops/ActionDialog";
import { CodeDialog } from "@/components/ops/company/CodeShow";
import { useOnce } from "@/components/ops/company/shared";
import { toast } from "@/components/ui/Toast";
import { newRequestId } from "@/lib/ops/client";
import { useIssueCode, useRevokeSessions } from "@/lib/ops/company-queries";
import type { CardPerson, IssuedCode } from "@/lib/ops/contract";
import { pluralRu } from "@/lib/tasks/status-text";

export type CodePerson = Pick<CardPerson, "id" | "full_name" | "role" | "sessions" | "devices" | "is_active">;

/**
 * A new sign-in code from one place: the people's menu, the director's row, the card's head. The
 * dialog that asks why, then the code itself. A lost phone stays signed in until told otherwise, so
 * closing every sign-in is one tick here. It goes first: closing cancels the codes still unused,
 * this one included if it came first. Each write has its own id of this attempt, so a repeat after
 * a failure closes nothing twice.
 */
export function IssueCode({ companyId, person, onClose }: { companyId: string; person: CodePerson; onClose: () => void }) {
  const issueId = useOnce(newRequestId);
  const revokeId = useOnce(newRequestId);
  const issue = useIssueCode();
  const revoke = useRevokeSessions();
  const [lost, setLost] = useState(false);
  const [login, setLogin] = useState<IssuedCode | null>(null);
  // the action dialog closes itself after its submit, and the code must outlive that
  const issued = useRef(false);

  if (login) return <CodeDialog login={login} tv={person.role === "tv"} onClose={onClose} />;

  const signedIn = person.sessions + person.devices > 0 && person.role !== "tv";

  return (
    <ActionDialog
      title={`Выдать код · ${person.full_name}`}
      description="Восемь цифр на 15 минут, один вход. Прежний код, если он был, перестанет работать. Код будет показан один раз."
      confirmLabel={lost ? "Закрыть входы и выдать код" : "Выдать код"}
      waiting={person.is_active ? null : "Человек не работает: включи его в «Изменить», потом выдавай код"}
      onClose={() => {
        if (!issued.current) onClose();
      }}
      onSubmit={async (reason) => {
        if (lost) {
          const closed = await revoke.mutateAsync({ personId: person.id, body: { reason, client_request_id: revokeId, company_id: companyId } });
          if (!closed.duplicate) toast(`Входов закрыто: ${closed.sessions}, устройств: ${closed.devices}`);
        }
        const answer = await issue.mutateAsync({ personId: person.id, body: { reason, client_request_id: issueId, company_id: companyId } });
        if (answer.login) {
          issued.current = true;
          setLogin(answer.login);
        } else {
          toast("Этот код уже выдан и показан. Открой выдачу ещё раз, будет новый");
        }
      }}
    >
      {signedIn ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[6px] border border-border px-3 py-2" data-testid="ops-code-lost">
          <input type="checkbox" checked={lost} onChange={(event) => setLost(event.target.checked)} className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium leading-5">Телефон потерян: закрыть все входы</span>
            <span className="block text-[12px] leading-4 text-muted">
              Иначе старый телефон останется в приложении. Сейчас {person.sessions} {pluralRu(person.sessions, ["вход", "входа", "входов"])}, уведомления на {person.devices}{" "}
              {pluralRu(person.devices, ["устройстве", "устройствах", "устройствах"])}.
            </span>
          </span>
        </label>
      ) : null}
    </ActionDialog>
  );
}
