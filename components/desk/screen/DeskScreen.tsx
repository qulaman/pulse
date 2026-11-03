"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskPresenter } from "@/components/desk/screen/DeskPresenter";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import type { Tone } from "@/components/desk/ui/tone";
import { ejectReceipt } from "@/components/mindboard/carry";
import { EXTEND_MINUTES } from "@/components/mindboard/WallSheet";
import { useWallBoard } from "@/components/screen/useWallBoard";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { splitBoards } from "@/lib/mindboard/list";
import { useBoards } from "@/lib/mindboard/queries";
import { useNotes } from "@/lib/notes/queries";
import { usePeople } from "@/lib/people/queries";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { tvTime } from "@/lib/tv/clock";
import { useTvBoardControl, useTvControl, useTvWeekBoard, type TvControlInput } from "@/lib/tv/mutations";
import { cartridgeLine } from "@/lib/tv/presenter";
import { tvKeys, useTvState, type TvState } from "@/lib/tv/queries";
import { CALENDAR_LABEL, CLOCK_LABEL, RATING_LABEL, SCENE_LABEL, wallNow, wallReceipt } from "@/lib/tv/remote";
import {
  afterBoard,
  awakeUntil,
  boardExtendTo,
  CALENDAR_VIEWS,
  calendarViewOf,
  carouselNext,
  carouselScenes,
  CLOCK_STYLES,
  clockStyleOf,
  effectiveMode,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  RATING_VIEWS,
  ratingViewOf,
  roundOn,
  sceneOf,
  TV_SCENES,
  WAKE_MS,
  weekBoardLive,
  weekInRound,
  type CalendarView,
  type ClockStyle,
  type RatingView,
  type TvScene,
} from "@/lib/tv/state";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { BoardsPick, ConnectDialog, PeoplePick, Section, SettingRow, Switch, TaskPick, Visits } from "./ScreenParts";
import { WallFrame } from "./WallFrame";

/** «ещё N мин» melts by itself: every ten seconds is enough, the minute is never late. */
function useTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The light of the screen is the wall's receipt: green while it answers, amber once it has gone silent. */
const RECEIPT_LIGHT: Record<"ok" | "warn" | "muted", Tone | null> = { ok: "ok", warn: "warn", muted: null };

/** «По кругу» stands in the row of scenes as the sixth way the wall can look. */
type SceneKey = TvScene | "round";
/** Nothing of a row is lit: the thing is not on the wall right now. */
const NONE = "none";

type Pick = "people" | "task" | "board";

/**
 * «Экран» of the desk (D-153, D-154, D-76): the wall in the office as it is — the live `/tv` in a
 * bezel with the receipt on its chin, two thirds of the screen — and under it what is on the wall
 * now with the row of scenes and «По кругу», the board's presenter while a board is up, the
 * secretary's visitor and messages. On the right: how the clock, the calendar and the rating
 * look and the guest, then «Показать на стене» — a person, an order or a board. The service keys
 * («Перезапустить», «Подключить экран») sit by the title. No queue: without network a command
 * says so (D-76 §3).
 */
