"use client";

import { useMemo, useState } from "react";

import { DeadlineSheet } from "@/components/confirm/DeadlineSheet";
import { EntityCard } from "@/components/confirm/EntityCard";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { useRoster } from "@/lib/people/roster";
import { usePointsEnabled } from "@/lib/points/queries";
import { useIngestStore } from "@/lib/store/ingest";
import { useMe } from "@/lib/tasks/queries";

/** Five and up: the list turns into one-liners and the screen stops being a wall (FRONTEND). */
const COMPACT_FROM = 5;

/**
 * The parsed phrase as cards, with everything that edits them — the roster, the assignee
 * picker and the deadline sheet. Shared by the two places a phrase is confirmed: inline
 * on the board (`ConfirmInline`, the normal way) and the standalone `/confirm` screen a
 * draft is reopened from. Nothing here sends: the caller owns that.
 */
export function ConfirmList({
  assigneeIndex,
  onAssigneeIndex,
}: {
  /** the «кому?» sheet is controlled: the face on the board opens it without owning the list */
  assigneeIndex: number | null;
  onAssigneeIndex: (index: number | null) => void;
}) {
  const entities = useIngestStore((state) => state.entities);
  const editEntity = useIngestStore((state) => state.editEntity);
  const removeEntity = useIngestStore((state) => state.removeEntity);

  const roster = useRoster();
  const me = useMe();
  const myId = me.data?.userId;
  const pointsEnabled = usePointsEnabled().data === true;

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deadlineIndex, setDeadlineIndex] = useState<number | null>(null);

  // The task is clear but the person is not: the people are listed right on the card.
  const people = useMemo(
    () =>
      (roster.data ?? [])
        .filter((user) => user.id !== myId)
        .map((user) => ({ user_id: user.id, full_name: user.full_name })),
    [roster.data, myId],
  );

  const pickAssignee = (index: number, user: { user_id: string; full_name: string }) =>
    editEntity(index, {
      assignee_id: user.user_id,
      assignee_name: null,
      assignee: {
        status: "matched",
        user_id: user.user_id,
        candidates: [{ user_id: user.user_id, full_name: user.full_name, score: 1 }],
        flag: "ok",
      },
      blocked: undefined,
    });

  const nameOf = useMemo(() => {
    const byId = new Map<string, string>();
    for (const user of roster.data ?? []) byId.set(user.id, user.full_name);
    for (const entity of entities) {
      for (const candidate of entity.assignee?.candidates ?? []) {
        if (!byId.has(candidate.user_id)) byId.set(candidate.user_id, candidate.full_name);
      }
    }
    return (id: string) => byId.get(id);
  }, [roster.data, entities]);

  const compact = entities.length >= COMPACT_FROM;
  const toggle = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const openAssignee = assigneeIndex === null ? null : entities[assigneeIndex];
  const openDeadline = deadlineIndex === null ? null : entities[deadlineIndex];

  return (
    <>
      <div className="space-y-3">
        {entities.map((entity, index) => (
          <EntityCard
            key={`${entity.kind}-${index}`}
            entity={entity}
            index={index}
            compact={compact}
            expanded={expanded.has(index)}
            onToggle={() => toggle(index)}
            onPatch={(patch) => editEntity(index, patch)}
            onRemove={() => removeEntity(index)}
            onOpenAssignee={() => onAssigneeIndex(index)}
            onPickAssignee={(user) => pickAssignee(index, user)}
            people={people}
            pointsEnabled={pointsEnabled}
            onOpenDeadline={() => setDeadlineIndex(index)}
            nameOf={nameOf}
          />
        ))}
      </div>

      <PeoplePicker
        open={openAssignee !== null}
        onClose={() => onAssigneeIndex(null)}
        title="Кому?"
        subject={openAssignee?.kind === "task" ? openAssignee.title : null}
        hint={
          (openAssignee?.assignee?.candidates.length ?? 0) > 0
            ? "Понял задачу, но имя подходит нескольким. Кому из них?"
            : "Понял задачу, но не понял, кому. Выберите человека"
        }
        suggestedIds={(openAssignee?.assignee?.candidates ?? []).map((candidate) => candidate.user_id)}
        onPick={(person) => {
          if (assigneeIndex !== null) pickAssignee(assigneeIndex, { user_id: person.id, full_name: person.full_name });
        }}
      />

      <DeadlineSheet
        open={openDeadline !== null}
        onClose={() => setDeadlineIndex(null)}
        currentIso={openDeadline?.kind === "task" ? openDeadline.deadline_iso : null}
        onPick={(iso) => {
          if (deadlineIndex === null) return;
          // A deadline the director set by hand needs neither confidence nor a source phrase.
          editEntity(deadlineIndex, {
            deadline_iso: iso,
            deadline_confidence: iso === null ? null : 1,
            deadline_source_text: null,
          });
        }}
      />
    </>
  );
}
