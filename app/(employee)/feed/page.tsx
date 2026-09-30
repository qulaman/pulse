"use client";

import { AnimatePresence, LayoutGroup, motion, MotionConfig } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { EtherSection } from "@/components/ether/EtherSection";
import { ACT_MS, ACT_TOUCH, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { IdleScene } from "@/components/pulse/IdleScene";
import { MascotLever } from "@/components/pulse/MascotLever";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { EVENT_ACT, useEmployeeEvents } from "@/components/pulse/useEmployeeEvents";
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
import { ErrandCards, ResultCard } from "@/components/secretary/ErrandCards";
import { Sheet } from "@/components/ui/Sheet";
import { DndLamp } from "@/components/secretary/DndLamp";
import { SecretaryFace } from "@/components/secretary/SecretaryFace";
import { useDeepRest } from "@/lib/useDeepRest";
import { useDeskFocus } from "@/components/secretary/useDeskFocus";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { MessageButton, VisitorButton } from "@/components/visits/VisitorButton";
import { useSecretaryActs } from "@/components/secretary/useSecretaryActs";
import { haptic } from "@/lib/haptics";
import { useErrandActions, useSetAway } from "@/lib/errands/mutations";
import { useErrands, useSecretaries, useSecretaryActions, useSecretarySetup, type Errand } from "@/lib/errands/queries";
import { askedDetails, daypartOf, deskLine, isAway, quickStreak, RESULTS, sceneOf, todayTally, untilLine, urgencyOf } from "@/lib/errands/scene";
import { usePointsArrival, usePointsEnabled } from "@/lib/points/queries";
import type { SecretaryAction } from "@/lib/settings";
import { describeErrandsForSecretary } from "@/lib/errands/say";
import { useEther } from "@/lib/ether/queries";
import { describeEtherForEmployee } from "@/lib/pulse/ether";
import { hasUnread, isOnBoard, lanesOf, type BoardTask } from "@/lib/pulse/board";
import {
  describeForEmployeeAll,
  employeeFace,
  employeeLoad,
  employeeOpening,
  isOpenFor,
  isTodo,
  onTimeStreak,
  otherSideOf,
  reasonOf,
} from "@/lib/pulse/employee";
import { useNow } from "@/lib/pulse/queries";
import { sortByUrgency, useMe, useMyTasks, usePulseBoard } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
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
 * An open ball is a job the employee's face does by hand while the panel is open (D-82, D-110):
 * the same clipboard, conversation and calendar as the director's — but Эфир is heard, not
 * shouted: the megaphone belongs to whoever speaks to everyone.
 */
const PANEL_FACE: Record<OrbitId, MascotState> = {
  tasks: "checking",
  messages: "chatting",
  ether: "tuned",
  calendar: "scheduling",
  secretary: "serving",
  // the employee has no rating ball: their rating is a tab (D-59)
  rating: "happy",
};
/** The medal has landed: then the face jumps with confetti this long (game feel, D-110). */
const CHEER_AFTER_MS = 1_100;
const CHEER_MS = 1_800;
/** How long «+N» and «N подряд в срок» stay by the face. */
const PILL_MS = 4_000;
/** A pile of events is played one after another, but never more than this far behind. */
const QUEUE_MAX_MS = 3_000;
/** The face's spring on a mode change; the words above it and the cards under it ride it too (D-60). */
const BAND_SPRING = { type: "spring" as const, stiffness: 260, damping: 26 };

/**
 * Лента — the employee's home (D-62): the same sleeping face in the middle of the
 * screen. A tap wakes it: it says what is new for the person and three balls orbit it —
 * «Дела» (orders to accept or redo), «Сообщения» (the director's unread words),
 * «Эфир» (announcements not yet acknowledged). A ball opens its panel; a change from
 * the director's side is a thought above the head. No microphone here: the person
 * speaks inside a task, not to the face.
 *
 * The face carries the work (D-110): it holds the orders in work as a stack of cards and sleeps
 * only with empty hands; it catches a new order, nods «есть!», puts up a hand, shrugs, throws the
 * card back up to the director, gets it back to redo or with a medal. A worried face leads to
 * its reason on the tap — the order to accept, the unread word — instead of to the balls.
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
  // «не на месте до 14:00» (D-99): the secretary's own row among the secretaries
  const secretaryPeople = useSecretaries(isSecretary);
  const meAtDesk = (secretaryPeople.data ?? []).find((p) => p.id === meId) ?? null;
  const away = meAtDesk !== null && isAway(meAtDesk, now);
  const setAway = useSetAway(meId);
  const [presenceOpen, setPresenceOpen] = useState(false);
  // what to pass back after «Готово» (D-99): this secretary's jobs of the last ten minutes
  const [skipped, setSkipped] = useState<string[]>([]);
  const errandDesk = useDeskFocus(errandRows, meId, catalogue.data ?? NO_ACTIONS, now);
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

  // a change from the director's side is a thought above the head; the face wakes up to it

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
  // is nerves. The director's face only ever watches. Since D-110 the face also shows what is in
  // its hands: the orders in work as a stack, the handed-over ones as an hourglass — and it
  // sleeps only with empty hands (владелец, 2026-09-17 — Марат спал с пятью делами).
  const load = useMemo(() => employeeLoad(open, now, meId), [open, now, meId]);
  const restFace = employeeFace(load.rest, false);
  // the medal has landed and the points are on (D-40, D-48): a jump with confetti after it
  const [cheering, setCheering] = useState(false);
  const panelFace: MascotState | null = mode === "panel" && panel ? PANEL_FACE[panel] : null;
  // a thought is news from the director: the face is awake for it and plays what happened
  // (D-110) instead of the director's «reads the data» (D-65)
  const mascot: MascotState = cheering
    ? "celebrating"
    : thought
      ? employeeFace(load.rest, true)
      : mode === "idle"
        ? restFace
        : (panelFace ?? (loading ? "thinking" : speech.speaking ? "speaking" : employeeFace(load.rest, true)));
  // the stack is in the hands whenever the hands are not busy with a ball's job
  const carry = !isSecretary && !panelFace && !cheering && load.carry > 0 ? { count: load.carry, hot: load.hot } : null;
  // a worried face leads to its reason on the tap (D-110); the secretary keeps its own face
  const reason = isSecretary ? null : reasonOf(load.rest);

  // the small things a face does on its own (D-82): asleep, busy with the stack, waiting for
  // the director, glad on the ring — never over a thought, a panel or the celebration
  const acts = useMascotActs(mascot, !isSecretary && !loading && !thought && !cheering && mode !== "panel");
  const play = acts.play;
  // one called act after another — an accepted pile nods once per card — but never far behind
  const actsEnd = useRef(0);
  const actTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playInTurn = useCallback(
    (act: MascotAct) => {
      const at = Date.now();
      const wait = Math.max(0, actsEnd.current - at);
      if (wait > QUEUE_MAX_MS) return;
      actsEnd.current = at + wait + ACT_MS[act];
      if (wait === 0) play(act);
      else actTimers.current.push(setTimeout(() => play(act), wait));
      // the phone answers the moment the act lands — the card caught, the medal on the chest
      const touch = ACT_TOUCH[act];
      if (touch) actTimers.current.push(setTimeout(() => haptic(touch[1]), wait + touch[0]));
    },
    [play],
  );
  useEffect(
    () => () => {
      for (const timer of actTimers.current) clearTimeout(timer);
    },
    [],
  );

  // what has just happened to the work — the person's own taps included (D-110)
  const happened = useEmployeeEvents(isSecretary ? undefined : rows, isSecretary ? undefined : ether.data, meId);
  // «N подряд в срок» — the closed orders come from «Мои дела», already subscribed by the tab bar
  const mine = useMyTasks(pointsEnabled && !isSecretary ? meId : undefined);
  const onTime = useMemo(() => onTimeStreak(mine.data ?? []), [mine.data]);
  // each event, each award and each thought plays once: an effect that re-runs for another
  // reason (the motion setting read, the points switch loaded) must not replay the last one
  const playedEvent = useRef(0);
  useEffect(() => {
    if (!happened.event || playedEvent.current === happened.key) return;
    playedEvent.current = happened.key;
    playInTurn(EVENT_ACT[happened.event]);
    if (happened.event !== "approved" || !pointsEnabled) return;
    // the medal lands first, then the jump; the run of «в срок» is said by the face
    const start = setTimeout(() => setCheering(true), CHEER_AFTER_MS);
    const stop = setTimeout(() => setCheering(false), CHEER_AFTER_MS + CHEER_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
      setCheering(false);
    };
  }, [happened, playInTurn, pointsEnabled]);
  // points in (behind the same switch): a coin into the head and «+N» by the face
  const arrival = usePointsArrival(meId, pointsEnabled && !isSecretary);
  const playedArrival = useRef(0);
  useEffect(() => {
    if (arrival.key === 0 || playedArrival.current === arrival.key) return;
    playedArrival.current = arrival.key;
    playInTurn("coin");
  }, [arrival, playInTurn]);
  // the pill under the face follows the medal and the points (adjusted during render, not in
  // an effect); the run of «в срок» is read at the moment of the medal — later it is not news
  const [pill, setPill] = useState<{ key: string; text: string } | null>(null);
  const [pillFor, setPillFor] = useState({ happened: happened.key, arrival: arrival.key });
  if (pillFor.happened !== happened.key || pillFor.arrival !== arrival.key) {
    setPillFor({ happened: happened.key, arrival: arrival.key });
    if (pillFor.arrival !== arrival.key && arrival.amount > 0) {
      setPill({ key: `points-${arrival.key}`, text: `+${arrival.amount} ${pluralRu(arrival.amount, ["очко", "очка", "очков"])}` });
    } else if (happened.event === "approved" && pointsEnabled && onTime >= 2) {
      setPill({ key: `streak-${happened.key}`, text: `🔥 ${onTime} подряд в срок` });
    }
  }
  const pillKey = pill?.key ?? null;
  useEffect(() => {
    if (!pillKey) return;
    const timer = setTimeout(() => setPill(null), PILL_MS);
    return () => clearTimeout(timer);
  }, [pillKey]);
  // a word about the calendar — an invitation, «скоро начнётся» — is a look at the watch
  const calendarThought = !isSecretary && thought?.source === "calendar" ? thought.id : null;
  const playedThought = useRef<string | null>(null);
  useEffect(() => {
    if (!calendarThought || playedThought.current === calendarThought) return;
    playedThought.current = calendarThought;
    playInTurn("watch");
  }, [calendarThought, playInTurn]);

  const onFaceTap = () => {
    if (acceptByFace && desk.errand) {
      haptic(20);
      errandActions.mutate({ id: desk.errand.id, to: "accepted" });
      return;
    }
    if (mode === "idle") {
      setWakeKey((key) => key + 1);
      speech.replay();
      if (reason) {
        // straight to what the face is worried about: face → card, not face → ball → card
        setPanel(reason);
        setMode("panel");
        return;
      }
      setMode("ring");
      if (!isSecretary) play("wave");
    } else if (mode === "panel") {
      setMode("ring");
      setPanel(null);
    } else {
      setMode("idle");
      setPanel(null);
      // dozing off with a yawn — only a face with empty hands goes back to sleep
      if (!isSecretary && restFace === "sleeping") play("yawn");
    }
  };
  // the thought is about something: a tap opens the ball it is about (D-110)
  const thoughtPanel: OrbitId = thought?.source === "ether" ? "ether" : thought?.source === "calendar" ? "calendar" : thought?.source === "errand" ? "secretary" : thought?.message ? "messages" : "tasks";
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;
  // a screen nobody has touched for minutes: the secretary stops typing and reads, and the small
  // things at the desk wait for the next touch (D-119)
  const deepRest = useDeepRest();
  // the small things at the desk play only at rest, on the waiting screen (D-97)
  const secretaryAct = useSecretaryActs({
    idle: isSecretary && mode === "idle" && desk.phase === "rest" && !thought && !loading && !deepRest,
    daypart,
    acceptKey: desk.acceptKey,
    thanksKey: desk.thanksKey,
  });

  // the top of the secretary's screen: the lamp of the director's door and the day's count —
  // laid over the screen, out of the flow, so the face keeps the very middle (D-87 доводка)
  const showTally = isSecretary && mode === "idle" && !loading && tally.total > 0;
  const topInset = isSecretary ? (guarded ? 40 : 0) + (showTally ? 24 : 0) : 0;

  return (
    // three bands, and the middle one never moves: the face sits in the centre of the screen
    // in every mode, what it says grows upwards above it and the cards downwards under it.
    // The bands scroll inside themselves, so the page itself is always one screen (D-60).
    // `data-board` stops the shell growing with its content (globals.css), as in the skeleton.
    <main
      className="relative mx-auto flex w-full min-h-0 max-w-lg flex-1 flex-col overflow-hidden px-4"
      style={{ overscrollBehaviorY: "contain" }}
      data-board=""
      data-mode={mode}
    >
      {isSecretary && (guarded || showTally) ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-4" data-testid="secretary-top">
          {guarded ? (
            <DndLamp
              since={guarded.accepted_at ?? guarded.created_at}
              who={guarded.claimed_by !== meId ? firstNameOf(guarded.claimed?.full_name ?? "") || null : null}
              now={now}
            />
          ) : null}
          {showTally ? (
            // what this secretary closed today, by button — the day's work at a glance
            <p className="nums max-w-full truncate pt-2 text-center text-[12px] leading-4 text-muted" data-testid="desk-tally">
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
      {/* framer's own motion (the balls, the bands) honours «уменьшить движение» (DESIGN §4) */}
      <MotionConfig reducedMotion="user">
      <LayoutGroup>
        {/* above the head: what the assistant says — it glides with the band's edge on a mode change */}
        <motion.div layoutScroll className="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto" data-band="said">
          <motion.div layout="position" transition={BAND_SPRING} className="mt-auto pb-3 pt-2" style={topInset ? { paddingTop: 8 + topInset } : undefined}>
            <Assistant lines={loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines} />
          </motion.div>
        </motion.div>

        <div className="relative flex shrink-0 flex-col items-center">
          {/* not animated: its middle never moves, and a layout animation of its size only squashed
              what is inside it (the dream, the thought) — the face animates its own size */}
          <div className="relative flex items-center justify-center" style={{ width: box, height: box }}>
            {/* the same waiting screen the director has (D-89): dust and a dream behind the
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
                still={deepRest && mode === "idle"}
                onTap={onFaceTap}
              />
            ) : (
              <>
                {/* the dust stays with the resting screen; the dream only with empty hands — a face
                    holding its work, waiting on the director or worried is not dreaming (D-110) */}
                <IdleScene active={mode === "idle"} quiet={!thought && restFace === "sleeping"} />
                <MascotLever
                  state={mascot}
                  act={acts.act}
                  carry={carry}
                  onTap={onFaceTap}
                  size={faceSize}
                  wakeKey={wakeKey}
                  voice={false}
                  label={
                    mode !== "idle"
                      ? undefined
                      : reason === "tasks"
                        ? "Маскот: тап — открыть дела"
                        : reason === "messages"
                          ? "Маскот: тап — сообщение директора"
                          : "Маскот: тап — дела, сообщения, эфир, календарь"
                  }
                />
              </>
            )}
            {/* the balls stay mounted while the face sleeps (shrunk into the head), so opening a
                panel walks them down into the row instead of throwing them away (D-60) */}
            {mode !== "panel" ? <OrbitBalls balls={balls} mode="ring" activeId={null} radius={RING_RADIUS} onPick={pick} hidden={mode === "idle"} /> : null}
            <AnimatePresence>
              {thought ? (
                <ThoughtBubble
                  key={thought.id}
                  text={thought.text}
                  tone={thought.tone}
                  faceSize={faceSize}
                  onDismiss={() => setExpiredThought(thought.id)}
                  // the thought opens what it is about: the order, the word, Эфир, the meeting (D-110)
                  onOpen={() => {
                    setExpiredThought(thought.id);
                    setPanel(thoughtPanel);
                    setMode("panel");
                  }}
                  openLabel={`открыть «${balls.find((ball) => ball.id === thoughtPanel)?.label ?? "Дела"}»`}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* under the head: the balls in a row, then the cards. The row is outside the scroller,
            so a ball walking down from the orbit is never clipped on its way in. */}
        <div className="flex min-h-0 flex-1 flex-col" data-band="cards">
          {/* right under the resting face: «+5 очков», «🔥 3 подряд в срок» — for a few seconds,
              behind the adaptation gate like the points themselves (D-40, D-110) */}
          {!isSecretary && mode === "idle" && pill ? (
            <div className="flex shrink-0 justify-center" data-testid="face-pill">
              <span
                key={pill.key}
                className="card-in nums rounded-full px-3 py-1 text-[14px] font-semibold leading-5"
                style={{ background: "color-mix(in srgb, var(--gold) 18%, var(--surface))", color: "var(--gold)" }}
              >
                {pill.text}
              </span>
            </div>
          ) : null}
          {/* right under the face: what the secretary is doing, «на месте», and a little lower
              «Посетитель» — out of the face's band, so the face stays in the middle (D-87 доводка) */}
          {isSecretary && mode === "idle" && !loading ? (
            <div className="flex shrink-0 flex-col items-center" data-testid="desk-under">
              {/* what the secretary is doing, in a few words, right under the face (D-87, D-97) */}
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
                <button
                  type="button"
                  onClick={() => setPresenceOpen(true)}
                  className="mt-0.5 inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold leading-4"
                  style={{
                    borderColor: away ? "color-mix(in srgb, var(--warn) 55%, var(--border))" : "var(--border)",
                    color: away ? "var(--warn)" : "var(--text-muted)",
                  }}
                  data-testid="presence-chip"
                  data-away={away ? "1" : "0"}
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: away ? "var(--warn)" : "var(--ok)" }} />
                  {away && meAtDesk?.away_until ? `Не на месте ${untilLine(meAtDesk.away_until)}` : "На месте"}
                </button>
                {acceptByFace ? (
                  <p className="text-[12px] leading-4 text-muted" data-testid="desk-hint">
                    {[askedDetails(desk, now), "тап по лицу — принять"].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              {/* «Посетитель» (D-96): a person at the desk — one tap, and the director's wall says so;
                  «Сообщение» (D-116): the secretary's own words on the same wall */}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <VisitorButton visits={visitRows} />
                <MessageButton visits={visitRows} />
              </div>
            </div>
          ) : null}
          {mode === "panel" ? (
            <div className="mt-1 w-full shrink-0">
              <OrbitBalls balls={balls} mode="row" activeId={panel} radius={RING_RADIUS} onPick={pick} />
            </div>
          ) : null}
          <motion.div layout="position" layoutScroll transition={BAND_SPRING} className="no-bar relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pt-2">
            {/* the secretary's requests live on the waiting screen itself: «Принял» in one tap */}
            {isSecretary && mode === "idle" ? <ReceptionCards visits={visitRows} now={now} /> : null}
            {isSecretary && mode === "idle" ? <DeskCards mine={mineErrands} meId={meId} now={now} catalogue={catalogue.data ?? NO_ACTIONS} /> : null}
            {isSecretary && mode === "idle"
              ? errandRows
                  .filter(
                    (e) =>
                      e.status === "done" &&
                      e.claimed_by === meId &&
                      !e.result &&
                      e.done_at &&
                      now.getTime() - new Date(e.done_at).getTime() <= 10 * 60_000 &&
                      !skipped.includes(e.id) &&
                      RESULTS[sceneOf(e, catalogue.data ?? NO_ACTIONS)].length > 0,
                  )
                  .slice(0, 1)
                  .map((e) => (
                    <ResultCard key={e.id} errand={e} scene={sceneOf(e, catalogue.data ?? NO_ACTIONS)} onSkip={() => setSkipped((list) => [...list, e.id])} />
                  ))
              : null}
            {mode !== "idle" ? (
              <>
                <PushCard bubble />
                <InstallHint bubble />
              </>
            ) : null}
            {/* a panel folding away fades out where it stood; position only (a size animation squashed its cards) */}
            <AnimatePresence mode="popLayout">
            {mode === "panel" ? (
              <motion.div
                key={panel}
                layout="position"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
                transition={BAND_SPRING}
                data-testid="panel"
                data-panel={panel}
              >
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
                {panel === "secretary" ? <ErrandCards errands={errandRows} meId={meId} now={now} catalogue={catalogue.data ?? NO_ACTIONS} /> : null}
                {panel === "ether" ? (
                  (ether.data ?? []).length === 0 ? (
                    <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет.</p>
                  ) : (
                    <EtherSection variant="page" />
                  )
                ) : null}
              </motion.div>
            ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      </LayoutGroup>
      </MotionConfig>

      {/* the hint never lies over the secretary's cards */}
      {mode === "idle" && !(isSecretary && (mineErrands.length > 0 || visitRows.some((v) => !v.closed_at))) ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(var(--tabbar-space) + 2px)" }}
        >
          {isSecretary
            ? "тап — дела, сообщения, эфир, календарь, заявки"
            : reason === "tasks"
              ? "тап — открыть дела"
              : reason === "messages"
                ? "тап — прочитать сообщение директора"
                : "тап — дела, сообщения, эфир, календарь"}
        </p>
      ) : null}

      <EventSheet event={openEvent} onClose={() => setOpenEvent(null)} meId={meId} isDirector={false} />

      {isSecretary ? (
        // stepped away (D-99): requests go to the secretaries who are here; nobody — they wait
        <Sheet open={presenceOpen} onClose={() => setPresenceOpen(false)} title={away ? "Вы не на месте" : "Отойти"}>
          <div className="flex flex-col gap-2" data-testid="presence-sheet">
            {away ? (
              <button
                type="button"
                className="min-h-[52px] rounded-[16px] bg-accent text-[16px] font-semibold text-bg"
                onClick={() => {
                  setAway.mutate(null);
                  setPresenceOpen(false);
                }}
              >
                Я на месте
              </button>
            ) : null}
            {[
              { label: "На 15 минут", min: 15 },
              { label: "На 30 минут", min: 30 },
              { label: "На час", min: 60 },
              { label: "До конца дня", min: 0 },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                className="min-h-[48px] rounded-[16px] border border-border bg-surface-2/70 text-[15px] font-semibold"
                onClick={() => {
                  // «до конца дня» — until 21:00 Aqtobe, the end of the delivery window (D-38)
                  const until = option.min
                    ? new Date(Date.now() + option.min * 60_000)
                    : new Date(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) + "T16:00:00Z");
                  setAway.mutate(until.toISOString());
                  setPresenceOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
            <p className="px-1 text-[13px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
          </div>
        </Sheet>
      ) : null}

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
function DeskCards({ mine, meId, now, catalogue }: { mine: readonly Errand[]; meId: string; now: Date; catalogue: readonly SecretaryAction[] }) {
  if (mine.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="desk-cards">
      <ErrandCards errands={mine} meId={meId} now={now} catalogue={catalogue} />
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
