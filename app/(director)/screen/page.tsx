"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { BoardPresenter, usePresenterBusy } from "@/components/mindboard/BoardPresenter";
import { BoardSeam } from "@/components/screen/BoardSeam";
import { ScreenPageSkeleton } from "@/components/screen/RemoteSkeleton";
import { useWallBoard } from "@/components/screen/useWallBoard";
import { PageHead } from "@/components/ui/PageHead";
import { Body, Dot, Gauge, Key, Lcd, LcdDim, Lens, Seam, Switch, type LedTone } from "@/components/ui/device/Device";
import { PersonPad } from "@/components/ui/device/PersonPad";
import { toast } from "@/components/ui/Toast";
import { ANSWERS } from "@/components/visits/VisitAsk";
import { useBoards } from "@/lib/mindboard/queries";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useMe } from "@/lib/tasks/queries";
import { tvTime } from "@/lib/tv/clock";
import { useTvControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { CALENDAR_LABEL, CLOCK_LABEL, RATING_LABEL, SCENE_LABEL, wallNow, wallReceipt } from "@/lib/tv/remote";
import {
  awakeUntil,
  CALENDAR_VIEWS,
  calendarViewOf,
  carouselNext,
  carouselOn,
  carouselScenes,
  CLOCK_STYLES,
  clockStyleOf,
  effectiveMode,
  FOCUS_MS,
  focusRemainingMs,
  guestEndsAt,
  guestOf,
  isNight,
  RATING_VIEWS,
  ratingViewOf,
  sceneOf,
  TV_SCENES,
  WAKE_MS,
  type CalendarView,
  type ClockStyle,
  type RatingView,
  type TvScene,
} from "@/lib/tv/state";
import { useAnswerVisit } from "@/lib/visits/mutations";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector, unreadMessages, waitedSince } from "@/lib/visits/text";

/**
 * «Экран в кабинете» — пульт от телевизора в кармане директора (D-76 §10, D-96).
 *
 * Жест, ради которого он существует: сотрудник зашёл в кабинет — директор нажал
 * его имя — на стене его дела (CONCEPT §9, демо-сцена продажи). Поэтому люди — клавиши
 * на самом пульте и работают в один тап, без листа подтверждения.
 *
 * Сам пульт собран как устройство: линза с диодом-квитанцией, дисплей «что на стене»,
 * резиновые клавиши и ползунок. Директор не видит телевизор из кабинета и обязан узнать
 * от пульта, дошла команда или экран висит со вчера (принцип 8 для ТВ): диод мигает,
 * пока команда летит, горит зелёным, когда стена показала, жёлтым — когда экран молчит.
 * Оффлайн-очереди у пульта нет: без сети клавиша честно говорит «нет связи» (D-76 §3).
 *
 * С D-96: четыре заставки (плюс «Календарь»), переключатель часов «Цифры / Стрелки»,
 * «Гость в кабинете» вместо «Посетителя» (посетитель теперь — событие от секретаря) и
 * ответ посетителю прямо с пульта, когда он ждёт.
 *
 * С D-102: шов «Доска на стене» — три последние доски директора клавишами; при госте в
 * кабинете — ползунок «Показать гостю».
 *
 * С D-121: доска на стене — картридж в шве (открыть, убрать, «Все доски» шторкой), а сразу
 * под дисплеем — ведущий: ◀ ✓ ▶ по пунктам, «Снять подсветку», «Список / Карта».
 *
 * С D-105: ночью, с 21:00 до 08:00, под дисплеем ползунок «Разбудить экран» — стена
 * возвращается из тусклых часов в эфир на два часа; тот же ползунок усыпляет её сразу.
 *
 * С D-123: заставка «Рейтинг» (только при включённых очках) и шов «Рейтинг на стене» с
 * «Неделя / Месяц»; клавиша «По кругу» — стена сама меняет лицо, рейтинг, календарь и
 * команду раз в три минуты, любая заставка руками круг останавливает; одно дело во весь
 * экран ставится с экрана задачи, а дисплей пульта называет его.
 */

const SCENE_HINT: Record<TvScene, string> = {
  face: "Лицо говорит о последних событиях",
  clock: "Тихие часы: для совещаний",
  team: "Кто чем занят",
  calendar: "Неделя вперёд: что запланировано",
  board: "Пункты директора — до 21:00",
  rating: "Пятёрка лучших, рост и награды",
};

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

const RECEIPT_COLOR = { ok: "var(--ok)", warn: "var(--warn)", muted: "var(--text-muted)" } as const;

