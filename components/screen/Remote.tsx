"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";

import { BoardPresenter, usePresenterBusy } from "@/components/mindboard/BoardPresenter";
import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { BoardSeam } from "@/components/screen/BoardSeam";
import { ConnectPad } from "@/components/screen/ConnectPad";
import { LiveWall } from "@/components/screen/LiveWall";
import { ScreenPageSkeleton } from "@/components/screen/RemoteSkeleton";
import { markSent, useRemoteClock } from "@/components/screen/sent";
import { useShownToday } from "@/components/screen/shown";
import { useWallBoard } from "@/components/screen/useWallBoard";
import { Avatar, Body, Dot, Gauge, Key, Lcd, LcdDim, Lens, PersonName, Seam, Switch, padClass, personKeyClass, type LedTone } from "@/components/ui/device/Device";
import s from "@/components/ui/device/device.module.css";
import { PersonPad } from "@/components/ui/device/PersonPad";
import { PageHead } from "@/components/ui/PageHead";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { ANSWERS } from "@/components/visits/VisitAsk";
import { useCalendar } from "@/lib/calendar/queries";
import { useBoards } from "@/lib/mindboard/queries";
import { keyLabels } from "@/lib/people/labels";
import { initialsOf, usePeople, type Person } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { tvTime } from "@/lib/tv/clock";
import { useTvControl, type TvControlInput } from "@/lib/tv/mutations";
import { programWindowOf, segmentEndsAt } from "@/lib/tv/program";
import { useTvState, useTvSummary, type TvState } from "@/lib/tv/queries";
import {
  CLOCK_LABEL,
  LIKELY_LABEL,
  SCALE_LABEL,
  SCENE_LABEL,
  WALL_SCALES,
  likelyNow,
  overlayLine,
  uncover,
  wallHealth,
  wallNow,
  wallReceipt,
  wallScaleOf,
  type WallScale,
} from "@/lib/tv/remote";
import {
  awakeUntil,
  calendarViewOf,
  CLOCK_STYLES,
  clockStyleOf,
  effectiveMode,
  FOCUS_MS,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  isTvScene,
  programOn,
  ratingViewOf,
  TV_SCENES,
  wallAsleep,
  wallSceneOf,
  WAKE_MS,
  type ClockStyle,
  type TvScene,
} from "@/lib/tv/state";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages, waitedSince } from "@/lib/visits/text";

/**
 * «Экран в кабинете» — пульт от телевизора в кармане директора (D-76 §10, D-96, D-182).
 *
 * Жест, ради которого он существует: сотрудник зашёл в кабинет — директор нажал его имя — на
 * стене его дела (CONCEPT §9). С D-182 этот жест стоит на первом экране телефона: дисплей «Сейчас
 * на стене», под ним — что происходит в эту минуту (посетитель, сообщение секретаря, ведущий доски,
 * «Перезапустить экран», если стена молчит), и сразу «Кого показать» с первой строкой «Вероятно
 * сейчас»: люди идущей встречи директора, те, чьё дело ждёт приёмки, кого уже показывали сегодня.
 * Ниже — заставки одной строкой (у календаря и рейтинга «Неделя / Месяц» — повторным тапом), доски
 * и свёрнутый «Вид стены»: часы, гость, «Крупность», подключение экрана (принцип 1: глубина —
 * вторым слоем).
 *
 * Пульт собран как устройство: линза с диодом-квитанцией, дисплей, резиновые клавиши. Директор не
 * видит телевизор из кабинета и узнаёт от пульта, дошла команда или экран висит (принцип 8 для ТВ):
 * диод мигает, пока команда летит, горит зелёным, когда стена показала, жёлтым — когда экран молчит;
 * команда, не показанная за 15 секунд, — уже «Экран не показал за 15 с». Дисплей говорит причину и
 * срок: «Человек на стене — ещё 7 мин», «Программа: утро · дальше по кругу в 10:00», «Вручную до
 * 17:00, потом программа»; тап по нему открывает живую стену в шторке. Оффлайн-очереди у пульта нет:
 * без сети клавиша честно говорит «нет связи» (D-76 §3).
 *
 * `wallSrc` и `frozenNow` — для песочницы `/dev/screen`: стена на фикстурах и остановленные часы.
 */

/** The order on the wall has a name on the remote's display (D-123); the director reads tasks. */
function useTaskTitle(taskId: string | null) {
  return useQuery({
    queryKey: ["tv", "task-title", taskId],
    enabled: Boolean(taskId),
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.from("tasks").select("title").eq("id", taskId!).maybeSingle();
      return data?.title ?? null;
    },
  });
}

