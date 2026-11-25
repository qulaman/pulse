"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { StillLogo } from "@/components/ui/StillLogo";
import type { TvBoard as TvBoardData } from "@/lib/tv/board";
import { monthEmptyAhead } from "@/lib/tv/calendar";
import { tvDate, tvTime } from "@/lib/tv/clock";
import type { TvMoment as TvMomentData } from "@/lib/tv/moment";
import type { OverlayView } from "@/lib/tv/overlay";
import type { TvPhoto } from "@/lib/tv/photos";
import type { TvCalendar as TvCalendarData, TvFocusEmployee, TvRatingScene, TvSummary, TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";
import { burnInShift, type CalendarView, type ClockStyle, type TvScene } from "@/lib/tv/state";
import type { TickerItem } from "@/lib/tv/ticker";
import type { TvSpeech } from "@/lib/tv/voice";

import "./tv-type.css";

import { TvAnalogClock } from "./TvAnalogClock";
import { TvBoard } from "./TvBoard";
import { TvBranchFull } from "./TvBranchFull";
import { TvCalendar } from "./TvCalendar";
import { TvClock } from "./TvClock";
import { TvFocus } from "./TvFocus";
import { TvLeaders } from "./TvLeaders";
import { TvMoment } from "./TvMoment";
import { TvOverlay } from "./TvOverlay";
import { TvPhotos } from "./TvPhotos";
import { TvSketchFull } from "./TvSketchFull";
import { TvTaskFocus } from "./TvTaskFocus";
import { TvTeam } from "./TvTeam";
import { TvTicker } from "./TvTicker";
import { TvToday } from "./TvToday";
import { TvWelcome } from "./TvWelcome";

/** The band's date in two short lines: the weekday over the day and month (Asia/Aqtobe). */
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "long" });
const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", day: "numeric", month: "long" });
const tvWeekdayWord = (now: Date) => WEEKDAY.format(now);
const tvDayMonth = (now: Date) => DAY_MONTH.format(now);

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
  /** Photos of finished tasks (D-185): the round's «Фото». */
  photos?: TvPhoto[];
  /** The reports of the person on the wall; without it — theirs among `photos` (the sandbox). */
  personPhotos?: TvPhoto[];
  /** Photos of the one order on the wall (D-185). */
  taskPhotos?: TvPhoto[];
  /** Praise, an award or an announcement that takes the wall for a moment (D-185). */
  moment?: TvMomentData | null;
  /** The wall goes round by itself (D-123): an empty turn — a calendar with nothing in it — gives way to home. */
  inRound?: boolean;
};

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5). Раскладка
 * без данных — её рисует и киоск (`TvScreen`), и песочница `/dev/tv` на фикстурах.
 *
 * The composition (D-185) is a TV channel's: the scene takes the whole screen above the bottom band; in the top
 * right corner, the channel mark — the client company's logo and name; along the bottom, full width, a band
 * with the news line, the date and the clock. Margins and the type scale are in `tv-type.css`: everything in fractions
 * of the height, so the screen sits the same on 720p, 1080p and 4K. Over everything, the «важно сейчас» layer (D-96).
 *
 * A scene changes by one transition of one container — opacity and a lift: the old one leaves, then
 * the new one comes; two scenes are never on screen at once. This transition is smooth on the wall — do not touch it.
 *
 * Вся композиция раз в 10 минут встаёт на несколько пикселей в другое место — против
 * выгорания матрицы; ночью в пустом кабинете стена гаснет до тусклых часов.
 */
