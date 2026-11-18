import { fits, fold } from "@/lib/desk/suggest";
import { keyLabels } from "@/lib/people/labels";

import type { TvControlInput } from "./mutations";
import type { TvState } from "./queries";
import { uncover } from "./remote";
import { type CalendarView, type RatingView, type TvScene } from "./state";

/**
 * The wall by words (D-182): «покажи Марата на стене», «часы на стену», «верни заставки»,
 * «убери со стены» — a command to the office screen typed (the desk's palette, Ctrl K) or, later,
 * said. Pure: the words give an intent, `wallInput` turns it into the remote's own command at the
 * moment it is sent (what is on the wall then decides whether a person is taken down with it).
 *
 * Strict on purpose: every word must be understood — the wall, a verb, a scene, a board's title
 * or a person's name. «Марат, повесь график на стену» is an order to Марат, not a command to the
 * wall: «график» is not understood, so nothing is offered and Enter sends the order as always.
 * A person is found the way the remote's keys name them (`keyLabels`): a first name, a surname,
 * an alias, in any case form («Марата», «Дину») — two namesakes are two candidates.
 */

export type WallIntent =
  | { kind: "person"; personId: string }
  | { kind: "scene"; scene: Exclude<TvScene, "board">; calendar?: CalendarView; rating?: RatingView }
  | { kind: "board"; boardId: string }
  | { kind: "round" }
  | { kind: "clear" };

export type WallCommand = {
  /** Stable per intent: a row key. */
  key: string;
  intent: WallIntent;
  /** The row's words: «На стену: Марат». */
  label: string;
  /** The receipt's words once the command went through: «На стене — Марат · 10 мин». */
  done: string;
  /** The whole phrase is this command and nothing else: Enter may do it by itself. */
  lead: boolean;
};

export type WallPerson = { id: string; full_name: string; aliases?: string[] | null; role?: string; is_active?: boolean };
export type WallBoardRef = { id: string; title: string; updated_at?: string };

export type WallContext = {
  people: readonly WallPerson[];
  /** The director's live boards, the one to put up first («доску на стену» — the first). */
  boards?: readonly WallBoardRef[];
  /** Points are on (D-48): the rating is a scene only then. Unknown — on. */
  points?: boolean;
  /** Who is on the wall now: «убери Марата со стены» names them. */
  onWallId?: string | null;
};

/** The phrase is longer than any command: an order, not a remote. */
const MAX_WORDS = 8;
/** Candidates a name may give — the namesakes. */
const MAX_PEOPLE = 3;

const WALL = /^(стен|экран|тв$|телевиз|телик)/;
const SHOW = /^(покаж|показ|выведи|вывед|вывест|вывод|постав|давай|дай$|включ|кинь|выкин|открой)/;
const BACK = /^(верн|возвра)/;
const CLEAR = /^(убер|убра|сним|снят|снима|убир|скрой|скрыт)/;
/** Words around the command that carry nothing: «покажи-ка мне, пожалуйста, на стене его дела». */
const FILLER = new Set([
  "на", "со", "с", "в", "во", "к", "ко", "мне", "нам", "пожалуйста", "плиз", "сейчас", "сюда", "туда", "там", "тут",
  "ка", "ну", "его", "ее", "их", "дела", "задачи", "работу", "все", "это", "этот", "эту", "а", "и", "же", "давайте",
  "быстро", "обратно", "опять", "снова",
]);

type SceneWord = Exclude<TvScene, "board"> | "board" | "round";

function sceneOfWord(word: string): SceneWord | null {
  if (/^лиц[оау]?$/.test(word) || /^маскот/.test(word)) return "face";
  if (/^час(ы|ов|ики)$/.test(word)) return "clock";
  if (/^команд/.test(word)) return "team";
  if (/^календар/.test(word)) return "calendar";
  if (/^рейтинг/.test(word)) return "rating";
  if (/^доск/.test(word)) return "board";
  if (/^заставк/.test(word) || /^эфир/.test(word) || /^программ/.test(word)) return "round";
  return null;
}

