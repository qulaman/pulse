"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { DeskPresenter } from "@/components/desk/screen/DeskPresenter";
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
  type ClockStyle,
} from "@/lib/tv/state";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages } from "@/lib/visits/text";

import { BoardsPick, ConnectDialog, Key, PeoplePick, Section, TaskPick, Visits } from "./ScreenParts";
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

const RECEIPT_TONE = { ok: "ok", warn: "warn", muted: "muted" } as const;

/**
 * «Экран» of the desk (D-153, D-76): the wall in the office as it is — the live `/tv` in a frame —
 * with its receipt and «сейчас на стене» under it, the secretary's visitor and messages, and on
 * the right the phone remote's every action as desktop controls: the scenes and the round, how
 * the clock, the calendar and the rating look, the guest, a person, an order or a board on the
 * wall, the week's board, waking the wall at night, «Вернуть эфир», a restart and the kiosk's
 * sign-in code. No queue: without network a command says so (D-76 §3).
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

  return (
    <DeskPage>
      <PageTitle
        title="Экран"
        state={loading ? null : { text: receipt.text, tone: RECEIPT_TONE[receipt.tone] }}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setConnecting(true)} data-testid="desk-screen-connect">
            Подключить экран
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-5">
        {/* the wall stays in sight while the panel beside it scrolls */}
        <div className="sticky top-5 flex flex-col gap-3">
          <WallFrame />
          <div className="card px-4 py-3" data-testid="desk-screen-now">
            <p className="eyebrow">Сейчас на стене</p>
            {loading ? (
              <Bone h={22} w="60%" className="mt-1.5" />
            ) : (
              <p className="mt-1 font-display text-[17px] font-semibold leading-6 [overflow-wrap:anywhere]">
                {row?.seen_at
                  ? wallNow(row, people.data ?? [], now, boards.data ?? [], { points, guest, taskTitle, boardPoints: wall.points.map((point) => point.id) })
                  : "Экран ещё не подключался"}
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[18px]" style={{ color: TONE_VAR[RECEIPT_TONE[receipt.tone]] }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[RECEIPT_TONE[receipt.tone]] }} />
              {row?.seen_at ? receipt.text : "Войдите на телевизоре под пользователем роли «ТВ-экран» — «Подключить экран» даст код"}
            </p>
          </div>
          <Visits
            visitors={visitors}
            messages={messages}
            now={now}
            busyId={answer.isPending ? (answer.variables?.id ?? null) : null}
            onAnswer={(visit, value) => answer.mutate({ id: visit.id, answer: value })}
          />
        </div>

        <div className="flex flex-col gap-3" data-testid="desk-screen-panel">
          <Section title="Эфир">
            <div className="grid grid-cols-2 gap-2">
              <Key disabled={mode === "ether"} onClick={() => show({ mode: "ether" }, "Вернул эфир")} testId="desk-screen-ether">
                Вернуть эфир
              </Key>
              <Key onClick={() => show({ reload: true }, "Экран перезапускается")} testId="desk-screen-reload">
                Перезапустить
              </Key>
            </div>
            {/* the night dims the wall to its clock (D-96 §8); a late evening wakes it for two hours (D-105) */}
            {night ? (
              <Key
                on={awake !== null}
                onClick={() => show({ wake: awake === null }, awake === null ? `Экран проснулся до ${tvTime(new Date(Date.now() + WAKE_MS))}` : "Экран снова спит")}
              >
                {awake ? `Не спит до ${tvTime(awake)} · усыпить` : "Ночь · разбудить на два часа"}
              </Key>
            ) : null}
          </Section>

          <Section title="Заставка" testId="desk-screen-scenes">
            <div className="grid grid-cols-3 gap-2">
              {sceneKeys.map((value) => (
                <Key
                  key={value}
                  on={!round && scene === value}
                  testId={`desk-scene-${value}`}
                  onClick={() => {
                    if (round || scene !== value) show({ scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}`);
                  }}
                >
                  {SCENE_LABEL[value]}
                </Key>
              ))}
              <Key
                on={round}
                testId="desk-carousel"
                onClick={() =>
                  show(
                    // off pins the face: a round that a run-out board left (D-144) stops as well
                    round ? { carousel: false, scene: "face" } : { carousel: true },
                    round ? "Заставки больше не меняются" : "Заставки меняются по кругу · раз в 3 мин",
                  )
                }
              >
                По кругу
              </Key>
            </div>
            {round ? (
              <p className="text-[12px] leading-4 text-muted">
                {carouselScenes(roundPoints, week).map((value) => SCENE_LABEL[value].toLowerCase()).join(" → ")} · дальше — {SCENE_LABEL[next.scene].toLowerCase()} в {tvTime(next.at)}
              </p>
            ) : null}
          </Section>

          <Section title="Вид на стене">
            <Row label="Часы">
              <SegmentTabs<ClockStyle>
                aria-label="Часы на стене"
                value={clock}
                onChange={(value) => {
                  if (value !== clock) show({ clock: value }, value === "analog" ? "Часы: стрелки" : "Часы: цифры");
                }}
                items={CLOCK_STYLES.map((value) => ({ value, label: CLOCK_LABEL[value] }))}
              />
            </Row>
            {/* one click puts the calendar up in that view — the key is also the way to the scene */}
            <Row label="Календарь">
              <div className="grid grid-cols-2 gap-2">
                {CALENDAR_VIEWS.map((value) => (
                  <Key
                    key={value}
                    on={scene === "calendar" && calendarView === value}
                    onClick={() => {
                      if (scene === "calendar" && calendarView === value) return;
                      show({ scene: "calendar", calendar: value }, value === "month" ? "На стене — месяц" : "На стене — сегодня и неделя");
                    }}
                  >
                    {CALENDAR_LABEL[value]}
                  </Key>
                ))}
              </div>
            </Row>
            {/* outside the round a click puts the rating up in that period; inside it only the period changes (D-123) */}
            {points ? (
              <Row label="Рейтинг">
                <div className="grid grid-cols-2 gap-2">
                  {RATING_VIEWS.map((value) => (
                    <Key
                      key={value}
                      on={ratingView === value && (round || scene === "rating")}
                      onClick={() => {
                        if (round) {
                          if (ratingView !== value) show({ rating: value }, value === "month" ? "В круге — рейтинг месяца" : "В круге — рейтинг недели");
                          return;
                        }
                        if (scene === "rating" && ratingView === value) return;
                        show({ scene: "rating", rating: value }, value === "month" ? "На стене — рейтинг месяца" : "На стене — рейтинг недели");
                      }}
                    >
                      {RATING_LABEL[value]}
                    </Key>
                  ))}
                </div>
              </Row>
            ) : null}
            <Row label="Гость в кабинете">
              <Key on={guest} onClick={() => show({ guest: !guest }, guest ? "Гость ушёл: имена снова видны" : "Гость в кабинете: имена скрыты")} testId="desk-screen-guest">
                {guest ? (guestEnds ? `Имена скрыты до ${tvTime(guestEnds)}` : "Имена скрыты") : "Выключен"}
              </Key>
            </Row>
          </Section>

          <Section title="Доска на стене" testId="desk-screen-board-section">
            {wall.boardId ? (
              <div className="rounded-[10px] border border-accent/40 bg-accent/[0.06] px-3 py-2.5" data-testid="desk-screen-cartridge">
                <p className="truncate text-[14px] font-semibold leading-5">{wall.board ? wall.board.title : wall.loading ? "" : "Доска другого директора"}</p>
                <p className="nums text-[12px] leading-4 text-muted">
                  {wall.board?.deleted_at ? "в корзине — на стене её уже нет" : until ? cartridgeLine(wall.counts.get(wall.boardId), until) : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mine ? (
                    <Link href={`/desk/notes/b/${wall.boardId}`} className="inline-flex min-h-[36px] items-center rounded-[12px] px-3 text-[13px] font-semibold text-accent hover:bg-accent/10">
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => show(afterBoard(row, new Date()), () => ejectReceipt(queryClient, me.data, wall.board, notes.data ?? [], openBoard))}
                  >
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
                {/* ◀ ✓ ▶ of the meeting on the wall — the phone's presenter in desk controls (D-121) */}
                {mine && wall.board ? <DeskPresenter boardId={wall.board.id} points={wall.points} now={now} /> : null}
              </div>
            ) : null}
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
          </Section>

          <Section title="Кого показать">
            <PeoplePick
              people={people.data ?? []}
              activeId={personId}
              minutes={minutes}
              onPick={(person) =>
                show({ mode: "employee", employeeId: person.id }, person.id === personId ? "Ещё 10 минут" : `На стене — ${person.full_name.split(/\s+/)[0]} · 10 мин`)
              }
            />
          </Section>

          <Section title="Дело на стене">
            <TaskPick
              tasks={sent.data ?? []}
              activeId={taskId}
              minutes={minutes}
              onPick={(task) => show({ mode: "task", taskId: task.id }, task.id === taskId ? "Ещё 10 минут" : `На стене — «${task.title.trim()}» · 10 мин`)}
            />
          </Section>
        </div>
      </div>

      <ConnectDialog open={connecting} onClose={() => setConnecting(false)} screens={screens} />
    </DeskPage>
  );
}

/** A setting of the wall: its name on the left, its control on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[13px] leading-[18px] text-muted">{label}</span>
      {children}
    </div>
  );
}
