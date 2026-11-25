"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { ACT_MS, ACT_TOUCH, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { CalendarList } from "@/components/calendar/CalendarList";
import { EtherSection } from "@/components/ether/EtherSection";
import { MessageRow } from "@/components/feed/MessageRow";
import { putAwayNow, wasPutAway } from "@/components/feed/putAway";
import { ReportDueRow } from "@/components/feed/ReportDueRow";
import { DeskUnder, PresenceSheet, SecretaryCards, SecretaryTop } from "@/components/feed/SecretaryParts";
import { useSecretaryHome } from "@/components/feed/useSecretaryHome";
import type { AssistantLine } from "@/components/pulse/Assistant";
import { HomeStage } from "@/components/pulse/home/HomeStage";
import {
  BAND_SPRING,
  ballsShowOf,
  CHEER_MS,
  FACE,
  FACE_SMALL,
  faceBox,
  PANEL_FACE_HEARD,
  QuietEventSheet,
  QuietThreadSheet,
  RING_RADIUS,
  ROW_GAP,
  SWAP_IN,
  SWAP_OUT,
  useThought,
  type Mode,
} from "@/components/pulse/home/stage";
import { IdleScene } from "@/components/pulse/IdleScene";
import { LocalPresence } from "@/components/pulse/LocalPresence";
import { MascotLever } from "@/components/pulse/MascotLever";
import { OrbitBalls, type OrbitBall, type OrbitId } from "@/components/pulse/OrbitBalls";
import { AFTER_CARD } from "@/components/pulse/PanelCard";
import { PointsFlight } from "@/components/pulse/PointsFlight";
import { SaidBand } from "@/components/pulse/SaidBand";
import { useStableActions, useStableCallback } from "@/components/pulse/stable";
import { EVENT_ACT, useEmployeeEvents } from "@/components/pulse/useEmployeeEvents";
import { useMascotActs } from "@/components/pulse/useMascotActs";
import { useSpeechWith, type Voice } from "@/components/pulse/useSpeech";
import { ErrandCards } from "@/components/secretary/ErrandCards";
import { SecretaryFace } from "@/components/secretary/SecretaryFace";
import { useSecretaryActs } from "@/components/secretary/useSecretaryActs";
import { SetupEntry } from "@/components/setup/SetupEntry";
import { SetupLaunch } from "@/components/setup/SetupLaunch";
import { TaskCard } from "@/components/tasks/TaskCard";
import { nextEvent, startsSoon, todayCount } from "@/lib/calendar/agenda";
import { pendingInvites } from "@/lib/calendar/invites";
import { useCalendar, type CalendarEvent } from "@/lib/calendar/queries";
import { describeCalendar, nextEventLine } from "@/lib/calendar/say";
import { useRefreshMyDay, useReportDue } from "@/lib/daily-report/queries";
import { describeErrandsForSecretary } from "@/lib/errands/say";
import { useEther } from "@/lib/ether/queries";
import { haptic } from "@/lib/haptics";
import { useNamesKey } from "@/lib/people/names";
import { useMascotTelegraph } from "@/lib/points/game";
import { usePointsArrival, usePointsEnabled } from "@/lib/points/queries";
import { hasUnread, isOnBoard, lanesOf, type BoardTask } from "@/lib/pulse/board";
import { describeEtherForEmployee } from "@/lib/pulse/ether";
import { employeeMascot } from "@/lib/pulse/scene-face";
import {
  describeForEmployeeAll,
  employeeFace,
  employeeLoad,
  employeeOpening,
  employeeWaiting,
  isOpenFor,
  isTodo,
  onTimeStreak,
  reasonOf,
  reportPhrase,
  tasksBallCount,
} from "@/lib/pulse/employee";
import { useTaskActions } from "@/lib/tasks/mutations";
import { sortByUrgency, useMe, useMyTasks, usePulseBoard } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { useDeepRest } from "@/lib/useDeepRest";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";

/**
 * The scene in one state (D-178): the mode, the open ball, the mode before (`cameFrom` — the band's
 * own lines come back once a card has gone down) and the place of the report row in «Дела»
 * (`reportTop`, D-173 — decided when the card opens, kept while it is open). A tap moves them at once:
 * adjusted during the render, they drew the page twice on every tap.
 */
