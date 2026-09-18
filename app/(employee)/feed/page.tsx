"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { MascotLever } from "@/components/pulse/MascotLever";
import { CalendarList } from "@/components/calendar/CalendarList";
import { EventSheet } from "@/components/calendar/EventSheet";
import { OrbitBalls, type OrbitBall, type OrbitId } from "@/components/pulse/OrbitBalls";
import { ThoughtBubble } from "@/components/pulse/ThoughtBubble";
import { useSpeechWith, type Voice } from "@/components/pulse/useSpeech";
import { PushCard } from "@/components/push/PushCard";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Composer } from "@/components/tasks/thread/Composer";
import { ThreadSheet } from "@/components/tasks/thread/ThreadSheet";
import { ThreadTail } from "@/components/tasks/thread/ThreadTail";
import { Chip } from "@/components/ui/Chip";
import { nextEvent, startsSoon, todayCount } from "@/lib/calendar/agenda";
import { useCalendar, type CalendarEvent } from "@/lib/calendar/queries";
import { describeCalendar, nextEventLine } from "@/lib/calendar/say";
import { useEther } from "@/lib/ether/queries";
import { hasUnread, isOnBoard, lanesOf, type BoardTask } from "@/lib/pulse/board";
import { describeForEmployeeAll, employeeOpening, isOpenFor, isTodo, otherSideOf } from "@/lib/pulse/employee";
import { useNow } from "@/lib/pulse/queries";
import { sortByUrgency, useMe, usePulseBoard } from "@/lib/tasks/queries";
import { useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import { firstNameOf } from "@/lib/text/normalize";

type Mode = "idle" | "ring" | "panel";

const FACE = 128;
const FACE_SMALL = 88;
const RING_RADIUS = 124;
const THOUGHT_MS = 9_000;

/**
 * Лента — the employee's home (D-62): the same sleeping face in the middle of the
 * screen. A tap wakes it: it says what is new for the person and three balls orbit it —
 * «Дела» (orders to accept or redo), «Сообщения» (the director's unread words),
 * «Эфир» (announcements not yet acknowledged). A ball opens its panel; a change from
 * the director's side is a thought above the head. No microphone here: the person
 * speaks inside a task, not to the face.
 */
export default function FeedPage() {
  const me = useMe();
  const meId = me.data?.userId ?? "";
  const board = usePulseBoard(me.data); // the query and the socket ask for the person's own tasks
  const now = useNow();
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";
  const name = firstNameOf(me.data?.fullName);
  const ether = useEther();

  const rows = board.data;
  const loading = me.isLoading || board.isLoading;
  const open = useMemo(() => (rows ?? []).filter((task) => isOnBoard(task.status)), [rows]);
  const lanes = useMemo(() => lanesOf(open, now, meId), [open, now, meId]);
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);
  const voice = useMemo<Voice>(
    () => ({
      opening: employeeOpening,
      describe: (prev, next) => describeForEmployeeAll(prev, next, meId),
      // an invitation, a move and «скоро начнётся» are news for the person too
      describeCalendar: (prev, next, at) => describeCalendar(prev, next, at, meId),
    }),
    [meId],
  );
  const speech = useSpeechWith(rows, lanes, now, name, voice, calendar.data);

  // «Дела»: what to accept or redo first, then what is in work, then what waits for the director
  const todo = useMemo(() => sortByUrgency(open.filter(isTodo), now), [open, now]);
  const inWork = useMemo(() => sortByUrgency(open.filter((task) => isOpenFor(task) && !isTodo(task)), now), [open, now]);
  const onReview = useMemo(() => sortByUrgency(open.filter((task) => task.status === "pending_review"), now), [open, now]);
  const unread = useMemo(() => open.filter((task) => hasUnread(task, meId)), [open, meId]);
  const unacked = useMemo(() => (ether.data ?? []).filter((item) => !item.acks.some((ack) => ack.user_id === meId)), [ether.data, meId]);

  const [mode, setMode] = useState<Mode>("idle");
  const [panel, setPanel] = useState<OrbitId | null>(null);
  const [wakeKey, setWakeKey] = useState(0);
  // the thread opens over Лента, the face and the balls stay as they were (D-64 §5)
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);

  const balls = useMemo<OrbitBall[]>(
    () => [
      { id: "tasks", label: "Дела", count: todo.length + inWork.length, tone: lanes.overdue.length > 0 ? "var(--danger)" : todo.length > 0 ? "var(--warn)" : "var(--accent)" },
      { id: "messages", label: "Сообщения", count: unread.length, tone: "var(--warn)" },
      { id: "ether", label: "Эфир", count: unacked.length, tone: "var(--gold)" },
      {
        id: "calendar",
        label: "Календарь",
        count: todayCount(events, now),
        tone: startsSoon(nextEvent(events, now), now) ? "var(--warn)" : "var(--accent)",
      },
    ],
    [todo.length, inWork.length, lanes.overdue.length, unread.length, unacked.length, events, now],
  );

  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);

  const pick = (ball: OrbitBall) => {
    if (mode === "panel" && panel === ball.id) {
      setMode("ring");
      setPanel(null);
      return;
    }
    setPanel(ball.id);
    setMode("panel");
  };
  const onFaceTap = () => {
    if (mode === "idle") {
      setWakeKey((key) => key + 1);
      speech.replay();
      setMode("ring");
    } else if (mode === "panel") {
      setMode("ring");
      setPanel(null);
    } else {
      setMode("idle");
      setPanel(null);
    }
  };

  // a change from the director's side is a thought above the head; the face wakes up to it
  const [expiredThought, setExpiredThought] = useState<string | null>(null);
  const thought = speech.line && !speech.line.opening && speech.line.id !== expiredThought ? speech.line : null;
  const thoughtId = thought?.id ?? null;
  useEffect(() => {
    if (!thoughtId) return;
    const timer = setTimeout(() => setExpiredThought(thoughtId), THOUGHT_MS);
    return () => clearTimeout(timer);
  }, [thoughtId]);

  const lines = useMemo<AssistantLine[]>(() => {
    if (!speech.line || !speech.line.opening || mode === "idle") return [];
    // the greeting is followed by the nearest meeting of the day, when there is one
    const soonest = nextEventLine(events, now);
    return soonest ? [speech.line, { id: "calendar", text: soonest }] : [speech.line];
  }, [speech.line, mode, events, now]);

  const awake: MascotState = loading ? "thinking" : speech.speaking ? "speaking" : todo.length > 0 || lanes.overdue.length > 0 ? "calm" : "happy";
  const mascot: MascotState = thought ? "surprised" : mode === "idle" ? "sleeping" : awake;
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;

  return (
    <main
      className={`mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-10 ${mode === "idle" ? "justify-center" : "justify-start pt-2"}`}
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
    >
      <LayoutGroup>
        <div className="relative flex flex-col items-center">
          <motion.div layout className="relative flex items-center justify-center" style={{ width: box, height: box }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <MascotLever state={mascot} onTap={onFaceTap} size={faceSize} wakeKey={wakeKey} voice={false} />
            <AnimatePresence>
              {mode === "ring" ? <OrbitBalls key="ring" balls={balls} mode="ring" activeId={null} radius={RING_RADIUS} onPick={pick} /> : null}
            </AnimatePresence>
            <AnimatePresence>
              {thought ? <ThoughtBubble key={thought.id} text={thought.text} tone={thought.tone} faceSize={faceSize} onDismiss={() => setExpiredThought(thought.id)} /> : null}
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
          <Assistant lines={loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}>
            {mode !== "idle" ? (
              <>
                <PushCard bubble />
                <InstallHint bubble />
              </>
            ) : null}
          </Assistant>
        </motion.div>

        {mode === "panel" ? (
          <motion.div key={panel} layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} data-testid="panel" data-panel={panel}>
            {panel === "tasks" ? (
              todo.length === 0 && inWork.length === 0 && onReview.length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Дел нет. Появится задача — разбужу.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {[...todo, ...inWork].map((task) => (
                    <div key={task.id} className="card-in">
                      <TaskCard task={task} variant="employee" actions={actions} companyId={companyId} href={`/tasks/${task.id}`} />
                    </div>
                  ))}
                  {onReview.length > 0 ? (
                    <>
                      <p className="mt-1 px-1 text-[14px] leading-4 text-muted">На проверке у директора · {onReview.length}</p>
                      {onReview.map((task) => (
                        <div key={task.id} className="card-in opacity-80">
                          <TaskCard task={task} variant="employee" actions={actions} companyId={companyId} href={`/tasks/${task.id}`} />
                        </div>
                      ))}
                    </>
                  ) : null}
                  <Link href="/tasks" className="min-h-[44px] px-1 text-[14px] leading-[44px] text-muted">
                    Все дела ›
                  </Link>
                </div>
              )
            ) : null}
            {panel === "messages" ? (
              unread.length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Новых сообщений от директора нет.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {unread.map((task) => (
                    <MessageRow
                      key={task.id}
                      task={task}
                      companyId={companyId}
                      meId={meId}
                      actions={actions}
                      onRead={(seq) => actions.markRead({ taskId: task.id, companyId, seq })}
                      onOpen={() => setThread({ id: task.id, title: task.title })}
                    />
                  ))}
                </div>
              )
            ) : null}
            {panel === "calendar" ? (
              events.length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Пока ничего не запланировано.</p>
              ) : (
                <CalendarList events={events} now={now} meId={meId} onOpen={setOpenEvent} variant="compact" />
              )
            ) : null}
            {panel === "ether" ? (
              (ether.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет.</p>
              ) : (
                <EtherSection variant="page" />
              )
            ) : null}
          </motion.div>
        ) : null}
      </LayoutGroup>

      {mode === "idle" ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 10px)" }}
        >
          тап — дела, сообщения, эфир, календарь
        </p>
      ) : null}

      <EventSheet event={openEvent} onClose={() => setOpenEvent(null)} meId={meId} isDirector={false} />

      <ThreadSheet
        open={Boolean(thread)}
        onClose={() => setThread(null)}
        taskId={thread?.id ?? null}
        title={thread?.title ?? ""}
        companyId={companyId}
        userId={meId || undefined}
        actions={actions}
      />
    </main>
  );
}

