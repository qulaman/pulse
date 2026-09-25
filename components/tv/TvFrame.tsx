"use client";

import { AnimatePresence, motion } from "framer-motion";

import { PulseMark } from "@/components/brand/PulseMark";
import type { TvBoard as TvBoardData } from "@/lib/tv/board";
import { tvDate, tvTime } from "@/lib/tv/clock";
import type { OverlayView } from "@/lib/tv/overlay";
import type { TvCalendar as TvCalendarData, TvFocusEmployee, TvRatingScene, TvSummary, TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";
import { burnInShift, type CalendarView, type ClockStyle, type TvScene } from "@/lib/tv/state";
import type { TickerItem } from "@/lib/tv/ticker";
import type { TvSpeech } from "@/lib/tv/voice";

import { DayPulse } from "./DayPulse";
import { TvBoard } from "./TvBoard";
import { TvAnalogClock } from "./TvAnalogClock";
import { TvCalendar } from "./TvCalendar";
import { TvClock } from "./TvClock";
import { TvFocus } from "./TvFocus";
import { TvLeaders } from "./TvLeaders";
import { TvMascot } from "./TvMascot";
import { TvOverlay } from "./TvOverlay";
import { TvTaskFocus } from "./TvTaskFocus";
import { TvTeam } from "./TvTeam";
import { TvTicker } from "./TvTicker";

/** Сцена «команда» до первой сводки: пустые плитки лучше пустого экрана. */
export const EMPTY_SUMMARY: TvSummary = {
  guest: false,
  points_enabled: false,
  now: new Date(0).toISOString(),
  pulse: [] as number[],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 0, done: 0, in_work: 0 },
  rating: [],
  load: [],
  week: [],
  merch: [],
  events: [],
};

export type TvFrameProps = {
  company: string;
  logoUrl: string | null;
  now: Date;
  guest: boolean;
  scene: TvScene;
  clock: ClockStyle;
  /**
   * 21:00–08:00 and the remote has not woken the wall (D-105): the screen dims to its clock
   * unless a person, a board or a notice is on it (D-96).
   */
  night: boolean;
  offline: boolean;
  items: TickerItem[];
  speech: TvSpeech;
  summary: TvSummary | null;
  focus: TvFocusEmployee | null;
  /** Одно дело во весь экран (D-123). */
  task?: TvTaskFocusData | null;
  focusRemainingMs: number;
  /** Заставка «Рейтинг» (D-123): пятёрка, рост, награды — или «скрыт», пока гость в кабинете. */
  rating?: TvRatingScene | null;
  calendar: TvCalendarData | null;
  /** «Сегодня» с неделей или месяц сеткой (D-98). */
  calendarView: CalendarView;
  /** Доска на стене (D-102): пункты, или «скрыта — гость», или ничего. */
  board?: TvBoardData | null;
  overlay: OverlayView;
  /** The kiosk rings for a visitor; the sandbox and a laptop preview keep quiet. */
  sound: boolean;
};

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5). Раскладка
 * без данных — её рисует и киоск (`TvScreen`), и песочница `/dev/tv` на фикстурах.
 *
 * Композиция владельца (2026-09-17): бегущая строка сверху, сцена посреди экрана и
 * подпись внизу без единой рамки: марка, название компании и часы. Ниже подписи —
 * дальний слой: кривая настоящего дня компании по часам. Поверх всего — слой «важно
 * сейчас» (D-96): посетитель и мероприятие, которое вот-вот начнётся.
 *
 * Вся композиция раз в 10 минут встаёт на несколько пикселей в другое место — против
 * выгорания матрицы; ночью в пустом кабинете стена гаснет до тусклых часов.
 *
 * Размеры в `vh`: экран одинаково садится и на 1080p, и на 4K, и на телевизор 55".
 */