/** A label under a seam's label: printed the same, in sentence case. */
const SUBLABEL = { textTransform: "none", letterSpacing: "0.01em" } as const;

const RECEIPT_COLOR = { ok: "var(--ok)", warn: "var(--warn)", muted: "var(--text-muted)" } as const;

/** The remote's blocks move with the design's spring (cards, counters): a slide, never a jump. */
const SLIDE = { type: "spring", stiffness: 260, damping: 24 } as const;
/**
 * A block that comes with the wall's state. The remote under it slides away first and the block fades in on the
 * room it made — faded in at once, it would show through the keys sliding over it; leaving, it is gone before
 * they slide back up over its place.
 */
const COMES_AND_GOES = {
  layout: "position",
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, delay: 0.12, ease: [0.2, 0, 0, 1] } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: [0.2, 0, 0, 1] } },
  transition: { layout: SLIDE },
} as const;

type RemoteProps = {
  /** What the live wall in the sheet shows: `/tv`, or a fixture case of `/dev/tv` in the sandbox. */
  wallSrc?: string;
  /** A stopped clock (ISO) — the sandbox's states hold still for a picture. */
  frozenNow?: string;
};

export function Remote({ wallSrc = "/tv", frozenNow }: RemoteProps) {
  const { now, sent } = useRemoteClock(frozenNow);
  const state = useTvState();
  const people = usePeople();
  const control = useTvControl();
  const visits = useVisits();
  const answer = useAnswerVisit();
  const me = useMe();
  const boards = useBoards(me.data?.userId);
  const pointsEnabled = usePointsEnabled();
  // the program's window and today's announcement (D-182) — the wall's own summary, so the display counts as the wall
  const summary = useTvSummary(false);
  const calendar = useCalendar();
  const sentTasks = useSentTasks(me.data?.userId);
  const taskTitle = useTaskTitle(state.data?.mode === "task" ? (state.data.task_id ?? null) : null);
  const wall = useWallBoard(state.data ?? null, now);
  const presenting = usePresenterBusy();
  const row = state.data ?? null;
  const onScreenId = effectiveMode(row, now) === "employee" ? (row?.employee_id ?? null) : null;
  const shownToday = useShownToday(onScreenId, now);
  const [sheet, setSheet] = useState<"live" | "connect" | null>(null);
  const [codeFor, setCodeFor] = useState<{ id: string | null; key: number }>({ id: null, key: 0 });
  const [look, setLook] = useState(false);

  if (state.isLoading || people.isLoading) return <ScreenPageSkeleton />;

  const roster = people.data ?? [];
  // «Вероятно сейчас» (D-182): from what the phone has read anyway — the calendar, the sent orders, this phone's day
  const likely = likelyNow({ meId: me.data?.userId, events: calendar.data ?? [], tasks: sentTasks.data ?? [], shownToday, people: roster, now });

  const w = programWindowOf(summary.data);
  const announcement = Boolean((summary.data as { announcement?: unknown } | undefined)?.announcement);
  const mode = effectiveMode(row, now);
  // the rating needs points (D-48): the key and the round follow the company switch (D-123)
  const points = pointsEnabled.data ?? true;
  const guest = guestOf(row, false, now);
  const visible = wallSceneOf(row, now, { points, guest, announcement }, w);
  const program = programOn(row, now, w);
  // a screensaver picked by hand and holding (D-182) — lit on its key; the round's key is lit while the program runs
  const pinned: TvScene | null = !program && visible !== "board" && isTvScene(visible) ? visible : null;
  const asleep = wallAsleep(row, now, w);
  const sceneKeys = TV_SCENES.filter((value) => value !== "rating" || pointsEnabled.data === true);
  const clock = clockStyleOf(row);
  const scale = wallScaleOf(row);
  const guestEnds = guestEndsAt(row, now);
  const night = isNight(now, w);
  const awake = awakeUntil(row, now);
  const receipt = wallReceipt(row, now, sent);
  const health = wallHealth(row, now);
  const remainingMs = focusRemainingMs(row, now);
  // a person or an order over the screensaver: a scene, a view or a board put up from here takes
  // them down in the same command (`uncover`), and no scene is lit as «on the wall» meanwhile
  const covered = mode !== "ether";
  const takeDown = uncover(row, now);
  const visitor = awaitingDirector(visits.data ?? [])[0] ?? null;
  // the secretary's words on the wall (D-116): the newest one, as the wall shows it
  const messages = unreadMessages(visits.data ?? []);
  const message = messages[messages.length - 1] ?? null;
  const over = overlayLine(visitor, message, now);
  // экран ни разу не поднимался: сначала объясняем, как его завести, потом команды
  const neverSeen = !row?.seen_at;
  // диод мигает, пока команда в пути: от нажатия до того, как киоск отметил её показанной
  const inFlight = control.isPending || presenting || (receipt.tone === "muted" && !neverSeen);
  const led: LedTone = inFlight ? "accent" : neverSeen ? "off" : receipt.tone;
  const display = wallNow(row, roster, now, boards.data ?? [], {
    points,
    guest,
    taskTitle: taskTitle.data,
    boardPoints: wall.points.map((point) => point.id),
    window: w,
    announcement,
  });
  // the end of a screensaver picked now; a database older than the program keeps it with no end
  const holdsTill = (row as (TvState & { scene_set_at?: string | null }) | null)?.scene_set_at === undefined ? null : segmentEndsAt(now, w);
  const tillWords = holdsTill ? ` · до ${tvTime(holdsTill)}` : "";
  const screens = roster.filter((p) => p.role === "tv" && p.is_active);
  const codeTo = screens.find((p) => p.id === codeFor.id) ?? (screens.length === 1 ? screens[0] : null);
  const likelyPeople = likely.flatMap((entry) => {
    const person = roster.find((p) => p.id === entry.id);
    return person ? [{ person, why: entry.why }] : [];
  });

  // the receipt of a command: its words in a toast, or (D-140) what the caller does instead; the
  // version that came back is the one the wall has fifteen seconds to show (D-182)
  const show = (input: TvControlInput, then: string | ((row: TvState) => void)) => {
    control.mutate(input, {
      onSuccess: (next) => {
        markSent(next?.version);
        if (typeof then === "string") toast(then);
        else then(next);
      },
    });
  };

  const putUp = (person: Person) =>
    show(
      { mode: "employee", employeeId: person.id },
      person.id === onScreenId ? "Ещё 10 минут" : `На стене — ${person.full_name.split(/\s+/)[0]} · 10 мин`,
    );

  const pickScene = (value: TvScene) => {
    if (covered || program || pinned !== value) {
      show({ ...takeDown, scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}${tillWords}`);
      return;
    }
    // the second tap on the calendar or the rating on the wall turns its period (D-98, D-123)
    if (value === "calendar") {
      const next = calendarViewOf(row) === "month" ? "week" : "month";
      show({ calendar: next }, next === "month" ? "На стене — месяц" : "На стене — сегодня и неделя");
    } else if (value === "rating") {
      const next = ratingViewOf(row) === "month" ? "week" : "month";
      show({ rating: next }, next === "month" ? "На стене — рейтинг месяца" : "На стене — рейтинг недели");
    }
  };

  const pickRound = () => {
    if (program && !covered) {
      // off pins what the office sees right now: the screensavers stop turning till the end of the part of the day
      const keep: TvScene = isTvScene(visible) && visible !== "board" ? visible : "face";
      show({ carousel: false, scene: keep }, `Заставки больше не меняются · ${SCENE_LABEL[keep].toLowerCase()}${tillWords}`);
      return;
    }
    show({ ...takeDown, carousel: true }, "Заставки по кругу — программа дня");
  };

  const sceneHint = covered
    ? `Поверх заставки — ${mode === "task" ? "дело" : "человек"} · тап по заставке покажет её сразу`
    : pinned === "calendar"
      ? `Ещё тап по «Календарь» — ${calendarViewOf(row) === "month" ? "неделя" : "месяц"}`
      : pinned === "rating"
        ? `Ещё тап по «Рейтинг» — ${ratingViewOf(row) === "month" ? "неделя" : "месяц"}`
        : pinned
          ? "«По кругу» вернёт программу дня"
          : holdsTill
            ? `Тап по заставке — она на стене до ${tvTime(holdsTill)}, потом программа`
            : "Тап по заставке — она на стене, пока не включите «По кругу»";

  const lookSummary = [
    CLOCK_LABEL[clock],
    SCALE_LABEL[scale].toLowerCase(),
    guest ? (guestEnds ? `гость до ${tvTime(guestEnds)}` : "гость в кабинете") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // «Подключить экран»: the sheet with both ways — the wall's own code (D-182) first, the login code (D-135) under it
  const connect = (
    <Key
      icon={<ConnectIcon />}
      on={neverSeen}
      data-testid="remote-connect"
      onClick={() => {
        setCodeFor((c) => ({ id: null, key: c.key + 1 }));
        setSheet("connect");
      }}
    >
      Подключить экран
    </Key>
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      {/* the wall's receipt lights the screen (D-117): green on the wall, amber when it does not answer;
          the words are the LCD's */}
      <PageHead title="Экран в кабинете" tone={receipt.tone} />

      <Body className="mx-auto mt-4 w-full max-w-[380px]">
        <Lens tone={led} blink={inFlight} />

        {/* the display; a tap opens the wall itself, live (D-182) */}
        <button
          type="button"
          className="mt-3 block w-full rounded-[18px] text-left [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35"
          aria-label="Сейчас на стене — открыть живую стену"
          disabled={neverSeen}
          onClick={() => setSheet("live")}
          data-testid="remote-display"
        >
          <Lcd>
            <div className="flex items-center justify-between gap-3">
              <LcdDim className="font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]">
                {neverSeen ? "Экран" : "Сейчас на стене"}
              </LcdDim>
              <LcdDim className="nums flex items-center gap-1.5 text-[12px] leading-4">
                {tvTime(now)}
                {neverSeen ? null : <EyeIcon />}
              </LcdDim>
            </div>
            {neverSeen ? (
              <>
                <p className="mt-2 font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">Ещё не подключался</p>
                <LcdDim className="mt-1 block text-[13px] leading-[18px]">Подключите телевизор — ниже, кодом с его экрана</LcdDim>
              </>
            ) : (
              <>
                <p className="mt-2 line-clamp-2 font-display text-[21px] font-bold leading-7 tracking-[-0.02em] [overflow-wrap:anywhere]" data-testid="remote-now">
                  {display.title}
                </p>
                <LcdDim className="mt-0.5 block text-[13px] leading-[18px]" data-testid="remote-why">
                  {display.why}
                </LcdDim>
                <p className="mt-1 text-[13px] leading-[18px]" style={{ color: RECEIPT_COLOR[receipt.tone] }} data-testid="remote-receipt" data-tone={receipt.tone}>
                  {receipt.text}
                </p>
                {over ? (
                  <p className="mt-1 text-[13px] leading-[18px]" style={{ color: "var(--accent)" }} data-testid="remote-over">
                    Поверх всего: {over.charAt(0).toLowerCase()}
                    {over.slice(1)}
                  </p>
                ) : null}
                {health ? (
                  <p className="mt-1 text-[13px] leading-[18px]" style={{ color: "var(--warn)" }} data-testid="remote-health">
                    {health}
                  </p>
                ) : null}
                {/* the gauge's row stays while nobody is on the wall: a person put up from the pad below
                    does not push the remote down under the finger — the strip fades in */}
                <div className="mt-3" style={{ opacity: covered ? 1 : 0, transition: "opacity var(--t-screen) var(--ease-out)" }}>
                  <Gauge ratio={covered ? remainingMs / FOCUS_MS : 0} />
                </div>
              </>
            )}
          </Lcd>
        </button>

        {/* blocks that come and go with the wall's state fade in place, and the remote under them slides
            (a spring) instead of jumping (FLIP: transform only); with «reduce motion» only the fades stay */}
        <MotionConfig reducedMotion="user">
          <AnimatePresence mode="popLayout" initial={false}>
            {/* the wall did not show the command, or went silent: the one key that may help, right here */}
            {receipt.restart ? (
              <motion.div key="restart" {...COMES_AND_GOES}>
                <div className="mt-3 flex">
                  <Key icon={<RefreshIcon />} onClick={() => show({ reload: true }, "Экран перезапускается")} data-testid="remote-restart">
                    Перезапустить экран
                  </Key>
                </div>
              </motion.div>
            ) : null}

            {/* a person or an order on the wall: one key takes them down, back to the screensavers */}
            {covered ? (
              <motion.div key="uncover" {...COMES_AND_GOES}>
                <div className="mt-3 flex">
                  <Key icon={<EtherIcon />} onClick={() => show({ mode: "ether" }, "Убрал со стены")} data-testid="remote-uncover">
                    Убрать со стены
                  </Key>
                </div>
              </motion.div>
            ) : null}

            {/* the visitor at the secretary's desk: the answer from the remote too (D-96) */}
            {visitor ? (
              <motion.div key="visitor" {...COMES_AND_GOES}>
                <div className="mt-3 rounded-[14px] p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }} data-testid="remote-visitor">
                  <p className="text-[13px] leading-4 text-muted">
                    {visitor.status === "waiting" ? "К вам посетитель" : "Посетитель ждёт"} · {waitedSince(visitor.created_at, now)}
                  </p>
                  <p className="mt-0.5 truncate font-display text-[17px] font-semibold leading-[22px]">{visitor.note?.trim() || "Без имени"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ANSWERS.map((option) => (
                      <Key
                        key={option.value}
                        className={option.value === "invited" ? "col-span-2" : ""}
                        on={option.value === "invited"}
                        disabled={(answer.isPending && answer.variables?.id === visitor.id) || (option.value === "wait" && visitor.status === "wait")}
                        onClick={() => answer.mutate({ id: visitor.id, answer: option.value })}
                      >
                        <span className="text-[13px] leading-4">{option.label}</span>
                      </Key>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* the secretary's message on the wall: «Понятно» from the remote takes it down (D-116) */}
            {message ? (
              <motion.div key="message" {...COMES_AND_GOES}>
                <div className="mt-3 rounded-[14px] p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }} data-testid="remote-message">
                  <p className="text-[13px] leading-4 text-muted">
                    Сообщение · {waitedSince(message.created_at, now)}
                    {messages.length > 1 ? ` · ещё ${messages.length - 1}` : ""}
                  </p>
                  <p className="mt-0.5 line-clamp-2 font-display text-[17px] font-semibold leading-[22px] [overflow-wrap:anywhere]">{message.note?.trim()}</p>
                  <div className="mt-2 grid">
                    <Key on disabled={answer.isPending && answer.variables?.id === message.id} onClick={() => answer.mutate({ id: message.id, answer: "read" })}>
                      <span className="text-[13px] leading-4">Понятно</span>
                    </Key>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* the presenter (D-121): right under the display while the director's board is on the wall —
                a meeting is run from here without scrolling the remote */}
            {wall.board && !wall.board.deleted_at ? (
              <motion.div key="presenter" {...COMES_AND_GOES}>
                <BoardPresenter variant="remote" boardId={wall.board.id} points={wall.points} now={now} />
              </motion.div>
            ) : null}

            {/* the night dims the wall to its clock (D-96 §8); the director working late wakes it
                for two hours, and the same switch puts it back to sleep (D-105) */}
            {night ? (
              <motion.div key="night" {...COMES_AND_GOES}>
                <div className="mt-3">
                  <Switch
                    on={awake !== null}
                    icon={<SunIcon />}
                    title={awake ? "Экран не спит" : "Разбудить экран"}
                    value={awake ? `до ${tvTime(awake)}, потом снова ночь` : asleep ? "ночь: тусклые часы до утра" : "ночь: стена уснёт, когда освободится"}
                    onToggle={(next) => show({ wake: next }, next ? `Экран проснулся до ${tvTime(new Date(Date.now() + WAKE_MS))}` : "Экран снова спит")}
                  />
                </div>
              </motion.div>
            ) : null}

            {/* a wall never connected: how to connect it comes first, the commands after */}
            {neverSeen ? (
              <motion.div key="first-connect" {...COMES_AND_GOES}>
                <Seam label="Подключить экран" />
                <div className="mt-2">{connect}</div>
              </motion.div>
            ) : null}

            <motion.div key="keys" layout="position" transition={{ layout: SLIDE }}>
              {/* «Кого показать» (D-76): the gesture the remote exists for — one tap, ten minutes, a second tap — ten more */}
              <Seam label="Кого показать" />
              {likelyPeople.length > 0 ? (
                <div className="mt-2" data-testid="remote-likely">
                  <p className={`${s.print} px-1`} style={SUBLABEL}>
                    Вероятно сейчас
                  </p>
                  <div className={`${padClass} mt-1.5`} role="group" aria-label="Вероятно сейчас">
                    {likelyPeople.map(({ person, why }) => (
                      <LikelyKey key={person.id} person={person} roster={roster} lit={person.id === onScreenId} why={LIKELY_LABEL[why]} onPick={() => putUp(person)} />
                    ))}
                  </div>
                  <p className={`${s.print} mt-3 px-1`} style={SUBLABEL}>
                    Все
                  </p>
                </div>
              ) : null}
              <div className="mt-2">
                <PersonPad
                  people={roster}
                  activeId={onScreenId}
                  groupLabel="Кого показать"
                  ariaFor={(person, active) => (active ? `${person.full_name} — на стене, продлить` : `Показать: ${person.full_name}`)}
                  onPick={putUp}
                />
              </div>

              {/* the screensavers in one row, the round last; the lit key — what the remote set, the dot —
                  what the office sees this minute (D-123, D-182) */}
              <Seam label="Заставки" />
              <div
                className="mt-2 grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${sceneKeys.length + 1}, minmax(0, 1fr))` }}
                data-testid="remote-scenes"
              >
                {sceneKeys.map((value) => (
                  <SceneKey
                    key={value}
                    label={value === "calendar" && pinned === "calendar" ? (calendarViewOf(row) === "month" ? "Месяц" : "Неделя") : value === "rating" && pinned === "rating" ? (ratingViewOf(row) === "month" ? "Месяц" : "Неделя") : SCENE_LABEL[value]}
                    icon={SCENE_ICON[value]}
                    on={pinned === value}
                    live={!covered && !asleep && visible === value}
                    testId={`remote-scene-${value}`}
                    onClick={() => pickScene(value)}
                  />
                ))}
                <SceneKey label="По кругу" icon={<RoundIcon />} on={program} live={program && !covered && !asleep} testId="remote-carousel" pressed={program} onClick={pickRound} />
              </div>
              {/* two lines always: the keys below do not jump */}
              <p className="mt-1.5 min-h-[36px] px-1 text-center text-[13px] leading-[18px] text-muted" data-testid="remote-scene-hint">
                {sceneHint}
              </p>

              {/* the director's boards (D-102, D-121): the one on the wall as a cartridge, the others on a shelf */}
              <BoardSeam wall={wall} row={row} now={now} guest={guest} show={show} />

              {/* «Вид стены» (D-182): how the wall looks and how it is connected — the second layer, folded */}
              <div className={s.seam} aria-hidden />
              <button
                type="button"
                className={`${s.panel} mt-3`}
                aria-expanded={look}
                aria-controls="remote-look"
                onClick={() => setLook((open) => !open)}
                data-testid="remote-look-toggle"
              >
                <span aria-hidden className="inline-flex shrink-0 text-muted">
                  <LookIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-semibold leading-5 tracking-[-0.01em]">Вид стены</span>
                  <span className="block truncate text-[13px] leading-4" style={{ color: guest ? "var(--warn)" : "var(--text-muted)" }}>
                    {lookSummary}
                  </span>
                </span>
                <span aria-hidden className="inline-flex shrink-0 text-muted transition-transform duration-150" style={{ transform: look ? "rotate(180deg)" : undefined }}>
                  <ChevronIcon />
                </span>
              </button>
              {look ? (
                <div id="remote-look" data-testid="remote-look">
                  {/* the clock on the wall: digits or hands, everywhere it is drawn (D-96) */}
                  <p className={`${s.print} mt-4 px-1`}>Часы</p>
                  <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Часы на стене">
                    {CLOCK_STYLES.map((value: ClockStyle) => (
                      <Key
                        key={value}
                        on={clock === value}
                        role="radio"
                        aria-checked={clock === value}
                        icon={value === "analog" ? <HandsIcon /> : <DigitsIcon />}
                        onClick={() => {
                          if (clock !== value) show({ clock: value }, value === "analog" ? "Часы: стрелки" : "Часы: цифры");
                        }}
                      >
                        {CLOCK_LABEL[value]}
                      </Key>
                    ))}
                  </div>

                  {/* «Крупность» (D-182): how far the room reads the wall from */}
                  <p className={`${s.print} mt-4 px-1`}>Крупность</p>
                  <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Крупность стены" data-testid="remote-scale">
                    {WALL_SCALES.map((value: WallScale) => (
                      <Key
                        key={value}
                        on={scale === value}
                        role="radio"
                        aria-checked={scale === value}
                        onClick={() => {
                          if (scale !== value) show({ scale: value }, `Крупность: ${SCALE_LABEL[value].toLowerCase()}`);
                        }}
                      >
                        <span className="flex flex-col items-center gap-0.5">
                          <span aria-hidden className="font-display font-bold leading-none" style={{ fontSize: value === 100 ? 13 : value === 115 ? 16 : 19 }}>
                            Аа
                          </span>
                          {SCALE_LABEL[value]}
                        </span>
                      </Key>
                    ))}
                  </div>

                  <div className="mt-3">
                    <Switch
                      on={guest}
                      icon={<GuestIcon />}
                      title="Гость в кабинете"
                      value={guest ? (guestEnds ? `имена скрыты до ${tvTime(guestEnds)}` : "без фамилий, очков и названий") : "выключен"}
                      onToggle={(next) => show({ guest: next }, next ? "Гость в кабинете: имена скрыты" : "Гость ушёл: имена снова видны")}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {connect}
                    <Key icon={<RefreshIcon />} onClick={() => show({ reload: true }, "Экран перезапускается")} data-testid="remote-reload">
                      Перезапустить
                    </Key>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </MotionConfig>
      </Body>

      {/* the wall itself, live, in a sheet (D-182): look only — nothing inside takes a tap */}
      <Sheet open={sheet === "live"} onClose={() => setSheet(null)} title="Стена сейчас">
        <div className="overflow-hidden rounded-[14px] bg-black" data-testid="remote-live">
          {sheet === "live" ? <LiveWall src={wallSrc} /> : null}
        </div>
        <p className="mt-3 font-display text-[17px] font-semibold leading-[22px]">{display.title}</p>
        <p className="mt-0.5 text-[14px] leading-[18px] text-muted">{display.why}</p>
        <p className="mt-1 text-[14px] leading-[18px]" style={{ color: RECEIPT_COLOR[receipt.tone] }}>
          {receipt.text}
        </p>
      </Sheet>

      <Sheet open={sheet === "connect"} onClose={() => setSheet(null)} title="Подключить экран">
        {/* the wall shows its code, the director types it here (D-182) */}
        <ConnectPad />
        {/* the D-135 way stays: a code for the wall's kiosk user, typed with the TV's remote */}
        <p className={`${s.print} mb-2 mt-6`}>Или код для входа{codeTo ? ` · ${codeTo.full_name}` : ""}</p>
        {codeTo ? (
          <LoginCodePanel key={codeFor.key} person={codeTo} tv onDone={() => setSheet(null)} />
        ) : screens.length > 1 ? (
          <div className="flex flex-col gap-2">
            <p className="text-[14px] leading-[18px] text-muted">Какой экран подключить?</p>
            {screens.map((screen) => (
              <Key key={screen.id} icon={<ConnectIcon />} onClick={() => setCodeFor((c) => ({ ...c, id: screen.id }))}>
                {screen.full_name}
              </Key>
            ))}
          </div>
        ) : (
          <p className="text-[14px] leading-[18px] text-muted">
            Экрана нет среди сотрудников: «Настройки» → «Сотрудники» → «Новый сотрудник», роль «ТВ-экран».
          </p>
        )}
      </Sheet>
    </main>
  );
}

/** A person of «Вероятно сейчас»: the pad's own key, and why under it, printed on the body. */
function LikelyKey({ person, roster, lit, why, onPick }: { person: Person; roster: Person[]; lit: boolean; why: string; onPick: () => void }) {
  const label = useMemo(() => keyLabels(roster.filter((p) => p.is_active && p.role !== "tv")).get(person.id) ?? person.full_name, [roster, person.id, person.full_name]);
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1">
      <Key
        on={lit}
        className={personKeyClass}
        aria-label={lit ? `${person.full_name} — на стене, продлить` : `Показать: ${person.full_name} (${why})`}
        title={person.position ?? undefined}
        onClick={onPick}
        data-testid="remote-likely-key"
      >
        <Avatar initials={initialsOf(person.full_name)} />
        <PersonName>{label}</PersonName>
      </Key>
      <span className="truncate text-center text-[11px] leading-[14px] text-muted">{why}</span>
    </div>
  );
}

/** A screensaver key of the one row: the icon on the key, the name printed under it, the dot — on the wall now. */
function SceneKey({
  label,
  icon,
  on,
  live,
  testId,
  pressed,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  on: boolean;
  live: boolean;
  testId: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <Key on={on} icon={icon} aria-label={label} aria-pressed={pressed} className="!min-h-[50px]" data-testid={testId} onClick={onClick} />
      {/* the longest name («Календарь») runs a few pixels past its key, into the gap — never under a neighbour's */}
      <span className="whitespace-nowrap text-center text-[10.5px] font-semibold leading-[14px] tracking-[-0.03em]" style={{ color: on ? "var(--accent)" : "var(--text-muted)" }}>
        {label}
      </span>
      <Dot on={live} />
    </div>
  );
}

const icon = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ConnectIcon = () => (
  <svg {...icon}>
    <rect x="2.5" y="3.5" width="15" height="10" rx="1.6" />
    <path d="M7 16.5h6M10 13.5v3" />
    <path d="M8 8.5h4M10.5 7l1.5 1.5-1.5 1.5" />
  </svg>
);

/** The screensavers back: waves out of a dot. */
const EtherIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
    <path d="M6.5 13.5a5 5 0 0 1 0-7M13.5 6.5a5 5 0 0 1 0 7" />
    <path d="M4 16a8.5 8.5 0 0 1 0-12M16 4a8.5 8.5 0 0 1 0 12" />
  </svg>
);

