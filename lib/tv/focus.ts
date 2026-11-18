import { pluralRu, SHORT_STATUS } from "@/lib/tasks/status-text";

import { tvTime } from "./clock";
import type { TvFocusEmployee, TvFocusTask, TvStoryEvent } from "./queries";
import { FOCUS_MS } from "./state";

/**
 * Дела сотрудника, стоящего на стене, — строками. Чистая функция: правило «какое
 * слово и какой цвет» проверяется тестом, а не глазами на телевизоре.
 *
 * Главное правило здесь — то же, что у ленты экрана: **негатив по именам на стену
 * не выносится** (D-45). Поэтому доработка печатается тем же «в работе», что и
 * принятая задача, слова «просрочено» нет ни при каком сроке, красного тона нет
 * вовсе — просроченный срок печатается нейтрально, датой. Кто виноват, знает
 * директор и знает адресат; коридор об этом не читает.
 */

export type FocusTone = "accent" | "ok" | "muted";

export type FocusRow = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  tone: FocusTone;
};

/** Гостю заголовка не отдают вовсе (D-33) — на стене просто «Поручение». */
const UNTITLED = "Поручение";

const STATUS_WORD: Record<string, string> = {
  sent: SHORT_STATUS.sent, // «новая»
  accepted: SHORT_STATUS.accepted, // «в работе»
  in_progress: SHORT_STATUS.in_progress, // «в работе»
  // доработка — это тоже работа: отдельного слова для неё на стене нет (D-45)
  rework: SHORT_STATUS.accepted,
  // слово ленты экрана («На проверке»), а не «на приёмке» из кабинета директора
  pending_review: "на проверке",
};

const STATUS_TONE: Record<string, FocusTone> = {
  sent: "accent",
  accepted: "ok",
  in_progress: "ok",
  rework: "ok",
  pending_review: "muted",
};

const AQTOBE_OFFSET_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Короткая дата «22 сен» для строки дела. `tvDate` из ./clock — длинная подпись для
 * футляра экрана («пятница, 18 сентября»), в строку дела она не влезает.
 */
const shortDateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Aqtobe",
  day: "numeric",
  month: "short",
});

/** Номер суток по часам Актобе — фиксированный +05:00 без перехода на летнее время. */
function dayIndex(date: Date): number {
  return Math.floor((date.getTime() + AQTOBE_OFFSET_MS) / DAY_MS);
}

/** `ru-RU` даёт «22 сент.»; на стене читают с двух метров — оставляем три буквы. */
function shortDate(date: Date): string {
  return shortDateFmt.format(date).replace(/(\p{L}{3})\p{L}*\.?$/u, "$1");
}

/**
 * Срок нейтрально: сегодня — со временем, завтра — словом, всё остальное — датой.
 * Прошедший срок попадает в ту же ветку «датой»: стена не обвиняет (D-45).
 */
function deadlineText(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diff = dayIndex(date) - dayIndex(now);
  if (diff === 0) return `сегодня ${tvTime(date)}`;
  if (diff === 1) return "завтра";
  return `до ${shortDate(date)}`;
}

export function focusRows(focus: TvFocusEmployee, now: Date): FocusRow[] {
  return focus.tasks.map((task) => ({
    id: task.id,
    title: task.title?.trim() || UNTITLED,
    status: STATUS_WORD[task.status] ?? SHORT_STATUS.accepted,
    deadline: deadlineText(task.deadline, now),
    tone: STATUS_TONE[task.status] ?? "ok",
  }));
}

/* -------------------------------------------------------------------------- */
/* Карточка v2 (D-96): три колонки по стадиям и числа над ними                */
/* -------------------------------------------------------------------------- */

export type LaneKey = "new" | "work" | "review";

export type FocusLaneRow = FocusRow & {
  /** Срок сегодня и ещё впереди — подсвечен акцентом. Прошедший не подсвечивается (D-45). */
  soon: boolean;
};