const MONTH = /^месяц/;
const WEEK = /^(недел|сегодн)/;

const SCENE_WORDS: Record<Exclude<TvScene, "board">, string> = {
  face: "лицо",
  clock: "часы",
  team: "команда",
  calendar: "календарь",
  rating: "рейтинг",
};

function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

/** Every typed word fits some word of the name: «ерлана б» — Ерлан Бекмуханов. */
function allFit(typed: readonly string[], haystack: readonly string[]): boolean {
  return typed.length > 0 && typed.every((t) => haystack.some((w) => fits(t, w)));
}

function nameWords(person: WallPerson): string[] {
  return [...words(person.full_name), ...(person.aliases ?? []).flatMap((alias) => words(alias))];
}

/** The people a name may mean: the roster's people (not a screen), every word fitting. */
function peopleNamed(rest: readonly string[], people: readonly WallPerson[]): WallPerson[] {
  return people.filter((person) => person.is_active !== false && person.role !== "tv" && allFit(rest, nameWords(person))).slice(0, MAX_PEOPLE);
}

function sceneLabel(scene: Exclude<TvScene, "board">, calendar?: CalendarView, rating?: RatingView): string {
  if (scene === "calendar") return calendar === "month" ? "календарь · месяц" : calendar === "week" ? "календарь · неделя" : "календарь";
  if (scene === "rating") return rating === "month" ? "рейтинг месяца" : rating === "week" ? "рейтинг недели" : "рейтинг";
  return SCENE_WORDS[scene];
}

function sceneDone(scene: Exclude<TvScene, "board">, calendar?: CalendarView, rating?: RatingView): string {
  if (scene === "calendar" && calendar === "month") return "На стене — месяц";
  if (scene === "calendar" && calendar === "week") return "На стене — сегодня и неделя";
  if (scene === "rating" && rating === "month") return "На стене — рейтинг месяца";
  if (scene === "rating" && rating === "week") return "На стене — рейтинг недели";
  return `Заставка: ${SCENE_WORDS[scene]}`;
}

const ROUND: WallCommand = {
  key: "round",
  intent: { kind: "round" },
  label: "Стена: заставки по кругу",
  done: "Заставки меняются по кругу",
  lead: true,
};

const CLEAR_COMMAND: WallCommand = {
  key: "clear",
  intent: { kind: "clear" },
  label: "Убрать со стены",
  done: "Убрал со стены — заставки по кругу",
  lead: true,
};

/**
 * What a phrase asks of the wall: one command, a few (namesakes, boards of the same name) — or
 * none, and then the words are an order.
 */