/** «ещё N мин» должно таять само: раз в 10 секунд достаточно, минута не опоздает. */
function useTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function ScreenPage() {
  const now = useTick();
  const state = useTvState();
  const people = usePeople();
  const control = useTvControl();
  const visits = useVisits();
  const answer = useAnswerVisit();
  const me = useMe();
  const boards = useBoards(me.data?.userId);
  const pointsEnabled = usePointsEnabled();
  const taskTitle = useTaskTitle(state.data?.mode === "task" ? (state.data.task_id ?? null) : null);
  const wall = useWallBoard(state.data ?? null, now);
  const presenting = usePresenterBusy();

  if (state.isLoading || people.isLoading) return <ScreenPageSkeleton />;

  const row = state.data ?? null;
  const mode = effectiveMode(row, now);
  // the rating needs points (D-48): the key and the round follow the company switch (D-123)
  const points = pointsEnabled.data ?? true;
  const guest = guestOf(row, false, now);
  const scene = sceneOf(row, now, points, guest);
  const round = carouselOn(row);
  // a guest takes the rating out of the round (D-33): the remote counts the same round as the wall
  const roundPoints = points && !guest;
  const next = carouselNext(now, roundPoints);
  const ratingView = ratingViewOf(row);
  const sceneKeys = TV_SCENES.filter((value) => value !== "rating" || pointsEnabled.data === true);
  const clock = clockStyleOf(row);
  const calendarView = calendarViewOf(row);
  const guestEnds = guestEndsAt(row, now);
  const night = isNight(now);
  const awake = awakeUntil(row, now);
  const receipt = wallReceipt(row, now);
  const remainingMs = focusRemainingMs(row, now);
  const onScreenId = mode === "employee" ? row?.employee_id ?? null : null;
  const visitor = awaitingDirector(visits.data ?? [])[0] ?? null;
  // the secretary's words on the wall (D-116): the newest one, as the wall shows it
  const messages = unreadMessages(visits.data ?? []);
  const message = messages[messages.length - 1] ?? null;
  // экран ни разу не поднимался: сначала объясняем, как его завести, потом команды
  const neverSeen = !row?.seen_at;
  // диод мигает, пока команда в пути: от нажатия до того, как киоск отметил её показанной
  const inFlight = control.isPending || presenting || (receipt.tone === "muted" && !neverSeen);
  const led: LedTone = inFlight ? "accent" : neverSeen ? "off" : receipt.tone;

  const show = (input: Parameters<typeof control.mutate>[0], message: string) => {
    control.mutate(input, { onSuccess: () => toast(message) });
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      {/* the wall's receipt lights the screen (D-117): green on the wall, amber when it does not answer;
          the words are the LCD's */}
      <PageHead title="Экран в кабинете" tone={receipt.tone === "muted" ? undefined : receipt.tone} />

      <Body className="mx-auto mt-4 w-full max-w-[380px]">
        <Lens tone={led} blink={inFlight} />

        <Lcd className="mt-3">
          <div className="flex items-center justify-between gap-3">
            <LcdDim className="font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]">
              {neverSeen ? "Экран" : "Сейчас на стене"}
            </LcdDim>
            <LcdDim className="nums text-[12px] leading-4">{tvTime(now)}</LcdDim>
          </div>
          {neverSeen ? (
            <>
              <p className="mt-2 font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">Ещё не подключался</p>
              <LcdDim className="mt-1 block text-[13px] leading-[18px]">
                Войди на телевизоре под пользователем роли «ТВ-экран» — и он появится здесь
              </LcdDim>
            </>
          ) : (
            <>
              <p className="mt-2 line-clamp-2 font-display text-[21px] font-bold leading-7 tracking-[-0.02em] [overflow-wrap:anywhere]">
                {wallNow(row, people.data ?? [], now, boards.data ?? [], {
                  points,
                  guest,
                  taskTitle: taskTitle.data,
                  boardPoints: wall.points.map((point) => point.id),
                })}
              </p>
              <p className="mt-1 text-[13px] leading-[18px]" style={{ color: RECEIPT_COLOR[receipt.tone] }}>
                {receipt.text}
              </p>
              {visitor?.status === "waiting" ? (
                <p className="mt-1 text-[13px] leading-[18px]" style={{ color: "var(--accent)" }}>
                  Поверх всего — «К вам посетитель»
                </p>
              ) : message ? (
                <p className="mt-1 text-[13px] leading-[18px]" style={{ color: "var(--accent)" }}>
                  Поверх всего — сообщение секретаря
                </p>
              ) : null}
              {mode !== "ether" ? (
                <div className="mt-3">
                  <Gauge ratio={remainingMs / FOCUS_MS} />
                </div>
              ) : null}
            </>
          )}
        </Lcd>

        {/* the visitor at the secretary's desk: the answer from the remote too (D-96) */}
        {visitor ? (
          <div className="mt-3 rounded-[14px] p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }} data-testid="remote-visitor">
            <p className="text-[13px] leading-4 text-muted">
              {visitor.status === "waiting" ? "К вам посетитель" : "Посетитель ждёт"} · {waitedSince(visitor.created_at, now)}
            </p>
            <p className="mt-0.5 truncate font-display text-[17px] font-semibold leading-[22px]">
              {visitor.note?.trim() || "Без имени"}
            </p>
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
        ) : null}

        {/* the secretary's message on the wall: «Понятно» from the remote takes it down (D-116) */}
        {message ? (
          <div className="mt-3 rounded-[14px] p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }} data-testid="remote-message">
            <p className="text-[13px] leading-4 text-muted">
              Сообщение · {waitedSince(message.created_at, now)}
              {messages.length > 1 ? ` · ещё ${messages.length - 1}` : ""}
            </p>
            <p className="mt-0.5 line-clamp-2 font-display text-[17px] font-semibold leading-[22px] [overflow-wrap:anywhere]">
              {message.note?.trim()}
            </p>
            <div className="mt-2 grid">
              <Key
                on
                disabled={answer.isPending && answer.variables?.id === message.id}
                onClick={() => answer.mutate({ id: message.id, answer: "read" })}
              >
                <span className="text-[13px] leading-4">Понятно</span>
              </Key>
            </div>
          </div>
        ) : null}

        {/* the presenter (D-121): right under the display while the director's board is on the wall —
            a meeting is run from here without scrolling the remote */}
        {wall.board && !wall.board.deleted_at ? (
          <BoardPresenter variant="remote" boardId={wall.board.id} points={wall.points} now={now} />
        ) : null}

        {/* the night dims the wall to its clock (D-96 §8); the director working late wakes it
            for two hours, and the same switch puts it back to sleep (D-105) */}
        {night ? (
          <div className="mt-3">
            <Switch
              on={awake !== null}
              icon={<SunIcon />}
              title={awake ? "Экран не спит" : "Разбудить экран"}
              value={awake ? `до ${tvTime(awake)}, потом снова ночь` : "ночь: тусклые часы до 08:00"}
              onToggle={(next) =>
                show(
                  { wake: next },
                  next ? `Экран проснулся до ${tvTime(new Date(Date.now() + WAKE_MS))}` : "Экран снова спит",
                )
              }
            />
          </div>
        ) : null}

        <div className="mt-3 flex items-stretch gap-2">
          <Key
            icon={<EtherIcon />}
            disabled={mode === "ether"}
            onClick={() => show({ mode: "ether" }, "Вернул эфир")}
          >
            Вернуть эфир
          </Key>
          <Key
            round
            icon={<RefreshIcon />}
            aria-label="Перезапустить экран"
            onClick={() => show({ reload: true }, "Экран перезапускается")}
          />
        </div>

        {/* the scenes three across, the round last; the lit dot under the one on the wall. While
            the round turns, no scene key is lit — a tap on one pins it and stops the round (D-123) */}
        <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2" data-testid="remote-scenes">
          {sceneKeys.map((value) => (
            <div key={value} className="flex flex-col items-stretch gap-1.5">
              <Key
                tall
                on={!round && scene === value}
                icon={SCENE_ICON[value]}
                data-testid={`remote-scene-${value}`}
                onClick={() => {
                  if (round || scene !== value) show({ scene: value }, `Заставка: ${SCENE_LABEL[value].toLowerCase()}`);
                }}
              >
                {SCENE_LABEL[value]}
              </Key>
              <span className="flex justify-center">
                <Dot on={scene === value} />
              </span>
            </div>
          ))}
          <div className="flex flex-col items-stretch gap-1.5">
            <Key
              tall
              on={round}
              icon={<RoundIcon />}
              aria-pressed={round}
              data-testid="remote-carousel"
              onClick={() =>
                show(
                  { carousel: !round },
                  round ? "Заставки больше не меняются" : "Заставки меняются по кругу · раз в 3 мин",
                )
              }
            >
              По кругу
            </Key>
            <span className="flex justify-center">
              <Dot on={round} />
            </span>
          </div>
        </div>
        <p className="mt-1 px-1 text-center text-[13px] leading-[18px] text-muted">
          {round
            ? `${carouselScenes(roundPoints).map((value) => SCENE_LABEL[value].toLowerCase()).join(" → ")} · дальше — ${SCENE_LABEL[next.scene].toLowerCase()} в ${tvTime(next.at)}`
            : SCENE_HINT[scene]}
        </p>

        {/* the rating on the wall (D-123): the week or the month. Outside the round a tap puts the
            rating up in that period; inside it only the period changes and the round goes on */}
        {pointsEnabled.data === true ? (
          <>
            <Seam label="Рейтинг на стене" />
            <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Рейтинг на стене">
              {RATING_VIEWS.map((value: RatingView) => {
                const lit = ratingView === value && (round || scene === "rating");
                return (
                  <Key
                    key={value}
                    on={lit}
                    role="radio"
                    aria-checked={lit}
                    icon={value === "month" ? <MonthIcon /> : <WeekIcon />}
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
                );
              })}
            </div>
          </>
        ) : null}

        {/* the calendar on the wall: today with the week, or the month (D-98). One tap puts the
            calendar up in that view — the key is also the way to the scene */}
        <Seam label="Календарь на стене" />
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Календарь на стене">
          {CALENDAR_VIEWS.map((value: CalendarView) => (
            <Key
              key={value}
              on={scene === "calendar" && calendarView === value}
              role="radio"
              aria-checked={scene === "calendar" && calendarView === value}
              icon={value === "month" ? <MonthIcon /> : <WeekIcon />}
              onClick={() => {
                if (scene === "calendar" && calendarView === value) return;
                show({ scene: "calendar", calendar: value }, value === "month" ? "На стене — месяц" : "На стене — сегодня и неделя");
              }}
            >
              {CALENDAR_LABEL[value]}
            </Key>
          ))}
        </div>

        {/* the director's boards (D-102, D-121): the one on the wall as a cartridge, the others on a shelf */}
        <BoardSeam wall={wall} row={row} now={now} guest={guest} show={show} />

        {/* the clock on the wall: digits or hands, everywhere it is drawn (D-96) */}
        <Seam label="Часы на стене" />
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

        <div className="mt-3">
          <Switch
            on={guest}
            icon={<GuestIcon />}
            title="Гость в кабинете"
            value={
              guest
                ? guestEnds
                  ? `имена скрыты до ${tvTime(guestEnds)}`
                  : "без фамилий, очков и названий"
                : "выключен"
            }
            onToggle={(next) => show({ guest: next }, next ? "Гость в кабинете: имена скрыты" : "Гость ушёл: имена снова видны")}
          />
        </div>
        <Seam label="Кого показать" />
        <div className="mt-2">
          <PersonPad
            people={people.data ?? []}
            activeId={onScreenId}
            groupLabel="Кого показать"
            ariaFor={(person, active) =>
              active ? `${person.full_name} — на стене, продлить` : `Показать: ${person.full_name}`
            }
            onPick={(person) =>
              show(
                { mode: "employee", employeeId: person.id },
                person.id === onScreenId
                  ? "Ещё 10 минут"
                  : `На стене — ${person.full_name.split(/\s+/)[0]} · 10 мин`,
              )
            }
          />
        </div>
      </Body>
    </main>
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

const WeekIcon = () => (
  <svg {...icon}>
    <rect x="2.8" y="4.2" width="14.4" height="12.2" rx="2.2" />
    <path d="M2.8 8.2h14.4" />
    <path d="M5.8 12.2h8.4" strokeWidth="2.4" />
  </svg>
);

const MonthIcon = () => (
  <svg {...icon}>
    <rect x="2.8" y="4.2" width="14.4" height="12.2" rx="2.2" />
    <path d="M2.8 8.2h14.4" />
    <path d="M6 11.2h.01M10 11.2h.01M14 11.2h.01M6 14h.01M10 14h.01M14 14h.01" strokeWidth="2.2" />
  </svg>
);

const DigitsIcon = () => (
  <svg {...icon}>
    <rect x="2.6" y="5" width="14.8" height="10" rx="2.2" />
    <path d="M6.4 8v4M9 8.2h1.8v1.8H9v2h1.8M13 8v4" />
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

const SCENE_ICON: Record<TvScene, React.ReactNode> = {
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