export type FocusLane = {
  key: LaneKey;
  label: string;
  tone: FocusTone;
  /** По всем открытым делам, а не по показанным. */
  count: number;
  rows: FocusLaneRow[];
  /** Сколько не влезло в колонку: «+ ещё 2». */
  more: number;
};

export type FocusCard = {
  lanes: FocusLane[];
  total: number;
  done: { count: number; titles: string[] };
};

/** Больше трёх карточек в колонке на стене не помещаются вместе с человеком и числами. */
export const PER_LANE = 3;

const LANE_OF: Record<string, LaneKey> = {
  sent: "new",
  accepted: "work",
  in_progress: "work",
  // доработка — это тоже работа (D-45)
  rework: "work",
  pending_review: "review",
};

const LANE_LABEL: Record<LaneKey, string> = { new: "Новые", work: "В работе", review: "На проверке" };
const LANE_TONE: Record<LaneKey, FocusTone> = { new: "accent", work: "ok", review: "muted" };

function soonOf(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return dayIndex(date) === dayIndex(now) && date.getTime() > now.getTime();
}

/**
 * Сотрудник на стене колонками «Новые → В работе → На проверке» (D-96). Числа приходят
 * из `tv_focus().counts` — по всем открытым делам; старая база без них — считаем по
 * показанным. Сданное сегодня — отдельно: хорошее по имени на стену можно.
 */
export function focusCard(focus: TvFocusEmployee, now: Date): FocusCard {
  const rows = focusRows(focus, now);
  const lanes = (["new", "work", "review"] as const).map((key): FocusLane => {
    const inLane = focus.tasks
      .map((task, i) => ({ task, row: rows[i] }))
      .filter(({ task }) => (LANE_OF[task.status] ?? "work") === key);
    const shown = inLane.slice(0, PER_LANE).map(({ task, row }) => ({ ...row, soon: soonOf(task.deadline, now) }));
    const count = Math.max(focus.counts?.[key] ?? inLane.length, inLane.length);
    return { key, label: LANE_LABEL[key], tone: LANE_TONE[key], count, rows: shown, more: Math.max(0, count - shown.length) };
  });
  const titles = (focus.done_today?.titles ?? []).map((title) => title?.trim() || UNTITLED);
  return {
    lanes,
    total: lanes.reduce((sum, lane) => sum + lane.count, 0),
    done: { count: focus.done_today?.count ?? 0, titles },
  };
}

/* -------------------------------------------------------------------------- */
/* Карточки v3 (D-120): дело — карточка с хронологией, слева — рейтинг          */
/* -------------------------------------------------------------------------- */

export type StoryTone = "past" | "now" | "done";

export type StoryRow = {
  key: string;
  /** «09:12» сегодня, «вт 09:12» на этой неделе, «12 сен» раньше; у текущей строки — «сейчас». */
  time: string;
  text: string;
  tone: StoryTone;
};

export type StageKey = LaneKey | "done";

export type StoryCard = {
  id: string;
  title: string;
  stage: StageKey;
  stageLabel: string;
  tone: FocusTone;
  deadline: string | null;
  soon: boolean;
  rows: StoryRow[];
};

export type StoryBoard = {
  /** Открытые дела; или открытых нет — сданное за неделю; или нет ничего. */
  mode: "open" | "done" | "empty";
  cards: StoryCard[];
  page: number;
  pages: number;
  /** Сетка страницы: до двух дел — одна строка карточек повыше, дальше — 2 × 2. */
  cols: number;
  rows: number;
  /** Открытых дел всего — по всем, а не по показанным. */
  total: number;
  /** Сколько открытых дел база не отдала (больше двенадцати). */
  hidden: number;
};

/**
 * На странице — четыре карточки, 2 × 2; больше — стена листает сама. Три колонки не
 * вмещали с двух метров ни время «ср 09:12», ни «Уточнение · ответ 11:40».
 */
