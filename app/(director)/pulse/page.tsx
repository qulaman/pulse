"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { CalendarList } from "@/components/calendar/CalendarList";
import { EventSheet } from "@/components/calendar/EventSheet";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { CardDeck } from "@/components/pulse/CardDeck";
import { MascotLever, useLeverHint } from "@/components/pulse/MascotLever";
import { OrbitBalls, type OrbitBall, type OrbitId } from "@/components/pulse/OrbitBalls";
import { ThoughtBubble } from "@/components/pulse/ThoughtBubble";
import { useSpeech } from "@/components/pulse/useSpeech";
import { PushCard } from "@/components/push/PushCard";
import { ThreadSheet } from "@/components/tasks/thread/ThreadSheet";
import { Button } from "@/components/ui/Button";
import { nextEvent, startsSoon, todayCount } from "@/lib/calendar/agenda";
import { useCalendar, type CalendarEvent } from "@/lib/calendar/queries";
import { nextEventLine } from "@/lib/calendar/say";
import { SecretaryPanel } from "@/components/secretary/SecretaryPanel";
import { useEther } from "@/lib/ether/queries";
import { activeCount, ballTone, useErrands, useSecretaryActions } from "@/lib/errands/queries";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { countsOf, emptyLanes, hasMessage, isOnBoard, lanesOf, toBriefTask, WORK_STATUSES, type BoardTask, type Lanes } from "@/lib/pulse/board";
import { useLastVisit, useNow } from "@/lib/pulse/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";

type Exchange = { key: string; said: string; lines: string[]; understood: boolean };

/** idle — the face asleep in the middle; ring — awake, the balls orbit it; panel — one ball opened under the row of balls. */
type Mode = "idle" | "ring" | "panel";

const FACE = 128;
const FACE_SMALL = 88;
/** Distance from the face's centre to the balls' centres. */
const RING_RADIUS = 124;
/** How long a thought hangs above the head before the face dozes off again. */
const THOUGHT_MS = 9_000;

/**
 * Пульс — the director's home (D-57, D-60): the face of «Капля» asleep in the middle of
 * the screen. Hold it to speak, pull it down to type, tap it and it wakes: three balls
 * orbit it — tasks, messages, Эфир — each with its count; a tap on a ball opens its panel
 * (the card deck with the gestures, or the announcements).
 * The gesture hint lives at the bottom; service lines (push, draft) appear only after
 * the tap, under the assistant's line. One screen at every width — a wide window only
 * centres it (owner, 2026-09-17: the board of D-57 stays a reserve for /tv).
 */
