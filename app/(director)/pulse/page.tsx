"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { LiveBoard } from "@/components/pulse/LiveBoard";
import { useSpeech } from "@/components/pulse/useSpeech";
import { PushCard } from "@/components/push/PushCard";
import { Button } from "@/components/ui/Button";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { countsOf, lanesOf, toBriefTask, WORK_STATUSES } from "@/lib/pulse/board";
import { useLastVisit, useNow } from "@/lib/pulse/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";

/** Suggestions under the assistant: the questions it answers from the data. */
const QUICK_QUESTIONS = ["Кто не отчитался?", "Что на приёмке?", "Как дела в целом?"];

type Exchange = { key: string; said: string; lines: string[]; understood: boolean };

/**
 * Пульс — the director's home: the assistant «Капля» with one line (the verdict on
 * opening, then whatever just happened), the live board of tasks under it (lanes by
 * what each task needs, tiles that recolour and move as statuses change), and the one
 * thing to do here — give a task: hold to speak, tap to type. The team lives on /people.
 */
export default function PulsePage() {
  const me = useMe();
  const board = usePulseBoard();
  const since = useLastVisit();
  const now = useNow();
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";
  const directorName = firstNameOf(me.data?.fullName);

  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const question = useIngestStore((state) => state.question);
  const requestId = useIngestStore((state) => state.clientRequestId);
  const resetIngest = useIngestStore((state) => state.reset);
  const startManual = useIngestStore((state) => state.startManual);
  const ask = useIngestStore((state) => state.ask);
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  const loading = me.isLoading || board.isLoading;
  const rows = board.data;
  const lanes = useMemo(() => lanesOf(rows ?? [], now), [rows, now]);
  const counts = countsOf(lanes);
  const speech = useSpeech(rows, lanes, now, directorName);

  // A question the phrase turned out to be: the director's words, then the answer from the data.
  const people = usePeople();
  const asked = stage === "question" && question ? question : null;
  // the closed list (200 rows, two joins) is fetched only while a question needs it
  const sent = useSentTasks(asked ? me.data?.userId : undefined);
  const reply = useMemo(() => {
    if (!asked || !rows || people.isLoading || sent.isLoading) return null;
    return answer({
      question: asked,
      now,
      people: (people.data ?? [])
        .filter((p) => p.is_active && p.role !== "tv")
        .map((p) => ({ id: p.id, fullName: p.full_name, aliases: p.aliases ?? [] })),
      open: rows.filter((t) => WORK_STATUSES.includes(t.status)).map((t) => ({ ...toBriefTask(t), status: t.status })),
      closed: (sent.data ?? [])
        .filter((t) => t.status === "done" || t.status === "declined" || t.status === "revoked")
        .map((t) => ({ id: t.id, title: t.title, deadline: t.deadline, assignee: t.assignee?.full_name ? firstNameOf(t.assignee.full_name) : null, assigneeId: t.assignee_id, status: t.status, closedAt: t.closed_at })),
      overdue: lanes.overdue.map(toBriefTask),
      declined: lanes.declined.map((t) => ({ ...toBriefTask(t), reason: t.decline_reason })),
      questions: lanes.question.map(toBriefTask),
      review: lanes.review.map(toBriefTask),
    });
  }, [asked, now, rows, lanes, people.isLoading, people.data, sent.isLoading, sent.data]);

  // The exchange stays on screen after the pipeline goes idle: the assistant keeps its
  // answer until the director asks again, taps the face, or closes it. Keyed by the
  // request, so the same question asked again is a new exchange.
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const exchangeKey = asked ? (requestId ?? asked) : null;
  if (asked && reply && exchangeKey && exchange?.key !== exchangeKey) {
    setExchange({ key: exchangeKey, said: asked, lines: reply.lines, understood: reply.understood });
  }
  // an answered question is done — the pipeline goes idle; an unread one waits for the choice
  useEffect(() => {
    if (asked && reply?.understood) resetIngest();
  }, [asked, reply, resetIngest]);
  const closeExchange = () => {
    setExchange(null);
    if (stage === "question") resetIngest();
  };
  const lines = useMemo<AssistantLine[]>(() => {
    if (exchange) return exchange.lines.map((text, i) => ({ id: `${exchange.key}:${i}`, text }));
    return speech.line ? [speech.line] : [];
  }, [exchange, speech.line]);

  const mascot: MascotState = loading ? "thinking" : speech.speaking ? "speaking" : counts.attention > 0 ? "calm" : "happy";
  const team = (people.data ?? []).filter((p) => p.is_active && p.role !== "director" && p.role !== "tv");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-[196px] pt-3">
      <Assistant
        mascot={mascot}
        said={exchange?.said ?? null}
        lines={loading && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}
        onReplay={() => {
          closeExchange();
          speech.replay();
        }}
      >
        {exchange ? (
          <div className="card-in flex flex-wrap gap-2 pl-4 pt-1">
            {!exchange.understood ? (
              <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={startManual}>
                Сделать задачей
              </Button>
            ) : null}
            <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={closeExchange}>
              Закрыть
            </Button>
          </div>
        ) : null}
        {draftCount > 0 ? (
          <Link href="/confirm" className="card-in relative block py-1 pl-4 text-[17px] leading-6">
            <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full bg-accent" />
            Черновик: {draftCount} {draftCount === 1 ? "сущность" : draftCount < 5 ? "сущности" : "сущностей"}, не отправлен.{" "}
            <span className="text-accent">Открыть ›</span>
          </Link>
        ) : null}
        {/* what the assistant can be asked — a tap asks at once, no parser round-trip */}
        {stage === "idle" && !loading ? (
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
        {/* a fresh instance: nobody to give tasks to yet — the first step is the team */}
        {people.data && team.length === 0 ? (
          <Link href="/people/new" className="card-in relative block py-1 pl-4 text-[17px] leading-6">
            <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full bg-accent" />
            В команде пока никого. Добавь первого сотрудника, и задачи будет кому давать.{" "}
            <span className="text-accent">Добавить ›</span>
          </Link>
        ) : null}
        <PushCard bubble />
        <InstallHint bubble />
      </Assistant>

      <LiveBoard rows={rows} now={now} since={since} actions={actions} companyId={companyId} />

      {/* the announcements (D-59: Эфир lives here, folded under the board) */}
      <EtherSection variant="director" />

      {/* the one action of the screen: pinned above the tab bar, always under the thumb;
          the board scrolls underneath and the main's bottom padding lets it clear the block */}
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
        </div>
      </div>
    </main>
  );
}