const RefreshIcon = () => (
  <svg {...icon}>
    <path d="M16.4 8.4A6.6 6.6 0 1 0 16 12.4" />
    <path d="M16.8 4.2v4.4h-4.4" />
  </svg>
);

const SunIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M4.8 15.2l1.3-1.3M13.9 6.1l1.3-1.3" />
  </svg>
);

const GuestIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 16.6c0-3 2.8-4.8 6.2-4.8s6.2 1.8 6.2 4.8" />
  </svg>
);

const HandsIcon = () => (
  <svg {...icon}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 5.6V10l3 2" />
  </svg>
);

const DigitsIcon = () => (
  <svg {...icon}>
    <rect x="2.6" y="5" width="14.8" height="10" rx="2.2" />
    <path d="M6.4 8v4M9 8.2h1.8v1.8H9v2h1.8M13 8v4" />
  </svg>
);

/** The wall's look: a screen with a slider under it. */
const LookIcon = () => (
  <svg {...icon}>
    <rect x="2.6" y="3.4" width="14.8" height="9.6" rx="1.8" />
    <path d="M4 16.6h12" />
    <circle cx="8" cy="16.6" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const ChevronIcon = () => (
  <svg {...icon} width={18} height={18}>
    <path d="M5.5 8l4.5 4.5L14.5 8" />
  </svg>
);

/** «Смотреть»: the display opens the live wall. */
const EyeIcon = () => (
  <svg {...icon} width={14} height={14} strokeWidth={1.9}>
    <path d="M1.8 10S4.8 4.6 10 4.6 18.2 10 18.2 10 15.2 15.4 10 15.4 1.8 10 1.8 10Z" />
    <circle cx="10" cy="10" r="2.4" />
  </svg>
);

const BoardIcon = () => (
  <svg {...icon}>
    <rect x="2.8" y="3.4" width="14.4" height="13.2" rx="2.2" />
    <path d="M6 7.6h.01M8.8 7.6h5.2M6 10.6h.01M8.8 10.6h5.2M6 13.6h.01M8.8 13.6h3.4" strokeWidth="1.8" />
  </svg>
);

/** A podium: the rating scene and its periods (D-123). */
const PodiumIcon = () => (
  <svg {...icon}>
    <path d="M7.2 16.6V8.6h5.6v8" />
    <path d="M2.8 16.6v-5h4.4M12.8 16.6v-3.6h4.4v3.6M2.4 16.6h15.2" />
    <path d="M10 3.4l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" strokeWidth="1.3" />
  </svg>
);

/** Two arrows chasing each other: the scenes change by themselves (D-123). */
const RoundIcon = () => (
  <svg {...icon}>
    <path d="M15.6 8.2a6 6 0 0 0-10.8-1.6" />
    <path d="M4.4 3.8v3.2h3.2" />
    <path d="M4.4 11.8a6 6 0 0 0 10.8 1.6" />
    <path d="M15.6 16.2V13h-3.2" />
  </svg>
);

const SCENE_ICON: Record<TvScene, ReactNode> = {
  board: <BoardIcon />,
  rating: <PodiumIcon />,
  face: (
    <svg {...icon}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.2 8.2h.01M12.8 8.2h.01" strokeWidth="2.2" />
      <path d="M7 12a3.6 3.6 0 0 0 6 0" />
    </svg>
  ),
  clock: (
    <svg {...icon}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.6" />
    </svg>
  ),
  team: (
    <svg {...icon}>
      <circle cx="7.2" cy="7.5" r="2.6" />
      <circle cx="13.6" cy="8.2" r="2.1" />
      <path d="M2.6 16c0-2.6 2.1-4.2 4.6-4.2s4.6 1.6 4.6 4.2" />
      <path d="M12.6 15.6h4.8c0-2.2-1.6-3.6-3.8-3.6" />
    </svg>
  ),
  calendar: (
    <svg {...icon}>
      <rect x="3" y="4.4" width="14" height="12.4" rx="2.2" />
      <path d="M3 8.2h14M7 2.8v3M13 2.8v3" />
      <path d="M6.6 11.4h.01M10 11.4h.01M13.4 11.4h.01M6.6 14h.01M10 14h.01" strokeWidth="2" />
    </svg>
  ),
};
