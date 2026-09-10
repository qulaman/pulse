"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { AssigneePicker } from "@/components/confirm/AssigneePicker";
import { DeadlineSheet } from "@/components/confirm/DeadlineSheet";
import { EntityCard } from "@/components/confirm/EntityCard";
import { SendBar } from "@/components/confirm/SendBar";
import { entitiesSummary, joinRu } from "@/components/confirm/format";
import { useRoster } from "@/components/confirm/useRoster";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { isCountable, isSendable, useIngestStore } from "@/lib/store/ingest";
import { usePointsEnabled } from "@/lib/points/queries";
import { useMe } from "@/lib/tasks/queries";

/** Five and up: the list turns into one-liners and the screen stops being a wall (FRONTEND). */
const COMPACT_FROM = 5;

export function ConfirmScreen({ sandbox = false }: { sandbox?: boolean }) {
  const entities = useIngestStore((state) => state.entities);
  const stage = useIngestStore((state) => state.stage);
  const editEntity = useIngestStore((state) => state.editEntity);
  const removeEntity = useIngestStore((state) => state.removeEntity);
  const send = useIngestStore((state) => state.send);
  const reset = useIngestStore((state) => state.reset);

  const router = useRouter();
  const roster = useRoster();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [assigneeIndex, setAssigneeIndex] = useState<number | null>(null);
  const [deadlineIndex, setDeadlineIndex] = useState<number | null>(null);

  // The task is clear but the person is not: the people are listed right on the card.
  const me = useMe();
  const myId = me.data?.userId;
  const pointsEnabled = usePointsEnabled().data === true;
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

  const countable = entities.filter((entity) => isCountable(entity, pointsEnabled));
  const sendableCount = entities.filter((entity) => isSendable(entity, pointsEnabled)).length;
  const compact = entities.length >= COMPACT_FROM;

  if (entities.length === 0) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <h1 className="text-[24px] font-bold leading-[30px]">Пока нечего подтверждать</h1>
        <p className="mt-2 text-[16px] leading-[22px] text-muted">
          Зажми кнопку на экране Пульса и скажи, что нужно сделать.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.replace("/pulse")}>К Пульсу</Button>
        </div>
      </main>
    );
  }

  const handleSend = async (forceNow: boolean) => {
    if (sandbox) {
      toast("Песочница: отправка отключена");
      return;
    }

    const sent = entities.filter((entity) => isSendable(entity, pointsEnabled));
    const names = [
      ...new Set(
        sent
          .map((entity) => entity.assignee?.user_id)
          .filter((id): id is string => Boolean(id))
          .map((id) => nameOf(id) ?? "сотруднику"),
      ),
    ];
    const hasAnnouncement = sent.some((entity) => entity.kind === "announcement");

    const result = await send(forceNow, pointsEnabled);
    if (!result) return; // the overlay owns the failure and the retry

    const parts = [...names];
    if (hasAnnouncement) parts.push("объявление в Эфир");
    toast(parts.length > 0 ? `Отправил ${joinRu(parts)}` : "Отправил");
    reset();
    router.replace("/pulse");
  };

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
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-5">
        <div className="flex items-center gap-3">
          <Mascot state={sendableCount === countable.length && countable.length > 0 ? "happy" : "thinking"} size={44} />
          <h1 className="text-[24px] font-bold leading-[30px]">Понял так: {entitiesSummary(entities)}</h1>
        </div>

        <div className="mt-4 space-y-3">
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
              onOpenAssignee={() => setAssigneeIndex(index)}
              onPickAssignee={(user) => pickAssignee(index, user)}
              people={people}
              pointsEnabled={pointsEnabled}
              onOpenDeadline={() => setDeadlineIndex(index)}
              nameOf={nameOf}
            />
          ))}
        </div>
      </main>

      <SendBar
        sendable={sendableCount}
        total={countable.length}
        sending={stage === "sending"}
        onSend={(forceNow) => void handleSend(forceNow)}
        onReset={() => {
          reset();
          router.replace("/pulse");
        }}
      />

      <AssigneePicker
        open={openAssignee !== null}
        onClose={() => setAssigneeIndex(null)}
        candidates={openAssignee?.assignee?.candidates ?? []}
        onPick={(user) => {
          if (assigneeIndex !== null) pickAssignee(assigneeIndex, user);
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
    </div>
  );
}