export default function PulsePage() {
  const me = useMe();
  const board = usePulseBoard(me.data);
  const since = useLastVisit();
  const now = useNow();
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";
  const meId = me.data?.userId ?? "";
  const directorName = firstNameOf(me.data?.fullName);

  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const question = useIngestStore((state) => state.question);
  const requestId = useIngestStore((state) => state.clientRequestId);
  const resetIngest = useIngestStore((state) => state.reset);
  const startManual = useIngestStore((state) => state.startManual);
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  const loading = me.isLoading || board.isLoading;
  const rows = board.data;
  const lanes = useMemo(() => lanesOf(rows ?? [], now, meId), [rows, now, meId]);
  const counts = countsOf(lanes);
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);
  const errands = useErrands();
  const errandRows = useMemo(() => errands.data ?? [], [errands.data]);
  const catalogue = useSecretaryActions();
  // the calendar and the errands are news too: an answer, a move, the reminder the tick
  // has just written, «Айгуль · кофе принят»
  const speech = useSpeech(rows, lanes, now, directorName, meId, calendar.data, errands.data);
  const eventSoon = startsSoon(nextEvent(events, now), now);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const showHint = useLeverHint();

  // ---- the balls and the panels ------------------------------------------------------------
  const [mode, setMode] = useState<Mode>("idle");
  const [panel, setPanel] = useState<OrbitId | null>(null);
  const [wakeKey, setWakeKey] = useState(0);
  const ether = useEther();
  // the thread opens over the board; Пульс underneath is never unmounted, so the deck,
  // the balls and the mascot are where they were when the sheet closes (D-64 §5)
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);
  const openThread = (task: BoardTask) => setThread({ id: task.id, title: task.title });

  const people = usePeople();
  const hasSecretary = (people.data ?? []).some((p) => p.role === "secretary" && p.is_active);

  // every open task on the ball (in work included), coloured by the worst of them; messages are counted apart
  const taskCount = counts.overdue + counts.declined + counts.review + counts.work;
  const messageTasks = useMemo(() => (rows ?? []).filter((task) => isOnBoard(task.status) && hasMessage(task, meId)), [rows, meId]);
  const balls = useMemo<OrbitBall[]>(
    () => [
      {
        id: "tasks",
        label: "Задачи",
        count: taskCount,
        tone: counts.overdue > 0 || counts.declined > 0 ? "var(--danger)" : counts.review > 0 ? "var(--ok)" : "var(--accent)",
      },
      { id: "messages", label: "Сообщения", count: messageTasks.length, tone: "var(--warn)" },
      { id: "ether", label: "Эфир", count: (ether.data ?? []).length, tone: "var(--gold)" },
      {
        id: "calendar",
        label: "Календарь",
        count: todayCount(events, now),
        tone: eventSoon ? "var(--warn)" : "var(--accent)",
      },
      // the fifth ball exists only when the company has somebody to ask (D-79 §4)
      ...(hasSecretary
        ? [
            {
              id: "secretary" as const,
              label: "Секретарь",
              count: activeCount(errandRows),
              tone: ballTone(errandRows),
            },
          ]
        : []),
    ],
    [taskCount, counts.overdue, counts.declined, counts.review, messageTasks.length, ether.data, events, now, eventSoon, hasSecretary, errandRows],
  );
  // the deck behind each ball: tasks without the message lane, or every task with a message (whatever its lane)
  const taskLanes = useMemo<Lanes>(() => ({ ...lanes, question: [] }), [lanes]);
  // the thought talks about the newest word on the board — a tap on it opens that thread
  const thoughtTask = messageTasks[0];
  const questionLanes = useMemo<Lanes>(() => ({ ...emptyLanes(), question: messageTasks }), [messageTasks]);

  const pick = (ball: OrbitBall) => {
    if (mode === "panel" && panel === ball.id) {
      // the open ball again: the panel folds back, the balls orbit again
      setMode("ring");
      setPanel(null);
      return;
    }
    setPanel(ball.id);
    setMode("panel");
  };

  // ---- a question the phrase turned out to be ---------------------------------------------
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
  // answer until the director asks again, taps the face, or closes it.
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const exchangeKey = asked ? (requestId ?? asked) : null;
  if (asked && reply && exchangeKey && exchange?.key !== exchangeKey) {
    setExchange({ key: exchangeKey, said: asked, lines: reply.lines, understood: reply.understood });
  }
  useEffect(() => {
    if (asked && reply?.understood) resetIngest();
  }, [asked, reply, resetIngest]);
  const closeExchange = () => {
    setExchange(null);
    if (stage === "question") resetIngest();
  };

  // A change on the board is a thought: it pops above the head, the face wakes up surprised
  // at it, and after a while the thought is gone and the face dozes off again. The opening
  // line (the summary on a tap) is speech, under the face. Both answer to the same line.
  const [expiredThought, setExpiredThought] = useState<string | null>(null);
  const thought = speech.line && !speech.line.opening && speech.line.id !== expiredThought ? speech.line : null;
  const thoughtId = thought?.id ?? null;
  useEffect(() => {
    if (!thoughtId) return;
    const timer = setTimeout(() => setExpiredThought(thoughtId), THOUGHT_MS);
    return () => clearTimeout(timer);
  }, [thoughtId]);

  const lines = useMemo<AssistantLine[]>(() => {
    if (exchange) return exchange.lines.map((text, i) => ({ id: `${exchange.key}:${i}`, text }));
    if (!speech.line) return [];
    // on the phone a change is a thought (above), never a line (below); the summary shows once awake
    if (!speech.line.opening) return [];
    if (mode === "idle") return [];
    // the greeting is followed by the nearest meeting of the day, when there is one
    const soonest = nextEventLine(events, now);
    return soonest ? [speech.line, { id: "calendar", text: soonest }] : [speech.line];
  }, [exchange, speech.line, mode, events, now]);

  const onFaceTap = () => {
    closeExchange();
    if (mode === "idle") {
      // waking up: a stretch, the summary, the balls come out
      setWakeKey((key) => key + 1);
      speech.replay();
      setMode("ring");
    } else if (mode === "panel") {
      // one step back: the panel folds, the balls orbit again
      setMode("ring");
      setPanel(null);
    } else {
      setMode("idle");
      setPanel(null);
    }
  };

  const awake: MascotState = loading ? "thinking" : speech.speaking ? "speaking" : counts.attention > 0 ? "calm" : "happy";
  // a thought wakes the face whatever it was doing; without one the idle face sleeps
  const mascot: MascotState = thought ? "surprised" : mode === "idle" ? "sleeping" : awake;
  const team = (people.data ?? []).filter((p) => p.is_active && p.role !== "director" && p.role !== "tv");
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;

  const serviceLines = (
    <>
      {draftCount > 0 ? (
        <Link href="/confirm" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          Черновик: {draftCount} {draftCount === 1 ? "сущность" : draftCount < 5 ? "сущности" : "сущностей"}, не отправлен.{" "}
          <span className="text-accent">Открыть ›</span>
        </Link>
      ) : null}
      {people.data && team.length === 0 ? (
        <Link href="/people/new" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          В команде пока никого. Добавь первого сотрудника. <span className="text-accent">Добавить ›</span>
        </Link>
      ) : null}
      <PushCard bubble />
      <InstallHint bubble />
    </>
  );


  return (
    <main
      className={`mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-12 ${mode === "idle" ? "justify-center" : "justify-start pt-2"}`}
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
    >
      <LayoutGroup>
        {/* the face, and the balls orbiting it (ring) or in a row under it (panel) */}
        <div className="relative flex flex-col items-center">
          <motion.div layout className="relative flex items-center justify-center" style={{ width: box, height: box }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <MascotLever state={mascot} onTap={onFaceTap} size={faceSize} wakeKey={wakeKey} />
            <AnimatePresence>
              {mode === "ring" ? <OrbitBalls key="ring" balls={balls} mode="ring" activeId={null} radius={RING_RADIUS} onPick={pick} /> : null}
            </AnimatePresence>
            <AnimatePresence>
              {thought ? (
                <ThoughtBubble
                  key={thought.id}
                  text={thought.text}
                  tone={thought.tone}
                  faceSize={faceSize}
                  onDismiss={() => setExpiredThought(thought.id)}
                  // a thought about the calendar opens no thread — there is none behind it
                  onOpen={!thought.source && thoughtTask ? () => openThread(thoughtTask) : undefined}
                />
              ) : null}
            </AnimatePresence>
          </motion.div>
          <AnimatePresence>
            {mode === "panel" ? (
              <motion.div key="row" layout className="mt-1 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <OrbitBalls balls={balls} mode="row" activeId={panel} radius={RING_RADIUS} onPick={pick} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <motion.div layout className="mt-3">
          <Assistant said={exchange?.said ?? null} lines={loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}>
            {exchange ? <ExchangeButtons exchange={exchange} onManual={startManual} onClose={closeExchange} /> : null}
            {/* service lines only once the face has been tapped — the idle screen is the face alone */}
            {mode !== "idle" ? serviceLines : null}
          </Assistant>
        </motion.div>

        {mode === "panel" ? (
          <motion.div key={panel} layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} data-testid="panel" data-panel={panel}>
            {panel === "tasks" ? (
              taskCount === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Задач нет. Зажми меня и скажи, что нужно сделать.</p>
              ) : (
                <CardDeck lanes={taskLanes} now={now} since={since} actions={actions} companyId={companyId} meId={meId} onReply={openThread} focus={null} />
              )
            ) : null}
            {panel === "messages" ? (
              messageTasks.length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Непрочитанных сообщений нет.</p>
              ) : (
                <CardDeck lanes={questionLanes} now={now} since={since} actions={actions} companyId={companyId} meId={meId} onReply={openThread} replyLine focus={null} showWork={false} />
              )
            ) : null}
            {panel === "calendar" ? (
              events.length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">
                  Мероприятий нет. Скажи «планёрка завтра в 10 со всеми».
                </p>
              ) : (
                <CalendarList events={events} now={now} meId={meId} onOpen={setOpenEvent} variant="compact" />
              )
            ) : null}
            {panel === "secretary" ? (
              <SecretaryPanel
                actions={catalogue.data ?? []}
                errands={errandRows}
                now={now}
                onRefresh={() => void errands.refetch()}
              />
            ) : null}
            {panel === "ether" ? (
              (ether.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет. Скажи «всем: …».</p>
              ) : (
                <EtherSection variant="page" />
              )
            ) : null}
          </motion.div>
        ) : null}
      </LayoutGroup>

      {/* the bottom: the gesture hint — never under the face */}
      {showHint && mode === "idle" ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 10px)" }}
          data-testid="lever-hint"
        >
          удержи — говори · тап — задачи · потяни вниз — текст
        </p>
      ) : null}

      <EventSheet event={openEvent} onClose={() => setOpenEvent(null)} meId={meId} isDirector />

      <ThreadSheet
        open={Boolean(thread)}
        onClose={() => setThread(null)}
        taskId={thread?.id ?? null}
        title={thread?.title ?? ""}
        companyId={companyId}
        userId={meId || undefined}
        actions={actions}
        isDirector
      />
    </main>
  );
}

function ExchangeButtons({ exchange, onManual, onClose }: { exchange: Exchange; onManual: () => void; onClose: () => void }) {
  return (
    <div className="card-in flex flex-wrap justify-center gap-2 pt-1">
      {!exchange.understood ? (
        <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={onManual}>
          Сделать задачей
        </Button>
      ) : null}
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
}
