"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Assistant } from "@/components/pulse/Assistant";
import { PushCard } from "@/components/push/PushCard";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { usePointsEnabled } from "@/lib/points/queries";
import { buildBriefing } from "@/lib/pulse/briefing";
import { firstNameOf, toBriefTask, useAcceptedSince, useLastVisit, useNow, useOpenTasks } from "@/lib/pulse/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useDirectorInbox, useMe, type TaskWithPeople } from "@/lib/tasks/queries";

/**
 * Пульс — the director's home is a conversation with the assistant: «Капля» reports
 * what changed since the last visit (overdue → questions → review, then who accepted
 * what), each fact opens its cards right in the bubble, and the one thing to do here
 * is to give a task — hold to speak, tap to type. The team lives on /people.
 */
export default function PulsePage() {
  const me = useMe();
  const inbox = useDirectorInbox();
  const since = useLastVisit();
  const accepted = useAcceptedSince(since);
  const open = useOpenTasks();
  const now = useNow();
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";

  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  const loading = me.isLoading || inbox.isLoading || open.isLoading || accepted.isLoading;

  const lines = useMemo(() => {
    const data = inbox.data;
    return buildBriefing({
      now,
      directorName: firstNameOf(me.data?.fullName),
      overdue: (data?.overdue ?? []).map(toBriefTask),
      questions: (data?.questions ?? []).map(toBriefTask),
      review: (data?.review ?? []).map(toBriefTask),
      accepted: accepted.data ?? [],
      open: open.data ?? [],
    });
  }, [now, me.data?.fullName, inbox.data, accepted.data, open.data]);

  const taskById = useMemo(() => {
    const map = new Map<string, TaskWithPeople>();
    for (const list of [inbox.data?.overdue, inbox.data?.questions, inbox.data?.review]) {
      for (const task of list ?? []) map.set(task.id, task);
    }
    return map;
  }, [inbox.data]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[232px] pt-4">
      <Assistant lines={lines} loading={loading} taskById={taskById} actions={actions} companyId={companyId}>
        {draftCount > 0 ? (
          <Link
            href="/confirm"
            className="card-in relative block py-1 pl-4 text-[17px] leading-6"
          >
            <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full bg-accent" />
            Черновик: {draftCount} {draftCount === 1 ? "сущность" : draftCount < 5 ? "сущности" : "сущностей"}, не отправлен.{" "}
            <span className="text-accent">Открыть ›</span>
          </Link>
        ) : null}
        <PushCard bubble />
      </Assistant>

      {/* the one action of the screen: pinned above the tab bar, always under the thumb;
          the briefing scrolls underneath and the main's bottom padding lets it clear the block */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20 flex flex-col items-center pt-8"
        style={{
          bottom: "calc(56px + env(safe-area-inset-bottom))",
          paddingBottom: 12,
          background: "linear-gradient(180deg, transparent, var(--bg) 28px)",
        }}
      >
        <div className="pointer-events-auto flex flex-col items-center">
          <VoiceButton inline />
          <Link href="/sent" className="mt-2 min-h-[44px] px-4 text-[14px] leading-[44px] text-muted">
            Задачи ›
          </Link>
        </div>
      </div>
    </main>
  );
}
