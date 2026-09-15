"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import { InstallHint } from "@/components/InstallHint";
import { Assistant } from "@/components/pulse/Assistant";
import { PushCard } from "@/components/push/PushCard";
import { Button } from "@/components/ui/Button";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { buildBriefing, type BriefLine } from "@/lib/pulse/briefing";
import { firstNameOf, toBriefTask, useAcceptedSince, useLastVisit, useNow, useOpenTasks } from "@/lib/pulse/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useDirectorInbox, useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";

/** Suggestions under the briefing: the questions the assistant answers from the data. */
const QUICK_QUESTIONS = ["Кто не отчитался?", "Что на приёмке?", "Как дела в целом?"];

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
  const question = useIngestStore((state) => state.question);
  const requestId = useIngestStore((state) => state.clientRequestId);
  const resetIngest = useIngestStore((state) => state.reset);
  const startManual = useIngestStore((state) => state.startManual);
  const ask = useIngestStore((state) => state.ask);
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  const loading = me.isLoading || inbox.isLoading || open.isLoading || accepted.isLoading;

  // A question the phrase turned out to be: the director's words, then the answer from the data.
  const people = usePeople();
  const asked = stage === "question" && question ? question : null;
  // the closed list (200 rows, two joins) is fetched only while a question needs it
  const sent = useSentTasks(asked ? me.data?.userId : undefined);
  const reply = useMemo(() => {
    if (!asked || people.isLoading || sent.isLoading) return null;
    return answer({
      question: asked,
      now,
      people: (people.data ?? [])
        .filter((p) => p.is_active && p.role !== "tv")
        .map((p) => ({ id: p.id, fullName: p.full_name, aliases: p.aliases ?? [] })),
      open: open.data ?? [],
      closed: (sent.data ?? [])
        .filter((t) => t.status === "done" || t.status === "declined" || t.status === "revoked")
        .map((t) => ({ ...toBriefTask(t), status: t.status, closedAt: t.closed_at })),
      overdue: (inbox.data?.overdue ?? []).map(toBriefTask),
      declined: (inbox.data?.declined ?? []).map((t) => ({ ...toBriefTask(t), reason: t.decline_reason })),
      questions: (inbox.data?.questions ?? []).map(toBriefTask),
      review: (inbox.data?.review ?? []).map(toBriefTask),
    });
  }, [asked, now, people.isLoading, people.data, open.data, sent.isLoading, sent.data, inbox.data]);
  const qaLines = useMemo<BriefLine[]>(() => {
    if (!asked || !reply) return [];
    // keyed by the request, not the words: the same question asked again is a new exchange
    const key = requestId ?? asked;
    return [
      { id: `q:${key}`, kind: "director", text: asked, instant: true },
      ...reply.lines.map((text, i) => ({ id: `a:${key}:${i}`, kind: "answer" as const, text })),
    ];
  }, [asked, reply, requestId]);
  // An answered question is done: the lines stay in the conversation (the assistant keeps
  // what it said), the pipeline goes idle. An unread one waits for the director's choice.
  useEffect(() => {
    if (asked && reply?.understood && !loading) resetIngest();
  }, [asked, reply, loading, resetIngest]);

  const lines = useMemo(() => {
    const data = inbox.data;
    const briefing = buildBriefing({
      now,
      directorName: firstNameOf(me.data?.fullName),
      overdue: (data?.overdue ?? []).map(toBriefTask),
      declined: (data?.declined ?? []).map((t) => ({ ...toBriefTask(t), reason: t.decline_reason })),
      questions: (data?.questions ?? []).map((t) => ({ ...toBriefTask(t), question: t.question })),
      review: (data?.review ?? []).map(toBriefTask),
      accepted: accepted.data ?? [],
      open: open.data ?? [],
    });
    return [...briefing, ...qaLines];
  }, [now, me.data?.fullName, inbox.data, accepted.data, open.data, qaLines]);

  const taskById = useMemo(() => {
    const map = new Map<string, TaskWithPeople>();
    for (const list of [inbox.data?.overdue, inbox.data?.declined, inbox.data?.questions, inbox.data?.review]) {
      for (const task of list ?? []) map.set(task.id, task);
    }
    return map;
  }, [inbox.data]);
  // news («принял») is over once the task left work — the open list says so
  const openIds = useMemo(() => (open.data ? new Set(open.data.map((t) => t.id)) : null), [open.data]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[232px] pt-4">
      <Assistant lines={lines} loading={loading} taskById={taskById} openIds={openIds} actions={actions} companyId={companyId}>
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
        {/* what the assistant can be asked — a tap asks at once, no parser round-trip */}
        {stage === "idle" ? (
          <div className="card-in flex flex-wrap gap-2 pl-4 pt-1" aria-label="Спросить">
            {QUICK_QUESTIONS.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => ask(text)}
                className="min-h-[36px] rounded-full border border-border bg-surface px-3 text-[14px] leading-[18px] text-muted transition-transform duration-[120ms] active:scale-[0.97]"
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}
        {asked && reply && !reply.understood ? (
          <div className="card-in flex flex-wrap gap-2 pl-4 pt-1">
            <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={startManual}>
              Сделать задачей
            </Button>
            <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={resetIngest}>
              Закрыть
            </Button>
          </div>
        ) : null}
        {/* a fresh instance: nobody to give tasks to yet — the first step is the team */}
        {people.data && people.data.filter((p) => p.is_active && p.role !== "director" && p.role !== "tv").length === 0 ? (
          <Link href="/people/new" className="card-in relative block py-1 pl-4 text-[17px] leading-6">
            <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full bg-accent" />
            В команде пока никого. Добавь первого сотрудника, и задачи будет кому давать.{" "}
            <span className="text-accent">Добавить ›</span>
          </Link>
        ) : null}
        <PushCard bubble />
        <InstallHint bubble />
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
