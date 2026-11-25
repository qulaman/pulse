"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { ACT_MS, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { CalendarList } from "@/components/calendar/CalendarList";
import { ConfirmInline, type ConfirmHandle } from "@/components/confirm/ConfirmInline";
import { entitiesSummary } from "@/components/confirm/format";
import { EtherSection } from "@/components/ether/EtherSection";
import type { AssistantLine } from "@/components/pulse/Assistant";
import { CardDeck } from "@/components/pulse/CardDeck";
import { HomeStage } from "@/components/pulse/home/HomeStage";
import { ExchangeButtons, ServiceLines, UnparsedButtons } from "@/components/pulse/home/PulseLines";
import {
  BAND_SPRING,
  ballsShowOf,
  FACE,
  FACE_SMALL,
  faceBox,
  PANEL_FACE,
  QuietEventSheet,
  QuietThreadSheet,
  RING_RADIUS,
  ROW_GAP,
  SWAP_IN,
  SWAP_OUT,
  useThought,
  type Mode,
} from "@/components/pulse/home/stage";
import { useDeskState } from "@/components/pulse/home/useDeskState";
import { usePhraseThrow } from "@/components/pulse/home/usePhraseThrow";
import { useQuestionExchange } from "@/components/pulse/home/useQuestionExchange";
import { IdleScene } from "@/components/pulse/IdleScene";
import { LocalPresence } from "@/components/pulse/LocalPresence";
import { MascotLever, useLeverHint } from "@/components/pulse/MascotLever";
import { OrbitBalls, type OrbitBall, type OrbitId } from "@/components/pulse/OrbitBalls";
import { AFTER_CARD, recede } from "@/components/pulse/PanelCard";
import { PickCard, type Picked } from "@/components/pulse/PickCard";
import { SaidBand } from "@/components/pulse/SaidBand";
import { SAY_WRITE_SKIRT, SayWrite } from "@/components/pulse/SayWrite";
import { SecretaryCard } from "@/components/pulse/SecretaryCard";
import { DESK_FACE, DESK_H, DESK_W, SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { useStableActions, useStableCallback } from "@/components/pulse/stable";
import { thoughtAct } from "@/components/pulse/thoughtActs";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useNoPush } from "@/components/pulse/useNoPush";
import { useSpeech } from "@/components/pulse/useSpeech";
import { RatingPanel } from "@/components/rating/RatingPanel";
import { useDirectorControls } from "@/components/tasks/list/useDirectorControls";
import { MessageAsk } from "@/components/visits/MessageAsk";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { useKeptPill } from "@/components/voice/KeptPhrases";
import { nextEvent, startsSoon, todayCount } from "@/lib/calendar/agenda";
import { useCalendar, type CalendarEvent } from "@/lib/calendar/queries";
import { nextEventLine } from "@/lib/calendar/say";
import { isCountable, isSendable, whyNothingToSend } from "@/lib/confirm/entities";
import { springs } from "@/lib/design/tokens";
import { askSecretary } from "@/lib/errands/pending";
import { activeCount, isActive } from "@/lib/errands/queries";
import { etaLeftMin, sceneOfAction, untilLine, urgencyOf } from "@/lib/errands/scene";
import { useEther } from "@/lib/ether/queries";
import { tasksOf, type Pick } from "@/lib/idle/people";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useOpenDisputes } from "@/lib/points/game";
import { usePointsEnabled } from "@/lib/points/queries";
import { countsOf, emptyLanes, hasMessage, hasUnread, HELD_STATUS, isOnBoard, lanesOf, type BoardTask, type Lanes } from "@/lib/pulse/board";
import { alarmOf } from "@/lib/pulse/mood";
import { useLastVisit } from "@/lib/pulse/queries";
import { directorMascot } from "@/lib/pulse/scene-face";
import { useComposeStore } from "@/lib/store/compose";
import { useIngestStore, type IngestError } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";
import { ERROR_ACT } from "@/lib/voice/stages";

/**
 * The face's look at a point, px from its middle, as a direction it can hold: mostly
 * sideways and down, never so far up that the pupils leave the eye (D-84).
 */
function lookAt(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: Math.max(-0.6, y / length) };
}

/**
 * The scene in one state (D-178): the mode, the open ball, what the screen shows (`view` — a card
 * shows only while no phrase is in hand) and what it showed before (`cameFrom` — the band's own
 * lines come back once a card has gone down). A tap moves all four at once: adjusted during the
 * render, they drew the page twice on every tap.
 */
type Scene = { mode: Mode; panel: OrbitId | null; view: Mode; cameFrom: Mode };
type SceneMove = { mode: Mode; panel: OrbitId | null; held: boolean };
const viewOf = (mode: Mode, held: boolean): Mode => (mode === "panel" ? (held ? "ring" : "panel") : mode);
function moveScene(scene: Scene, move: SceneMove): Scene {
  const view = viewOf(move.mode, move.held);
  if (scene.mode === move.mode && scene.panel === move.panel && scene.view === view) return scene;
  return { mode: move.mode, panel: move.panel, view, cameFrom: view !== scene.view ? scene.view : scene.cameFrom };
}
const AT_REST: Scene = { mode: "idle", panel: null, view: "idle", cameFrom: "idle" };

