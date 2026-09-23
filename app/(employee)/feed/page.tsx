"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { IdleScene } from "@/components/pulse/IdleScene";
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
import { ErrandCards } from "@/components/secretary/ErrandCards";
import { DndLamp } from "@/components/secretary/DndLamp";
import { SecretaryFace } from "@/components/secretary/SecretaryFace";
import { useDeskFocus } from "@/components/secretary/useDeskFocus";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitorButton } from "@/components/visits/VisitorButton";
import { useSecretaryActs } from "@/components/secretary/useSecretaryActs";
import { haptic } from "@/lib/haptics";
import { useErrandActions } from "@/lib/errands/mutations";
import { useErrands, useSecretaryActions, useSecretarySetup, type Errand } from "@/lib/errands/queries";
import { askedDetails, daypartOf, deskLine, quickStreak, sceneOf, todayTally, urgencyOf } from "@/lib/errands/scene";
import { usePointsEnabled } from "@/lib/points/queries";
import type { SecretaryAction } from "@/lib/settings";
import { describeErrandsForSecretary } from "@/lib/errands/say";
import { useEther } from "@/lib/ether/queries";
import { describeEtherForEmployee } from "@/lib/pulse/ether";
import { hasUnread, isOnBoard, lanesOf, type BoardTask } from "@/lib/pulse/board";
import { describeForEmployeeAll, employeeOpening, isOpenFor, isTodo, otherSideOf } from "@/lib/pulse/employee";
import { alarmOf } from "@/lib/pulse/mood";
import { useNow } from "@/lib/pulse/queries";
import { sortByUrgency, useMe, usePulseBoard } from "@/lib/tasks/queries";
import { useTaskActions, type TaskActions } from "@/lib/tasks/mutations";
import { firstNameOf } from "@/lib/text/normalize";
import { useVisits } from "@/lib/visits/queries";

type Mode = "idle" | "ring" | "panel";

const FACE = 128;
const FACE_SMALL = 88;
const RING_RADIUS = 124;
const THOUGHT_MS = 9_000;
const NO_ACTIONS: SecretaryAction[] = [];
const OFFICE_HOURS = { from: "08:00", to: "21:00" };

/**
 * Лента — the employee's home (D-62): the same sleeping face in the middle of the
 * screen. A tap wakes it: it says what is new for the person and three balls orbit it —
 * «Дела» (orders to accept or redo), «Сообщения» (the director's unread words),
 * «Эфир» (announcements not yet acknowledged). A ball opens its panel; a change from
 * the director's side is a thought above the head. No microphone here: the person
 * speaks inside a task, not to the face.
 *
 * The secretary's Лента is its own (D-87): its own face — the secretary at work, acting out
 * the director's request in hand (coffee, tea, «не беспокоить», a guest) — a line under it
 * saying what it is doing, and the live requests right on the waiting screen, so «Принял»
 * is one tap away instead of three.
 */