export function TvFrame(props: TvFrameProps) {
  const { company, logoUrl, now, guest, scene, clock, night, offline, items, speech, summary, focus, calendar, overlay, sound } =
    props;
  const shift = burnInShift(now);
  // a board to show: its points, or the honest «скрыта» for a guest (D-102)
  const board = scene === "board" && (props.board?.board || props.board?.hidden) ? props.board : null;
  const task = props.task ?? null;
  // a person, an order, a board or a notice on the wall wakes the night up: somebody is in the office
  const dim = night && !focus && !task && !overlay.banner && !board;
  // the scene key: changing it plays the transition, everything else updates in place
  const sceneKey = dim
    ? "night"
    : focus
      ? `focus:${focus.employee.id}`
      : task
        ? `task:${task.task.id}`
        : scene === "rating"
          ? `rating:${props.rating?.period ?? "week"}`
          : scene === "calendar"
        ? `calendar:${props.calendarView}`
        : scene === "board"
          ? `board:${board?.board?.id ?? (board?.hidden ? "hidden" : "none")}`
          : scene;

  return (
    <div className="relative h-full w-full overflow-hidden" data-scene={sceneKey} data-clock={clock} data-guest={guest || undefined}>
      <div
        className="relative flex h-full w-full flex-col"
        style={{ transform: `translate(${shift.x}px, ${shift.y}px)`, transition: "transform 2s var(--ease-in-out)" }}
      >
        {/* far layer: the company's day by the hour, at the very bottom */}
        {!dim ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh]">
            <DayPulse pulse={summary?.pulse ?? []} hour={Number(tvTime(now).slice(0, 2))} />
          </div>
        ) : null}

        <header className="shrink-0 pt-[2.4vh]" style={{ visibility: dim ? "hidden" : undefined }}>
          <TvTicker items={dim ? [] : items} />
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={sceneKey}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              // transform + opacity и ничего больше — перф-контракт стены (D-45)
              className="flex w-full items-center justify-center px-[4vh] motion-reduce:transform-none"
            >
              {dim ? (
                <Night now={now} clock={clock} />
              ) : focus ? (
                <TvFocus focus={focus} remainingMs={props.focusRemainingMs} now={now} />
              ) : task ? (
                <TvTaskFocus focus={task} remainingMs={props.focusRemainingMs} now={now} />
              ) : scene === "rating" ? (
                <TvLeaders data={props.rating ?? null} now={now} />
              ) : scene === "clock" ? (
                <TvClock company={company} logoUrl={logoUrl} now={now} next={summary?.events[0] ?? null} clock={clock} />
              ) : scene === "team" ? (
                <TvTeam summary={summary ?? EMPTY_SUMMARY} guest={guest} />
              ) : scene === "calendar" ? (
                <TvCalendar calendar={calendar} now={now} view={props.calendarView} />
              ) : board ? (
                <TvBoard data={board} now={now} />
              ) : (
                <TvMascot speech={speech} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer
          className="relative z-10 flex shrink-0 items-center justify-between gap-[3vh] px-[4vh] pb-[3.4vh]"
          style={{ visibility: dim ? "hidden" : undefined }}
        >
          <div className="flex items-baseline gap-[2vh]">
            <PulseMark size="tv" />
            <span className="text-[3vh] leading-[3.8vh] text-muted">{company}</span>
            {guest ? <span className="text-[2.2vh] leading-[2.8vh] text-muted">· гость в кабинете</span> : null}
            {focus ? <span className="text-[2.2vh] leading-[2.8vh] text-muted">· на экране: {focus.employee.name}</span> : null}
            {task?.employee ? <span className="text-[2.2vh] leading-[2.8vh] text-muted">· дело: {task.employee.name}</span> : null}
          </div>

          <div className="flex items-center gap-[2.4vh]">
            {offline ? <span className="text-[2.2vh] leading-[2.8vh]" style={{ color: "var(--warn)" }}>нет связи</span> : null}
            <span className="text-[2.6vh] leading-[3.4vh] text-muted first-letter:uppercase">{tvDate(now)}</span>
            {clock === "analog" ? (
              <TvAnalogClock now={now} size="9vh" seconds={false} detailed={false} />
            ) : (
              <span className="text-[7vh] font-bold leading-[7.4vh] tabular-nums">{tvTime(now)}</span>
            )}
          </div>
        </footer>

        <TvOverlay view={overlay} sound={sound} />
      </div>
    </div>
  );
}

/**
 * Ночь стены (D-96): только часы, тускло. Экран не гаснет совсем — чёрный телевизор
 * читается как сломанный, — но и не светит в пустой кабинет лентой и лицом.
 */
function Night({ now, clock }: { now: Date; clock: ClockStyle }) {
  return (
    <div className="flex flex-col items-center gap-[2vh] opacity-[0.32]" data-testid="tv-night">
      {clock === "analog" ? (
        <TvAnalogClock now={now} size="44vh" seconds={false} />
      ) : (
        <p className="text-[18vh] font-bold leading-[20vh] tabular-nums">{tvTime(now)}</p>
      )}
      <p className="text-[3.4vh] leading-[4.4vh] text-muted first-letter:uppercase">{tvDate(now)}</p>
    </div>
  );
}
