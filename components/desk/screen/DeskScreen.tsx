"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Cast, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskPresenter } from "@/components/desk/screen/DeskPresenter";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { ejectReceipt } from "@/components/mindboard/carry";
import { EXTEND_MINUTES } from "@/components/mindboard/WallSheet";
import { markSent, useRemoteClock } from "@/components/screen/sent";
import { useWallBoard } from "@/components/screen/useWallBoard";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { splitBoards } from "@/lib/mindboard/list";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useBoards } from "@/lib/mindboard/queries";
import { useNotes } from "@/lib/notes/queries";
import { usePeople } from "@/lib/people/queries";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { tvTime } from "@/lib/tv/clock";
import { useTvBoardControl, useTvControl, useTvWeekBoard, type TvControlInput } from "@/lib/tv/mutations";
import { cartridgeLine } from "@/lib/tv/presenter";
import { programWindowOf, segmentEndsAt } from "@/lib/tv/program";
import { tvKeys, useTvState, useTvSummary, type TvState } from "@/lib/tv/queries";
import {
  CALENDAR_LABEL,
  CLOCK_LABEL,
  overlayLine,
  RATING_LABEL,
  SCALE_LABEL,
  SCENE_LABEL,
  uncover,
  WALL_SCALES,
  wallHealth,
  wallNow,
  wallReceipt,
  wallScaleOf,
  type WallScale,
} from "@/lib/tv/remote";
import {
  afterBoard,
  awakeUntil,
  boardExtendTo,
  CALENDAR_VIEWS,
  calendarViewOf,
  CLOCK_STYLES,
  clockStyleOf,
  effectiveMode,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  isTvScene,
  programOn,
  RATING_VIEWS,
  ratingViewOf,
  TV_SCENES,
  WAKE_MS,
  wallSceneOf,
  weekBoardLive,
  type CalendarView,
  type ClockStyle,
  type RatingView,
  type TvScene,
} from "@/lib/tv/state";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { SceneCards, type SceneKey } from "./SceneCards";
import { BoardsPick, ConnectDialog, PeoplePick, Section, SettingRow, Switch, TaskPick, Visits } from "./ScreenParts";
import { WallFrame } from "./WallFrame";

/** Nothing of a row is lit: the thing is not on the wall right now. */
const NONE = "none";

type Pick = "people" | "task" | "board";

/**
 * «Экран» of the desk (D-153, D-154, D-76): the wall in the office as it is — the live `/tv` in a
 * bezel with the receipt on its chin, two thirds of the screen — and under it what is on the wall
 * now with the row of scenes and «По кругу», the board's presenter while a board is up, the
 * secretary's visitor and messages. On the right: how the clock, the calendar and the rating
 * look and the guest, then «Показать на стене» — a person, an order or a board. The service keys
 * («Перезапустить», «Подключить экран») sit by the title. The keyboard is a remote too (wave 3):
 * 1–6 — the scenes and «По кругу», E — the ether back, Ctrl+F — the search of «Показать», and
 * while a board is up ←/→ (or a presentation clicker's PageUp/PageDown) lead the meeting. No
 * queue: without network a command says so (D-76 §3).
 *
 * D-182, the same as the phone's remote: the receipt warns when a command is not on the wall in
 * fifteen seconds and offers «Перезапустить» on the frame's chin; «Сейчас на стене» says why and
 * till when — the day's program («Программа: утро · дальше по кругу в 10:00»), a scene picked by
 * hand («Вручную до 17:00, потом программа»), what lies over everything; «Крупность» sits with the
 * look of the wall. `frozenNow` — the sandbox's stopped clock.
 */