/**
 * A director's unread word on a task: the tail of the thread, «Прочитал», and a reply
 * line right here — the microphone first, because the person answering is usually on a
 * site with gloves on (D-64 §5). The card opens the thread over Лента, never a page.
 */
function MessageRow({
  task,
  companyId,
  meId,
  actions,
  onRead,
  onOpen,
}: {
  task: BoardTask;
  companyId: string;
  meId: string;
  actions: TaskActions;
  onRead: (seq: number) => void;
  onOpen: () => void;
}) {
  const last = task.last_message!;
  return (
    <article className="relative overflow-hidden rounded-[20px] border border-border bg-surface p-4 pl-5" data-testid="message-row">
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: "var(--warn)" }} />
      <span className="block text-[13px] leading-4 text-muted">{otherSideOf(task)}</span>
      <button type="button" onClick={onOpen} className="mt-1 block w-full text-left">
        <span className="line-clamp-2 block text-[17px] font-semibold leading-[22px] text-text">{task.title}</span>
      </button>
      <ThreadTail taskId={task.id} meId={meId} enabled />
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip onClick={() => onRead(last.seq)}>Прочитал</Chip>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-[34px] items-center rounded-full border border-border bg-surface-2 px-3 font-display text-[13px] font-semibold leading-4 text-text"
        >
          Открыть переписку ›
        </button>
      </div>
      <div className="mt-2">
        <Composer taskId={task.id} companyId={companyId} actions={actions} inline micFirst />
      </div>
    </article>
  );
}
