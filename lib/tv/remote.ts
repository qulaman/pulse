import { runningEvent } from "@/lib/calendar/agenda";
import { stepLabel } from "@/lib/mindboard/tree";

import { mapFits } from "./board";
import { tvTime } from "./clock";
import {
  DEFAULT_PROGRAM_WINDOW,
  programNext,
  segmentEndsAt,
  segmentOf,
  type ProgramWindow,
  type WallScene,
} from "./program";
import type { TvState } from "./queries";
import {
  awakeUntil,
  boardLive,
  boardPointOf,
  boardViewOf,
  calendarViewOf,
  effectiveMode,
  focusRemainingMs,
  guestOf,
  programOn,
  ratingViewOf,
  wallAsleep,
  wallSceneOf,
  weekInRound,
  type CalendarView,
  type ClockStyle,
  type RatingView,
  type TvScene,
} from "./state";

/**
 * Что пульт говорит директору о стене. Чистые функции: формулировки — часть продукта,
 * и проверяются тестом, а не глазами на телефоне.
 *
 * Квитанция экрана — принцип 8 CLAUDE.md в приложении к ТВ (D-76 §9). Разница между
 * «отправлено» и «на стене» здесь настоящая: директор в кабинете не видит телевизор
 * в коридоре и обязан узнать от пульта, дошла команда или экран висит со вчера.
 * Формулировка та же, что у доставки людям: не «экран не получил», а «не отвечает
 * с 9:14» — пульт сообщает факт, а не ставит диагноз.
 *
 * С D-182 дисплей говорит не только что на стене, но и почему и до каких пор: «Человек на
 * стене — ещё 7 мин», «Программа: утро · дальше по кругу в 10:00», «Вручную до 17:00, потом
 * программа», «Надпись о посетителе — уйдёт в 10:35»; слова «Эфир» на нём больше нет. Команда,
 * которую стена не показала за 15 секунд, — уже повод проверить телевизор, а не ждать три минуты.
 */

export type ReceiptTone = "ok" | "warn" | "muted";
/** `restart` — the remote offers «Перезапустить экран» beside the words. */
export type WallReceipt = { tone: ReceiptTone; text: string; restart?: boolean };

/** Киоск отмечается раз в минуту; три пропуска подряд — экран уже не отвечает. */
const STALE_MS = 3 * 60_000;
/**
 * A live kiosk shows a command within a second or two (`KioskLife` beats again the moment its
 * applied version moves): a command still not shown after fifteen seconds means the TV is off,
 * asleep or offline — the director learns it while still holding the phone (D-182).
 */
export const SHOWN_WITHIN_MS = 15_000;

/** The last command this remote sent: the version `tv_control` returned and when (the phone's clock). */
export type SentMark = { version: number; at: number };

export const SCENE_LABEL: Record<TvScene, string> = {
  face: "Лицо",
  clock: "Часы",
  team: "Команда",
  calendar: "Календарь",
  board: "Доска",
  rating: "Рейтинг",
};

/** Every scene the middle of the wall can hold, as the display names it — the program's own too (D-182). */
export const WALL_SCENE_LABEL: Record<WallScene, string> = {
  ...SCENE_LABEL,
  "day-result": "Итог дня",
  "week-result": "Итог недели",
  announcement: "Объявление",
  welcome: "Приветствие",
};

/** Переключатель часов на пульте (D-96): как на стене, так и на клавише. */
export const CLOCK_LABEL: Record<ClockStyle, string> = {
  digital: "Цифры",
  analog: "Стрелки",
};

/** Переключатель вида календаря на пульте (D-98). */
export const CALENDAR_LABEL: Record<CalendarView, string> = {
  week: "Неделя",
  month: "Месяц",
};

/** Период рейтинга на стене (D-123) — те же слова, что у экрана «Рейтинг». */
export const RATING_LABEL: Record<RatingView, string> = {
  week: "Неделя",
  month: "Месяц",
};

/** «Крупность» (D-182): how far the room reads the wall from — the kiosk scales its type by it. */
export type WallScale = 100 | 115 | 130;
export const WALL_SCALES: readonly WallScale[] = [100, 115, 130];
export const SCALE_LABEL: Record<WallScale, string> = { 100: "Рядом", 115: "Средне", 130: "Далеко" };

/** The row's scale; a value the client does not know (or a database older than D-182) — «рядом». */
export function wallScaleOf(state: TvState | null): WallScale {
  const scale = (state as (TvState & { scale?: number | null }) | null)?.scale;
  return scale === 115 || scale === 130 ? scale : 100;
}

