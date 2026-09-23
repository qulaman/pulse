"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { CalendarList } from "@/components/calendar/CalendarList";
import { EventSheet } from "@/components/calendar/EventSheet";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { CardDeck } from "@/components/pulse/CardDeck";
import { IdleScene } from "@/components/pulse/IdleScene";
import { loadsOf } from "@/lib/idle/people";
import { ConfirmInline, type ConfirmHandle } from "@/components/confirm/ConfirmInline";
import { entitiesSummary } from "@/components/confirm/format";
import { MascotLever, useLeverHint } from "@/components/pulse/MascotLever";
import { OrbitBalls, type OrbitBall, type OrbitId } from "@/components/pulse/OrbitBalls";
import { PickCard, type Picked } from "@/components/pulse/PickCard";
import { ThoughtBubble } from "@/components/pulse/ThoughtBubble";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useSpeech } from "@/components/pulse/useSpeech";
import { PushCard } from "@/components/push/PushCard";
import { ThreadSheet } from "@/components/tasks/thread/ThreadSheet";
import { Button } from "@/components/ui/Button";
import { nextEvent, startsSoon, todayCount } from "@/lib/calendar/agenda";
import { useCalendar, type CalendarEvent } from "@/lib/calendar/queries";
import { nextEventLine } from "@/lib/calendar/say";
import { SecretaryCard } from "@/components/pulse/SecretaryCard";
import { DESK_FACE, DESK_H, DESK_W, SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { useEther } from "@/lib/ether/queries";
import { useDeskFocus } from "@/components/secretary/useDeskFocus";
import { activeCount, useErrands, useSecretaryActions, useSecretarySetup } from "@/lib/errands/queries";
import { urgencyOf } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { countsOf, emptyLanes, hasMessage, isOnBoard, lanesOf, toBriefTask, WORK_STATUSES, type BoardTask, type Lanes } from "@/lib/pulse/board";
import { alarmOf } from "@/lib/pulse/mood";
import { useLastVisit, useNow } from "@/lib/pulse/queries";
import { isCountable, isSendable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";

type Exchange = { key: string; said: string; lines: string[]; understood: boolean };

/**
 * The face's look at a point, px from its middle, as a direction it can hold: mostly
 * sideways and down, never so far up that the pupils leave the eye (D-84).
 */
function lookAt(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: Math.max(-0.6, y / length) };
}

/** idle — the face asleep in the middle; ring — awake, the balls orbit it; panel — one ball opened under the row of balls. */
type Mode = "idle" | "ring" | "panel";

/** One full swing of `mascot-throw`: the face keeps throwing even if the server was faster. */
const THROW_MS = 1200;
const FACE = 128;
const FACE_SMALL = 88;
/** Distance from the face's centre to the balls' centres. */
const RING_RADIUS = 124;
/** How long a thought hangs above the head before the face dozes off again. */
const THOUGHT_MS = 9_000;
/** The batch has landed: the face jumps for joy this long after the throw (D-82). */
const CHEER_MS = 1_800;

/**
 * An open ball is a job the face does by hand while the panel is open (D-82): it ticks off
 * the tasks on a clipboard, answers a message, shouts into Эфир through a megaphone, tears a
 * page off the calendar. (The coffee is brought for the secretary's desk since D-85.)
 */
const PANEL_FACE: Record<OrbitId, MascotState> = {
  tasks: "checking",
  messages: "chatting",
  ether: "announcing",
  calendar: "scheduling",
  // the director has no «Секретарь» ball since D-85 (the secretary's own Лента keeps one)
  secretary: "serving",
};

/**
 * The secretary's desk on the waiting screen (D-85): right of the face, level with it, clear
 * of the face's own button (152 px across) and of the rows of idlers below. px from the
 * middle of the face to the desk's top-left corner.
 */
const DESK_AT = { x: 80, y: -14 };
const NO_ACTIONS: SecretaryAction[] = [];
/** The finishes the small secretary brings over as a cup — the big face takes it (D-97). */
const DRINKS = new Set(["coffee", "tea", "water"]);

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
  const startVoice = useIngestStore((state) => state.startVoice);
  const stopVoice = useIngestStore((state) => state.stopVoice);

  // ---- somebody picked on the waiting screen (D-84) -----------------------------------------
  // The face turns to them and the ways to give them a task come out over its head; holding
  // the face records for them too. The pick lasts until the phrase leaves for the parser.
  const [picked, setPicked] = useState<Picked | null>(null);
  // the secretary at the desk has turned to the face, and the errand buttons are out (D-85)
  const [deskOpen, setDeskOpen] = useState(false);
  // the face is held for the picked person right now: the card drops its buttons (D-84)
  const [held, setHeld] = useState(false);
  useEffect(
    () =>
      useIngestStore.subscribe((current) => {
        // an error keeps the pick — «слишком коротко» is retried for the same person
        if (current.stage !== "idle" && current.stage !== "recording" && current.stage !== "error") setPicked(null);
        // a phrase started over the errand card is not an errand: the card steps aside
        if (current.stage !== "idle") setDeskOpen(false);
      }),
    [],
  );
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  // ---- the phrase just parsed, confirmed right here (D-60, sixth refinement) ---------------
  // «sending» keeps the cards on screen while they fly — the store clears them on landing
  const confirming = (stage === "confirm" || stage === "sending") && entities.length > 0;
  const sendableCount = entities.filter((entity) => isSendable(entity, pointsEnabled)).length;
  const confirmRef = useRef<ConfirmHandle>(null);
  // The send answers in ~0.5 s, the throw takes 1.2 s: without this the face froze mid
  // wind-up and the card never left the hand. The swing is held to its end (D-60, sixth).
  const [throwing, setThrowing] = useState(false);
  const throwTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throwEndsAt = useRef(0);
  // The batch has landed (the store went from «sending» to done): the face celebrates — after
  // the swing, never over it. A failed send goes to «error» and gets no confetti.
  const [cheering, setCheering] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = useIngestStore.subscribe((current, previous) => {
      if (previous.stage !== "sending" || (current.stage !== "done" && current.stage !== "idle")) return;
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      cheerTimer.current = setTimeout(
        () => {
          setCheering(true);
          cheerTimer.current = setTimeout(() => setCheering(false), CHEER_MS);
        },
        Math.max(0, throwEndsAt.current - Date.now()),
      );
    });
    return () => {
      unsubscribe();
      if (throwTimer.current) clearTimeout(throwTimer.current);
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
    };
  }, []);
  /** the phrase owns the screen from the parse until the swing after the tap is over */
  const phraseInHand = confirming || throwing;

  const loading = me.isLoading || board.isLoading;
  const rows = board.data;
  const lanes = useMemo(() => lanesOf(rows ?? [], now, meId), [rows, now, meId]);
  const counts = countsOf(lanes);
  const ether = useEther();
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);
  // the fifth ball, its socket and the catalogue exist only when the company has
  // somebody to ask (D-79 §4)
  const people = usePeople();
  const hasSecretary = (people.data ?? []).some((p) => p.role === "secretary" && p.is_active);
  const errands = useErrands(hasSecretary);
  const errandRows = useMemo(() => errands.data ?? [], [errands.data]);
  const catalogue = useSecretaryActions(hasSecretary);
  // what the secretaries are doing about the requests, for the small secretary at the desk:
  // the job in its hands, the picture on its monitor, the cup brought over after «Готово» (D-97)
  const deskStage = useDeskFocus(errandRows, null, catalogue.data ?? NO_ACTIONS);
  const secretarySetup = useSecretarySetup(hasSecretary);
  // Эфир is news too: an announcement going out and every «ознакомился» coming back;
  // so are the calendar — an answer, a move, the reminder the tick has just written —
  // and the errands: «Айгуль · кофе принят»
  const speech = useSpeech(rows, lanes, now, directorName, meId, ether.data, calendar.data, errands.data);
  const nextMeeting = useMemo(() => nextEvent(events, now), [events, now]);
  const eventSoon = startsSoon(nextMeeting, now);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const showHint = useLeverHint();

  // ---- the balls and the panels ------------------------------------------------------------
  const [mode, setMode] = useState<Mode>("idle");
  const [panel, setPanel] = useState<OrbitId | null>(null);
  const [wakeKey, setWakeKey] = useState(0);
  // the thread opens over the board; Пульс underneath is never unmounted, so the deck,
  // the balls and the mascot are where they were when the sheet closes (D-64 §5)
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);
  const openThread = (task: BoardTask) => setThread({ id: task.id, title: task.title });

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
      // the secretary is not a ball: it sits at its own desk next to the face (D-85)
    ],
    [taskCount, counts.overdue, counts.declined, counts.review, messageTasks.length, ether.data, events, now, eventSoon],
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
  // the board is one screen: the shell stops growing with its content while this page is open
  useEffect(() => {
    document.body.setAttribute("data-board", "");
    return () => document.body.removeAttribute("data-board");
  }, []);

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

  // The director's assistant is never angry (D-70, владелец): whatever waits for him — a
  // deadline within the hour, an order unaccepted for half an hour, an unread word — the
  // face just goes watchful. The balls and the line say which of the three it is.
  const alarm = useMemo(() => alarmOf(rows ?? [], now, meId), [rows, now, meId]);
  // a meeting within the quarter of an hour is worth the same watchful face as a deadline
  const mood: MascotState | null = alarm || eventSoon ? "alert" : null;
  const awake: MascotState = loading
    ? "thinking"
    : speech.speaking
      ? "speaking"
      : (mood ?? (counts.attention > 0 ? "calm" : "happy"));
  // while the cards wait for the throw the face shows whether they are ready to fly; once
  // they have landed it jumps for joy (D-82)
  const confirmFace: MascotState | null = throwing
    ? "sending"
    : cheering
      ? "celebrating"
      : confirming
        ? sendableCount > 0
          ? "offering"
          : "thinking"
        : null;
  // a thought wakes the face whatever it was doing; without one the idle face sleeps
  // a change on the board is data the assistant has just read: it reports the new status (D-65)
  // The face sleeps only when the board is quiet: a mood outranks sleep, so the barometer
  // is readable without a tap (владелец, 2026-09-17 — «маскот должен меняться и в покое»).
  const restFace: MascotState = mood ?? "sleeping";
  // a picked person wakes the face: it cannot look at anybody with its eyes shut
  const attending = picked !== null && (stage === "idle" || stage === "recording");
  // the desk is part of the waiting screen: shown there, and only when there is somebody at it
  const showDesk = hasSecretary && mode === "idle" && !phraseInHand && (stage === "idle" || stage === "recording");
  const asking = deskOpen && showDesk && stage === "idle";
  // the small secretary has brought the cup over: the face takes it and looks at the desk
  const handoff = showDesk && !asking && stage === "idle" && deskStage.phase === "done" && DRINKS.has(deskStage.scene ?? "");
  // an open ball is a job in the face's hands, and it does it while the panel is open (D-82)
  const panelFace: MascotState | null = mode === "panel" && panel ? PANEL_FACE[panel] : null;
  // asking the secretary, the face brings the cup and looks at the desk (D-85)
  const mascot: MascotState =
    // the cup brought over outranks the news of it: the face takes it, the thought says it
    confirmFace ?? (handoff ? "serving" : thought ? "processing" : mode === "idle" ? (asking ? "serving" : attending ? "calm" : restFace) : (panelFace ?? awake));
  // where the face looks: the middle of the picked circle, or the small face at the desk
  const gaze = attending && picked ? lookAt(picked.x, picked.y) : asking || handoff ? lookAt(DESK_AT.x + DESK_FACE.x, DESK_AT.y + DESK_FACE.y) : null;
  // the small things a face at rest does on its own — asleep, waiting on the ring, or
  // watchful (D-82); never while anything is in flight or said
  const acts = useMascotActs(mascot, stage === "idle" && !phraseInHand && !cheering && !exchange && mode !== "panel" && !attending && !asking && !handoff);

  const onFaceTap = () => {
    // the errand card is out: a tap on the face puts it away, it does not wake the balls
    if (asking) {
      setDeskOpen(false);
      return;
    }
    // somebody is picked: the face is their microphone — a tap starts, a tap stops (D-84);
    // holding it works as always and never gets here
    if (picked && !phraseInHand) {
      if (stage === "recording") void stopVoice();
      else if (stage === "idle" || stage === "error" || stage === "question") void startVoice(picked.address, { id: picked.id, name: picked.name });
      return;
    }
    // a phrase is in hand: the face is the throw, nothing else (D-36 — never by itself)
    if (phraseInHand) {
      if (confirmRef.current?.throwBatch()) {
        setThrowing(true);
        throwEndsAt.current = Date.now() + THROW_MS;
        if (throwTimer.current) clearTimeout(throwTimer.current);
        throwTimer.current = setTimeout(() => setThrowing(false), THROW_MS);
      }
      return;
    }
    closeExchange();
    if (mode === "idle") {
      // waking up: a stretch, a wave hello, the summary, the balls come out
      setWakeKey((key) => key + 1);
      speech.replay();
      setMode("ring");
      acts.play("wave");
    } else if (mode === "panel") {
      // one step back: the panel folds, the balls orbit again
      setMode("ring");
      setPanel(null);
    } else {
      setMode("idle");
      setPanel(null);
      // dozing off again with a yawn — unless something waits, then the face stays watchful
      if (!mood) acts.play("yawn");
    }
  };
  const team = (people.data ?? []).filter((p) => p.is_active && p.role !== "director" && p.role !== "tv");
  // the secretaries sit at the desk, not among the circles (D-85)
  const secretaries = team.filter((p) => p.role === "secretary");
  // the waiting screen's own view of the team: who is carrying what right now (D-69)
  const field = useMemo(
    () => ({
      people: team
        .filter((p) => p.role !== "secretary")
        .map((p) => ({ id: p.id, fullName: p.full_name, alias: p.aliases?.[0] ?? null, available: p.availability === "active" })),
      loads: loadsOf(
        (rows ?? []).map((t) => ({ id: t.id, assignee_id: t.assignee_id, status: t.status, deadline: t.deadline, title: t.title, question: t.question, decline_reason: t.decline_reason })),
        now.getTime(),
      ),
      now: now.getTime(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- team is derived from people.data
    [people.data, rows, now],
  );
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 84 : faceSize + 24;

  // «Понял так: 2 задачи» — the assistant's own words, where its words always are
  const confirmLines: AssistantLine[] = phraseInHand
    ? [
        {
          id: `confirm:${requestId ?? "draft"}:${entities.length}:${sendableCount}:${throwing ? "fly" : "wait"}`,
          // no «тапни меня» in words: the face asks for the tap itself (`offering`)
          text: throwing
            ? "Отправляю…"
            : `Понял так: ${entitiesSummary(entities)}.${sendableCount > 0 ? "" : " Не хватает исполнителя."}`,
          tone: sendableCount > 0 ? "ok" : "warn",
        },
      ]
    : [];

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
    // three bands, and the middle one never moves: the face sits in the centre of the screen
    // in every mode, the assistant's words grow upwards above it and the cards downwards
    // under it. The bands scroll inside themselves, so the page itself is always one screen
    // — no scrollbar appearing and disappearing on a tap (D-60).
    <main
      className="mx-auto flex w-full min-h-0 max-w-lg flex-1 flex-col overflow-hidden px-4"
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
    >
      <LayoutGroup>
        {/* above the head: what the assistant says */}
        <div className="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto" data-band="said">
          <div className="mt-auto pb-3 pt-2">
            <Assistant said={exchange?.said ?? null} lines={phraseInHand ? confirmLines : loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}>
              {exchange ? <ExchangeButtons exchange={exchange} onManual={startManual} onClose={closeExchange} /> : null}
            </Assistant>
          </div>
        </div>

        {/* the face, and the balls orbiting it (ring) or in a row under it (panel) */}
        <div className="relative flex shrink-0 flex-col items-center">
          <motion.div layout className="relative flex items-center justify-center" style={{ width: box, height: box }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            {/* The waiting screen (D-68, D-71): drawn before the face, so the team and the
                dream pass behind the head. It belongs to the screen being at rest, not to one
                pose of the face — since D-70 the resting face is a barometer and only sleeps
                when nothing waits. The team also stays while the director is recording a task
                he started from somebody's own orb (D-72); the dream does not — a dream is for
                a face that is not doing anything. */}
            <IdleScene
              active={mode === "idle" && (stage === "idle" || stage === "recording")}
              // a face that is looking at somebody is not dreaming
              quiet={!thought && stage === "idle" && !attending && !asking}
              team={field}
              picked={picked?.id ?? null}
              onPick={(orb) => {
                // a sleeping face wakes up with a stretch before it looks
                if (orb && !picked && !asking && restFace === "sleeping") setWakeKey((key) => key + 1);
                setDeskOpen(false);
                setPicked(orb ? { id: orb.id, name: orb.name, address: orb.address, x: orb.x, y: orb.y } : null);
              }}
            />
            <MascotLever
              state={mascot}
              act={acts.act}
              onTap={onFaceTap}
              size={faceSize}
              wakeKey={wakeKey}
              // a phrase in hand owns the face: no new recording over it, a tap throws
              voice={!phraseInHand}
              // the words above the head already say «Отправляю…» while the cards fly
              caption={!phraseInHand}
              label={
                phraseInHand
                  ? sendableCount > 0
                    ? "Маскот: тап — отправить"
                    : "Маскот: тап — указать, кому"
                  : picked
                    ? `Маскот: задача для ${picked.name} — удержи и говори или тапни`
                    : undefined
              }
              pin={picked && !phraseInHand ? { id: picked.id, name: picked.name, address: picked.address } : null}
              gaze={gaze}
              onHold={setHeld}
            />
            {/* the ways to give the picked person a task, right over the face that is looking at them */}
            <AnimatePresence>
              {picked && mode === "idle" && (stage === "idle" || stage === "recording") ? (
                <div key={picked.id} className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
                  <PickCard picked={picked} held={held} onClose={() => setPicked(null)} />
                </div>
              ) : null}
            </AnimatePresence>
            {/* the secretary at the desk, right of the face (D-85): types while nobody asks; a
                tap turns it to the face, the face to it, and the errand buttons come out */}
            <AnimatePresence>
              {showDesk ? (
                <motion.div
                  key="desk"
                  className="absolute left-1/2 top-1/2 z-20"
                  style={{ marginLeft: DESK_AT.x, marginTop: DESK_AT.y, width: DESK_W, height: DESK_H }}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12, transition: { duration: 0.18 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                >
                  {/* a narrow phone keeps the desk a little smaller, so it never touches the edge */}
                  <div className="origin-top-left [@media(max-width:380px)]:scale-[0.84]">
                  <SecretaryDesk
                    attending={asking}
                    scene={deskStage.scene}
                    phase={deskStage.phase}
                    urgency={urgencyOf(deskStage.phase === "asked" ? deskStage.errand : null, now, secretarySetup.data?.escalateAfterMin ?? 3)}
                    count={activeCount(errandRows)}
                    tone={errandRows.some((e) => e.status === "accepted") ? "var(--ok)" : "var(--warn)"}
                    label={asking ? "Секретарь: убрать кнопки" : `Секретарь${secretaries.length ? `: ${secretaries.map((p) => firstNameOf(p.full_name)).join(", ")}` : ""} — попросить`}
                    onTap={() => {
                      if (stage !== "idle") return;
                      if (!asking && restFace === "sleeping" && !picked) setWakeKey((key) => key + 1);
                      setPicked(null);
                      setDeskOpen(!asking);
                    }}
                  />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {asking ? (
                <div key="secretary" className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
                  <SecretaryCard
                    names={secretaries.map((p) => firstNameOf(p.full_name)).join(", ") || "на месте"}
                    actions={catalogue.data ?? []}
                    errands={errandRows}
                    now={now}
                    onRefresh={() => void errands.refetch()}
                    // «спасибо» for a closed request waits for the adaptation gate (D-40, D-97)
                    thanks={pointsEnabled}
                    onClose={() => setDeskOpen(false)}
                  />
                </div>
              ) : null}
            </AnimatePresence>
            {/* the balls stay mounted while the face sleeps (shrunk into the head), so opening a
                panel walks them down into the row instead of throwing them away (D-60) */}
            {mode !== "panel" && !phraseInHand ? (
              <OrbitBalls balls={balls} mode="ring" activeId={null} radius={RING_RADIUS} onPick={pick} hidden={mode === "idle"} />
            ) : null}
            <AnimatePresence>
              {thought ? (
                <ThoughtBubble
                  key={thought.id}
                  text={thought.text}
                  tone={thought.tone}
                  faceSize={faceSize}
                  onDismiss={() => setExpiredThought(thought.id)}
                  // a thought about Эфир or the calendar opens no thread — there is none behind it
                  onOpen={!thought.source && thoughtTask ? () => openThread(thoughtTask) : undefined}
                />
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* under the head: the balls in a row, then the cards. The row is outside the scroller,
            so a ball walking down from the orbit is never clipped on its way in. */}
        <div className="flex min-h-0 flex-1 flex-col" data-band="cards">
          {mode === "panel" && !phraseInHand ? (
            <div className="mt-1 w-full shrink-0">
              <OrbitBalls balls={balls} mode="row" activeId={panel} radius={RING_RADIUS} onPick={pick} />
            </div>
          ) : null}
          <div className="no-bar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pt-2">
            {/* the phrase in hand takes the whole band: its cards, and nothing else to do */}
            {confirming ? <ConfirmInline ref={confirmRef} /> : null}
            {/* service cards only once the face has been tapped — the idle screen is the face alone */}
            {!phraseInHand && mode !== "idle" ? serviceLines : null}
            {mode === "panel" && !phraseInHand ? (
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
                {panel === "ether" ? (
                  (ether.data ?? []).length === 0 ? (
                    <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет. Скажи «всем: …».</p>
                  ) : (
                    <EtherSection variant="page" />
                  )
                ) : null}
              </motion.div>
            ) : null}
          </div>
        </div>
      </LayoutGroup>

      {/* the bottom: the gesture hint — never under the face */}
      {/* the hint is for an idle face: while the phrase is in flight the face says what it does */}
      {showHint && mode === "idle" && stage === "idle" && !picked && !asking ? (
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
