"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

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
  const { company, logoUrl, now, guest, clock, night, offline, items, speech, summary, focus, overlay, sound } = props;
  const shift = burnInShift(now);
  const task = props.task ?? null;
  // the scene changes once, when the next one has its data (a calendar without its events would
  // say «Свободный день», a board without its points would show the face in between)
  const stage = useStage(
    { scene: props.scene, calendar: props.calendar, calendarView: props.calendarView, rating: props.rating ?? null, board: props.board ?? null },
    !focus && !task,
  );
  const { scene, calendar } = stage;
  // a board to show: its points, or the honest «скрыта» for a guest (D-102)
  const board = scene === "board" && (stage.board?.board || stage.board?.hidden) ? stage.board : null;
  // a person, an order, a board or a notice on the wall wakes the night up: somebody is in the office
  const dim = night && !focus && !task && !overlay.banner && !board;
  // the ticker, the footer and the day curve leave and come back with the night softly, in place
  const awake = { opacity: dim ? 0 : 1, transition: "opacity var(--t-tv) var(--ease-in-out)" };
  // an opaque notice over the wall: the scene under it stays mounted but is not drawn (no mascot
  // frames for the minutes a visitor waits); it is drawn again the moment the notice starts to leave
  const [coverShown, setCoverShown] = useState(false);
  if (coverShown && !overlay.banner) setCoverShown(false);
  const covered = coverShown && overlay.banner !== null;
  // the scene key: changing it plays the transition, everything else updates in place
  const sceneKey = dim
    ? "night"
    : focus
      ? `focus:${focus.employee.id}`
      : task
        ? `task:${task.task.id}`
        : scene === "rating"
          ? `rating:${stage.rating?.period ?? "week"}`
          : scene === "calendar"
        ? `calendar:${stage.calendarView}`
        : scene === "board"
          ? // no board yet (loading) or no longer (expired): the face is drawn, so the key is the
            // face's too — otherwise face → board replays the face's entrance (D-121)
            board
            ? `board:${board.board?.id ?? "hidden"}`
            : "face"
          : scene;

  return (
    <div className="relative h-full w-full overflow-hidden" data-scene={sceneKey} data-clock={clock} data-guest={guest || undefined}>
      <div
        className="relative flex h-full w-full flex-col"
        style={{ transform: `translate(${shift.x}px, ${shift.y}px)`, transition: "transform 2s var(--ease-in-out)" }}
      >
        {/* far layer: the company's day by the hour, at the very bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh]" style={awake} aria-hidden>
          <DayPulse pulse={summary?.pulse ?? []} hour={Number(tvTime(now).slice(0, 2))} />
        </div>

        <header className="shrink-0 pt-[2.4vh]" style={awake} aria-hidden={dim || undefined}>
          {/* the row keeps the ticker's height at night and on a day without news: the middle never moves */}
          <div className="h-[6.2vh]">
            <TvTicker items={items} paused={dim} />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 items-center justify-center" style={covered ? { contentVisibility: "hidden" } : undefined}>
          <AnimatePresence mode="wait">
            <motion.div
              key={sceneKey}
              // the rise is a share of the wall, the same on 720p and 4K
              initial={{ opacity: 0, y: "2.2vh" }}
              animate={{ opacity: 1, y: "0vh" }}
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
                <TvLeaders data={stage.rating} now={now} />
              ) : scene === "clock" ? (
                <TvClock company={company} logoUrl={logoUrl} now={now} next={summary?.events[0] ?? null} clock={clock} />
              ) : scene === "team" ? (
                <TvTeam summary={summary ?? EMPTY_SUMMARY} guest={guest} />
              ) : scene === "calendar" ? (
                <TvCalendar calendar={calendar} now={now} view={stage.calendarView} />
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
          style={awake}
          aria-hidden={dim || undefined}
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

        <TvOverlay view={overlay} sound={sound} onCovered={() => setCoverShown(true)} />
      </div>
    </div>
  );
}

/** How long the wall keeps its scene while the next one's data is on its way: a query that never answers must not pin it. */
const HOLD_MS = 4_000;

/** The middle of the wall and the data it is drawn from — they change together. */
type Stage = {
  scene: TvScene;
  calendar: TvCalendarData | null;
  calendarView: CalendarView;
  rating: TvRatingScene | null;
  board: TvBoardData | null;
};

/**
 * The kiosk fetches a scene's data after `tv_state` names the scene (the queries run only for what is on the wall):
 * until the data is there, the stage on the wall stays as it was, so the wall plays one transition into the whole
 * picture — not into «Свободный день» or an empty grid that fill in a moment later, not through the face (D-121).
 * `open`: nobody's orders cover the middle, the scene is what shows.
 */
function useStage(next: Stage, open: boolean): Stage {
  const waiting =
    open && ((next.scene === "calendar" && !next.calendar) || (next.scene === "rating" && !next.rating) || (next.scene === "board" && !next.board));
  const [held, setHeld] = useState(next);
  if (!waiting && !sameStage(held, next)) setHeld(next);
  const waitingFor = waiting ? `${next.scene}:${next.calendarView}` : null;
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  if (!waiting && gaveUp !== null) setGaveUp(null);
  useEffect(() => {
    if (!waitingFor) return;
    const timer = setTimeout(() => setGaveUp(waitingFor), HOLD_MS);
    return () => clearTimeout(timer);
  }, [waitingFor]);
  return waiting && gaveUp !== waitingFor ? held : next;
}

function sameStage(a: Stage, b: Stage): boolean {
  return a.scene === b.scene && a.calendar === b.calendar && a.calendarView === b.calendarView && a.rating === b.rating && a.board === b.board;
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
