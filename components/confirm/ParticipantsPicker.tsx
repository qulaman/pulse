"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useRoster } from "@/components/confirm/useRoster";

type Props = {
  open: boolean;
  onClose: () => void;
  everyone: boolean;
  selectedIds: string[];
  onDone: (next: { everyone: boolean; ids: string[] }) => void;
  /** People who are in anyway and need no check — the author of a meeting (D-94). */
  hideIds?: string[];
};

function Check({ on, dim }: { on: boolean; dim: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] border"
      style={{
        opacity: dim ? 0.45 : 1,
        borderColor: on ? "var(--accent)" : "var(--border)",
        background: on ? "var(--accent)" : "transparent",
        color: "var(--bg)",
      }}
    >
      {on ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="3.5,8.5 6.5,11.5 12.5,4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * Who is coming (D-78). A meeting is one row with many people, so this is a multi-pick,
 * not the assignee sheet: «Все сотрудники» is a switch above the list, and while it is on
 * the individual checks are inert — the company is already the answer.
 */
export function ParticipantsPicker({ open, onClose, everyone, selectedIds, onDone, hideIds }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Кто участвует?">
      {/* the body is born with the sheet, so every opening starts from the list the card
          holds right now — the same trick DeadlineSheet uses */}
      <ParticipantsBody everyone={everyone} selectedIds={selectedIds} onClose={onClose} onDone={onDone} hideIds={hideIds} />
    </Sheet>
  );
}

function ParticipantsBody({
  everyone,
  selectedIds,
  onClose,
  onDone,
  hideIds = [],
}: Omit<Props, "open">) {
  const roster = useRoster();
  const [all, setAll] = useState(everyone);
  const [ids, setIds] = useState<string[]>(selectedIds);

  const toggle = (id: string) => {
    setIds((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAll((was) => !was)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left active:bg-surface-2"
      >
        <span className="text-[16px] leading-[22px]">Все сотрудники</span>
        <Check on={all} dim={false} />
      </button>

      <div className="no-bar mt-1 max-h-[52vh] overflow-y-auto">
        {roster.isLoading ? <p className="px-3 py-2 text-[14px] text-muted">Загружаю…</p> : null}
        {roster.isError ? <p className="px-3 py-2 text-[14px] text-danger">Не смог загрузить список</p> : null}

        {(roster.data ?? []).filter((user) => !hideIds.includes(user.id)).map((user) => (
          <button
            key={user.id}
            type="button"
            disabled={all}
            onClick={() => toggle(user.id)}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left active:bg-surface-2"
            style={{ opacity: all ? 0.45 : 1 }}
          >
            <span className="min-w-0">
              <span className="block truncate text-[16px] leading-[22px]">{user.full_name}</span>
              {user.position ? (
                <span className="block truncate text-[13px] leading-4 text-muted">{user.position}</span>
              ) : null}
            </span>
            <Check on={all || ids.includes(user.id)} dim={all} />
          </button>
        ))}
      </div>

      <div className="mt-2">
        <Button
          block
          onClick={() => {
            onDone({ everyone: all, ids: all ? [] : ids });
            onClose();
          }}
        >
          Готово
        </Button>
      </div>
    </>
  );
}
