"use client";

import { Activity, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { StillLogo } from "@/components/ui/StillLogo";
import type { TvBoard as TvBoardData } from "@/lib/tv/board";
import { aqtobeClock, tvDate, tvTime } from "@/lib/tv/clock";
import type { TvEvent } from "@/lib/tv/feed";
import type { OverlayView } from "@/lib/tv/overlay";
import type { WallScene } from "@/lib/tv/program";
import type { TvCalendar as TvCalendarData, TvFocusEmployee, TvRatingScene, TvSummary, TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";
import {
  bandOver,
  boardShown,
  EMPTY_SUMMARY,
  quietScene,
  resolveScene,
  sceneKey,
  sceneReady,
  stageOf,
  type SceneData,
  type StageKind,
} from "@/lib/tv/scenes";
import { burnInShift, nightSpot, type CalendarView, type ClockStyle } from "@/lib/tv/state";
import type { TickerItem } from "@/lib/tv/ticker";
import type { TvSpeech } from "@/lib/tv/voice";

import { DayPulse } from "./DayPulse";
import { TvAnalogClock } from "./TvAnalogClock";
import { TvAnnouncement } from "./TvAnnouncement";
import { TvBoard } from "./TvBoard";
import { TvBranchFull } from "./TvBranchFull";
import { TvCalendar } from "./TvCalendar";
import { TvCelebrate } from "./TvCelebrate";
import { CLOCK_INK, TvClock } from "./TvClock";
import { TvDayResult } from "./TvDayResult";
import { TvFocus } from "./TvFocus";
import { TvLeaders } from "./TvLeaders";
import { TvMascot } from "./TvMascot";
import { TvOverlay } from "./TvOverlay";
import { TvSketchFull } from "./TvSketchFull";
import { TvTaskFocus } from "./TvTaskFocus";
import { TvTeam } from "./TvTeam";
import { TvTicker } from "./TvTicker";
import { TvWeekResult } from "./TvWeekResult";
import { TvWelcome } from "./TvWelcome";
import "./tv-type.css";

export type TvFrameProps = {
  company: string;
  logoUrl: string | null;
  now: Date;
  guest: boolean;
  /** What the middle shows when nobody's orders cover it: a screensaver, the board or the program's own (D-182). */
  scene: WallScene;
  /**
   * The program's next scene when it turns within seconds (D-182): it is drawn ahead, hidden, and at the
   * turn only its visibility changes — no render on the frame of the change.
   */
  next?: WallScene | null;
  clock: ClockStyle;
  /**
   * The night of the program's window and the remote has not woken the wall (D-105): the screen dims to its
   * clock unless a person, a board or a notice is on it (D-96).
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
  /** «Крупность» from the remote (D-182): 100, 115 or 130 — every text of the wall grows by it. */
  scale?: number;
  /** The wall's feed: the plaques of recognition come from it (D-182). */
  events?: readonly TvEvent[];
  /** The sandbox shows each celebration afresh; the kiosk remembers what it has shown. */
  remember?: boolean;
  /** A plaque or a moment is up — the kiosk does not reload its build under it. */
  onCelebrate?: (busy: boolean) => void;
};

/**
 * Экран 16:9 в кабинете: только наблюдение, ноль интеракций (CONCEPT §3.5). Раскладка
 * без данных — её рисует и киоск (`TvScreen`), и песочница `/dev/tv` на фикстурах.
 *
 * Композиция: бегущая строка сверху, сцена посреди экрана и подпись внизу без рамок — логотип
 * и название компании, скромный знак Pulse, дата и часы. Ниже подписи — дальний слой: кривая
 * настоящего дня компании. Поверх — праздники (D-182) и слой «важно сейчас» (D-96).
 *
 * Что посреди — реестр сцен (`lib/tv/scenes.ts`): ночь, человек, дело, сцена; что рисовать —
 * `DRAW` ниже. Смена сцены — без пустого кадра (D-182): уходящая гаснет быстро поверх входящей,
 * входящая встаёт по порядку чтения; следующую сцену программы стена рисует заранее, скрытой в
 * `<Activity>`, и на границе меняется только видимость. Только transform и opacity (D-45).
 *
 * Вся композиция раз в 10 минут встаёт на несколько пикселей в другое место — против выгорания;
 * ночью стена гаснет до тусклых часов, и те раз в 10 минут переезжают. Размеры в `vh`, текст — на
 * шкале `tv-type.css`, умноженной на «Крупность».
 */
export function TvFrame(props: TvFrameProps) {
  const { company, logoUrl, now, guest, clock, night, offline, items, speech, summary, focus, overlay, sound } = props;
  const shift = burnInShift(now);
  const task = props.task ?? null;
  const data: SceneData = {
    calendar: props.calendar,
    calendarView: props.calendarView,
    rating: props.rating ?? null,
    board: props.board ?? null,
    summary,
  };
  const open = !focus && !task;
  // the scene changes once, when the next one has its data (a calendar without its events would
  // say «Свободный день», a board without its points would show the face in between)
  const stage = useStage({ scene: resolveScene(props.scene, data), ...data }, open);
  const board = boardShown(stage.scene, stage.board);
  // a person, an order, a board or a notice on the wall wakes the night up: somebody is in the office
  const dim = night && open && !overlay.banner && !board;
  const pick = stageOf({ night: dim, focus, task, scene: stage.scene }, stage);
  // the program's next scene, drawn ahead and hidden (D-182): only over a scene of the program, with its data there
  const nextScene = props.next && !dim && open && !board ? resolveScene(props.next, data) : null;
  const nextPick =
    nextScene && sceneReady(nextScene, data) && sceneKey(nextScene, data) !== pick.key
      ? { kind: nextScene as StageKind, key: sceneKey(nextScene, data) }
      : null;

  const live: DrawCtx = {
    now,
    clock,
    company,
    logoUrl,
    guest,
    speech,
    focusRemainingMs: props.focusRemainingMs,
    focus,
    task,
    rating: stage.rating,
    calendar: stage.calendar,
    calendarView: stage.calendarView,
    board: stage.board,
    summary: stage.summary,
  };
  const layers = useLayers({ key: pick.key, kind: pick.kind, snap: snapOf(live) }, nextPick);

  const quiet = !dim && open && quietScene(pick.kind);
  // the ticker, the footer and the day curve leave and come back with the night softly, in place
  const awake = { opacity: dim ? 0 : 1, transition: "opacity var(--t-tv) var(--ease-in-out)" };
  // the ticker also rests on the quiet clock of a meeting and on the board everyone reads
  const tickerShown = { opacity: dim || quiet ? 0 : 1, transition: "opacity var(--t-tv) var(--ease-in-out)" };
  const band = overlay.banner !== null && bandOver(pick.kind);
  // an opaque notice over a screensaver: the scene under it stays mounted but is not drawn (no mascot
  // frames for the minutes a visitor waits); it is drawn again the moment the notice starts to leave
  const [coverShown, setCoverShown] = useState(false);
  if (coverShown && (!overlay.banner || band)) setCoverShown(false);
  const covered = coverShown && overlay.banner !== null && !band;
  const clockInScene = pick.kind === "clock";
  const dateInScene = clockInScene || pick.kind === "calendar" || pick.kind === "welcome";
  const scale = props.scale === 115 || props.scale === 130 ? props.scale : 100;
  const { h, m } = aqtobeClock(now);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      data-scene={pick.key}
      data-clock={clock}
      data-guest={guest || undefined}
      data-scale={scale}
      style={{ "--tv-k": scale / 100 } as CSSProperties}
    >
      <div
        className="relative flex h-full w-full flex-col"
        style={{ transform: `translate(${shift.x}px, ${shift.y}px)`, transition: "transform 2s var(--ease-in-out)" }}
      >
        {/* far layer: the company's day by the hour, at the very bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[26vh]" style={awake} aria-hidden>
          <DayPulse pulse={summary?.pulse ?? []} hour={h + m / 60} />
        </div>

        <header className="shrink-0 pt-[2.4vh]" style={tickerShown} aria-hidden={dim || quiet || undefined}>
          {/* the row keeps the ticker's height at night and on a day without news: the middle never moves */}
          <div className="h-[calc(6.2vh*var(--tv-k,1))]">
            <TvTicker items={items} paused={dim || quiet} />
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 items-center justify-center" style={covered ? { contentVisibility: "hidden" } : undefined}>
          {layers.map((layer) => (
            <SceneLayer key={layer.key} role={layer.role} kind={layer.kind}>
              {DRAW[layer.kind](layer.role === "leaving" ? { ...live, ...layer.snap } : live)}
            </SceneLayer>
          ))}
        </main>

        <footer className="relative z-40 flex shrink-0 items-center justify-between gap-[3vh] px-[4vh] pb-[3.4vh]" style={awake} aria-hidden={dim || undefined}>
          <div className="flex min-w-0 items-center gap-[2vh]">
            {logoUrl ? <StillLogo src={logoUrl} className="h-[calc(5vh*var(--tv-k,1))] w-auto max-w-[18vw] shrink-0 object-contain" /> : null}
            <span className="tv-text truncate font-semibold">{company}</span>
            <PulseSign />
            {focus ? <span className="tv-caption truncate text-muted">· на экране: {focus.employee.name}</span> : null}
            {task?.employee ? <span className="tv-caption truncate text-muted">· дело: {task.employee.name}</span> : null}
          </div>

          <div className="flex shrink-0 items-center gap-[2.4vh]">
            {offline ? (
              <span className="tv-caption" style={{ color: "var(--warn)" }}>
                нет связи
              </span>
            ) : null}
            {/* the clock scene and the calendar say the time and the date big already: the footer does not repeat them */}
            {dateInScene ? null : <span className="tv-caption text-muted first-letter:uppercase">{tvDate(now)}</span>}
            {clockInScene ? null : clock === "analog" ? (
              <TvAnalogClock now={now} size="calc(9vh * var(--tv-k, 1))" seconds={false} detailed={false} />
            ) : (
              <span className="tv-title font-bold tabular-nums" style={{ color: CLOCK_INK }}>
                {tvTime(now)}
              </span>
            )}
          </div>
        </footer>

        {/* a drawing lit on the board takes the whole wall (D-141), a branch lit on the map too (D-144),
            while the board is the scene — a person or an order put up over it stays seen; a visitor's
            notice still stands above them */}
        <TvSketchFull board={board && open ? board.board : null} />
        <TvBranchFull board={board && open ? board.board : null} />

        <TvCelebrate
          events={props.events ?? []}
          guest={guest}
          now={now}
          pace={summary?.pace ?? null}
          night={dim}
          banner={overlay.banner !== null}
          boardPoint={Boolean(board?.board?.focus)}
          focus={!open}
          board={board !== null}
          remember={props.remember ?? true}
          onBusy={props.onCelebrate}
        />

        <TvOverlay view={overlay} sound={sound} mode={band ? "band" : "cover"} onCovered={() => setCoverShown(true)} />
      </div>
    </div>
  );
}

/** The product's sign, quieter than the company's name: the wall is the company's, not ours. */
function PulseSign() {
  return (
    <span className="tv-caption flex shrink-0 items-center gap-[0.8vh] text-muted opacity-70" aria-label="Pulse">
      <svg viewBox="0 0 26 18" aria-hidden className="h-[1.8vh] w-[2.6vh]">
        <polyline points="0,10 6,10 9,3 13,15 16,8 19,10 26,10" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      Pulse
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* What to draw                                                               */
/* -------------------------------------------------------------------------- */

type DrawCtx = {
  now: Date;
  clock: ClockStyle;
  company: string;
  logoUrl: string | null;
  guest: boolean;
  speech: TvSpeech;
  focusRemainingMs: number;
  focus: TvFocusEmployee | null;
  task: TvTaskFocusData | null;
  rating: TvRatingScene | null;
  calendar: TvCalendarData | null;
  calendarView: CalendarView;
  board: TvBoardData | null;
  summary: TvSummary | null;
};

/** The data a scene was drawn with: a scene on its way out keeps it while it fades. */
type Snap = Pick<DrawCtx, "focus" | "task" | "rating" | "calendar" | "calendarView" | "board" | "summary">;

function snapOf(c: DrawCtx): Snap {
  return { focus: c.focus, task: c.task, rating: c.rating, calendar: c.calendar, calendarView: c.calendarView, board: c.board, summary: c.summary };
}

function sameSnap(a: Snap, b: Snap): boolean {
  return (
    a.focus === b.focus &&
    a.task === b.task &&
    a.rating === b.rating &&
    a.calendar === b.calendar &&
    a.calendarView === b.calendarView &&
    a.board === b.board &&
    a.summary === b.summary
  );
}

/** A new scene: an entry in `SCENES` (lib/tv/scenes.ts), a line here and its component. */
const DRAW: Record<StageKind, (c: DrawCtx) => ReactNode> = {
  night: (c) => <Night now={c.now} clock={c.clock} />,
  focus: (c) => (c.focus ? <TvFocus focus={c.focus} remainingMs={c.focusRemainingMs} now={c.now} /> : null),
  task: (c) => (c.task ? <TvTaskFocus focus={c.task} remainingMs={c.focusRemainingMs} now={c.now} /> : null),
  face: (c) => <TvMascot speech={c.speech} pace={c.summary?.pace ?? null} />,
  clock: (c) => <TvClock now={c.now} next={c.summary?.events[0] ?? null} clock={c.clock} />,
  team: (c) => <TvTeam summary={c.summary ?? EMPTY_SUMMARY} guest={c.guest} />,
  calendar: (c) => <TvCalendar calendar={c.calendar} now={c.now} view={c.calendarView} />,
  rating: (c) => <TvLeaders data={c.rating} now={c.now} />,
  board: (c) => <TvBoard data={c.board} now={c.now} />,
  "day-result": (c) => (c.summary?.day ? <TvDayResult day={c.summary.day} guest={c.guest} now={c.now} /> : null),
  "week-result": (c) => (c.summary?.week_result ? <TvWeekResult week={c.summary.week_result} guest={c.guest} now={c.now} /> : null),
  announcement: (c) => (c.summary?.announcement ? <TvAnnouncement announcement={c.summary.announcement} now={c.now} /> : null),
  welcome: (c) => <TvWelcome company={c.company} logoUrl={c.logoUrl} now={c.now} />,
};

/* -------------------------------------------------------------------------- */
/* Layers: the scene on the wall, the one leaving, the one drawn ahead         */
/* -------------------------------------------------------------------------- */

type Role = "current" | "leaving" | "next";
type Shown = { key: string; kind: StageKind; snap: Snap };
type Track = { order: string[]; shown: Shown; leaving: Shown[] };

/** The way out is quicker than the way in (D-166). */
const EXIT_MS = 220;
const ENTER_MS = 520;
const ENTER_DELAY_MS = 80;
/** Reading order: the heading, then the main thing, then the details. */
const ENTER_STEP_MS = 70;

/**
 * The layers of the middle, in the order they first came: a new one is appended, so a layer's DOM node
 * never moves (a moved node restarts its animations). The scene on the wall is drawn live; the one
 * leaving keeps the data it was drawn with (`snap`) for the fraction of a second it fades; the next
 * one of the program is drawn live and hidden.
 */
function useLayers(current: Shown, next: { key: string; kind: StageKind } | null): { key: string; kind: StageKind; role: Role; snap: Snap }[] {
  const [track, setTrack] = useState<Track>(() => ({ order: [current.key], shown: current, leaving: [] }));
  const advanced = advance(track, current, next);
  if (advanced !== track) setTrack(advanced);

  // the scenes that left are dropped once their way out is over
  const leavingKeys = advanced.leaving.map((layer) => layer.key).join("|");
  useEffect(() => {
    if (!leavingKeys) return;
    const timer = setTimeout(() => setTrack((t) => ({ ...t, leaving: [] })), EXIT_MS + 80);
    return () => clearTimeout(timer);
  }, [leavingKeys]);

  const out: { key: string; kind: StageKind; role: Role; snap: Snap }[] = [];
  for (const key of advanced.order) {
    if (key === advanced.shown.key) out.push({ ...advanced.shown, role: "current" });
    else {
      const leaving = advanced.leaving.find((layer) => layer.key === key);
      if (leaving) out.push({ ...leaving, role: "leaving" });
      else if (next && key === next.key) out.push({ key, kind: next.kind, snap: advanced.shown.snap, role: "next" });
    }
  }
  return out;
}

function advance(track: Track, current: Shown, next: { key: string; kind: StageKind } | null): Track {
  let t = track;
  if (t.shown.key !== current.key) {
    const leaving = [...t.leaving.filter((layer) => layer.key !== current.key && layer.key !== t.shown.key), t.shown];
    t = { order: t.order.includes(current.key) ? t.order : [...t.order, current.key], shown: current, leaving };
  } else if (t.shown.kind !== current.kind || !sameSnap(t.shown.snap, current.snap)) {
    t = { ...t, shown: current };
  }
  if (next && !t.order.includes(next.key)) t = { ...t, order: [...t.order, next.key] };
  const keep = (key: string) => key === t.shown.key || t.leaving.some((layer) => layer.key === key) || key === next?.key;
  if (!t.order.every(keep)) t = { ...t, order: t.order.filter(keep) };
  return t;
}

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The parts of a scene in reading order: its root's children, through wrappers of one child. */
function partsOf(layer: HTMLElement): Element[] {
  let root = layer.firstElementChild;
  for (let depth = 0; root && root.children.length === 1 && depth < 3; depth += 1) root = root.firstElementChild;
  if (!root) return [];
  const kids = Array.from(root.children);
  return kids.length > 0 ? kids.slice(0, 8) : [root];
}

/**
 * One scene in the middle. `next` — drawn ahead behind `<Activity mode="hidden">`: rendered, not shown,
 * no effects running; becoming `current` it only turns visible and its parts rise in reading order.
 * `leaving` — out of the flow, fading over what comes in. Transform and opacity only (D-45).
 */
function SceneLayer({ role, kind, children }: { role: Role; kind: StageKind; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || role === "next" || prefersReduced()) return;
    const rise = window.innerHeight * 0.022;
    if (role === "leaving") {
      const out = el.animate([{ opacity: 1, transform: "translateY(0px)" }, { opacity: 0, transform: `translateY(${-rise / 2}px)` }], {
        duration: EXIT_MS,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      });
      return () => out.cancel();
    }
    // implicit end keyframes: each part comes to whatever it is by itself — its own transform and opacity stay
    const anims = partsOf(el).flatMap((part, i) => {
      const timing: KeyframeAnimationOptions = {
        duration: ENTER_MS,
        delay: ENTER_DELAY_MS + Math.min(i, 3) * ENTER_STEP_MS,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
        fill: "backwards",
      };
      return [part.animate([{ opacity: 0 }], timing), part.animate([{ transform: `translateY(${rise}px)` }], { ...timing, composite: "add" })];
    });
    return () => anims.forEach((anim) => anim.cancel());
  }, [role]);

  return (
    <div
      ref={ref}
      className={
        role === "current"
          ? "relative flex w-full items-center justify-center px-[4vh] motion-reduce:transform-none"
          : "pointer-events-none absolute inset-0 flex items-center justify-center px-[4vh]"
      }
      aria-hidden={role !== "current" || undefined}
      data-layer={role}
      data-kind={kind}
    >
      <Activity mode={role === "next" ? "hidden" : "visible"}>{children}</Activity>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Holding the scene while its data comes                                     */
/* -------------------------------------------------------------------------- */

/** How long the wall keeps its scene while the next one's data is on its way: a query that never answers must not pin it. */
const HOLD_MS = 4_000;

/** The middle of the wall and the data it is drawn from — they change together. */
type Stage = SceneData & { scene: WallScene };

/**
 * The kiosk fetches a scene's data after the scene is named (the queries run only for what is on the wall):
 * until the data is there, the stage on the wall stays as it was, so the wall plays one transition into the whole
 * picture — not into «Свободный день» or an empty grid that fill in a moment later, not through the face (D-121).
 * `open`: nobody's orders cover the middle, the scene is what shows.
 */
function useStage(next: Stage, open: boolean): Stage {
  const waiting = open && !sceneReady(next.scene, next);
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
  return (
    a.scene === b.scene &&
    a.calendar === b.calendar &&
    a.calendarView === b.calendarView &&
    a.rating === b.rating &&
    a.board === b.board &&
    a.summary === b.summary
  );
}

/* -------------------------------------------------------------------------- */
/* The night                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ночь стены (D-96): только часы, тускло. Экран не гаснет совсем — чёрный телевизор
 * читается как сломанный, — но и не светит в пустой кабинет лентой и лицом. Сдвиг всей
 * композиции тоньше штриха цифр, поэтому ночные часы раз в 10 минут сами переезжают в другое
 * место средней области (`nightSpot`, D-182).
 */
function Night({ now, clock }: { now: Date; clock: ClockStyle }) {
  const spot = nightSpot(now);
  return (
    <div
      className="flex flex-col items-center gap-[2vh] opacity-[0.32]"
      style={{ transform: `translate(${(spot.x * 28).toFixed(2)}vw, ${(spot.y * 14).toFixed(2)}vh)`, transition: "transform 3s var(--ease-in-out)" }}
      data-testid="tv-night"
    >
      {clock === "analog" ? (
        <TvAnalogClock now={now} size="44vh" seconds={false} />
      ) : (
        <p className="tv-giant font-bold tabular-nums" style={{ color: CLOCK_INK }}>
          {tvTime(now)}
        </p>
      )}
      <p className="tv-text text-muted first-letter:uppercase">{tvDate(now)}</p>
    </div>
  );
}
