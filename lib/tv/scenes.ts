import type { TvBoard } from "./board";
import type { WallScene } from "./program";
import type { TvCalendar, TvFocusEmployee, TvPace, TvRatingScene, TvSummary, TvTaskFocus } from "./queries";
import type { CalendarView } from "./state";

/**
 * Реестр сцен стены (D-182): одно место, где сказано, что стоит посреди стены, по приоритету —
 * ночь, человек, дело, доска, приветствие гостя, ручная заставка или программа дня (их выбирает
 * `wallSceneOf` в `state.ts`), — у каждой сцены ключ (смена ключа играет переход) и готовность
 * данных (пока данных нет, стена держит прежнюю сцену). Что рисовать — `DRAW` в `TvFrame`: новая
 * сцена — запись здесь, строка там и её компонент.
 *
 * Чистый модуль без React: правило проверяется тестом, а не глазами на стене.
 */

/** `tv_summary()` with the fields of D-182 (I1) — every one optional: the wall lives without them. */
export type WallSummary = TvSummary;
export type TvPaceRow = TvPace;

/** The «Команда» scene before the first summary: empty tiles are better than an empty wall. */
export const EMPTY_SUMMARY: TvSummary = {
  guest: false,
  points_enabled: false,
  now: new Date(0).toISOString(),
  pulse: [],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 0, done: 0, in_work: 0 },
  rating: [],
  load: [],
  week: [],
  merch: [],
  events: [],
};

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

/** What the middle of the wall can hold: the night, a person, an order, or a scene. */
export type StageKind = "night" | "focus" | "task" | WallScene;

/** The data a scene is drawn from — it changes together with the scene. */
export type SceneData = {
  calendar: TvCalendar | null;
  calendarView: CalendarView;
  rating: TvRatingScene | null;
  board: TvBoard | null;
  summary: WallSummary | null;
};

type Entry = {
  /** The data is there to draw the whole picture; until then the wall keeps the scene it has. */
  ready: (d: SceneData) => boolean;
  /** Another key plays the transition; the same key updates in place. */
  key: (d: SceneData) => string;
  /**
   * The data says there is nothing to draw (not «still loading»): the face stands in. A run-out
   * board, an evening of an older database without «Итог дня», a cleared announcement.
   */
  empty?: (d: SceneData) => boolean;
};

const always = () => true;

export const SCENES: Record<WallScene, Entry> = {
  face: { ready: always, key: () => "face" },
  clock: { ready: always, key: () => "clock" },
  team: { ready: always, key: () => "team" },
  calendar: { ready: (d) => d.calendar !== null, key: (d) => `calendar:${d.calendarView}` },
  rating: { ready: (d) => d.rating !== null, key: (d) => `rating:${d.rating?.period ?? "week"}` },
  board: {
    ready: (d) => d.board !== null,
    key: (d) => `board:${d.board?.board?.id ?? "hidden"}`,
    // no board to show and no honest «скрыта» either: it was taken down or ran out
    empty: (d) => d.board !== null && !d.board.board && !d.board.hidden,
  },
  "day-result": { ready: always, key: () => "day-result", empty: (d) => !d.summary?.day },
  "week-result": { ready: always, key: () => "week-result", empty: (d) => !d.summary?.week_result },
  announcement: {
    ready: always,
    key: (d) => `announcement:${d.summary?.announcement?.id ?? ""}`,
    empty: (d) => !d.summary?.announcement,
  },
  welcome: { ready: always, key: () => "welcome" },
};

/** The scene the wall can actually draw: one whose data says «nothing» gives way to the face. */
export function resolveScene(scene: WallScene, d: SceneData): WallScene {
  return SCENES[scene].empty?.(d) ? "face" : scene;
}

export function sceneReady(scene: WallScene, d: SceneData): boolean {
  return SCENES[scene].ready(d);
}

export function sceneKey(scene: WallScene, d: SceneData): string {
  return SCENES[scene].key(d);
}

/** A board on the wall: its points, or the honest «скрыта» for a guest (D-102) — not a board still loading. */
export function boardShown(scene: WallScene, board: TvBoard | null): TvBoard | null {
  return scene === "board" && board && (board.board || board.hidden) ? board : null;
}

export type StagePick = { kind: StageKind; key: string };

/**
 * What stands in the middle, by priority. `night` — the wall sleeps (the caller has already let a
 * person, an order, a board or a notice wake it, D-96); a person (D-120) and an order (D-123) put up
 * from a phone stand above every scene.
 */
export function stageOf(
  input: { night: boolean; focus: TvFocusEmployee | null; task: TvTaskFocus | null; scene: WallScene },
  d: SceneData,
): StagePick {
  if (input.night) return { kind: "night", key: "night" };
  if (input.focus) return { kind: "focus", key: `focus:${input.focus.employee.id}` };
  if (input.task) return { kind: "task", key: `task:${input.task.task.id}` };
  return { kind: input.scene, key: sceneKey(input.scene, d) };
}

/** The scenes that turn the ticker off: the quiet clock of a meeting and the board everyone reads. */
export function quietScene(kind: StageKind): boolean {
  return kind === "clock" || kind === "board";
}

/**
 * A notice over a person, an order, a board or an announcement comes as a band in the bottom third:
 * what the room is reading stays on the wall. Over a screensaver it covers the middle as before.
 */
export function bandOver(kind: StageKind): boolean {
  return kind === "focus" || kind === "task" || kind === "board" || kind === "announcement";
}