type Scene = { mode: Mode; panel: OrbitId | null; cameFrom: Mode; reportTop: boolean | null };
/** `reportTop` — where the report row goes if «Дела» opens now (null while the board is being read). */
type SceneMove = { mode: Mode; panel: OrbitId | null; reportTop: boolean | null };
function moveScene(scene: Scene, move: SceneMove): Scene {
  const tasksNow = move.mode === "panel" && move.panel === "tasks";
  // the next opening of «Дела» decides the report row's place anew
  const leavesTasks = scene.mode === "panel" && scene.panel === "tasks" && !tasksNow;
  const kept = leavesTasks ? null : scene.reportTop;
  const reportTop = tasksNow && kept === null ? move.reportTop : kept;
  if (scene.mode === move.mode && scene.panel === move.panel && scene.reportTop === reportTop) return scene;
  return { mode: move.mode, panel: move.panel, cameFrom: move.mode !== scene.mode ? scene.mode : scene.cameFrom, reportTop };
}

/** The medal has landed: then the face jumps with confetti (game feel, D-110). */
const CHEER_AFTER_MS = 1_100;
/** How long «+N» and «N подряд в срок» stay by the face. */
const PILL_MS = 4_000;
/** A pile of events is played one after another, but never more than this far behind. */
const QUEUE_MAX_MS = 3_000;
/**
 * The one line that tells the person the phone is not set up yet — the way into «Подключение»
 * (D-190), where the push and install cards were; one element, never drawn again by a tap.
 */
const SERVICE = <SetupEntry />;
/** The copy of a card taken in hand has reached the face. */
const landed = () => haptic(8);
/** What leaves with the face dozing off, or the balls coming out, goes in a short fade, not in one frame. */
const FADE_AWAY = { opacity: 0, transition: { duration: 0.15, ease: "easeOut" } } as const;

/**
 * The ball open when the person left Лента — for a task's own screen and back, another tab and
 * back. It outlives the page (not the app): coming back within a few minutes finds the same card
 * open instead of the face at rest — the person returns to where they were (D-167).
 */
let lastOpen: { panel: OrbitId; at: number } | null = null;
const LAST_OPEN_MS = 10 * 60_000;

/** The button under the resting face says where a tap on the face leads (D-173). */
const FACE_GO: Partial<Record<OrbitId, string>> = {
  tasks: "Открыть дела ›",
  messages: "Открыть сообщения ›",
  ether: "Открыть эфир ›",
  calendar: "Открыть календарь ›",
};
const FACE_GO_BALLS = "Дела, сообщения, эфир ›";
/** The resting face's own name for the screen reader: where its tap leads. */
const FACE_LABEL: Partial<Record<OrbitId, string>> = {
  tasks: "Маскот: тап — открыть дела",
  messages: "Маскот: тап — сообщение директора",
  ether: "Маскот: тап — новое объявление",
  calendar: "Маскот: тап — ответить на приглашение",
};
const FACE_LABEL_BALLS = "Маскот: тап — дела, сообщения, эфир, календарь";