/** The cards band against the words' band while a phrase of several things waits (D-146). */
const CROWDED_GROW = 8;

/**
 * The secretary's desk on the waiting screen (D-85): right of the face, level with it, clear
 * of the face's own button (152 px across) and of the rows of idlers below. px from the
 * middle of the face to the desk's top-left corner.
 */
const DESK_AT = { x: 80, y: -14 };
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
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const board = usePulseBoard(me.data);
  const since = useLastVisit();
  const now = useNow();
  // one identity for the screen's life: the deck and the thread are memoised (D-178)
  const actions = useStableActions(useTaskActions(me.data));
  const companyId = me.data?.companyId ?? "";
  const meId = me.data?.userId ?? "";
  const directorName = firstNameOf(me.data?.fullName);

  const stage = useIngestStore((state) => state.stage);
  const ingestError = useIngestStore((state) => state.error);
  // the act of the latest failure, while it plays (tasks/020, phase B)
  const [oops, setOops] = useState<MascotAct | null>(null);
  const oopsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entities = useIngestStore((state) => state.entities);
  const question = useIngestStore((state) => state.question);
  const requestId = useIngestStore((state) => state.clientRequestId);
  const heard = useIngestStore((state) => state.transcript);
  // Nothing parsed out of a real phrase — the parser found nothing, or would not take it: the
  // state /confirm draws as «Не разобрал». On Пульс it used to be silent (no cards, so nothing
  // «in hand») and the face just fell asleep while the words sat in a draft
  const unparsed = stage === "confirm" && entities.length === 0 && heard.trim() !== "";
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
  // the card of somebody at work is open on the waiting screen: the face looks at him (D-118)
  const [looking, setLooking] = useState<Pick | null>(null);
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
  // a disputed minus waits for the director's answer on the rating (D-14, D-133)
  const disputes = useOpenDisputes(pointsEnabled).data?.length ?? 0;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  // ---- the phrase just parsed, confirmed right here (D-60, sixth refinement) ---------------
  // «sending» keeps the cards on screen while they fly — the store clears them on landing
  const confirming = (stage === "confirm" || stage === "sending") && entities.length > 0;
  const sendableCount = entities.filter((entity) => isSendable(entity, pointsEnabled)).length;
  const confirmRef = useRef<ConfirmHandle>(null);
  // the swing held to its end, and the jump for joy after it once the batch has landed (D-60, D-82)
  const { throwing, cheering, startThrow } = usePhraseThrow();
  /** the phrase owns the screen from the parse until the swing after the tap is over */
  const phraseInHand = confirming || throwing;

  const loading = me.isLoading || board.isLoading;
  // The first render reads as the server drew it — without data. The tab bar in the layout
  // fetches the board (and a kept snapshot comes back) before this streamed segment hydrates, so
  // the face drew «alert» over the server's «sleeping» and React threw the page away (D-142).
  const hydrated = useHydrated();
  const rows = hydrated ? board.data : undefined;
  const lanes = useMemo(() => lanesOf(rows ?? [], now, meId), [rows, now, meId]);
  const counts = countsOf(lanes);
  // what waits for the morning (D-38): no lane of its own, named on the closing card (D-139)
  const heldTasks = useMemo(() => (rows ?? []).filter((task) => task.status === HELD_STATUS), [rows]);
  // «Все действия» of any task on the screen — the deck's long press and «⋯», a person's card
  // (D-139): the same sheet and the same buttons as on «Задачи» and on the task's own screen
  const director = useDirectorControls({
    base: actions,
    companyId,
    tasks: rows ?? [],
    questionOf: (id) => rows?.find((task) => task.id === id)?.question ?? null,
    requestOf: (id) => {
      const request = rows?.find((task) => task.id === id)?.time_request ?? null;
      return request && request.senderId !== meId ? request : null;
    },
    suggestionOf: (id) => rows?.find((task) => task.id === id)?.suggestion ?? null,
    now,
  });
  const moreTask = useStableCallback(director.more);
  const moreOf = useStableCallback((id: string) => {
    const task = rows?.find((row) => row.id === id);
    if (task) director.more(task);
  });
  const ether = useEther();
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);
  const people = usePeople();
  const peopleRows = hydrated ? people.data : undefined;
  // the secretary's desk next to the face and everything round it — only when the company has
  // somebody to ask (D-79 §4, D-85)
  const desk = useDeskState({ people: peopleRows, hydrated, now, events });
  const { hasSecretary, errandRows, deskStage, visitRows, visitorsWaiting, messagesWaiting, meetingNow, meetingEndsAt } = desk;
  // the director is saying a request into the desk (D-99)
  const toSecretary = useIngestStore((state) => state.toSecretary);
  // Эфир is news too: an announcement going out and every «ознакомился» coming back;
  // so are the calendar — an answer, a move, the reminder the tick has just written —
  // and the errands: «Айгуль · кофе принят»
  const speech = useSpeech(rows, lanes, now, directorName, meId, ether.data, calendar.data, desk.errandsData);
  const nextMeeting = useMemo(() => nextEvent(events, now), [events, now]);
  const eventSoon = startsSoon(nextMeeting, now);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const closeEvent = useCallback(() => setOpenEvent(null), []);
  const showHint = useLeverHint();
  // the pill of a phrase the phone keeps stands where the hint would (D-130)
  const keptPill = useKeptPill((state) => state.shown);

  // ---- the balls and the panels ------------------------------------------------------------
  const [scene, go] = useReducer(moveScene, AT_REST);
  const { mode, panel } = scene;
  const [wakeKey, setWakeKey] = useState(0);
  // the thread opens over the board; Пульс underneath is never unmounted, so the deck,
  // the balls and the mascot are where they were when the sheet closes (D-64 §5)
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);
  const openThread = useCallback((task: BoardTask) => setThread({ id: task.id, title: task.title }), []);
  const closeThread = useCallback(() => setThread(null), []);

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
      // the rating, one tap from the face — only while points are on (D-48, D-123); it counts
      // only what waits for an answer — a disputed minus (D-133)
      ...(pointsEnabled ? [{ id: "rating" as const, label: "Рейтинг", count: disputes, tone: disputes > 0 ? "var(--warn)" : "var(--gold)" }] : []),
    ],
    [taskCount, counts.overdue, counts.declined, counts.review, messageTasks.length, ether.data, events, now, eventSoon, pointsEnabled, disputes],
  );
  // the deck behind each ball: tasks without the message lane, or every task with a message (whatever its lane)
  const taskLanes = useMemo<Lanes>(() => ({ ...lanes, question: [] }), [lanes]);
  // the thought talks about the newest word on the board — a tap on it opens that thread
  const thoughtTask = messageTasks[0];
  const questionLanes = useMemo<Lanes>(() => ({ ...emptyLanes(), question: messageTasks }), [messageTasks]);

  const pick = useStableCallback((ball: OrbitBall) => {
    // the open ball again: the panel folds back, the balls orbit again
    if (mode === "panel" && panel === ball.id) go({ mode: "ring", panel: null, held: phraseInHand });
    else go({ mode: "panel", panel: ball.id, held: phraseInHand });
  });
  // the card pulled down by its grip: the same step back as a tap on the face
  const closePanel = useStableCallback(() => go({ mode: "ring", panel: null, held: phraseInHand }));
  // the director is speaking and the phrase is on its way: what he is not looking at steps back
  // behind the face (D-166) — the words, the balls, the open card, the team at rest
  const listening = stage === "recording" || stage === "uploading" || stage === "transcribing" || stage === "parsing";

  // ---- a question the phrase turned out to be: answered right here, kept until closed -------
  const { exchange, closeExchange } = useQuestionExchange({
    stage,
    question,
    requestId,
    resetIngest,
    userId: me.data?.userId,
    rows,
    lanes,
    now,
    people: peopleRows,
    peopleLoading: people.isLoading,
  });

  // A change on the board is a thought: it pops above the head, the face wakes up and reads it
  // (`processing`, D-65), and after a while the thought is gone and the face dozes off again. The opening
  // line (the summary on a tap) is speech, under the face. Both answer to the same line.
  const { thought, dismiss: dismissThought } = useThought(speech.line);

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

  // The director's assistant is never angry (D-70, the owner): whatever waits for him — a
  // deadline within the hour, an order unaccepted for half an hour, an unread word — the
  // face just goes watchful. The balls and the line say which of the three it is.
  // an order whose assignee hears nothing about it is a reason to watch too (D-114)
  const noPush = useNoPush();
  const alarm = useMemo(() => alarmOf(rows ?? [], now, meId, noPush), [rows, now, meId, noPush]);
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
  // is readable without a tap (the owner, 2026-09-17 — «маскот должен меняться и в покое»).
  const restFace: MascotState = mood ?? "sleeping";
  // a picked person wakes the face: it cannot look at anybody with its eyes shut
  const attending = picked !== null && (stage === "idle" || stage === "recording");
  // the same for the person whose card is open — only while the waiting screen is up
  const reading = looking !== null && mode === "idle" && stage === "idle" && !phraseInHand;
  // the desk is part of the waiting screen: shown there, and only when there is somebody at it
  const showDesk = hasSecretary && mode === "idle" && !phraseInHand && (stage === "idle" || stage === "recording");
  const asking = deskOpen && showDesk && stage === "idle";
  // the small secretary has brought the cup over: the face takes it and looks at the desk
  const handoff = showDesk && !asking && stage === "idle" && deskStage.phase === "done" && DRINKS.has(deskStage.scene ?? "");
  // an open ball is a job in the face's hands, and it does it while the panel is open (D-82)
  const panelFace: MascotState | null = mode === "panel" && panel ? PANEL_FACE[panel] : null;
  // A change on the board with an act of its own (tasks/020) is played by an awake face — a stamp
  // for «Принять», a crumpled card for «Отозвать», a card taken for «сдана» — over the ball's job
  // when a panel is open; a change without one is still «reads the data» (D-65), but not over an
  // open card: the face keeps the card's job in its hands and the thought says the news (D-178)
  const newsAct = thought ? thoughtAct(thought.kind) : null;
  // The order of the faces is `directorMascot`: the phrase in hand and its celebration; the cup brought
  // over (it outranks the news of it: the face takes it, the thought says it); a phrase that did not
  // make it (tasks/020, phase B) — the face stays awake while the error is up and while its act
  // plays; «не разобрал», puzzled until the words are fixed, made a task or closed; the card's job;
  // the news; the waiting screen — asking the secretary the face brings the cup (D-85), looking at
  // somebody it is calm — or the ring
  const mascot: MascotState = directorMascot({
    confirm: confirmFace,
    handoff,
    oops: stage === "error" || oops !== null,
    unparsed,
    job: panelFace,
    thought: thought !== null,
    newsAct: newsAct !== null,
    mood,
    idle: mode === "idle",
    rest: asking ? "serving" : attending || reading ? "calm" : restFace,
    awake,
  });
  // where the face looks: the middle of the picked circle, the person whose card is open, or the small face at the desk
  const gaze = attending && picked ? lookAt(picked.x, picked.y) : reading && looking ? lookAt(looking.x, looking.y) : asking || handoff ? lookAt(DESK_AT.x + DESK_FACE.x, DESK_AT.y + DESK_FACE.y) : null;
  // the small things a face at rest does on its own — asleep, waiting on the ring, or
  // watchful (D-82); never while anything is in flight or said, nor under a thought
  const acts = useMascotActs(mascot, stage === "idle" && !phraseInHand && !cheering && !exchange && mode !== "panel" && !attending && !reading && !asking && !handoff && !thought);
  // each thought plays its act once: a re-render for another reason must not replay it
  const playAct = acts.play;
  const playedThought = useRef<string | null>(null);
  useEffect(() => {
    if (!thought || !newsAct || playedThought.current === thought.id) return;
    playedThought.current = thought.id;
    playAct(newsAct);
  }, [thought, newsAct, playAct]);
  // each failure plays its act once — the error object is new with every failure
  const playedError = useRef<IngestError | null>(null);
  useEffect(() => {
    if (stage !== "error" || !ingestError || playedError.current === ingestError) return;
    playedError.current = ingestError;
    const act = ERROR_ACT[ingestError.code];
    playAct(act);
    setOops(act);
    // one timer for the whole page: a newer failure restarts it, the stage going idle does not cut it
    if (oopsTimer.current) clearTimeout(oopsTimer.current);
    oopsTimer.current = setTimeout(() => setOops(null), ACT_MS[act]);
  }, [stage, ingestError, playAct]);
  // no network: the phrase stays on the phone and goes by itself (D-130) — the same phone held
  // up for signal as a failed upload, but the face is not sorry, it has kept the words
  useEffect(
    () =>
      useIngestStore.subscribe((current, previous) => {
        if (current.stage !== "kept" || previous.stage === "kept") return;
        playAct("signal");
        setOops("signal");
        if (oopsTimer.current) clearTimeout(oopsTimer.current);
        oopsTimer.current = setTimeout(() => setOops(null), ACT_MS.signal);
      }),
    [playAct],
  );
  useEffect(
    () => () => {
      if (oopsTimer.current) clearTimeout(oopsTimer.current);
    },
    [],
  );
  // «не разобрал» plays the moment the parse comes back empty — the hand to the crown — once per
  // phrase: corrected words are a new request, and a second miss scratches again
  const playedUnparsed = useRef<string | null>(null);
  useEffect(() => {
    if (!unparsed || !requestId || playedUnparsed.current === requestId) return;
    playedUnparsed.current = requestId;
    playAct("scratch");
  }, [unparsed, requestId, playAct]);

  const onFaceTap = useStableCallback(() => {
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
      if (confirmRef.current?.throwBatch()) startThrow();
      return;
    }
    closeExchange();
    if (mode === "idle") {
      // waking up: a stretch, a wave hello, the summary, the balls come out
      setWakeKey((key) => key + 1);
      speech.replay();
      go({ mode: "ring", panel, held: phraseInHand });
      acts.play("wave");
    } else if (mode === "panel") {
      // one step back: the panel folds, the balls orbit again
      go({ mode: "ring", panel: null, held: phraseInHand });
    } else {
      go({ mode: "idle", panel: null, held: phraseInHand });
      // dozing off again with a yawn — unless something waits, then the face stays watchful
      if (!mood) acts.play("yawn");
    }
  });
  const team = useMemo(() => (peopleRows ?? []).filter((p) => p.is_active && p.role !== "director" && p.role !== "tv"), [peopleRows]);
  // the secretaries sit at the desk, not among the circles (D-85)
  const secretaries = team.filter((p) => p.role === "secretary");
  // the waiting screen's own view of the team: who is carrying what right now (D-90), each
  // task with its stage, its deadline, a question, a refusal and an unread word (D-118)
  const field = useMemo(() => {
    const byPerson = tasksOf(
      (rows ?? []).map((t) => ({
        id: t.id,
        assignee_id: t.assignee_id,
        status: t.status,
        deadline: t.deadline,
        title: t.title,
        question: t.question,
        request: t.time_request && t.time_request.senderId !== meId ? t.time_request.proposed : null,
        decline_reason: t.decline_reason,
        unread: hasUnread(t, meId),
        scheduled_send_at: t.scheduled_send_at,
      })),
      now.getTime(),
    );
    return {
      members: team
        .filter((p) => p.role !== "secretary")
        .map((p) => ({ id: p.id, fullName: p.full_name, alias: p.aliases?.[0] ?? null, tasks: byPerson[p.id] ?? [] })),
    };
  }, [team, rows, now, meId]);
  const teamScene = useMemo(() => ({ ...field, onTaskMore: moreOf }), [field, moreOf]);
  const onPickOrb = useStableCallback((orb: Pick | null) => {
    // a sleeping face wakes up with a stretch before it looks
    if (orb && !picked && !asking && restFace === "sleeping") setWakeKey((key) => key + 1);
    setDeskOpen(false);
    setPicked(orb ? { id: orb.id, name: orb.name, address: orb.address, x: orb.x, y: orb.y } : null);
  });
  const onLookAt = useStableCallback((person: Pick | null) => {
    // the face wakes up to look at the one whose card is open, as it does for a pick
    if (person && !picked && !asking && restFace === "sleeping") setWakeKey((key) => key + 1);
    if (person) setDeskOpen(false);
    setLooking(person);
  });
  // two cards and more do not fit under a face in the middle: a third card, «Отменить» and the
  // send hint went below the tab bar while the top half stood empty. The face goes smaller and
  // up, the cards band takes the screen (D-146); the words above keep room for their line.
  const crowded = confirming && entities.length >= 2;
  // a ball is open: its panel is a card up from the bottom edge (D-166); a phrase in hand sends it
  // down for as long as the cards of the phrase are on the screen
  const cardOpen = mode === "panel" && !phraseInHand;
  // the face is small over a card and under a crowded phrase; a phrase landing over an open card
  // sends the card down and gives the face its size back (D-178)
  const faceSize = cardOpen || crowded ? FACE_SMALL : FACE;
  const box = faceBox(mode, faceSize);
  // Where the balls are (D-178): in a row under the small face over a card; orbiting on the ring;
  // inside the head at rest — and none while a phrase is in hand: whatever was out goes into the head
  const ballsShow = ballsShowOf(mode, cardOpen, phraseInHand);
  // what the screen showed before: the band's own lines come back only once a card has gone down. A
  // tap moves it with the mode (`moveScene`); a phrase taken in hand or dropped moves it here
  const viewNow = viewOf(mode, phraseInHand);
  if (scene.view !== viewNow) go({ mode, panel, held: phraseInHand });
  const afterCard = scene.cameFrom === "panel" && viewNow !== "panel";

  // «Понял так: 2 задачи» — the assistant's own words, where its words always are
  const confirmLines: AssistantLine[] = phraseInHand
    ? [
        {
          id: `confirm:${requestId ?? "draft"}:${entities.length}:${sendableCount}:${throwing ? "fly" : "wait"}`,
          // no «тапни меня» in words: the face asks for the tap itself (`offering`)
          text: throwing
            ? "Отправляю…"
            : `Понял так: ${entitiesSummary(entities)}.${sendableCount > 0 ? "" : ` ${whyNothingToSend(entities, pointsEnabled)}`}`,
          tone: sendableCount > 0 ? "ok" : "warn",
        },
      ]
    : [];

  // what the words band says: «не разобрал» — what was heard, in the director's bubble, and the
  // assistant's answer under it
  const assistantSaid = exchange?.said ?? (unparsed ? heard : null);
  const assistantLines: AssistantLine[] = phraseInHand
    ? confirmLines
    : unparsed
      ? [{ id: `unparsed:${requestId ?? ""}`, text: "Не разобрал: не нашёл здесь ни задачи, ни объявления.", tone: "warn" }]
      : loading && mode !== "idle" && lines.length === 0
        ? [{ id: "loading", text: "Смотрю, что нового…" }]
        : lines;
  const saying = Boolean(assistantSaid) || assistantLines.length > 0 || exchange !== null || unparsed;
  // a thought over the face: a person's card says the same news and stands where the thought would,
  // so the thought waits (D-118); a phrase in hand owns the face — a thought over it hid «Понял так: …» (D-146).
  // So do an answer and «Не разобрал…»: their buttons are in the words, which step aside under a thought (D-178)
  const thoughtUp = thought !== null && !reading && !phraseInHand && !exchange && !unparsed;

  const noTeam = Boolean(peopleRows) && team.length === 0;
  const serviceLines = useMemo(() => <ServiceLines draftCount={draftCount} noTeam={noTeam} />, [draftCount, noTeam]);
  // in the card the phone's line stands under «Дела» only, not under every ball (D-190)
  const cardService = useMemo(
    () => <ServiceLines draftCount={draftCount} noTeam={noTeam} setup={panel === "tasks"} />,
    [draftCount, noTeam, panel],
  );

  // somebody at the door, the secretary's words on the wall: above whatever is open (D-96, D-116)
  const { refetchErrands, actions: deskActions, dndAction } = desk;
  const asks = useMemo(
    () =>
      visitorsWaiting || messagesWaiting ? (
        <>
          {visitorsWaiting ? (
            <VisitAsk
              visits={visitRows}
              now={now}
              // tea or coffee for the guest goes with «Пусть заходит» (D-99)
              hospitality={deskActions.filter((a) => ["tea", "coffee"].includes(sceneOfAction(a)))}
              onErrand={() => void refetchErrands()}
            />
          ) : null}
          {messagesWaiting ? <MessageAsk visits={visitRows} now={now} /> : null}
        </>
      ) : null,
    [visitorsWaiting, messagesWaiting, visitRows, now, deskActions, refetchErrands],
  );

  // what the open ball shows inside its card — drawn again only when its own data changes (D-178)
  const etherCount = (ether.data ?? []).length;
  const panelContent = useMemo(
    () =>
      panel === "tasks" ? (
        // what waits for the morning still has its closing card (D-139)
        taskCount === 0 && heldTasks.length === 0 ? (
          <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Задач нет. Удержите меня и скажите, что нужно сделать.</p>
        ) : (
          <CardDeck lanes={taskLanes} now={now} since={since} actions={actions} companyId={companyId} meId={meId} onReply={openThread} focus={null} held={heldTasks} onMore={moreTask} />
        )
      ) : panel === "messages" ? (
        messageTasks.length === 0 ? (
          <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Непрочитанных сообщений нет.</p>
        ) : (
          <CardDeck lanes={questionLanes} now={now} since={since} actions={actions} companyId={companyId} meId={meId} onReply={openThread} replyLine focus={null} showWork={false} onMore={moreTask} />
        )
      ) : panel === "calendar" ? (
        events.length === 0 ? (
          <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Встреч нет. Скажите: «планёрка завтра в 10 со всеми».</p>
        ) : (
          <CalendarList events={events} now={now} meId={meId} onOpen={setOpenEvent} variant="compact" />
        )
      ) : panel === "rating" ? (
        <RatingPanel />
      ) : panel === "ether" ? (
        etherCount === 0 ? (
          <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет. Скажите: «всем: …».</p>
        ) : (
          <EtherSection variant="page" />
        )
      ) : null,
    [panel, taskCount, heldTasks, taskLanes, now, since, actions, companyId, meId, openThread, moreTask, messageTasks.length, questionLanes, events, etherCount],
  );
  // the card's inside: the asks, the open ball's content, the service lines under it
  const cardBody = useMemo(
    () => (
      <div className="flex min-h-full flex-col gap-2 pt-1">
        {asks}
        {/* another ball changes what is in the card, not the card: the old content is gone in a
            blink (popLayout — the new one does not wait for it, and nothing of it is left over
            the service lines), the new one rises into its place and shows once the old is gone
            — two «нет» lines never stand one over the other; position only — a layout
            animation of its size squashed the deck inside */}
        <div className="relative">
          <LocalPresence mode="popLayout" initial={false}>
            <motion.div
              key={panel}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: SWAP_OUT }}
              transition={{ ...BAND_SPRING, opacity: SWAP_IN }}
              data-testid="panel"
              data-panel={panel}
            >
              {panelContent}
            </motion.div>
          </LocalPresence>
        </div>
        {/* the panel is what the tap asked for: service lines wait under it (D-139) — once for
            the card, so a switch of balls does not mount them anew; at the card's bottom while
            the panel is short, and when another panel moves them they glide there (D-178) */}
        <motion.div layout="position" transition={BAND_SPRING} className="mt-auto flex flex-col gap-2 pt-2 empty:hidden" data-testid="card-service">
          {cardService}
        </motion.div>
      </div>
    ),
    [asks, panel, panelContent, cardService],
  );

  // the balls live in the head and travel with the face (D-178): the ring dives into it as the row
  // comes out of it, and at rest they wait inside — never across the face. One element while
  // nothing of it changes: the lever is memoised and takes it as a prop
  const rowTop = box / 2 + ROW_GAP;
  const orbit = useMemo(
    () => <OrbitBalls balls={balls} show={ballsShow} activeId={panel} radius={RING_RADIUS} rowTop={rowTop} onPick={pick} receded={listening} />,
    [balls, ballsShow, panel, rowTop, pick, listening],
  );
  // where the face looks and whom it records for: kept while they stay the same
  const gazeX = gaze?.x;
  const gazeY = gaze?.y;
  const faceGaze = useMemo(() => (gazeX === undefined || gazeY === undefined ? null : { x: gazeX, y: gazeY }), [gazeX, gazeY]);
  const pin = useMemo(() => (picked && !phraseInHand ? { id: picked.id, name: picked.name, address: picked.address } : null), [picked, phraseInHand]);
  const openThoughtThread = useCallback(() => {
    if (thoughtTask) openThread(thoughtTask);
  }, [thoughtTask, openThread]);
  const fixUnparsed = useStableCallback(() => useComposeStore.getState().request(heard));
  // the ways out of an answer or of «не разобрал», under the words
  const buttons = useMemo(
    () =>
      exchange ? (
        <ExchangeButtons exchange={exchange} onManual={startManual} onClose={closeExchange} />
      ) : unparsed ? (
        <UnparsedButtons onFix={fixUnparsed} onManual={startManual} onClose={resetIngest} />
      ) : null,
    [exchange, unparsed, startManual, closeExchange, fixUnparsed, resetIngest],
  );

  // «Сказать · Написать» under the resting face (owner, 2026-11-25): the same two ways in as the
  // face's hold and pull, in sight — not while a phrase is in hand, somebody is picked or the
  // secretary's buttons are out, each of which has its own ways
  const sayWrite = mode === "idle" && !phraseInHand && !picked && !asking;

  return (
    // the three bands of the home stage (HomeStage) — one exception: a phrase of several things lifts
    // the face, the cards band growing by a CSS transition (`crowded`, D-146). PulseSkeleton draws the
    // same bands, so the face stands where the skeleton had it.
    <HomeStage
      mode={mode}
      box={box}
      faceSize={faceSize}
      // above the head: what the assistant says. A mode change moves the band's edge by up to 110 px:
      // the words glide there on the face's spring instead of jumping in one frame — and are not cut
      // off by the band's new edge on the way (`useBandGlide`). A thought floats up over them: they
      // step aside while it is up (D-178)
      words={<SaidBand show={saying} said={assistantSaid} lines={assistantLines} buttons={buttons} aside={thoughtUp} receded={listening} />}
      // the face, and the balls orbiting it (ring) or in a row under it (panel)
      face={
          <>
            {/* The waiting screen (D-89, D-91): drawn before the face, so the team and the
                dream pass behind the head. It belongs to the screen being at rest, not to one
                pose of the face — since D-70 the resting face is a barometer and only sleeps
                when nothing waits. The team also stays while the director is recording a task
                he started from somebody's own orb (D-72); the dream does not — a dream is for
                a face that is not doing anything. While the face listens the team steps back
                behind it — unless the words are for one of them, who must stay in sight (D-166). */}
            <div className="pointer-events-none absolute inset-0" style={recede(stage === "recording" && !picked)}>
            <IdleScene
              active={mode === "idle" && (stage === "idle" || stage === "recording")}
              // a face that is looking at somebody is not dreaming
              quiet={!thought && stage === "idle" && !attending && !reading && !asking}
              team={teamScene}
              picked={picked?.id ?? null}
              onPick={onPickOrb}
              onLook={onLookAt}
              // the idlers' floor starts under the buttons
              skirt={sayWrite ? SAY_WRITE_SKIRT : undefined}
            />
            </div>
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
                    ? "Маскот: нажмите — отправить"
                    : "Маскот: нажмите — указать, кому"
                  : picked
                    ? `Маскот: задача для ${picked.name} — удержите и говорите или нажмите`
                    : undefined
              }
              pin={pin}
              gaze={faceGaze}
              onHold={setHeld}
              around={orbit}
            />
            {/* the ways to give the picked person a task, right over the face that is looking at them */}
            <LocalPresence>
              {picked && mode === "idle" && (stage === "idle" || stage === "recording") ? (
                <div key={picked.id} className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
                  <PickCard picked={picked} held={held} onClose={() => setPicked(null)} />
                </div>
              ) : null}
            </LocalPresence>
            {/* the secretary at the desk, right of the face (D-85): types while nobody asks; a
                tap turns it to the face, the face to it, and the errand buttons come out */}
            <LocalPresence>
              {showDesk ? (
                <motion.div
                  key="desk"
                  className="absolute left-1/2 top-1/2 z-20"
                  style={{ marginLeft: DESK_AT.x, marginTop: DESK_AT.y, width: DESK_W, height: DESK_H }}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12, transition: { duration: 0.18 } }}
                  transition={springs.object}
                >
                  {/* a narrow phone keeps the desk a little smaller, so it never touches the edge;
                      words for the face, not for the desk, send it a step back (D-166) */}
                  <div className="origin-top-left [@media(max-width:380px)]:scale-[0.84]" style={recede(stage === "recording" && !toSecretary, { scale: false })}>
                  <SecretaryDesk
                    attending={asking}
                    scene={deskStage.scene}
                    phase={deskStage.phase}
                    urgency={urgencyOf(deskStage.phase === "asked" ? deskStage.errand : null, now, desk.escalateAfterMin)}
                    count={activeCount(errandRows) + desk.waitingErrands}
                    away={desk.awayUntil}
                    seen={desk.deskSeen}
                    waiting={desk.waitingErrands}
                    etaLeft={deskStage.phase === "doing" ? etaLeftMin(deskStage.errand, now) : null}
                    asking={errandRows.some((e) => isActive(e) && e.question && !e.answer)}
                    listening={stage === "recording" && toSecretary}
                    onHold={(down) => {
                      // hold the desk — say it to the secretary in your own words (D-99)
                      if (down) {
                        // the desk is on the waiting screen only: here the pipeline is idle or recording
                        if (stage === "idle") {
                          setDeskOpen(false);
                          void startVoice(undefined, undefined, "secretary");
                        }
                      } else if (useIngestStore.getState().stage === "recording") {
                        void stopVoice();
                      }
                    }}
                    tone={errandRows.some((e) => e.status === "accepted") ? "var(--ok)" : "var(--warn)"}
                    label={asking ? "Секретарь: убрать кнопки" : `Секретарь${secretaries.length ? `: ${secretaries.map((p) => shortName(p.full_name)).join(", ")}` : ""} — попросить`}
                    onTap={() => {
                      if (stage !== "idle") return;
                      if (!asking && restFace === "sleeping" && !picked) setWakeKey((key) => key + 1);
                      setPicked(null);
                      setDeskOpen(!asking);
                    }}
                  />
                  </div>
                  {desk.offerDnd && meetingNow && meetingEndsAt && dndAction && !asking ? (
                    // a meeting is on: one tap guards the door until it ends (D-99)
                    // right-aligned under the desk: the desk sits right of the face, a centred pill ran off the screen
                    <div className="absolute right-0 top-full mt-5 flex items-center gap-1 whitespace-nowrap" data-testid="dnd-offer">
                      <button
                        type="button"
                        className="card-in rounded-full border px-3 py-1.5 text-[13px] font-semibold leading-4"
                        style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))", background: "var(--surface)" }}
                        onClick={() => {
                          const left = Math.max(5, Math.ceil((new Date(meetingEndsAt).getTime() - Date.now()) / 60_000));
                          askSecretary(dndAction, "на встречу", () => void refetchErrands(), undefined, { untilMin: left });
                          desk.setDndOffered(meetingNow.id);
                        }}
                      >
                        🔕 Не беспокоить {untilLine(meetingEndsAt)}?
                      </button>
                      <button type="button" aria-label="Не надо" className="h-8 w-8 text-[16px] text-muted" onClick={() => desk.setDndOffered(meetingNow.id)}>
                        ×
                      </button>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </LocalPresence>
            <LocalPresence>
              {asking ? (
                <div key="secretary" className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
                  <SecretaryCard
                    names={secretaries.map((p) => shortName(p.full_name)).join(", ") || "на месте"}
                    actions={deskActions}
                    errands={errandRows}
                    now={now}
                    onRefresh={() => void refetchErrands()}
                    // «спасибо» for a closed request waits for the adaptation gate (D-40, D-97)
                    thanks={pointsEnabled}
                    secretaries={desk.secretaries}
                    meetingEndsAt={meetingEndsAt}
                    onClose={() => setDeskOpen(false)}
                  />
                </div>
              ) : null}
            </LocalPresence>
          </>
      }
      underFace={<SayWrite show={sayWrite} />}
      // a thought about Эфир or the calendar opens no thread — there is none behind it
      thought={
        thought && thoughtUp
          ? { id: thought.id, text: thought.text, tone: thought.tone, onDismiss: dismissThought, onOpen: !thought.source && thoughtTask ? openThoughtThread : undefined }
          : null
      }
      band={
        <>
          {/* the phrase in hand takes the whole band: its cards, and nothing else to do */}
          {confirming ? <ConfirmInline ref={confirmRef} /> : null}
          {/* after a card they wait for it to be gone: the card going down holds them too */}
          <div className={`flex flex-col gap-2 empty:hidden${afterCard ? ` ${AFTER_CARD}` : ""}`} style={recede(listening, { scale: false })}>
            {!phraseInHand ? asks : null}
            {/* service cards only once the face has been tapped — the idle screen is the face
                alone; the face dozing off takes them with it in a short fade */}
            <LocalPresence initial={false}>
              {!phraseInHand && mode !== "idle" ? (
                <motion.div key="service" className="flex flex-col gap-2 empty:hidden" exit={{ opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}>
                  {serviceLines}
                </motion.div>
              ) : null}
            </LocalPresence>
          </div>
        </>
      }
      card={{ open: cardOpen, panel: panel ?? "", label: balls.find((ball) => ball.id === panel)?.label ?? "Панель", receded: listening, onClose: closePanel, body: cardBody }}
      grow={crowded ? CROWDED_GROW : 1}
      gliding={phraseInHand}
      crowded={crowded}
    >
      {/* the bottom: the gesture hint — never under the face */}
      {/* the hint is for an idle face: while the phrase is in flight the face says what it does */}
      {showHint && mode === "idle" && stage === "idle" && !picked && !asking && !visitorsWaiting && !messagesWaiting && !keptPill ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(var(--tabbar-space) + 2px)" }}
          data-testid="lever-hint"
        >
          {/* «Сказать · Написать» above are the same ways in, in sight; the line teaches the face's own:
              the hold and the pull (the faster way), and what its tap brings out — the balls, by their
              own labels (D-60) */}
          лицо: удержите — говорите, потяните вниз — текст
          <br />
          нажмите — {balls.map((ball) => ball.label.toLowerCase()).join(", ")}
        </p>
      ) : null}

      <QuietEventSheet event={openEvent} onClose={closeEvent} meId={meId} isDirector />

      {director.sheets}

      <QuietThreadSheet
        open={Boolean(thread)}
        onClose={closeThread}
        taskId={thread?.id ?? null}
        title={thread?.title ?? ""}
        companyId={companyId}
        userId={meId || undefined}
        actions={actions}
        isDirector
      />
    </HomeStage>
  );
}
