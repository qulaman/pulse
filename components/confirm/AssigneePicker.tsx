"use client";

import { Mascot } from "@/components/brand/Mascot";
import { Sheet } from "@/components/ui/Sheet";
import { useRoster, type RosterEntry } from "@/components/confirm/useRoster";
import type { AssigneeMatch } from "@/lib/matchName";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Matcher candidates come first — the shortlist the director actually meant (D-16). */
  candidates: AssigneeMatch["candidates"];
  onPick: (user: { user_id: string; full_name: string }) => void;
};

function Row({
  name,
  hint,
  onClick,
}: {
  name: string;
  hint?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left text-[16px] leading-[22px] active:bg-surface-2"
    >
      <span className="truncate">{name}</span>
      {hint ? <span className="shrink-0 text-[13px] leading-4 text-muted">{hint}</span> : null}
    </button>
  );
}

export function AssigneePicker({ open, onClose, candidates, onPick }: Props) {
  const roster = useRoster();
  const candidateIds = new Set(candidates.map((c) => c.user_id));
  const rest: RosterEntry[] = (roster.data ?? []).filter((user) => !candidateIds.has(user.id));

  return (
    <Sheet open={open} onClose={onClose} title="Кому?">
      <div className="mb-2 flex items-center gap-3 px-1">
        <Mascot state="thinking" size={36} />
        <p className="text-[13px] leading-4 text-muted">
          {candidates.length > 0 ? "Понял задачу, но имя подходит нескольким. Кому из них?" : "Понял задачу, но не понял, кому. Выбери человека"}
        </p>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {candidates.length > 0 ? (
          <div className="mb-2">
            {candidates.map((candidate) => (
              <Row
                key={candidate.user_id}
                name={candidate.full_name}
                onClick={() => {
                  onPick({ user_id: candidate.user_id, full_name: candidate.full_name });
                  onClose();
                }}
              />
            ))}
          </div>
        ) : null}

        <p className="px-3 py-2 text-[13px] leading-4 text-muted">Все сотрудники</p>

        {roster.isLoading ? <p className="px-3 py-2 text-[14px] text-muted">Загружаю…</p> : null}
        {roster.isError ? (
          <p className="px-3 py-2 text-[14px] text-danger">Не смог загрузить список</p>
        ) : null}

        {rest.map((user) => (
          <Row
            key={user.id}
            name={user.full_name}
            hint={user.position}
            onClick={() => {
              onPick({ user_id: user.id, full_name: user.full_name });
              onClose();
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
