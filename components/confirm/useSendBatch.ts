"use client";

import { useCallback, useMemo } from "react";

import { joinRu } from "@/components/confirm/format";
import { useRoster } from "@/lib/people/roster";
import { toast } from "@/components/ui/Toast";
import { usePointsEnabled } from "@/lib/points/queries";
import { isCountable, isSendable, useIngestStore } from "@/lib/store/ingest";

/**
 * Throwing the batch: who it went to, what the toast says, and the question a mixed phrase
 * left behind (it is answered on Пульс once the batch is away). One copy for both places
 * that send — the face on the board and the bar of `/confirm` — because the wording and
 * the order of `send → reset → ask` are the contract, not the screen's business.
 */
export function useSendBatch(onDone?: () => void) {
  const entities = useIngestStore((state) => state.entities);
  const send = useIngestStore((state) => state.send);
  const reset = useIngestStore((state) => state.reset);
  const ask = useIngestStore((state) => state.ask);
  const stage = useIngestStore((state) => state.stage);
  const pointsEnabled = usePointsEnabled().data === true;
  const roster = useRoster();

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

  const countable = entities.filter((entity) => isCountable(entity, pointsEnabled)).length;
  const sendable = entities.filter((entity) => isSendable(entity, pointsEnabled)).length;

  const sendBatch = useCallback(
    async (forceNow = false) => {
      const going = entities.filter((entity) => isSendable(entity, pointsEnabled));
      if (going.length === 0) return;
      const question = entities
        .map((entity) => (entity.kind === "query" ? entity.question : ""))
        .filter(Boolean)
        .join(" ");
      const names = [
        ...new Set(
          going
            .map((entity) => entity.assignee?.user_id)
            .filter((id): id is string => Boolean(id))
            .map((id) => nameOf(id) ?? "сотруднику"),
        ),
      ];
      const hasAnnouncement = going.some((entity) => entity.kind === "announcement");
      // «напомни мне» lives in «Заметки» now (D-95): the toast says where to find it
      const hasReminder = going.some((entity) => entity.kind === "reminder");

      const result = await send(forceNow, pointsEnabled);
      if (!result) return; // the overlay owns the failure and the retry
      // no network: the batch waits on the phone and the face said so (D-130); a question
      // asked about data the phone cannot reach now is asked again later
      if (result.queued) {
        onDone?.();
        return;
      }

      const parts = [...names];
      if (hasAnnouncement) parts.push("объявление в Эфир");
      if (hasReminder) parts.push("напоминание в Заметки");
      toast(parts.length > 0 ? `Отправил ${joinRu(parts)}` : "Отправил");
      reset();
      if (question) ask(question);
      onDone?.();
    },
    [ask, entities, nameOf, onDone, pointsEnabled, reset, send],
  );

  return { sendBatch, sendable, countable, sending: stage === "sending", nameOf };
}