export function DeskScreen() {
  const now = useTick();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pointsEnabled: points } = useDeskScope();
  const me = useMe();
  const state = useTvState();
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
  const mode = effectiveMode(row, now);
  const guest = guestOf(row, false, now);
  const scene = sceneOf(row, now, points, guest);
  const round = roundOn(row, now);
  // a guest takes the rating out of the round (D-33): the panel counts the same round as the wall
  const roundPoints = points && !guest;
  const week = weekInRound(row, now, guest);
  const next = carouselNext(now, roundPoints, week);
  const sceneKeys = TV_SCENES.filter((value) => value !== "rating" || points);
  const clock = clockStyleOf(row);
  const calendarView = calendarViewOf(row);
  const ratingView = ratingViewOf(row);
  const guestEnds = guestEndsAt(row, now);
  const night = isNight(now);
  const awake = awakeUntil(row, now);
  const receipt = wallReceipt(row, now);
  const minutes = Math.max(1, Math.ceil(focusRemainingMs(row, now) / 60_000));
  const personId = mode === "employee" ? (row?.employee_id ?? null) : null;
  const taskId = mode === "task" ? (row?.task_id ?? null) : null;
  const taskTitle = taskId ? (sent.data?.find((task) => task.id === taskId)?.title ?? null) : null;
  const visitors = awaitingDirector(visits.data ?? []);
  const messages = unreadMessages(visits.data ?? []);
  const screens = (people.data ?? []).filter((person) => person.role === "tv" && person.is_active);
  const liveBoards = splitBoards(boards.data ?? [], now, wall.boardId).live;
  const weekId = row && weekBoardLive(row, now) ? row.week_board_id : null;
  const mine = wall.board !== null && wall.board.deleted_at === null;
  const until = row?.board_until ? new Date(row.board_until) : null;

  /** A command to the wall; `then` — the words of its toast, or what to do instead. */
  const show = (input: TvControlInput, then: string | ((row: TvState) => void)) => {
    control.mutate(input, { onSuccess: (next) => (typeof then === "string" ? toast(then) : then(next)) });
  };
  const openBoard = (id: string) => router.push(`/desk/notes/b/${id}`);

  const loading = state.isLoading || people.isLoading;
  const connected = Boolean(row?.seen_at);
  // the list of «Показать на стене» opens on what is up there now
  const shownPick: Pick = pick ?? (taskId ? "task" : wall.boardId ? "board" : "people");

  const sceneValue: SceneKey = round ? "round" : scene;
  const pickScene = (value: SceneKey) => {
    if (value === "round") {
      if (!round) show({ carousel: true }, "Заставки меняются по кругу · раз в 3 мин");
      return;
    }
    if (round || scene !== value) show({ scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}`);
  };

  return (
    <DeskPage>
      <PageTitle
        title="Экран"
        light={loading ? null : RECEIPT_LIGHT[receipt.tone]}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => show({ reload: true }, "Экран перезапускается")} data-testid="desk-screen-reload" title="Стена загрузится заново — если завис или не обновился">
              Перезапустить
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConnecting(true)} data-testid="desk-screen-connect">
              Подключить экран
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(340px,1fr)] items-start gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <WallFrame receipt={loading ? null : receipt} label={screens.length === 1 ? screens[0].full_name : screens.length > 1 ? `${screens.length} экрана` : null} />

          <Visits
            visitors={visitors}
            messages={messages}
            now={now}
            busyId={answer.isPending ? (answer.variables?.id ?? null) : null}
            onAnswer={(visit, value) => answer.mutate({ id: visit.id, answer: value })}
          />

          <section className="card flex flex-col gap-3 px-5 pb-4 pt-3.5" data-testid="desk-screen-now">
            <SectionLabel>Сейчас на стене</SectionLabel>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                {loading ? (
                  <Bone h={28} w="55%" />
                ) : (
                  <p className="font-display text-[22px] font-semibold leading-7 tracking-[-0.015em] [overflow-wrap:anywhere]" data-testid="desk-screen-now-line">
                    {connected
                      ? wallNow(row, people.data ?? [], now, boards.data ?? [], { points, guest, taskTitle, boardPoints: wall.points.map((point) => point.id) })
                      : "Экран ещё не подключался"}
                  </p>
                )}
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
                  {!connected && !loading
                    ? "Войдите на телевизоре под пользователем роли «ТВ-экран» — «Подключить экран» даст код"
                    : round
                      ? `${carouselScenes(roundPoints, week).map((value) => SCENE_LABEL[value].toLowerCase()).join(" → ")} · дальше — ${SCENE_LABEL[next.scene].toLowerCase()} в ${tvTime(next.at)}`
                      : mode !== "ether"
                        ? "Потом стена сама вернётся к заставке"
                        : "Заставка не меняется — «По кругу» включит смену"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {/* the night dims the wall to its clock (D-96 §8); a late evening wakes it for two hours (D-105) */}
                {night ? (
                  <Button
                    size="sm"
                    variant={awake ? "secondary" : "primary"}
                    onClick={() => show({ wake: awake === null }, awake === null ? `Экран проснулся до ${tvTime(new Date(Date.now() + WAKE_MS))}` : "Экран снова спит")}
                    data-testid="desk-screen-wake"
                  >
                    {awake ? `Не спит до ${tvTime(awake)} · усыпить` : "Разбудить на два часа"}
                  </Button>
                ) : null}
                {mode !== "ether" ? (
                  <Button size="sm" variant="secondary" onClick={() => show({ mode: "ether" }, "Вернул эфир")} data-testid="desk-screen-ether">
                    Вернуть эфир
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-3" data-testid="desk-screen-scenes">
              <SegmentTabs<SceneKey>
                aria-label="Заставка на стене"
                value={sceneValue}
                onChange={pickScene}
                items={[...sceneKeys.map((value) => ({ value, label: SCENE_LABEL[value] })), { value: "round" as const, label: "По кругу" }]}
              />
            </div>
          </section>

          {wall.boardId ? (
            <section className="card flex flex-col gap-2 px-5 pb-4 pt-3.5" data-testid="desk-screen-cartridge">
              <SectionLabel>Доска на стене</SectionLabel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[17px] font-semibold leading-6">{wall.board ? wall.board.title : wall.loading ? "" : "Доска другого директора"}</p>
                  <p className="nums text-[13px] leading-[18px] text-muted">
                    {wall.board?.deleted_at ? "в корзине — на стене её уже нет" : until ? cartridgeLine(wall.counts.get(wall.boardId), until) : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mine ? (
                    <Link href={`/desk/notes/b/${wall.boardId}`} className="inline-flex min-h-[36px] items-center rounded-[12px] px-3 font-display text-[13px] font-semibold text-accent hover:bg-accent/10">
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
                      variant={row?.board_guest ? "primary" : "ghost"}
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

        <div className="flex min-w-0 flex-col gap-4" data-testid="desk-screen-panel">
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
            <SettingRow label="Календарь" hint={scene === "calendar" ? "на стене" : "клик — на стену"}>
              <SegmentTabs<CalendarView | typeof NONE>
                aria-label="Календарь на стене"
                value={scene === "calendar" ? calendarView : NONE}
                onChange={(value) => {
                  if (value === NONE || (scene === "calendar" && calendarView === value)) return;
                  show({ scene: "calendar", calendar: value }, value === "month" ? "На стене — месяц" : "На стене — сегодня и неделя");
                }}
                items={CALENDAR_VIEWS.map((value) => ({ value, label: CALENDAR_LABEL[value] }))}
              />
            </SettingRow>
            {/* outside the round a click puts the rating up in that period; inside it only the period changes (D-123) */}
            {points ? (
              <SettingRow label="Рейтинг" hint={round ? "период в круге" : scene === "rating" ? "на стене" : "клик — на стену"}>
                <SegmentTabs<RatingView | typeof NONE>
                  aria-label="Рейтинг на стене"
                  value={round || scene === "rating" ? ratingView : NONE}
                  onChange={(value) => {
                    if (value === NONE) return;
                    if (round) {
                      if (ratingView !== value) show({ rating: value }, value === "month" ? "В круге — рейтинг месяца" : "В круге — рейтинг недели");
                      return;
                    }
                    if (scene === "rating" && ratingView === value) return;
                    show({ scene: "rating", rating: value }, value === "month" ? "На стене — рейтинг месяца" : "На стене — рейтинг недели");
                  }}
                  items={RATING_VIEWS.map((value) => ({ value, label: RATING_LABEL[value] }))}
                />
              </SettingRow>
            ) : null}
            <div className="border-t border-border/70 pt-3">
              <SettingRow label="Гость в кабинете" hint={guest ? (guestEnds ? `Имена скрыты до ${tvTime(guestEnds)}` : "Имена скрыты") : "Имена на стене видны"}>
                <Switch on={guest} label="Гость в кабинете" testId="desk-screen-guest" onToggle={() => show({ guest: !guest }, guest ? "Гость ушёл: имена снова видны" : "Гость в кабинете: имена скрыты")} />
              </SettingRow>
            </div>
          </Section>

          <Section title="Показать на стене" testId="desk-screen-show">
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
            <p className="-mt-1 text-[12px] leading-4 text-muted">
              {shownPick === "people"
                ? "Его дела — на 10 минут, второй клик — ещё 10"
                : shownPick === "task"
                  ? "Одна задача во весь экран — на 10 минут"
                  : "До вечера; «Неделя» — в круг заставок до воскресенья"}
            </p>
            <div className="[&_label]:!w-full" data-testid="desk-screen-pick">
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
                  onPut={(board) => show({ board: board.id }, `На стене — «${board.title}»`)}
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
