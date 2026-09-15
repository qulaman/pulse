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
import { Sheet } from "@/components/ui/Sheet";
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
  const transcript = useIngestStore((state) => state.transcript);
  const reparse = useIngestStore((state) => state.reparse);
  const startManual = useIngestStore((state) => state.startManual);
  const ask = useIngestStore((state) => state.ask);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const close = () => {
    reset();
    router.replace("/pulse");
  };

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

  const countable = entities.filter((entity) => isCountable(entity, pointsEnabled));
  const sendableCount = entities.filter((entity) => isSendable(entity, pointsEnabled)).length;
  const compact = entities.length >= COMPACT_FROM;

  // Nothing parsed out of a real phrase: the words are shown and there is always a way out —
  // fix the text and parse again, make the words a task by hand, or close.
  if (entities.length === 0 && transcript.trim() && stage !== "parsing") {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <div className="flex items-center gap-3">
          <Mascot state="thinking" size={44} />
          <h1 className="text-[24px] font-bold leading-[30px]">Не разобрал</h1>
        </div>
        <p className="mt-4 text-[13px] leading-4 text-muted">Услышал так:</p>
        <p className="mt-1 rounded-[12px] bg-surface-2 px-3 py-2 text-[16px] leading-[22px]">«{transcript}»</p>
        <p className="mt-4 text-[16px] leading-[22px] text-muted">
          Не нашёл здесь ни задач, ни объявлений. Можно поправить слова и разобрать заново, или сделать из них задачу.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            onClick={() => {
              setDraft(transcript);
              setEditing(true);
            }}
          >
            Исправить текст
          </Button>
          <Button block variant="secondary" onClick={startManual}>
            Сделать задачей
          </Button>
          <Button block variant="ghost" onClick={close}>
            Закрыть
          </Button>
        </div>

        <Sheet open={editing} onClose={() => setEditing(false)} title="Исправить текст">
          <textarea
            className="w-full rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent"
            rows={4}
            data-autofocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-3">
            <Button
              block
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false);
                void reparse(draft);
              }}
            >
              Разобрать заново
            </Button>
          </div>
        </Sheet>
      </main>
    );
  }

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
    // questions in a mixed phrase are answered on Пульс once the batch is away
    const question = entities
      .map((entity) => (entity.kind === "query" ? entity.question : ""))
      .filter(Boolean)
      .join(" ");
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
    if (question) ask(question);
    router.replace("/pulse");
  };

  const firstBlocked = entities.findIndex((entity) => entity.blocked === "assignee_unmatched");

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
          <h1 className="min-w-0 flex-1 text-[24px] font-bold leading-[30px]">Понял так: {entitiesSummary(entities)}</h1>
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-[20px] leading-none text-muted transition-transform duration-[120ms] active:scale-[0.96]"
          >
            ×
          </button>
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
        onReset={close}
        onFixFirst={firstBlocked >= 0 ? () => setAssigneeIndex(firstBlocked) : undefined}
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