export function wallReceipt(state: TvState | null, now: Date, sent: SentMark | null = null): WallReceipt {
  if (!state) return { tone: "muted", text: "Экран ещё не подключался" };

  if (!state.seen_at || now.getTime() - new Date(state.seen_at).getTime() > STALE_MS) {
    return state.seen_at
      ? { tone: "warn", text: `Экран не отвечает с ${tvTime(new Date(state.seen_at))}`, restart: true }
      : { tone: "muted", text: "Экран ещё не подключался" };
  }

  const applied = state.applied_version ?? -1;
  if (applied < state.version) {
    // this remote's own command, sent fifteen seconds ago and still not on the wall
    if (sent && applied < sent.version && now.getTime() - sent.at >= SHOWN_WITHIN_MS) {
      return { tone: "warn", text: "Экран не показал за 15 с — телевизор выключен или без сети?", restart: true };
    }
    return { tone: "muted", text: "Отправлено, экран ещё не показал" };
  }

  return { tone: "ok", text: "На стене" };
}

/**
 * What the kiosk reported about itself with its heartbeat (D-182, `tv_state.health`): the browser
 * blocks sound — the visitor's chime will not ring — or the screen is let fall asleep. One line on
 * the display, the most important first; nothing while the kiosk is silent (the receipt says so).
 * The kiosk's words are read leniently: a missing or unknown field is no warning.
 */
export function wallHealth(state: TvState | null, now: Date): string | null {
  if (!state?.seen_at || now.getTime() - new Date(state.seen_at).getTime() > STALE_MS) return null;
  const raw = (state as TvState & { health?: unknown }).health;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // the kiosk's own words (`KioskHealth`, lib/tv/kiosk-signal.ts): `sound` — the AudioContext's state
  // («idle» — no chime yet, unknown), `silent_rings` — chimes rung into silence, `wake` — the Wake Lock
  const health = raw as Record<string, unknown>;
  const muted = ["suspended", "interrupted", "closed", "unsupported", "blocked"];
  if ((typeof health.sound === "string" && muted.includes(health.sound)) || (typeof health.silent_rings === "number" && health.silent_rings > 0)) {
    return "Звук на экране заблокирован — звонка о посетителе не будет";
  }
  // the first beat leaves before the Wake Lock is granted: the first two minutes say nothing about sleep
  const justUp = typeof health.up_min === "number" && health.up_min < 2;
  if (!justUp && (health.wake === "off" || health.wake === "denied" || health.wake === "unsupported")) {
    return "Экран может уснуть сам — проверьте сон в настройках телевизора";
  }
  return null;
}

/** Название доски на дисплее: длинное режется, чтобы «пункт 3 из 7 · до 21:00» не ушло за край. */
const TITLE_MAX = 24;