export default function FeedPage() {
  const me = useMe();
  const meId = me.data?.userId ?? "";
  const board = usePulseBoard(me.data); // the query and the socket ask for the person's own tasks
  // the secretary's face calls harder by the minute and counts how long the door is shut:
  // its clock ticks every ten seconds, everybody else's every minute
  const now = useNow(me.data?.role === "secretary" ? 10_000 : 60_000);
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";
  const name = firstNameOf(me.data?.fullName);
  const ether = useEther();
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);

  const rows = board.data;
  const loading = me.isLoading || board.isLoading;
  const open = useMemo(() => (rows ?? []).filter((task) => isOnBoard(task.status)), [rows]);
  const lanes = useMemo(() => lanesOf(open, now, meId), [open, now, meId]);
  // заявки читает только секретарь: остальным ролям RLS не отдаёт ни строки (D-79 §8)
  const isSecretary = me.data?.role === "secretary";
  const errands = useErrands(isSecretary);
  const errandRows = useMemo(() => errands.data ?? [], [errands.data]);
  const voice = useMemo<Voice>(
    () => ({
      opening: employeeOpening,
      describe: (prev, next) => describeForEmployeeAll(prev, next, meId),
      // a word to everyone is news to the person too — the face wakes up to it
      describeEther: (prev, next) => describeEtherForEmployee(prev, next, meId),
      // an invitation, a move and «скоро начнётся» are news for the person too
      describeCalendar: (prev, next, at) => describeCalendar(prev, next, at, meId),
      // «Директор просит: кофе» — the errand arrives as a thought above the head
      describeErrands: (prev, next) => describeErrandsForSecretary(prev, next, meId),
    }),
    [meId],
  );
  const speech = useSpeechWith(rows, lanes, now, name, voice, ether.data, calendar.data, isSecretary ? errands.data : undefined);

  // «Дела»: what to accept or redo first, then what is in work, then what waits for the director
  const todo = useMemo(() => sortByUrgency(open.filter(isTodo), now), [open, now]);
  const inWork = useMemo(() => sortByUrgency(open.filter((task) => isOpenFor(task) && !isTodo(task)), now), [open, now]);
  const onReview = useMemo(() => sortByUrgency(open.filter((task) => task.status === "pending_review"), now), [open, now]);
  const unread = useMemo(() => open.filter((task) => hasUnread(task, meId)), [open, meId]);
  const unacked = useMemo(() => (ether.data ?? []).filter((item) => !item.acks.some((ack) => ack.user_id === meId)), [ether.data, meId]);

  // живые заявки секретаря: ничьи и свои принятые — чужая принятая гаснет сама
  const mineErrands = useMemo(
    () => errandRows.filter((e) => e.status === "sent" || (e.status === "accepted" && e.claimed_by === meId)),
    [errandRows, meId],
  );
  // the request the secretary's face acts out, the finish after «Готово», the nod on
  // «Принял» and the hearts of a thank-you (D-87, D-97)
  const catalogue = useSecretaryActions(isSecretary);
  const secretarySetup = useSecretarySetup(isSecretary);
  const pointsEnabled = usePointsEnabled().data === true;
  const errandActions = useErrandActions();
  const errandDesk = useDeskFocus(errandRows, meId, catalogue.data ?? NO_ACTIONS);
  // «К вам посетитель» (D-96): the reception's own cards, and the director's «пусть заходит»
  // plays the guest scene — the door opens — unless a new request is ringing
  const visits = useVisits(isSecretary);
  const visitRows = useMemo(() => visits.data ?? [], [visits.data]);
  const letIn = visitRows.find((v) => v.status === "invited" && !v.closed_at) ?? null;
  const showsGuest = letIn !== null && errandDesk.phase !== "asked";
  const desk = showsGuest ? { ...errandDesk, scene: "guest" as const, phase: "doing" as const } : errandDesk;
  const urgency = urgencyOf(desk.phase === "asked" ? desk.errand : null, now, secretarySetup.data?.escalateAfterMin ?? 3);
  const daypart = daypartOf(now, secretarySetup.data?.window ?? OFFICE_HOURS);
  // «не беспокоить», whoever of the secretaries took it: the whole screen says so
  const guarded = useMemo(
    () => errandRows.find((e) => e.status === "accepted" && sceneOf(e, catalogue.data ?? NO_ACTIONS) === "dnd") ?? null,
    [errandRows, catalogue.data],
  );
  const tally = useMemo(() => todayTally(errandRows, meId, now, catalogue.data ?? NO_ACTIONS), [errandRows, meId, now, catalogue.data]);
  // the game feel waits for the adaptation gate — the same switch as the points (D-40, D-48)
  const streak = pointsEnabled && desk.phase === "done" ? quickStreak(errandRows, meId, now) : 0;

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
      // пятый шарик только у секретаря: «Заявки» — свои и ничьи ещё (D-79)
      ...(isSecretary
        ? [
            {
              id: "secretary" as const,
              label: "Заявки",
              count: mineErrands.length,
              tone: mineErrands.some((e) => e.status === "sent") ? "var(--warn)" : "var(--ok)",
            },
          ]
        : []),
    ],
    [todo.length, inWork.length, lanes.overdue.length, unread.length, unacked.length, events, now, isSecretary, mineErrands],
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
  // while a request is calling, the face itself is the biggest «Принял» on the screen (D-97)
  const acceptByFace = isSecretary && mode === "idle" && desk.phase === "asked" && desk.errand !== null;
  const onFaceTap = () => {
    if (acceptByFace && desk.errand) {
      haptic(20);
      errandActions.mutate({ id: desk.errand.id, to: "accepted" });
      return;
    }
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
  // the board is one screen: the shell stops growing with its content while this page is open
  useEffect(() => {
    document.body.setAttribute("data-board", "");
    return () => document.body.removeAttribute("data-board");
  }, []);

  const [expiredThought, setExpiredThought] = useState<string | null>(null);
  // the secretary's face already shows a new request, and the line under it names it
  const shownByDesk = isSecretary && mode === "idle" && speech.line?.source === "errand";
  const thought = speech.line && !speech.line.opening && speech.line.id !== expiredThought && !shownByDesk ? speech.line : null;
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

  // The feelings live here, on the side that carries the work (D-70): an unopened order
  // calls (D-69), a deadline within the hour is panic, an unread word from the director
  // is nerves. The director's face only ever watches.
  const alarm = useMemo(() => alarmOf(open, now, meId), [open, now, meId]);
  const awake: MascotState = loading
    ? "thinking"
    : speech.speaking
      ? "speaking"
      : todo.length > 0
        ? "calling"
        : alarm === "deadline"
          ? "panicking"
          : alarm === "unread"
            ? "nervous"
            : lanes.overdue.length > 0
              ? "calm"
              : "happy";
  // a change on the board is data the assistant has just read: it reports the new status (D-65)
  // An unaccepted order calls even before the first tap: the resting face sleeps only when
  // there is nothing to open (владелец, 2026-09-17 — Марат спал с пятью делами).
  const restFace: MascotState = todo.length > 0 ? "calling" : alarm === "deadline" ? "panicking" : alarm === "unread" ? "nervous" : "sleeping";
  const mascot: MascotState = thought ? "processing" : mode === "idle" ? restFace : awake;
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;
  // the small things at the desk play only at rest, on the waiting screen (D-97)
  const secretaryAct = useSecretaryActs({
    idle: isSecretary && mode === "idle" && desk.phase === "rest" && !thought && !loading,
    daypart,
    acceptKey: desk.acceptKey,
    thanksKey: desk.thanksKey,
  });

  return (
    // three bands, and the middle one never moves: the face sits in the centre of the screen
    // in every mode, what it says grows upwards above it and the cards downwards under it.
    // The bands scroll inside themselves, so the page itself is always one screen (D-60).
    <main
      className="mx-auto flex w-full min-h-0 max-w-lg flex-1 flex-col overflow-hidden px-4"
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
    >
      {isSecretary && guarded ? (
        <DndLamp
          since={guarded.accepted_at ?? guarded.created_at}
          who={guarded.claimed_by !== meId ? firstNameOf(guarded.claimed?.full_name ?? "") || null : null}
          now={now}
        />
      ) : null}
      <LayoutGroup>
        {/* above the head: what the assistant says */}
        <div className="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto" data-band="said">
          <div className="mt-auto pb-3 pt-2">
            <Assistant lines={loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines} />
          </div>
        </div>

        <div className="relative flex shrink-0 flex-col items-center">
          <motion.div layout className="relative flex items-center justify-center" style={{ width: box, height: box }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            {/* the same waiting screen the director has (D-68): dust and a dream behind the
                head while the board is at rest, gone at the first touch */}
            {isSecretary ? (
              // the secretary does not sleep and dream: it sits at work, and its face is the job
              <SecretaryFace
                scene={desk.scene}
                phase={desk.phase}
                size={faceSize}
                wakeKey={wakeKey}
                talking={mode !== "idle" && speech.speaking}
                bare={mode !== "idle"}
                label={acceptByFace && desk.errand ? `Принять: ${desk.errand.label}` : "Секретарь: тап — дела, сообщения, эфир, календарь, заявки"}
                act={secretaryAct}
                urgency={urgency}
                queue={desk.queue}
                daypart={daypart}
                cheer={pointsEnabled && desk.phase === "done" && desk.quick}
                onTap={onFaceTap}
              />
            ) : (
              <>
                <IdleScene active={mode === "idle"} quiet={!thought} />
                <MascotLever state={mascot} onTap={onFaceTap} size={faceSize} wakeKey={wakeKey} voice={false} />
              </>
            )}
            {/* the balls stay mounted while the face sleeps (shrunk into the head), so opening a
                panel walks them down into the row instead of throwing them away (D-60) */}
            {mode !== "panel" ? <OrbitBalls balls={balls} mode="ring" activeId={null} radius={RING_RADIUS} onPick={pick} hidden={mode === "idle"} /> : null}
            <AnimatePresence>
              {thought ? <ThoughtBubble key={thought.id} text={thought.text} tone={thought.tone} faceSize={faceSize} onDismiss={() => setExpiredThought(thought.id)} /> : null}
            </AnimatePresence>
          </motion.div>
          {/* what the secretary is doing, in a few words, right under the face (D-87, D-97) */}
          {isSecretary && mode === "idle" && !loading ? (
            <div className="-mt-1 flex max-w-full flex-col items-center gap-0.5">
              <p
                key={`${desk.phase}-${desk.errand?.id ?? ""}-${secretaryAct === "thanks" ? "t" : ""}`}
                className="card-in max-w-full truncate rounded-full px-3 py-1 text-center text-[15px] font-medium leading-5"
                style={{
                  background: "color-mix(in srgb, var(--surface) 88%, transparent)",
                  color:
                    secretaryAct === "thanks"
                      ? "var(--danger)"
                      : desk.phase === "asked"
                        ? urgency === 2
                          ? "var(--danger)"
                          : "var(--warn)"
                        : desk.phase === "rest"
                          ? "var(--text-muted)"
                          : "var(--text)",
                }}
                data-testid="desk-line"
                data-phase={desk.phase}
                data-urgency={desk.phase === "asked" ? urgency : undefined}
              >
                {secretaryAct === "thanks" ? "Директор: спасибо ♥" : showsGuest ? "Приглашаю посетителя в кабинет" : deskLine(desk)}
                {secretaryAct !== "thanks" && desk.phase === "asked" && desk.errand?.note ? <span className="text-muted"> · {desk.errand.note}</span> : null}
                {streak >= 2 ? <span className="text-muted"> · {streak} подряд быстрее двух минут</span> : null}
              </p>
              {acceptByFace ? (
                <p className="text-[12px] leading-4 text-muted" data-testid="desk-hint">
                  {[askedDetails(desk, now), "тап по лицу — принять"].filter(Boolean).join(" · ")}
                </p>
              ) : desk.phase === "rest" && tally.total > 0 ? (
                // what this secretary closed today, by button — the day's work at a glance
                <p className="nums text-[12px] leading-4 text-muted" data-testid="desk-tally">
                  Сегодня:{" "}
                  {tally.items.map((item) => (
                    <span key={item.kind} className="ml-1">
                      {item.icon || item.label} {item.count}
                    </span>
                  ))}
                  {tally.averageMin !== null ? <span> · в среднем {tally.averageMin} мин</span> : null}
                </p>
              ) : null}
            </div>
          ) : null}
          {/* «Посетитель» (D-96): a person at the desk — one tap, and the director's wall says so */}
          {isSecretary && mode === "idle" && !loading ? (
            <div className="mt-2">
              <VisitorButton visits={visitRows} />
            </div>
          ) : null}
        </div>

        {/* under the head: the balls in a row, then the cards. The row is outside the scroller,
            so a ball walking down from the orbit is never clipped on its way in. */}
        <div className="flex min-h-0 flex-1 flex-col" data-band="cards">
          {mode === "panel" ? (
            <div className="mt-1 w-full shrink-0">
              <OrbitBalls balls={balls} mode="row" activeId={panel} radius={RING_RADIUS} onPick={pick} />
            </div>
          ) : null}
          <div className="no-bar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pt-2">
            {/* the secretary's requests live on the waiting screen itself: «Принял» in one tap */}
            {isSecretary && mode === "idle" ? <ReceptionCards visits={visitRows} now={now} /> : null}
            {isSecretary && mode === "idle" ? <DeskCards mine={mineErrands} meId={meId} now={now} /> : null}
            {mode !== "idle" ? (
              <>
                <PushCard bubble />
                <InstallHint bubble />
              </>
            ) : null}
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
                {panel === "secretary" ? <ErrandCards errands={errandRows} meId={meId} now={now} /> : null}
                {panel === "ether" ? (
                  (ether.data ?? []).length === 0 ? (
                    <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет.</p>
                  ) : (
                    <EtherSection variant="page" />
                  )
                ) : null}
              </motion.div>
            ) : null}
          </div>
        </div>
      </LayoutGroup>

      {/* the hint never lies over the secretary's cards */}
      {mode === "idle" && !(isSecretary && (mineErrands.length > 0 || visitRows.some((v) => !v.closed_at))) ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 10px)" }}
        >
          {isSecretary ? "тап — дела, сообщения, эфир, календарь, заявки" : "тап — дела, сообщения, эфир, календарь"}
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
 * The secretary's requests on the waiting screen (D-87): the live cards, «Принял» in one tap.
 * «Не беспокоить» another secretary took is the lamp at the top of the screen (D-97).
 */
function DeskCards({ mine, meId, now }: { mine: readonly Errand[]; meId: string; now: Date }) {
  if (mine.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="desk-cards">
      <ErrandCards errands={mine} meId={meId} now={now} />
    </div>
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