export function DeskScreen({ frozenNow }: { frozenNow?: string } = {}) {
  const { now, sent: lastSent } = useRemoteClock(frozenNow);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pointsEnabled: points } = useDeskScope();
  const me = useMe();
  const state = useTvState();
  // the program's window and today's announcement (D-182) — the wall's own summary
  const summary = useTvSummary(false);
  const people = usePeople();
  const control = useTvControl();
  const boardControl = useTvBoardControl();
  const weekBoard = useTvWeekBoard();
  const visits = useVisits();
  const answer = useAnswerVisit();
  const boards = useBoards(me.data?.userId);
  const notes = useNotes(me.data?.userId);
  const sent = useSentTasks(me.data?.userId);
  const wall = useWallBoard(state.data ?? null, now);
  const [connecting, setConnecting] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);

  const row = state.data ?? null;
  const w = programWindowOf(summary.data);
  const announcement = Boolean((summary.data as { announcement?: unknown } | undefined)?.announcement);
  const mode = effectiveMode(row, now);
  const guest = guestOf(row, false, now);
  // what the office sees (D-182): the program's scene, or one picked by hand while its part of the day lasts
  const visible = wallSceneOf(row, now, { points, guest, announcement }, w);
  const program = programOn(row, now, w);
  const pinned: TvScene | null = !program && visible !== "board" && isTvScene(visible) ? visible : null;
  const scene: TvScene = pinned ?? (isTvScene(visible) ? visible : "face");
  const scale = wallScaleOf(row);
  const sceneKeys = TV_SCENES.filter((value) => value !== "rating" || points);
  const clock = clockStyleOf(row);
  const calendarView = calendarViewOf(row);
  const ratingView = ratingViewOf(row);
  const guestEnds = guestEndsAt(row, now);
  const night = isNight(now, w);
  const awake = awakeUntil(row, now);
  const receipt = wallReceipt(row, now, lastSent);
  const health = wallHealth(row, now);
  const minutes = Math.max(1, Math.ceil(focusRemainingMs(row, now) / 60_000));
  const personId = mode === "employee" ? (row?.employee_id ?? null) : null;
  const taskId = mode === "task" ? (row?.task_id ?? null) : null;
  const taskTitle = taskId ? (sent.data?.find((task) => task.id === taskId)?.title ?? null) : null;
  const visitors = awaitingDirector(visits.data ?? []);
  const messages = unreadMessages(visits.data ?? []);
  const over = overlayLine(visitors[0] ?? null, messages[messages.length - 1] ?? null, now);
  const screens = (people.data ?? []).filter((person) => person.role === "tv" && person.is_active);
  const liveBoards = splitBoards(boards.data ?? [], now, wall.boardId).live;
  const weekId = row && weekBoardLive(row, now) ? row.week_board_id : null;
  const mine = wall.board !== null && wall.board.deleted_at === null;
  const until = row?.board_until ? new Date(row.board_until) : null;
  // a person or an order over the screensaver: a scene, a view or a board picked here takes them
  // down in the same command (`uncover`, D-76) — the wall moves at once
  const covered = mode !== "ether";
  const takeDown = uncover(row, now);

  /** A command to the wall; `then` — the words of its toast, or what to do instead. The version that came back has fifteen seconds to show (D-182). */
  const show = (input: TvControlInput, then: string | ((row: TvState) => void)) => {
    control.mutate(input, {
      onSuccess: (next) => {
        markSent(next?.version);
        if (typeof then === "string") toast(then);
        else then(next);
      },
    });
  };
  // a scene picked by hand holds till the end of its part of the day (D-182); an older database — with no end
  const holdsTill = (row as (TvState & { scene_set_at?: string | null }) | null)?.scene_set_at === undefined ? null : segmentEndsAt(now, w);
  const tillWords = holdsTill ? ` · до ${tvTime(holdsTill)}` : "";
  const display = wallNow(row, people.data ?? [], now, boards.data ?? [], {
    points,
    guest,
    taskTitle,
    boardPoints: wall.points.map((point) => point.id),
    window: w,
    announcement,
  });
  const openBoard = (id: string) => router.push(`/desk/boards/${id}`);

  const loading = state.isLoading || people.isLoading;
  const connected = Boolean(row?.seen_at);
  // the list of «Показать на стене» opens on what is up there now
  const shownPick: Pick = pick ?? (taskId ? "task" : wall.boardId ? "board" : "people");

  const sceneValue: SceneKey = program || !pinned ? "round" : pinned;
  const pickScene = (value: SceneKey) => {
    if (value === "round") {
      if (!program || covered) show({ ...takeDown, carousel: true }, "Заставки по кругу — программа дня");
      return;
    }
    if (program || pinned !== value || covered) show({ ...takeDown, scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}${tillWords}`);
  };
  // the row of scenes in its order: what the digits pick
  const sceneOrder: SceneKey[] = [...sceneKeys, "round"];

  // the remote's keys, by the physical key: a digit — a scene (the wall changes at once, as a click
  // on the segment does), E — the ether back, Ctrl+F — the search of «Показать на стене»
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  useEffect(() => {
    keys.current = (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyF") {
        const field = document.querySelector<HTMLInputElement>("[data-testid=desk-screen-pick] input[type=search]");
        if (!field) return false;
        field.focus();
        field.select();
        return true;
      }
      if (!isPlainKey(event) || event.shiftKey || isTypingTarget(event.target) || loading) return false;
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit) {
        const value = sceneOrder[Number(digit[1]) - 1];
        if (!value) return false;
        pickScene(value);
        return true;
      }
      if (event.code === "KeyE" && mode !== "ether") {
        show({ mode: "ether" }, "Вернул эфир");
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open")) return;
      if (keys.current(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts("Экран", [
    { keys: sceneOrder.length > 1 ? ["1", "…", String(sceneOrder.length)] : ["1"], label: `Заставка: ${sceneOrder.map((value) => (value === "round" ? "по кругу" : SCENE_LABEL[value].toLowerCase())).join(", ")}` },
    { keys: ["E"], label: "Вернуть эфир" },
    { keys: ["Ctrl F"], label: "Найти, что показать на стене" },
  ]);

  return (
    <DeskPage>
      <PageTitle
        title="Экран"
        actions={
          <>
            <Tooltip label="Стена загрузится заново — если зависла или не обновилась" side="bottom">
              <Button size="sm" variant="ghost" icon={<RotateCw aria-hidden size={14} strokeWidth={2.1} />} onClick={() => show({ reload: true }, "Экран перезапускается")} data-testid="desk-screen-reload">
                Перезапустить
              </Button>
            </Tooltip>
            <Button size="sm" variant="secondary" icon={<Cast aria-hidden size={15} strokeWidth={2} />} onClick={() => setConnecting(true)} data-testid="desk-screen-connect">
              Подключить экран
            </Button>
          </>
        }
      />

      <div className="screen-layout grid grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] items-start gap-8">
        <div className="screen-main flex min-w-0 flex-col gap-5">
          <WallFrame
            receipt={loading ? null : receipt}
            health={loading ? null : health}
            onRestart={() => show({ reload: true }, "Экран перезапускается")}
            label={screens.length === 1 ? screens[0].full_name : screens.length > 1 ? `${screens.length} экрана` : null}
          />

          <Visits
            visitors={visitors}
            messages={messages}
            now={now}
            busyId={answer.isPending ? (answer.variables?.id ?? null) : null}
            onAnswer={(visit, value) => answer.mutate({ id: visit.id, answer: value })}
          />

          <section className="screen-now flex flex-col" data-testid="desk-screen-now" data-tone={loading ? "muted" : receipt.tone} data-mode={mode}>
            <SectionLabel className="screen-now-label mb-0.5">
              <span aria-hidden className="screen-now-dot" />
              Сейчас на стене
            </SectionLabel>
            <div className="screen-now-body flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-text pb-2.5 pt-2">
              <div className="min-w-0 flex-1">
                {loading ? (
                  <Bone h={28} w="55%" />
                ) : (
                  <p className="desk-figure text-[26px] leading-8 [overflow-wrap:anywhere]" data-testid="desk-screen-now-line">
                    {connected ? display.title : "Экран ещё не подключался"}
                  </p>
                )}
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted" data-testid="desk-screen-why">
                  {!connected && !loading
                    ? "Подключите телевизор: «Подключить экран» — код с его экрана или код для входа"
                    : loading
                      ? ""
                      : mode !== "ether"
                        ? `${display.why} · клик по заставке — сразу`
                        : display.why}
                </p>
                {over && connected ? (
                  <p className="mt-0.5 text-[13px] leading-[18px] text-accent" data-testid="desk-screen-over">
                    Поверх всего: {over.charAt(0).toLowerCase()}
                    {over.slice(1)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {/* the night dims the wall to its clock (D-96 §8); a late evening wakes it for two hours (D-105) */}
                {night ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={awake ? "" : "desk-move"}
                    onClick={() => show({ wake: awake === null }, awake === null ? `Экран проснулся до ${tvTime(new Date(Date.now() + WAKE_MS))}` : "Экран снова спит")}
                    data-testid="desk-screen-wake"
                  >
                    {awake ? `Не спит до ${tvTime(awake)} · усыпить` : "Разбудить на два часа"}
                  </Button>
                ) : null}
                {mode !== "ether" ? (
                  <Tooltip label="Вернуть эфир" keys={["E"]} side="bottom">
                    <Button size="sm" variant="secondary" onClick={() => show({ mode: "ether" }, "Вернул эфир")} data-testid="desk-screen-ether">
                      Вернуть эфир
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            </div>
            <div className="screen-now-scenes border-t border-border/60 pt-3" data-testid="desk-screen-scenes">
              <SceneCards
                value={sceneValue}
                // what the office sees this minute: the screensaver, unless a person, an order or a board is up instead
                live={connected && mode === "ether" && isTvScene(visible) && visible !== "board" ? visible : null}
                onPick={pickScene}
                items={sceneOrder.map((value, index) => ({ value, label: value === "round" ? "По кругу" : SCENE_LABEL[value], hint: String(index + 1) }))}
              />
            </div>
          </section>

          {wall.boardId ? (
            <section className="screen-cartridge flex flex-col" data-testid="desk-screen-cartridge">
              <SectionLabel className="mb-0.5">Доска на стене</SectionLabel>
              <div className="screen-cartridge-body flex flex-wrap items-center justify-between gap-3 border-t border-text py-2">
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold leading-6">{wall.board ? wall.board.title : wall.loading ? "" : "Доска другого директора"}</p>
                  <p className="nums text-[13px] leading-[18px] text-muted">
                    {wall.board?.deleted_at ? "в корзине — на стене её уже нет" : until ? cartridgeLine(wall.counts.get(wall.boardId), until) : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mine ? (
                    <Link href={`/desk/boards/${wall.boardId}`} className="screen-link inline-flex min-h-[36px] items-center px-3 text-[13px] font-medium text-text hover:underline">
                      Открыть
                    </Link>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!mine || boardControl.isPending}
                    onClick={() =>
                      boardControl.mutate(
                        // from the row as the cache holds it this instant: clicks in a row add up, a repeat does not
                        { until: boardExtendTo(queryClient.getQueryData<TvState | null>(tvKeys.state) ?? row, EXTEND_MINUTES, new Date()).toISOString() },
                        { onSuccess: (next) => toast(next.board_until ? `Доска на стене до ${tvTime(new Date(next.board_until))}` : "Продлил") },
                      )
                    }
                  >
                    +{EXTEND_MINUTES} мин
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => show(afterBoard(row, new Date()), () => ejectReceipt(queryClient, me.data, wall.board, notes.data ?? [], openBoard))}>
                    Убрать
                  </Button>
                  {guest ? (
                    <Button
                      size="sm"
                      variant={row?.board_guest ? "secondary" : "ghost"}
                      aria-pressed={row?.board_guest ?? false}
                      onClick={() => show({ boardGuest: !row?.board_guest }, row?.board_guest ? "Доска скрыта от гостя" : "Доска видна гостю")}
                    >
                      Показать гостю
                    </Button>
                  ) : null}
                </div>
              </div>
              {/* ◀ ✓ ▶ of the meeting on the wall — the phone's presenter in desk controls (D-121) */}
              {mine && wall.board ? <DeskPresenter boardId={wall.board.id} points={wall.points} now={now} /> : null}
            </section>
          ) : null}
        </div>

        <div className="screen-panel flex min-w-0 flex-col gap-6" data-testid="desk-screen-panel">
          <Section title="Вид на стене" testId="desk-screen-look">
            <SettingRow label="Часы">
              <SegmentTabs<ClockStyle>
                aria-label="Часы на стене"
                value={clock}
                onChange={(value) => {
                  if (value !== clock) show({ clock: value }, value === "analog" ? "Часы: стрелки" : "Часы: цифры");
                }}
                items={CLOCK_STYLES.map((value) => ({ value, label: CLOCK_LABEL[value] }))}
              />
            </SettingRow>
            {/* lit while the calendar is up in that view; a click puts it up — the segment is also the way to the scene */}
            <SettingRow label="Календарь" hint={scene === "calendar" && !covered ? "на стене" : "клик — на стену"}>
              <SegmentTabs<CalendarView | typeof NONE>
                aria-label="Календарь на стене"
                value={scene === "calendar" ? calendarView : NONE}
                onChange={(value) => {
                  if (value === NONE || (scene === "calendar" && calendarView === value && !covered)) return;
                  show({ ...takeDown, scene: "calendar", calendar: value }, value === "month" ? "На стене — месяц" : "На стене — сегодня и неделя");
                }}
                items={CALENDAR_VIEWS.map((value) => ({ value, label: CALENDAR_LABEL[value] }))}
              />
            </SettingRow>
            {/* outside the round a click puts the rating up in that period; inside it only the period changes (D-123) */}
            {points ? (
              <SettingRow label="Рейтинг" hint={program ? "период в круге" : scene === "rating" && !covered ? "на стене" : "клик — на стену"}>
                <SegmentTabs<RatingView | typeof NONE>
                  aria-label="Рейтинг на стене"
                  value={program || scene === "rating" ? ratingView : NONE}
                  onChange={(value) => {
                    if (value === NONE) return;
                    if (program) {
                      if (ratingView !== value) show({ rating: value }, value === "month" ? "В круге — рейтинг месяца" : "В круге — рейтинг недели");
                      return;
                    }
                    if (scene === "rating" && ratingView === value && !covered) return;
                    show({ ...takeDown, scene: "rating", rating: value }, value === "month" ? "На стене — рейтинг месяца" : "На стене — рейтинг недели");
                  }}
                  items={RATING_VIEWS.map((value) => ({ value, label: RATING_LABEL[value] }))}
                />
              </SettingRow>
            ) : null}
            {/* «Крупность» (D-182): how far the room reads the wall from */}
            <SettingRow label="Крупность">
              <SegmentTabs<`${WallScale}`>
                aria-label="Крупность стены"
                value={`${scale}`}
                onChange={(value) => {
                  const next = Number(value) as WallScale;
                  if (next !== scale) show({ scale: next }, `Крупность: ${SCALE_LABEL[next].toLowerCase()}`);
                }}
                items={WALL_SCALES.map((value) => ({ value: `${value}` as `${WallScale}`, label: SCALE_LABEL[value] }))}
              />
            </SettingRow>
            <SettingRow label="Гость в кабинете" hint={guest ? (guestEnds ? `Имена скрыты до ${tvTime(guestEnds)}` : "Имена скрыты") : "Имена на стене видны"}>
              <Switch on={guest} label="Гость в кабинете" testId="desk-screen-guest" onToggle={() => show({ guest: !guest }, guest ? "Гость ушёл: имена снова видны" : "Гость в кабинете: имена скрыты")} />
            </SettingRow>
          </Section>

          <Section title="Показать на стене" testId="desk-screen-show">
            <div className="flex flex-col gap-0.5 py-1">
              <SegmentTabs<Pick>
                aria-label="Что показать"
                value={shownPick}
                onChange={setPick}
                items={[
                  { value: "people", label: "Человека" },
                  { value: "task", label: "Дело" },
                  { value: "board", label: "Доску" },
                ]}
              />
              <p className="pt-1 text-[12px] leading-4 text-muted">
                {shownPick === "people"
                  ? "Его дела — на 10 минут, второй клик — ещё 10"
                  : shownPick === "task"
                    ? "Одна задача во весь экран — на 10 минут"
                    : "До вечера; «Неделя» — в круг заставок до воскресенья"}
              </p>
            </div>
            <div className="desk-fields [&_label]:!w-full" data-testid="desk-screen-pick">
              {shownPick === "people" ? (
                <PeoplePick
                  people={people.data ?? []}
                  activeId={personId}
                  minutes={minutes}
                  onPick={(person) =>
                    show({ mode: "employee", employeeId: person.id }, person.id === personId ? "Ещё 10 минут" : `На стене — ${person.full_name.split(/\s+/)[0]} · 10 мин`)
                  }
                />
              ) : shownPick === "task" ? (
                <TaskPick
                  tasks={sent.data ?? []}
                  activeId={taskId}
                  minutes={minutes}
                  onPick={(task) => show({ mode: "task", taskId: task.id }, task.id === taskId ? "Ещё 10 минут" : `На стене — «${task.title.trim()}» · 10 мин`)}
                />
              ) : (
                <BoardsPick
                  boards={liveBoards}
                  counts={wall.counts}
                  wallId={wall.boardId}
                  weekId={weekId}
                  weekBusy={weekBoard.isPending}
                  onPut={(board) => show({ ...takeDown, board: board.id }, `На стене — «${board.title}»`)}
                  onWeek={(board, on) =>
                    weekBoard.mutate(on ? board.id : null, {
                      onSuccess: () => toast(on ? "Доска недели — в круге заставок до воскресенья, 21:00" : "Доска ушла из круга заставок"),
                    })
                  }
                />
              )}
            </div>
          </Section>
        </div>
      </div>

      <ConnectDialog open={connecting} onClose={() => setConnecting(false)} screens={screens} />
    </DeskPage>
  );
}