/** Where a card taken in hand flies on Лента: the employee's face (D-167). */
const faceTarget = () => document.querySelector<HTMLElement>('[data-testid="mascot-lever"]');
const FLIGHT = { getTarget: faceTarget, onLand: landed };

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
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const meId = me.data?.userId ?? "";
  const board = usePulseBoard(me.data); // the query and the socket ask for the person's own tasks
  // the secretary's face calls harder by the minute and counts how long the door is shut:
  // its clock ticks every ten seconds, everybody else's every minute
  const now = useNow(me.data?.role === "secretary" ? 10_000 : 60_000);
  // one identity for the screen's life: the cards and the thread are memoised (D-178)
  const actions = useStableActions(useTaskActions(me.data));
  const companyId = me.data?.companyId ?? "";
  const name = firstNameOf(me.data?.fullName);
  const ether = useEther();
  const calendar = useCalendar();
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);

  const rows = board.data;
  const loading = me.isLoading || board.isLoading;
  const open = useMemo(() => (rows ?? []).filter((task) => isOnBoard(task.status)), [rows]);
  const lanes = useMemo(() => lanesOf(open, now, meId), [open, now, meId]);
  const isSecretary = me.data?.role === "secretary";
  const pointsEnabled = usePointsEnabled().data === true;
  // the secretary's own Лента: the requests, the desk, the door (D-87)
  const secretary = useSecretaryHome({ isSecretary, meId, now, pointsEnabled });
  const { desk, mineErrands, visitRows } = secretary;
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
  const speech = useSpeechWith(rows, lanes, now, name, voice, ether.data, calendar.data, isSecretary ? secretary.errandsData : undefined);

  // «Дела»: what to accept or redo first, then what is in work, then what waits for the director
  const todo = useMemo(() => sortByUrgency(open.filter(isTodo), now), [open, now]);
  const inWork = useMemo(() => sortByUrgency(open.filter((task) => isOpenFor(task) && !isTodo(task)), now), [open, now]);
  const onReview = useMemo(() => sortByUrgency(open.filter((task) => task.status === "pending_review"), now), [open, now]);
  const unread = useMemo(() => open.filter((task) => hasUnread(task, meId)), [open, meId]);
  const unacked = useMemo(() => (ether.data ?? []).filter((item) => !item.acks.some((ack) => ack.user_id === meId)), [ether.data, meId]);
  // meetings waiting for «Буду / Не смогу» (D-167); a series' weekly invitation is answered in its
  // row like any other, but it does not nag in the words or colour the ball every week
  const invites = useMemo(() => pendingInvites(events, meId, now).filter((event) => !event.recurrence_rule_id), [events, meId, now]);
  // the meetings the person is going to or not answered yet: one declined is not counted on the ball
  // nor said as the day's next — it stays in the calendar with its «Не смогу» (D-167)
  const attending = useMemo(
    () => events.filter((event) => event.participants?.find((person) => person.user_id === meId)?.status !== "declined"),
    [events, meId],
  );
  // the day's report (D-152): a row on top of «Дела» all day; from `ask_from` (17:00) the face calls
  // for it and the words say it is not in (D-167)
  const report = useReportDue(now);

  // Back on Лента within a few minutes: the ball that was open is open again. Read once, as the
  // first state: a return is a client-side navigation (nothing to hydrate), and a full load starts
  // with this module fresh — `lastOpen` empty, the face at rest, as the server drew it.
  const [reopened] = useState(() => (lastOpen && Date.now() - lastOpen.at <= LAST_OPEN_MS ? lastOpen.panel : null));
  // what the band shows again after a card waits for the card to be gone (`cameFrom`)
  const [scene, go] = useReducer(moveScene, reopened, (open): Scene => {
    const first: Mode = open ? "panel" : "idle";
    return { mode: first, panel: open, cameFrom: first, reportTop: null };
  });
  const { mode, panel, cameFrom, reportTop } = scene;
  useEffect(() => {
    lastOpen = mode === "panel" && panel ? { panel, at: Date.now() } : null;
  }, [mode, panel]);
  // An order waiting for the person's move — new or sent back — raises «Дела» by itself (D-173): on
  // arrival at Лента and when one comes while the face is at rest, so «Принял» is one tap away, with
  // nothing to guess. The ball remembered open (above) comes first; a card the person put away stays
  // down for the same orders. Decided during render, after hydration: the server drew the face at rest
  // and knows nothing of the orders, and an effect would paint the resting face for a frame first. Not
  // while the board is being read, nor offline (a paused read): the phone's kept copy (D-127) may
  // still hold an order since taken.
  const hydrated = useHydrated();
  const settled = !loading && board.fetchStatus === "idle";
  // orders that would raise the card once the board is read: until then the resting words and the
  // button under the face wait too — they would flash for a moment and the card jump up over them
  const raising = hydrated && !isSecretary && mode === "idle" && todo.some((task) => !wasPutAway(task));
  // Where the day's report stands in «Дела» (D-173): on top in the evening only when no order waits for
  // the person's move. Decided when the card opens, with the board read, and kept while it is open —
  // «Принял» on the last order must not throw the row up from under the finger (`moveScene`).
  const reportTopNow = report.evening && todo.length === 0;
  if (raising && settled) go({ mode: "panel", panel: "tasks", reportTop: reportTopNow });
  // Every move between the face, the balls and a card goes through here: the «Дела» card leaving the
  // screen — the face, the grip, its ball, another ball — puts the waiting orders away (D-173), and so
  // does the person putting the face to rest from the balls: rest they chose is not a reason to jump up.
  const show = useStableCallback((nextMode: Mode, nextPanel: OrbitId | null) => {
    const leavesTasks = mode === "panel" && panel === "tasks" && !(nextMode === "panel" && nextPanel === "tasks");
    if (leavesTasks || nextMode === "idle") putAwayNow(todo);
    go({ mode: nextMode, panel: nextPanel, reportTop: settled ? reportTopNow : null });
  });
  // «Дела» opened while the board was still being read: its report row takes its place once it is read
  if (mode === "panel" && panel === "tasks" && reportTop === null && settled) go({ mode, panel, reportTop: reportTopNow });
  const [wakeKey, setWakeKey] = useState(0);
  // the thread opens over Лента, the face and the balls stay as they were (D-64 §5)
  const [thread, setThread] = useState<{ id: string; title: string } | null>(null);

  const balls = useMemo<OrbitBall[]>(
    () => [
      // One number for «Дела» everywhere (D-173): the orders waiting for the person's move — new, sent
      // back, overdue — exactly as the tab's badge counts them; the report asked for in the evening is a
      // thing to do too, so it lights the ball without a number: it does not stand grey while the face
      // calls for it
      {
        id: "tasks",
        label: "Дела",
        count: tasksBallCount(open, now),
        tone: lanes.overdue.length > 0 ? "var(--danger)" : todo.length > 0 || report.asking ? "var(--warn)" : "var(--accent)",
        lit: report.asking,
      },
      { id: "messages", label: "Сообщения", count: unread.length, tone: "var(--warn)" },
      { id: "ether", label: "Эфир", count: unacked.length, tone: "var(--gold)" },
      {
        id: "calendar",
        label: "Календарь",
        // an invitation for tomorrow still has a number on the ball: it waits for an answer
        count: todayCount(attending, now) || invites.length,
        tone: invites.length > 0 || startsSoon(nextEvent(attending, now), now) ? "var(--warn)" : "var(--accent)",
      },
      // the fifth ball is the secretary's only: «Заявки» — its own and nobody's yet (D-79)
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
    [open, todo.length, report.asking, lanes.overdue.length, unread.length, unacked.length, attending, now, invites.length, isSecretary, mineErrands],
  );

  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const closeEvent = useCallback(() => setOpenEvent(null), []);

  const pick = useStableCallback((ball: OrbitBall) => {
    if (mode === "panel" && panel === ball.id) {
      show("ring", null);
      return;
    }
    show("panel", ball.id);
  });
  // while a request is calling, the face itself is the biggest «Принял» on the screen (D-97)
  const acceptByFace = isSecretary && mode === "idle" && desk.phase === "asked" && desk.errand !== null;

  // a change from the director's side is a thought above the head; the face wakes up to it —
  // unless the secretary's face already shows a new request, and the line under it names it
  const shownByDesk = isSecretary && mode === "idle" && speech.line?.source === "errand";
  const { thought, dismiss: dismissThought } = useThought(speech.line, shownByDesk);

  const lines = useMemo<AssistantLine[]>(() => {
    // At rest the face speaks too (D-173) — once the orders are in and the page has hydrated (the
    // server knows neither the orders nor the hour); the secretary's face has its own line under it.
    if (mode === "idle" && (isSecretary || !hydrated || loading || raising)) return [];
    // The greeting counts the orders as they are now — a tap on «Принял» or a thought that came
    // and went does not leave yesterday's count or an empty band (D-167); then, a line each: what
    // waits for the person — the director's word, an announcement, an invitation — and in the
    // evening the report not yet in; the nearest meeting closes it. At rest and over an open card the
    // band is small: the greeting and the one line that matters most; three lines at most with the balls.
    const opening = employeeOpening(lanes, now, name, { reportPending: report.asking });
    const waiting = isSecretary
      ? null
      : employeeWaiting(
          {
            unread: unread.map((task) => ({ title: task.title })),
            unacked: unacked.length,
            invites: invites.map((event) => ({ title: event.title, startsAt: event.starts_at })),
          },
          now,
        );
    const evening = reportPhrase(report);
    // keyed by the words: a new count comes in out of the haze, the same one stays still
    const said: AssistantLine[] = [{ id: `opening:${opening.text}`, text: opening.text, tone: opening.tone }];
    if (mode !== "ring") {
      const first = evening ?? waiting;
      if (first) said.push({ id: evening ? "report" : "waiting", text: first.text, tone: first.tone });
      return said;
    }
    if (waiting) said.push({ id: "waiting", text: waiting.text, tone: waiting.tone });
    if (evening) said.push({ id: "report", text: evening.text, tone: evening.tone });
    // a single invitation is said with its time in the waiting line: the same meeting is not said twice
    const saidInvite = waiting !== null && invites.length === 1;
    const next = nextEvent(attending, now);
    const soonest = next && !(saidInvite && next.id === invites[0]?.id) ? nextEventLine(attending, now) : null;
    if (soonest && said.length < 3) said.push({ id: "calendar", text: soonest });
    return said;
  }, [mode, hydrated, loading, raising, lanes, now, name, attending, isSecretary, unread, unacked.length, invites, report]);

  // The feelings live here, on the side that carries the work (D-70): an unopened order
  // calls (D-69), a deadline within the hour is panic, an unread word from the director
  // is nerves. The director's face only ever watches. Since D-110 the face also shows what is in
  // its hands: the orders in work as a stack, the handed-over ones as an hourglass — and it
  // sleeps only with empty hands (the owner, 2026-09-17: Марат slept with five orders in hand).
  // the company may switch the worry off (`settings.mascot_telegraph`, D-133, В-5)
  const telegraph = useMascotTelegraph();
  const load = useMemo(() => employeeLoad(open, now, meId, telegraph, report.asking), [open, now, meId, telegraph, report.asking]);
  // Until the board has been read the face does not know what it carries: neutral and awake, not
  // asleep with «z» over work that may be waiting (D-178). The server draws it so too. Read once is
  // enough — a refetch in the background does not wake it up again
  const boardRead = hydrated && board.isFetched;
  const restFace: MascotState = boardRead ? employeeFace(load.rest, false) : "calm";
  // the medal has landed and the points are on (D-40, D-48): a jump with confetti after it
  const [cheering, setCheering] = useState(false);
  const panelFace: MascotState | null = mode === "panel" && panel ? PANEL_FACE_HEARD[panel] : null;
  // A thought is news from the director: the face is awake for it and plays what happened (D-110)
  // instead of the director's «reads the data» (D-65) — but not over an open card: the face keeps the
  // card's job in its hands and the thought says the news (D-178). The medal's jump is over all.
  const mascot: MascotState = employeeMascot({
    cheering,
    job: panelFace,
    thought: thought !== null,
    idle: mode === "idle",
    rest: restFace,
    awake: employeeFace(load.rest, true),
    loading,
    speaking: speech.speaking,
  });
  // the stack is in the hands whenever the hands are not busy with a ball's job
  const carrying = !isSecretary && !panelFace && !cheering && load.carry > 0;
  const carryCount = load.carry;
  const carryHot = load.hot;
  const carry = useMemo(() => (carrying ? { count: carryCount, hot: carryHot } : null), [carrying, carryCount, carryHot]);
  // a worried face leads to its reason on the tap (D-110); the secretary keeps its own face
  // Where a tap on the resting face leads (D-110, D-167): what worries it first; with only the work
  // in hands — an announcement or an invitation waiting for the person comes before it, as the words
  // say; with nothing in hands — the same, or the balls.
  const worry = isSecretary ? null : reasonOf(load.rest);
  const waitsElsewhere: OrbitId | null = unacked.length > 0 ? "ether" : invites.length > 0 ? "calendar" : null;
  const reason: OrbitId | null = isSecretary
    ? null
    : worry === "tasks" && load.rest === "working"
      ? (waitsElsewhere ?? "tasks")
      : (worry ?? waitsElsewhere);

  // the small things a face does on its own (D-82): asleep, busy with the stack, waiting for
  // the director, glad on the ring — never over a thought, a panel or the celebration
  const acts = useMascotActs(mascot, !isSecretary && !loading && !thought && !cheering && mode !== "panel", undefined, carrying);
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
  const refreshMyDay = useRefreshMyDay();
  useEffect(() => {
    if (!happened.event || playedEvent.current === happened.key) return;
    playedEvent.current = happened.key;
    // an order taken, handed in or closed changes what today's report holds (D-167)
    refreshMyDay();
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
  }, [happened, playInTurn, pointsEnabled, refreshMyDay]);
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

  const onFaceTap = useStableCallback(() => {
    if (acceptByFace && desk.errand) {
      haptic(20);
      secretary.errandActions.mutate({ id: desk.errand.id, to: "accepted" });
      return;
    }
    if (mode === "idle") {
      setWakeKey((key) => key + 1);
      speech.replay();
      if (reason) {
        // straight to what the face is worried about: face → card, not face → ball → card
        show("panel", reason);
        return;
      }
      show("ring", null);
      if (!isSecretary) play("wave");
    } else if (mode === "panel") {
      show("ring", null);
    } else {
      show("idle", null);
      // dozing off with a yawn — only a face with empty hands goes back to sleep
      if (!isSecretary && restFace === "sleeping") play("yawn");
    }
  });
  // the thought is about something: a tap opens the ball it is about (D-110)
  const thoughtPanel: OrbitId = thought?.source === "ether" ? "ether" : thought?.source === "calendar" ? "calendar" : thought?.source === "errand" ? "secretary" : thought?.message ? "messages" : "tasks";
  // a ball is open: its panel is a card up from the bottom edge, as on Пульс (D-167)
  const cardOpen = mode === "panel";
  const faceSize = mode === "panel" ? FACE_SMALL : FACE;
  const box = faceBox(mode, faceSize);
  // where the balls are (D-178): in a row under the small face over a card, orbiting on the ring,
  // inside the head at rest — the «Дела» raised at rest comes straight out of it
  const ballsShow = ballsShowOf(mode, cardOpen);
  // the band's own lines (service cards, the secretary's hint) come back once a card has gone down
  const afterCard = cameFrom === "panel" && mode !== "panel";
  // a card remembered open (D-167) is where it was left: no rise, no balls out of the head (D-178).
  // One element while nothing of it changes: the face is memoised and takes it as a prop
  const rowTop = box / 2 + ROW_GAP;
  const orbit = useMemo(
    () => <OrbitBalls balls={balls} show={ballsShow} activeId={panel} radius={RING_RADIUS} rowTop={rowTop} onPick={pick} initial={!reopened} />,
    [balls, ballsShow, panel, rowTop, pick, reopened],
  );
  // a screen nobody has touched for minutes: the secretary stops typing and reads, and the small
  // things at the desk wait for the next touch (D-119)
  const deepRest = useDeepRest();
  // the small things at the desk play only at rest, on the waiting screen (D-97)
  const secretaryAct = useSecretaryActs({
    idle: isSecretary && mode === "idle" && desk.phase === "rest" && !thought && !loading && !deepRest,
    daypart: secretary.daypart,
    acceptKey: desk.acceptKey,
    thanksKey: desk.thanksKey,
  });

  // the top of the secretary's screen: the lamp of the director's door and the day's count —
  // laid over the screen, out of the flow, so the face keeps the very middle (D-87)
  const showTally = isSecretary && mode === "idle" && !loading && secretary.tally.total > 0;
  const topInset = isSecretary ? (secretary.guarded ? 40 : 0) + (showTally ? 24 : 0) : 0;

  // A card swiped down by its grip goes to rest, not to the balls (D-173): at rest the face says
  // where things stand and the button under it names the way back — drifting balls left a newcomer
  // tapping face → rest → face. A tap on the face over a card still steps back to the balls (D-62).
  const closePanel = useStableCallback(() => show("idle", null));

  const assistantLines: AssistantLine[] = loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines;

  // «+5 очков», «🔥 3 подряд в срок» — for a few seconds, behind the adaptation gate like the points
  // themselves (D-40, D-110): under the face at rest and on the ring, by the small face over a card —
  // at once wherever the face is, and the copy flies to the counter from there (D-165, D-178)
  const overCard = mode === "panel";
  const pillNode = useMemo(
    () =>
      !isSecretary && pill ? (
        <div
          className={overCard ? "pointer-events-none absolute left-1/2 top-1/2 flex" : "flex shrink-0 justify-center pt-1"}
          style={overCard ? { translate: `${FACE_SMALL / 2 + 24}px -50%` } : undefined}
          data-testid="face-pill"
        >
          <span
            key={pill.key}
            className={`card-in nums rounded-full px-3 py-1 text-[14px] font-semibold leading-5${overCard ? " w-max max-w-[min(140px,calc(50vw-96px))] text-center" : ""}`}
            style={{ background: "color-mix(in srgb, var(--gold) 18%, var(--surface))", color: "var(--gold)" }}
          >
            {pill.text}
          </span>
        </div>
      ) : null,
    [isSecretary, pill, overCard],
  );
  // what lives round the face: the balls, and «+N» by the small face over a card
  const aroundFace = useMemo(
    () => (
      <>
        {orbit}
        {overCard ? pillNode : null}
      </>
    ),
    [orbit, overCard, pillNode],
  );
  // a tap on the thought: it goes, and the ball it is about opens
  const openThought = useCallback(() => {
    dismissThought();
    show("panel", thoughtPanel);
  }, [dismissThought, thoughtPanel, show]);
  const openThread = useCallback((task: BoardTask) => setThread({ id: task.id, title: task.title }), []);
  const closeThread = useCallback(() => setThread(null), []);

  // what the open ball shows inside its card — drawn again only when its own data changes (D-178)
  const etherCount = (ether.data ?? []).length;
  const { errandRows, actions: catalogueRows } = secretary;
  const panelContent = useMemo(() =>
    panel === "tasks" ? (
      // The report row is mounted once, whatever «Дела» holds — it keeps its state when the list
      // empties or fills, and it can be the only thing left (the face that calls for it leads here).
      // Its place is a flex order: under the orders through the day; on top from `ask_from` (D-167)
      // only when no order waits for the person's move — an order to accept is not pushed under the
      // tab bar by the report (D-173). Decided once per opening of the card (`reportTop`).
      // The report row and «Все дела ›» glide with the cards round them on the same spring: a card
      // taken or handed in moves them, and they used to jump while the cards slid (D-178).
      <div className="flex flex-col gap-3">
        <motion.div layout="position" transition={BAND_SPRING} className="empty:hidden" style={{ order: (reportTop ?? reportTopNow) ? -1 : 1 }}>
          <ReportDueRow now={now} />
        </motion.div>
        {todo.length === 0 && inWork.length === 0 && onReview.length === 0 ? (
          <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Дел нет. Придёт задача — я позову.</p>
        ) : (
        // One list, each card keyed by its task: «Принял» moves a card down among those in work and
        // «Выполнено» under «На проверке» — the same card glides there instead of jumping (D-167),
        // while its copy flies into the face's hands or up to the director (FlightTargetProvider)
        <div className="flex flex-col gap-3">
          <LocalPresence mode="popLayout" initial={false}>
            {[...todo, ...inWork, ...onReview].flatMap((task, i, all) => {
              const review = task.status === "pending_review";
              const card = (
                <motion.div
                  key={task.id}
                  layout="position"
                  transition={BAND_SPRING}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: "easeOut" } }}
                >
                  <div className="card-in">
                    {/* dimmed inside: the fade-in's `both` would hold its own opacity over the class */}
                    <div className={review ? "opacity-80" : undefined}>
                      <TaskCard task={task} variant="employee" actions={actions} companyId={companyId} href={`/tasks/${task.id}`} />
                    </div>
                  </div>
                </motion.div>
              );
              return review && all[i - 1]?.status !== "pending_review"
                ? [
                    <motion.p key="on-review" layout="position" transition={BAND_SPRING} className="mt-1 px-1 text-[14px] leading-4 text-muted">
                      На проверке у директора · {onReview.length}
                    </motion.p>,
                    card,
                  ]
                : [card];
            })}
          </LocalPresence>
        </div>
        )}
        {todo.length + inWork.length + onReview.length > 0 ? (
          <motion.div layout="position" transition={BAND_SPRING} className="flex" style={{ order: 2 }}>
            <Link href="/tasks" className="min-h-[44px] px-1 text-[14px] leading-[44px] text-muted">
              Все дела ›
            </Link>
          </motion.div>
        ) : null}
      </div>
    ) : panel === "messages" ? (
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
              onOpen={() => openThread(task)}
            />
          ))}
        </div>
      )
    ) : panel === "calendar" ? (
      events.length === 0 ? (
        <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Пока ничего не запланировано.</p>
      ) : (
        <CalendarList events={events} now={now} meId={meId} onOpen={setOpenEvent} variant="compact" />
      )
    ) : panel === "secretary" ? (
      <ErrandCards errands={errandRows} meId={meId} now={now} catalogue={catalogueRows} />
    ) : panel === "ether" ? (
      etherCount === 0 ? (
        <p className="py-4 text-center text-[16px] leading-[22px] text-muted">Объявлений пока нет.</p>
      ) : (
        <EtherSection variant="page" />
      )
    ) : null,
  [panel, reportTop, reportTopNow, now, todo, inWork, onReview, actions, companyId, unread, meId, openThread, events, errandRows, catalogueRows, etherCount]);
  // the card's inside: the open ball's content, and the service cards under it
  const cardBody = useMemo(
    () => (
      <div className="flex min-h-full flex-col">
        {/* another ball changes what is in the card, not the card: the old content is gone in a
            blink (popLayout — the new one does not wait for it, and nothing of it is left over the
            service cards), the new one rises into its place and shows once the old is gone — two
            «нет» lines never stand one over the other; position only, a size animation squashed
            the cards */}
        <div className="relative pt-1">
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
        {/* the panel is what the tap asked for: the service cards wait under it (D-143) — once
            for the card, so a switch of balls does not mount them anew; at the card's bottom
            while the panel is short, and when another panel moves them they glide there (D-178) */}
        <motion.div layout="position" transition={BAND_SPRING} className="mt-auto flex flex-col gap-2 pt-4 empty:hidden" data-testid="card-service">
          {/* the phone's line under «Дела» only, not under every ball (D-190) */}
          {panel === "tasks" ? SERVICE : null}
        </motion.div>
      </div>
    ),
    [panel, panelContent],
  );

  return (
    // the three bands of the home stage (HomeStage), as on Пульс; a card taken in hand flies into
    // the face — the secretary's face is its own, nothing flies there
    <HomeStage
      mode={mode}
      box={box}
      faceSize={faceSize}
      top={isSecretary ? <SecretaryTop home={secretary} meId={meId} now={now} showTally={showTally} /> : null}
      flight={FLIGHT}
      // above the head: what the assistant says — it glides with the band's edge on a mode change,
      // not cut off by the band's new edge on the way (`useBandGlide`); a thought floats up over it,
      // and it steps aside while the thought is up (D-178). At rest the words keep clear of what the
      // face holds up over its head — the new order's card hops above the face's box (D-173)
      words={<SaidBand show={assistantLines.length > 0} lines={assistantLines} aside={thought !== null} roomy={mode === "idle" && lines.length > 0} topInset={topInset} />}
      // the same waiting screen the director has (D-89): dust and a dream behind the head while the
      // board is at rest, gone at the first touch
      face={
            isSecretary ? (
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
                urgency={secretary.urgency}
                queue={desk.queue}
                daypart={secretary.daypart}
                cheer={pointsEnabled && desk.phase === "done" && desk.quick}
                still={deepRest && mode === "idle"}
                onTap={onFaceTap}
                around={orbit}
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
                  label={mode !== "idle" ? undefined : ((reason && FACE_LABEL[reason]) ?? FACE_LABEL_BALLS)}
                  // the balls live in the head and travel with the face (D-178); over a card, «+N» and
                  // the run of «в срок» stand by the small face, at once (principle 1a)
                  around={aroundFace}
                />
              </>
            )
      }
      // the thought opens what it is about: the order, the word, Эфир, the meeting (D-110)
      thought={
        thought
          ? {
              id: thought.id,
              text: thought.text,
              tone: thought.tone,
              onDismiss: dismissThought,
              onOpen: openThought,
              openLabel: `открыть «${balls.find((ball) => ball.id === thoughtPanel)?.label ?? "Дела"}»`,
            }
          : null
      }
      underFace={
        <>
          {/* right under the resting face: where a tap on it leads, as a button that does the same
              (D-173) — the person does not have to guess that the face is the way in. After
              hydration, like the words: what it names comes from the orders and the hour. It fades
              in — after the face has come down to it, when the face comes back from a card or the
              balls (D-178) */}
          {!isSecretary && mode === "idle" && hydrated && !loading && !raising ? (
            // above the dream that flies round the sleeping head: it passes behind the button
            <div className={`relative z-10 flex shrink-0 justify-center pt-2 ${cameFrom !== "idle" ? AFTER_CARD : "card-in"}`}>
              <button
                type="button"
                onClick={onFaceTap}
                className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface-2 px-4 font-display text-[15px] font-semibold leading-5 text-text transition-transform duration-[120ms] ease-out active:scale-[0.97]"
                data-testid="face-go"
                data-go={reason ?? "balls"}
              >
                {(reason && FACE_GO[reason]) || FACE_GO_BALLS}
              </button>
            </div>
          ) : null}
          {/* under it: «+5 очков», «🔥 3 подряд в срок» (over a card — by the small face, above) */}
          {mode !== "panel" ? pillNode : null}
          <PointsFlight arrival={arrival.key} />
          {/* right under the face: what the secretary is doing, «на месте», and a little lower
              «Посетитель» — out of the face's band, so the face stays in the middle (D-87).
              The balls coming out take it away in a short fade, popped out of the flow so the band
              takes its place at once; coming back with the face it shows once the face is down (D-178) */}
          <LocalPresence mode="popLayout" initial={false}>
            {isSecretary && mode === "idle" && !loading ? (
              <motion.div
                key="desk-under"
                className={`flex shrink-0 flex-col items-center${cameFrom !== "idle" ? ` ${AFTER_CARD}` : ""}`}
                exit={FADE_AWAY}
                data-testid="desk-under"
              >
                <DeskUnder home={secretary} now={now} acceptByFace={acceptByFace} act={secretaryAct} />
              </motion.div>
            ) : null}
          </LocalPresence>
        </>
      }
      band={
        <>
          {/* the secretary's requests live on the waiting screen itself: «Принял» in one tap */}
          {isSecretary && mode === "idle" ? <SecretaryCards home={secretary} meId={meId} now={now} /> : null}
          {/* service cards only once the face has been tapped — the resting screen is the face
              alone; after a card they wait for it to be gone, and the face dozing off takes them
              with it in a short fade (D-178) */}
          <LocalPresence initial={false}>
            {mode !== "idle" ? (
              <motion.div key="service" className={`flex flex-col gap-2 empty:hidden${afterCard ? ` ${AFTER_CARD}` : ""}`} exit={FADE_AWAY}>
                {SERVICE}
              </motion.div>
            ) : null}
          </LocalPresence>
        </>
      }
      // a card remembered open (D-167) stands where it was left: no rise (D-178)
      card={{ open: cardOpen, panel: panel ?? "", label: balls.find((ball) => ball.id === panel)?.label ?? "Панель", receded: false, onClose: closePanel, body: cardBody, initial: !reopened }}
    >

      {/* the secretary's hint; it never lies over the secretary's cards, nor over a card going down
          (D-178). Everybody else has the button under the face (D-173) */}
      {isSecretary && mode === "idle" && !(mineErrands.length > 0 || visitRows.some((v) => !v.closed_at)) ? (
        <p
          className={`pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted${afterCard ? ` ${AFTER_CARD}` : ""}`}
          style={{ bottom: "calc(var(--tabbar-space) + 2px)" }}
        >
          тап — дела, сообщения, эфир, календарь, заявки
        </p>
      ) : null}

      {/* the first sign-in on a phone opens «Подключение» once (D-190) */}
      <SetupLaunch />

      <QuietEventSheet event={openEvent} onClose={closeEvent} meId={meId} isDirector={false} />

      {isSecretary ? <PresenceSheet home={secretary} /> : null}

      <QuietThreadSheet
        open={Boolean(thread)}
        onClose={closeThread}
        taskId={thread?.id ?? null}
        title={thread?.title ?? ""}
        companyId={companyId}
        userId={meId || undefined}
        actions={actions}
      />
    </HomeStage>
  );
}