function clip(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1).trimEnd()}…` : flat;
}

/** "08:00" from minutes after midnight. */
function clockOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** What the wall shows (`title`) and why, and till when (`why`). */
export type WallNow = { title: string; why: string };

export type WallNowExtra = {
  points?: boolean;
  guest?: boolean;
  taskTitle?: string | null;
  /** Пункты доски на стене (верхнего уровня, со словами) по порядку — для «пункт 3 из 7» (D-121). */
  boardPoints?: readonly string[];
  /** The company's program window (D-182, `tv_summary.program`); none — 21:00 / 08:00 / 17:00. */
  window?: ProgramWindow;
  /** Today's announcement waits in the round (D-182, `tv_summary.announcement`). */
  announcement?: boolean;
};

const SEGMENT_WORD = { morning: "утро", day: "день", evening: "вечер", night: "ночь" } as const;

/** A scene in the middle of a sentence: «дальше — календарь в 14:03». */
function lower(scene: WallScene): string {
  return WALL_SCENE_LABEL[scene].toLowerCase();
}

/**
 * Что на стене прямо сейчас и почему (D-182): «Марат Ахметов» — «Человек на стене — ещё 7 мин»;
 * «Дело «Замер окон»» (D-123); «Доска «Планёрка»» — «пункт 3 из 7 · до 21:00» (D-102, D-121);
 * «Ночь · тусклые часы» — «До 08:00…» (D-105); заставка — и чья она: программы дня
 * («Заставки по кругу · дальше — календарь в 14:03», «Программа: утро · дальше по кругу в
 * 10:00») или поставленная руками («Вручную до 17:00, потом программа»).
 *
 * Про доску дисплей говорит то, что видно на стене, а не то, что просили: карта — только
 * когда она влезает (`mapFits`), иначе стена рисует список; при госте без «Показать гостю»
 * на стене часы и «Доска скрыта» (D-102 §7). Сцену считает то же правило, что у киоска
 * (`wallSceneOf`), поэтому пульт и стена не расходятся.
 */
export function wallNow(
  state: TvState | null,
  people: { id: string; full_name: string }[],
  now: Date,
  boards: { id: string; title: string }[] = [],
  extra: WallNowExtra = {},
): WallNow {
  const mode = effectiveMode(state, now);
  const minutes = Math.ceil(focusRemainingMs(state, now) / 60_000);
  if (mode === "employee" && state?.employee_id) {
    const person = people.find((p) => p.id === state.employee_id);
    return { title: person?.full_name ?? "Сотрудник", why: `Человек на стене — ещё ${minutes} мин` };
  }
  if (mode === "task") {
    const title = extra.taskTitle?.trim();
    return { title: title ? `Дело «${title}»` : "Одно дело", why: `Дело на стене — ещё ${minutes} мин` };
  }

  const w = extra.window ?? DEFAULT_PROGRAM_WINDOW;
  if (wallAsleep(state, now, w)) {
    return { title: "Ночь · тусклые часы", why: `До ${clockOf(w.nightTo)}, потом программа дня` };
  }

  const points = extra.points ?? true;
  const guest = extra.guest ?? false;
  const announcement = extra.announcement ?? false;
  const scene = wallSceneOf(state, now, { points, guest, announcement }, w);

  if (scene === "board" && boardLive(state, now) && state?.board_until) {
    const title = boards.find((board) => board.id === state.board_id)?.title;
    const name = title ? `Доска «${clip(title)}»` : "Доска";
    const until = `до ${tvTime(new Date(state.board_until))}`;
    if (guestOf(state, false, now) && !state.board_guest) return { title: name, why: `Скрыта от гостя — на стене часы · ${until}` };
    const boardPoints = extra.boardPoints ?? [];
    const parts: string[] = [];
    if (boardViewOf(state) === "map" && mapFits(boardPoints.length)) parts.push("Карта");
    const step = stepLabel(boardPoints, boardPointOf(state, now));
    if (step) parts.push(`пункт ${step}`);
    parts.push(until);
    const why = parts.join(" · ");
    return { title: name, why: why.charAt(0).toUpperCase() + why.slice(1) };
  }

  const program = programOn(state, now, w);
  const segment = segmentOf(now, w);
  const title = sceneTitle(state, scene, boards, { program, segment, guest });
  const awake = awakeUntil(state, now);

  if (scene === "welcome") return { title, why: "Гость только что вошёл — минута приветствия" };
  // woken at night (D-105): the program runs, the night comes back by itself
  if (segment === "night" && awake) return { title, why: `Разбужен до ${tvTime(awake)}, потом ночь` };

  if (!program) {
    // a screensaver picked by hand (D-182): till the end of its part of the day; a database older
    // than the program knows no such end — the hand holds as it always did
    const setAt = (state as (TvState & { scene_set_at?: string | null }) | null)?.scene_set_at;
    if (setAt === undefined) return { title, why: "Вручную · «По кругу» вернёт программу" };
    return { title, why: `Вручную до ${tvTime(segmentEndsAt(now, w))}, потом программа` };
  }

  const next = programNext(now, w, { points, guest, announcement, weekBoard: weekInRound(state, now, guest, w) });
  const end = segmentEndsAt(now, w);
  const at = tvTime(next.at);
  if (segment === "morning") {
    return { title, why: next.at.getTime() >= end.getTime() ? `Программа: утро · дальше по кругу в ${at}` : `Программа: утро · дальше — ${lower(next.scene)} в ${at}` };
  }
  if (segment === "day") return { title, why: `Заставки по кругу · дальше — ${lower(next.scene)} в ${at}` };
  if (next.at.getTime() >= end.getTime() && segment === "evening") {
    return { title, why: `Программа: вечер · в ${tvTime(end)} ночь` };
  }
  return { title, why: `Программа: ${SEGMENT_WORD[segment]} · дальше — ${lower(next.scene)} в ${at}` };
}

function sceneTitle(
  state: TvState | null,
  scene: WallScene,
  boards: { id: string; title: string }[],
  o: { program: boolean; segment: string; guest: boolean },
): string {
  if (scene === "calendar") {
    // the program's morning shows «Сегодня» (the week view, D-182); by hand — the remote's view
    if (o.program && o.segment === "morning") return "Календарь · сегодня";
    return calendarViewOf(state) === "month" ? "Календарь · месяц" : "Календарь · неделя";
  }
  if (scene === "rating") {
    const name = ratingViewOf(state) === "month" ? "Рейтинг месяца" : "Рейтинг недели";
    return o.guest ? `${name} · скрыт от гостя` : name;
  }
  // the week board's turn in the round (D-144)
  if (scene === "board") {
    const title = state?.week_board_id ? boards.find((board) => board.id === state.week_board_id)?.title : null;
    return title ? `Доска недели «${clip(title)}»` : "Доска недели";
  }
  return WALL_SCENE_LABEL[scene];
}

/** Без ответа надпись о посетителе гаснет через 20 минут, сообщение — через 30, «Подождёт» — через час (D-96, D-116). */
export const VISITOR_MS = 20 * 60_000;
export const MESSAGE_MS = 30 * 60_000;
export const WAIT_MS = 60 * 60_000;

type OverVisit = { status: string; created_at: string; answered_at?: string | null };

/**
 * What lies over every scene and until when (D-182): «Надпись о посетителе — уйдёт в 10:35»,
 * «Сообщение секретаря — уйдёт в 10:45», «Плашка «Посетитель ждёт» — уйдёт в 11:15». The visitor
 * first, as on the wall (`overlayOf`). The time is the rule's: past it — «уйдёт после ответа»,
 * because only an answer or the tick takes it down.
 */
export function overlayLine(visitor: OverVisit | null, message: OverVisit | null, now: Date): string | null {
  const until = (from: string, ms: number, late: string) => {
    const at = new Date(new Date(from).getTime() + ms);
    return at.getTime() > now.getTime() ? `уйдёт в ${tvTime(at)}` : late;
  };
  if (visitor?.status === "waiting") return `Надпись о посетителе — ${until(visitor.created_at, VISITOR_MS, "уйдёт после ответа")}`;
  if (message?.status === "waiting") return `Сообщение секретаря — ${until(message.created_at, MESSAGE_MS, "уйдёт после «Понятно»")}`;
  if (visitor?.status === "wait") return `Плашка «Посетитель ждёт» — ${until(visitor.answered_at ?? visitor.created_at, WAIT_MS, "уйдёт после ответа")}`;
  return null;
}

/** Why a person stands first among «Кого показать» (D-182). */
export type LikelyReason = "meeting" | "review" | "shown";
export const LIKELY_LABEL: Record<LikelyReason, string> = { meeting: "на встрече", review: "на приёмке", shown: "уже был" };

type LikelyEvent = {
  starts_at: string;
  ends_at?: string | null;
  author_id: string;
  cancelled_at?: string | null;
  participants: readonly { user_id: string; status: string }[];
};

/**
 * «Вероятно сейчас» (D-182): who the director is likely to put up this minute, from what the
 * phone has already read — the people of the director's meeting on right now (they are in the
 * office), the people whose work waits for the director's acceptance (the conversation is about
 * it), and whom this remote has put up today. In that order, each once, never a screen or the
 * director; four at most — one row of the keypad.
 */
export function likelyNow({
  meId,
  events,
  tasks,
  shownToday,
  people,
  now,
  limit = 4,
}: {
  meId: string | null | undefined;
  events: readonly LikelyEvent[];
  tasks: readonly { status: string; assignee_id: string | null }[];
  shownToday: readonly string[];
  people: readonly { id: string; role: string; is_active: boolean }[];
  now: Date;
  limit?: number;
}): { id: string; why: LikelyReason }[] {
  const roster = new Set(people.filter((person) => person.is_active && person.role !== "tv" && person.id !== meId).map((person) => person.id));
  const out: { id: string; why: LikelyReason }[] = [];
  const add = (id: string | null | undefined, why: LikelyReason) => {
    if (!id || !roster.has(id) || out.length >= limit || out.some((entry) => entry.id === id)) return;
    out.push({ id, why });
  };

  // the director's own meetings: made by them, or asked and not refused
  const mine = meId
    ? events.filter((event) => !event.cancelled_at && (event.author_id === meId || event.participants.some((p) => p.user_id === meId && p.status !== "declined")))
    : [];
  const meeting = runningEvent(mine, now);
  if (meeting) {
    add(meeting.author_id, "meeting");
    for (const person of meeting.participants) if (person.status !== "declined") add(person.user_id, "meeting");
  }
  for (const task of tasks) if (task.status === "pending_review") add(task.assignee_id, "review");
  for (const id of shownToday) add(id, "shown");
  return out;
}

/**
 * A person or an order lies over the screensaver for its ten minutes (D-76). A scene, a calendar
 * or rating view and a board are put up from a remote to be seen now, so the same command takes
 * the focus down — without it a press changed only what lay underneath, and the wall did not
 * move. Spread into the command: `{ ...uncover(row, now), scene }`; in the ether — nothing.
 */
export function uncover(state: TvState | null, now: Date): { mode?: "ether" } {
  return effectiveMode(state, now) === "ether" ? {} : { mode: "ether" };
}

export { keyLabels } from "@/lib/people/labels";