export function parseWallCommand(text: string, context: WallContext): WallCommand[] {
  const typed = words(text);
  if (typed.length === 0 || typed.length > MAX_WORDS) return [];

  let wall = false;
  let verb: "show" | "back" | "clear" | null = null;
  let scene: SceneWord | null = null;
  let calendar: CalendarView | undefined;
  let rating: RatingView | undefined;
  let view: "month" | "week" | null = null;
  const rest: string[] = [];

  for (let index = 0; index < typed.length; index += 1) {
    const word = typed[index];
    // «по кругу» — the round; «по» alone carries nothing
    if (word === "по" && /^круг/.test(typed[index + 1] ?? "")) {
      if (scene && scene !== "round") return [];
      scene = "round";
      index += 1;
      continue;
    }
    if (WALL.test(word)) {
      wall = true;
      continue;
    }
    if (FILLER.has(word)) continue;
    const named = sceneOfWord(word);
    if (named) {
      // two scenes in one phrase — «часы и календарь»: not a command
      if (scene && scene !== named) return [];
      scene = named;
      continue;
    }
    if (MONTH.test(word) || WEEK.test(word)) {
      const next = MONTH.test(word) ? "month" : "week";
      if (view && view !== next) return [];
      view = next;
      continue;
    }
    if (CLEAR.test(word)) {
      verb = "clear";
      continue;
    }
    if (BACK.test(word)) {
      verb = verb ?? "back";
      continue;
    }
    if (SHOW.test(word)) {
      verb = verb ?? "show";
      continue;
    }
    rest.push(word);
  }

  // the screensavers are the wall's own word; anything else must name the wall
  if (!wall && scene !== "round") return [];

  if (verb === "clear") {
    // «убери со стены», «сними Марата со стены» — the one on the wall; a name of someone else is an order
    if (view) return [];
    if (rest.length === 0) return [CLEAR_COMMAND];
    const onWall = context.onWallId ? context.people.find((person) => person.id === context.onWallId) : null;
    return onWall && allFit(rest, nameWords(onWall)) ? [CLEAR_COMMAND] : [];
  }

  if (scene === "round") return rest.length === 0 && !view ? [ROUND] : [];

  if (scene === "board") {
    if (view) return [];
    const boards = context.boards ?? [];
    const found = rest.length === 0 ? boards.slice(0, 1) : boards.filter((board) => allFit(rest, words(board.title))).slice(0, MAX_PEOPLE);
    return found.map((board) => ({
      key: `board:${board.id}`,
      intent: { kind: "board", boardId: board.id },
      label: `На стену: доска «${board.title.trim()}»`,
      done: `На стене — «${board.title.trim()}»`,
      lead: found.length === 1,
    }));
  }

  if (scene) {
    if (rest.length > 0) return [];
    if (scene === "rating" && context.points === false) return [];
    if (view && scene !== "calendar" && scene !== "rating") return [];
    if (scene === "calendar" && view) calendar = view;
    if (scene === "rating" && view) rating = view;
    return [
      {
        key: `scene:${scene}${calendar ? `:${calendar}` : ""}${rating ? `:${rating}` : ""}`,
        intent: { kind: "scene", scene, ...(calendar ? { calendar } : {}), ...(rating ? { rating } : {}) },
        label: `На стену: ${sceneLabel(scene, calendar, rating)}`,
        done: sceneDone(scene, calendar, rating),
        lead: true,
      },
    ];
  }

  if (rest.length === 0 || view) return [];
  const found = peopleNamed(rest, context.people);
  if (found.length === 0) return [];
  // the key's own words: «Марат», namesakes «Ерлан Б.» (D-146)
  const labels = keyLabels(context.people.filter((person) => person.is_active !== false && person.role !== "tv").map((person) => ({ id: person.id, full_name: person.full_name })));
  return found.map((person) => {
    const name = labels.get(person.id) ?? person.full_name;
    return {
      key: `person:${person.id}`,
      intent: { kind: "person", personId: person.id },
      label: `На стену: ${name}`,
      done: `На стене — ${name} · 10 мин`,
      lead: found.length === 1,
    };
  });
}

/**
 * The remote's command for an intent, at the moment it is sent. A scene, a board or the round
 * take a person or an order off the wall in the same command (`uncover`, D-76) — when what is on
 * the wall is unknown (the desk away from «Экран»), the command takes them down anyway: the
 * words asked for this scene to be seen now. «Убрать со стены» takes down what lies on top: a
 * person or an order — else a board or a scene picked by hand, back to the round.
 */
export function wallInput(intent: WallIntent, state: TvState | null | undefined, now: Date): TvControlInput {
  const down: Pick<TvControlInput, "mode"> = state ? uncover(state, now) : { mode: "ether" };
  switch (intent.kind) {
    case "person":
      return { mode: "employee", employeeId: intent.personId };
    case "scene":
      return {
        ...down,
        scene: intent.scene,
        ...(intent.calendar ? { calendar: intent.calendar } : {}),
        ...(intent.rating ? { rating: intent.rating } : {}),
      };
    case "board":
      return { ...down, board: intent.boardId };
    case "round":
      return { ...down, carousel: true };
    case "clear":
      return state && uncover(state, now).mode ? { mode: "ether" } : { mode: "ether", carousel: true };
  }
}