export const PER_PAGE = 4;
/** Страница стоит 20 секунд: двенадцать дел — три страницы, минута на круг. */
export const PAGE_MS = 20_000;
/** Строк хронологии в карточке: в сетке 2 × 2 и в одной строке крупных карточек. */
export const ROWS_GRID = 5;
export const ROWS_SINGLE = 9;

const STAGE_LABEL: Record<StageKey, string> = { new: "Новая", work: "В работе", review: "На проверке", done: "Принята" };
const STAGE_TONE: Record<StageKey, FocusTone> = { new: "accent", work: "ok", review: "muted", done: "ok" };
/** Текущая строка хронологии: где дело сейчас. Доработка — тоже «в работе» (D-45). */
const NOW_TEXT: Record<LaneKey, string> = { new: "Ждёт принятия", work: "В работе", review: "На проверке у директора" };

/** Подряд идущие сообщения одного вида сливаются в строку «Фото ×3». */
const MERGED = new Set(["text", "photo", "voice", "director"]);

function stageOf(status: string): StageKey {
  if (status === "done") return "done";
  return LANE_OF[status] ?? "work";
}

const weekdayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Aqtobe", weekday: "short" });

/** Время события: сегодня — часами, на этой неделе — днём и часами, раньше — датой. */
export function storyTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = dayIndex(now) - dayIndex(date);
  if (days <= 0) return tvTime(date);
  if (days < 7) return `${weekdayFmt.format(date)} ${tvTime(date)}`;
  return shortDate(date);
}

/**
 * Слова события. Всё — о деле, а не о человеке: «Принята в работу», а не «Марат принял» —
 * имя стоит в шапке стены, а род по имени не угадывается. Отказа здесь нет: база его не
 * отдаёт; возврат на доработку — «Снова в работе» (D-45).
 */
function eventText(event: TvStoryEvent, task: TvFocusTask, now: Date): string {
  switch (event.k) {
    case "posted":
      return task.source === "voice" ? "Поставлена голосом" : "Поставлена";
    case "seen":
      return "Просмотрена";
    case "accepted":
      return "Принята в работу";
    case "question": {
      if (!event.ans) return "Уточнение · ждёт ответа";
      // ответ в тот же день — только часы: день уже стоит в колонке времени
      const sameDay = dayIndex(new Date(event.ans)) === dayIndex(new Date(event.at));
      return `Уточнение · ответ ${sameDay ? tvTime(new Date(event.ans)) : storyTime(event.ans, now)}`;
    }
    case "text":
      return "Сообщение";
    case "photo":
      return "Фото";
    case "voice":
      return "Голосовое";
    case "director":
      return "Сообщение директора";
    case "deadline":
      return event.cleared || !event.to ? "Срок снят" : `Новый срок · ${deadlineText(event.to, now) ?? ""}`.trim();
    case "review":
      return event.rep === "photo" ? "Сдана с фото" : event.rep === "text" ? "Сдана с отчётом" : "Сдана на проверку";
    case "again":
      return "Снова в работе";
    case "done": {
      // хорошее можно: «в срок» — только когда так и есть; опоздание не печатается (D-45)
      const onTime = task.deadline ? Date.parse(event.at) <= Date.parse(task.deadline) : false;
      return onTime ? "Принята директором · в срок" : "Принята директором";
    }
  }
}

/**
 * Хронология дела строками, не длиннее `limit` вместе с текущей строкой. Длинная история
 * сжимается: первая строка («Поставлена») остаётся, середина уходит в «ещё N событий»,
 * последние строки — на месте: на стене важно, с чего началось и что было недавно.
 */