export function TvFrame(props: TvFrameProps) {
  const { company, logoUrl, now, guest, clock, night, offline, items, speech, summary, focus, overlay, sound } = props;
  const shift = burnInShift(now);
  // an order means nothing to a guest with its title masked: the welcome stands instead (D-185)
  const task = guest ? null : (props.task ?? null);
  const photos = props.photos ?? [];
  // the scene changes once, when the next one has its data (a calendar without its events would
  // say «Свободный день», a board without its points would show the face in between)
  const stage = useStage(
    { scene: props.scene, calendar: props.calendar, calendarView: props.calendarView, rating: props.rating ?? null, board: props.board ?? null },
    !focus && !task,
  );
  const { scene, calendar } = stage;
  // a board to show: its points; a board hidden from a guest is not shown as «скрыта» — the guest
  // gets the welcome instead (D-102, D-185)
  const board = scene === "board" && stage.board?.board ? stage.board : null;
  // a person, an order, a board or a notice on the wall wakes the night up: somebody is in the office
  const dim = night && !focus && !task && !overlay.banner && !board;
  // a moment interrupts the round and the screensavers — never a person, an order, a board, the night or
  // the quiet clock of a meeting (D-185)
  const moment = !dim && !focus && !task && !board && !guest && scene !== "clock" ? (props.moment ?? null) : null;
  // the round's «Фото» with nothing to show is «Сегодня» — the same key, so no transition between the two
  const showPhotos = scene === "photos" && photos.length > 0;
  // in the round an empty calendar is a turn of nothing: home stands instead — a week with no meetings, a month with
  // none ahead (a calendar put up by hand stays and says «встреч нет»)
  const emptyWeek =
    props.inRound === true &&
    scene === "calendar" &&
    calendar !== null &&
    (stage.calendarView === "week" ? calendar.events.length === 0 : monthEmptyAhead(calendar, now));
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
        : moment
          ? `moment:${moment.id}`
          : scene === "rating"
            ? `rating:${stage.rating?.period ?? "week"}`
            : scene === "calendar"
              ? emptyWeek
                ? homeKey(guest)
                : `calendar:${stage.calendarView}`
              : scene === "board"
                ? // no board yet (loading) or no longer (expired): home is drawn, so the key is home's
                  // too — otherwise home → board replays home's entrance (D-121)
                  board
                  ? `board:${board.board?.id ?? "hidden"}`
                  : homeKey(guest)
                : scene === "photos"
                  ? showPhotos
                    ? "photos"
                    : homeKey(guest)
                  : scene === "face"
                    ? homeKey(guest)
                    : scene;
  // the band fades with the night softly, in place — and on the welcome: a guest reads the company's
  // name and the time on the scene itself, not the team's numbers in the band (D-185)
  const bandOff = dim || sceneKey === "welcome";
  const awake = { opacity: bandOff ? 0 : 1, transition: "opacity var(--t-tv) var(--ease-in-out)" };
  // the clock scene is the clock: the band does not repeat it; the welcome carries the company's name itself,
  // and a meeting's board needs its top row for the presenter's «3 / 7»
  const bandClock = sceneKey !== "clock";
  const channelMark = !dim && sceneKey !== "welcome" && !sceneKey.startsWith("board:");
  const personPhotos = focus ? (props.personPhotos ?? photos.filter((photo) => photo.employee_id === focus.employee.id)) : [];

  return (
    <div className="tv-wall relative h-full w-full overflow-hidden" data-scene={sceneKey} data-clock={clock} data-guest={guest || undefined}>
      {/* the band's surface stays put and runs a little past the band: the burn-in shift moves the words, never the edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[calc(var(--tv-band)+1vh)]"
        style={{ ...awake, background: "var(--tv-band-bg)" }}
      />
      <div
        className="relative flex h-full w-full flex-col"
        style={{ transform: `translate(${shift.x}px, ${shift.y}px)`, transition: "transform 2s var(--ease-in-out)" }}
      >
        <main className="relative min-h-0 flex-1" style={covered ? { contentVisibility: "hidden" } : undefined}>
          <AnimatePresence mode="wait">
            <motion.div
              key={sceneKey}
              // the rise is a share of the wall, the same on 720p and 4K
              initial={{ opacity: 0, y: "2.2vh" }}
              animate={{ opacity: 1, y: "0vh" }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              // transform + opacity и ничего больше — перф-контракт стены (D-45)
              className="absolute inset-0"
            >
              {dim ? (
                <Night now={now} clock={clock} />
              ) : focus ? (
                <TvFocus focus={focus} remainingMs={props.focusRemainingMs} now={now} photos={personPhotos} />
              ) : task ? (
                <TvTaskFocus focus={task} remainingMs={props.focusRemainingMs} now={now} photos={props.taskPhotos ?? []} />
              ) : moment ? (
                <TvMoment moment={moment} />
              ) : scene === "rating" ? (
                <TvLeaders data={stage.rating} now={now} />
              ) : scene === "clock" ? (
                <TvClock company={company} logoUrl={logoUrl} now={now} next={summary?.events[0] ?? null} clock={clock} />
              ) : scene === "team" ? (
                <TvTeam summary={summary ?? EMPTY_SUMMARY} guest={guest} now={now} />
              ) : scene === "calendar" && !emptyWeek ? (
                <TvCalendar calendar={calendar} now={now} view={stage.calendarView} />
              ) : board ? (
                <div className="tv-box items-center">
                  <TvBoard data={board} now={now} />
                </div>
              ) : showPhotos ? (
                <TvPhotos photos={photos} now={now} />
              ) : guest ? (
                <TvWelcome company={company} logoUrl={logoUrl} now={now} next={summary?.events[0] ?? null} />
              ) : (
                <TvToday speech={speech} summary={summary} now={now} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* the channel mark: the client's logo and name, top right on every scene but the welcome (D-185) */}
        <div
          // above a notice too (z-40 over the notice's z-30): the wall stays the company's channel
          className="pointer-events-none absolute right-[var(--tv-x)] top-[var(--tv-y)] z-40 flex h-[6vh] items-center gap-[1.6vh]"
          style={{
            opacity: channelMark || overlay.banner ? 1 : 0,
            // a moment fills the wall with gold or green: the mark goes dark on it
            ["--tv-text" as string]: sceneKey.startsWith("moment:") && !overlay.banner ? "var(--tv-ink)" : undefined,
            transition: "opacity var(--t-tv) var(--ease-in-out)",
          }}
          aria-hidden
          data-testid="tv-channel"
        >
          {/* one colour, like a channel's bug: the client's gold or red never argues with the wall's own colours */}
          {logoUrl ? <StillLogo src={logoUrl} className="h-[5vh] w-auto object-contain opacity-75 [filter:brightness(0)_invert(1)]" /> : null}
          <span className="tv-small font-semibold" style={{ color: "var(--tv-text)" }}>
            {company}
          </span>
        </div>

        <footer
          className="relative z-10 flex h-[var(--tv-band)] shrink-0 items-center gap-[3vh] px-[var(--tv-x)]"
          style={awake}
          aria-hidden={bandOff || undefined}
          data-testid="tv-band"
        >
          {/* the product's mark as an icon only: the words of the band are the company's news */}
          <svg viewBox="0 0 26 18" aria-hidden className="h-[3.2vh] w-[4.6vh] shrink-0 opacity-60">
            <polyline points="0,10 6,10 9,3 13,15 16,8 19,10 26,10" fill="none" stroke="var(--tv-live)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0 flex-1">
            {/* a guest reads the time, not the team's news (D-33) */}
            {guest ? null : <TvTicker items={items} paused={bandOff} />}
          </div>
          {offline ? (
            <span className="tv-fine shrink-0" style={{ color: "var(--warn)" }}>
              нет связи
            </span>
          ) : null}
          {bandClock ? (
            // the time in a block of its own, a step lighter than the band, like a broadcast's clock
            <div className="-mr-[calc(var(--tv-x)+1vh)] flex h-full shrink-0 items-center gap-[2.4vh] pl-[3vh] pr-[calc(var(--tv-x)+1vh)]" style={{ background: "var(--surface-2)" }}>
              <span className="tv-fine flex flex-col text-right leading-[1.15] text-muted">
                <span className="first-letter:uppercase">{tvWeekdayWord(now)}</span>
                <span>{tvDayMonth(now)}</span>
              </span>
              {clock === "analog" ? (
                <TvAnalogClock now={now} size="8.4vh" seconds={false} detailed={false} />
              ) : (
                <span className="tv-num text-[7vh] font-bold leading-none" style={{ color: "var(--tv-text)" }}>
                  {tvTime(now)}
                </span>
              )}
            </div>
          ) : null}
        </footer>

        {/* a drawing lit on the board takes the whole wall (D-141), a branch lit on the map too (D-144),
            while the board is the scene — a person or an order put up over it stays seen; a visitor's
            notice still stands above them */}
        <TvSketchFull board={board && !focus && !task ? board.board : null} />
        <TvBranchFull board={board && !focus && !task ? board.board : null} />

        <TvOverlay view={overlay} sound={sound} onCovered={() => setCoverShown(true)} />
      </div>
    </div>
  );
}

/** «Сегодня» for the team, the welcome for a guest: one key each, so a guest coming in plays one transition. */
function homeKey(guest: boolean): string {
  return guest ? "welcome" : "face";
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-[2vh] opacity-[0.32]" data-testid="tv-night">
      {clock === "analog" ? (
        <TvAnalogClock now={now} size="44vh" seconds={false} />
      ) : (
        <p className="text-[18vh] font-bold leading-[20vh] tabular-nums">{tvTime(now)}</p>
      )}
      <p className="text-[3.4vh] leading-[4.4vh] text-muted first-letter:uppercase">{tvDate(now)}</p>
    </div>
  );
}