export function storyRows(task: TvFocusTask, now: Date, limit: number): StoryRow[] {
  const story = [...(task.story ?? [])]
    .filter((event) => !Number.isNaN(Date.parse(event.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // «просмотрена» после «принята» ничего не говорит: человек открыл уведомление позже
  const accepted = story.find((event) => event.k === "accepted");
  const events = story.filter(
    (event) => !(event.k === "seen" && accepted && Date.parse(event.at) >= Date.parse(accepted.at)),
  );

  const merged: { event: TvStoryEvent; count: number }[] = [];
  for (const event of events) {
    const last = merged[merged.length - 1];
    if (last && MERGED.has(event.k) && last.event.k === event.k) {
      last.count += 1;
      last.event = event;
    } else {
      merged.push({ event, count: 1 });
    }
  }

  let rows: StoryRow[] = merged.map(({ event, count }, index) => ({
    key: `${event.k}-${index}`,
    time: storyTime(event.at, now),
    text: count > 1 ? `${eventText(event, task, now)} ×${count}` : eventText(event, task, now),
    tone: event.k === "done" ? "done" : "past",
  }));

  const stage = stageOf(task.status);
  const nowRow: StoryRow | null = stage === "done" ? null : { key: "now", time: "сейчас", text: NOW_TEXT[stage], tone: "now" };
  const room = Math.max(3, limit - (nowRow ? 1 : 0));
  if (rows.length > room) {
    const tail = rows.slice(rows.length - (room - 2));
    const hidden = rows.length - 1 - tail.length;
    rows = [
      rows[0],
      { key: "more", time: "", text: `ещё ${hidden} ${pluralRu(hidden, ["событие", "события", "событий"])}`, tone: "past" },
      ...tail,
    ];
  }
  return nowRow ? [...rows, nowRow] : rows;
}

export function storyCard(task: TvFocusTask, now: Date, limit: number): StoryCard {
  const stage = stageOf(task.status);
  const open = stage !== "done";
  return {
    id: task.id,
    title: task.title?.trim() || UNTITLED,
    stage,
    stageLabel: STAGE_LABEL[stage],
    tone: STAGE_TONE[stage],
    deadline: open ? deadlineText(task.deadline, now) : null,
    soon: open && soonOf(task.deadline, now),
    rows: storyRows(task, now, limit),
  };
}

/**
 * Дела человека карточками (D-120). Страница выбирается по часам стены от начала фокуса —
 * без своего таймера: киоск и так перерисовывается по тику часов. Открытых дел нет —
 * стена показывает сданное за неделю с его хронологией: хорошее по имени можно (D-45).
 */
export function storyBoard(focus: TvFocusEmployee, now: Date): StoryBoard {
  const open = focus.tasks;
  const list = open.length > 0 ? open : (focus.done_recent ?? []);
  const mode = open.length > 0 ? "open" : list.length > 0 ? "done" : "empty";
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const started = Date.parse(focus.expires_at) - FOCUS_MS;
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, now.getTime() - started);
  const page = Math.floor(elapsed / PAGE_MS) % pages;
  const single = list.length <= 2;
  const limit = single ? ROWS_SINGLE : ROWS_GRID;
  const counts = focus.counts;
  const total = counts ? Math.max(counts.new + counts.work + counts.review, open.length) : open.length;
  return {
    mode,
    cards: list.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((task) => storyCard(task, now, limit)),
    page,
    pages,
    cols: single ? Math.max(1, list.length) : 2,
    rows: single ? 1 : 2,
    total,
    hidden: Math.max(0, total - open.length),
  };
}

/* -------------------------------------------------------------------------- */
/* Одно дело во весь экран (D-123)                                             */
/* -------------------------------------------------------------------------- */

export type TaskStepKey = "posted" | "accepted" | "review" | "done";

export type TaskStep = {
  key: TaskStepKey;
  label: string;
  /** Когда шаг пройден: «09:12», «ср 09:12», «12 сен»; не пройден — null. */
  time: string | null;
  state: "passed" | "now" | "next";
};

const STEP_LABEL: Record<TaskStepKey, string> = {
  posted: "Поставлена",
  accepted: "Принята в работу",
  review: "Сдана на проверку",
  done: "Принята директором",
};

/** Сколько шагов пройдено по статусу: новая — один, в работе — два, на проверке — три. */
const REACHED: Record<string, number> = {
  sent: 1,
  accepted: 2,
  in_progress: 2,
  rework: 2,
  pending_review: 3,
  done: 4,
};

/**
 * Четыре шага дела крупно — «Поставлена → Принята в работу → Сдана → Принята директором»:
 * пройденные с временем, текущий подсвечен. Возврат на доработку откатывает «Сдана»: шаг
 * снова впереди, без отдельного слова (D-45). Время сдачи — последней, а не первой.
 */
export function taskSteps(task: TvFocusTask, now: Date): TaskStep[] {
  const story = [...(task.story ?? [])]
    .filter((event) => !Number.isNaN(Date.parse(event.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const first = (kind: TvStoryEvent["k"]) => story.find((event) => event.k === kind);
  const last = (kind: TvStoryEvent["k"]) => [...story].reverse().find((event) => event.k === kind);
  const reached = REACHED[task.status] ?? 2;
  const at: Record<TaskStepKey, TvStoryEvent | undefined> = {
    posted: first("posted"),
    accepted: first("accepted"),
    review: last("review"),
    done: last("done"),
  };
  return (["posted", "accepted", "review", "done"] as const).map((key, index) => {
    const passed = index < reached;
    const event = passed ? at[key] : undefined;
    return {
      key,
      label: STEP_LABEL[key],
      time: event ? storyTime(event.at, now) : null,
      state: passed ? "passed" : index === reached ? "now" : "next",
    };
  });
}

export type RatingBar = { value: number; current: boolean };

export type RatingView = {
  /** Место — только из первой пятёрки (D-45). */
  rank: number | null;
  /** Очки за неделю, только положительные. */
  points: number | null;
  /** Рост к прошлой неделе; падение на стену не выносится (D-45). */
  delta: number | null;
  /** Четыре недели очков, текущая — последней; минус рисуется нулём. */
  bars: RatingBar[] | null;
  /** Сдано за неделю и из них в срок — числом хорошего, без процента. */
  week: { done: number; onTime: number } | null;
};

/**
 * Рейтинг человека на стене (D-120). Гостю — ничего (D-33). База v2 без `rating` — как
 * было: только очки недели. Всё, что может читаться как упрёк, — место ниже пятого,
 * падение к прошлой неделе, «в срок 3 из 10» — не показывается вовсе (D-45).
 */
export function ratingView(focus: TvFocusEmployee): RatingView | null {
  if (focus.guest || focus.rating === null) return null;
  const rating = focus.rating;
  if (rating === undefined) {
    const points = focus.points_week;
    return typeof points === "number" && points > 0 ? { rank: null, points, delta: null, bars: null, week: null } : null;
  }

  const weeks = rating.points && Array.isArray(rating.weeks) && rating.weeks.length === 4 ? rating.weeks : null;
  const current = weeks ? weeks[3] : 0;
  const previous = weeks ? weeks[2] : 0;
  const points = current > 0 ? current : null;
  const delta = points !== null && current - previous > 0 ? current - previous : null;
  const clamped = weeks?.map((value) => Math.max(0, value)) ?? null;
  const bars = clamped && clamped.some((value) => value > 0) ? clamped.map((value, index) => ({ value, current: index === 3 })) : null;
  const rank = rating.points && typeof rating.rank === "number" && rating.rank >= 1 && rating.rank <= 5 ? rating.rank : null;
  const done = rating.done_week ?? 0;
  return {
    rank,
    points,
    delta,
    bars,
    week: done > 0 ? { done, onTime: Math.min(done, rating.on_time_week ?? 0) } : null,
  };
}

/** «МА» — две буквы для кружка вместо фото. */
export function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}
