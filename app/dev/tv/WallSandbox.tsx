"use client";

import { useEffect, useMemo, useState } from "react";

import { TvFrame } from "@/components/tv/TvFrame";
import { useClock } from "@/components/tv/useKiosk";
import type { TvBoard, TvBoardItem } from "@/lib/tv/board";
import { lineOf, type TvEvent } from "@/lib/tv/feed";
import { overlayOf } from "@/lib/tv/overlay";
import type {
  TvCalendar,
  TvFocusEmployee,
  TvFocusTask,
  TvOverlay,
  TvRatingScene,
  TvStoryEvent,
  TvSummary,
  TvTaskFocus,
} from "@/lib/tv/queries";
import { carouselScene, type ClockStyle, type TvScene } from "@/lib/tv/state";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

import { boardCase, boardDemo, DEMO_STEP_MS, type BoardCase, type BoardDemo } from "./boardFixtures";
import { bigTeam, momentFixture, photoFixtures, type MomentCase } from "./sceneFixtures";

export type WallCase =
  | "face"
  | "clock"
  | "team"
  | "calendar"
  | "calendar-month"
  | "calendar-empty"
  | "calendar-month-empty"
  | "board"
  | "board-two"
  | "board-pages"
  | "board-hidden"
  | BoardCase
  | "focus"
  | "focus-few"
  | "focus-many"
  | "focus-done"
  | "focus-nopoints"
  | "focus-empty"
  | "rating"
  | "rating-month"
  | "rating-empty"
  | "task"
  | "task-review"
  | "task-done"
  | "carousel"
  | "visit"
  | "wait"
  | "message"
  | "message-long"
  | "event"
  | "night"
  | "photos"
  | "team-many"
  | "visit-now"
  | "message-now"
  | MomentCase;

const MIN = 60_000;
const at = (base: number, minutes: number) => new Date(base + minutes * MIN).toISOString();

/** Today at hh:mm in Aqtobe (+05:00), relative to the moment the sandbox opened. */
function todayAt(base: number, hh: number, mm = 0, dayOffset = 0): string {
  const offset = 5 * 3_600_000;
  const day = Math.floor((base + offset) / 86_400_000) + dayOffset;
  return new Date(day * 86_400_000 - offset + (hh * 60 + mm) * MIN).toISOString();
}

/** Seven open orders of the person on the wall — every stage, voice and typed, with and without a deadline. */
function openTasks(base: number): TvFocusTask[] {
  return [
    { id: "t1", title: "Смета по кровле для нового корпуса", status: "sent", deadline: todayAt(base, 18), source: "voice" },
    { id: "t2", title: "Забрать пропуска на объект", status: "sent", deadline: todayAt(base, 12, 0, 1), source: "voice" },
    { id: "t3", title: "Бетон на третий этаж", status: "accepted", deadline: todayAt(base, 18, 0, 3), source: "typed" },
    { id: "t4", title: "Замер окон", status: "rework", deadline: todayAt(base, 10, 0, 1), source: "voice" },
    { id: "t5", title: "Договор с поставщиком арматуры: согласовать объёмы на октябрь", status: "in_progress", deadline: null, source: "voice" },
    { id: "t6", title: "Фотоотчёт по фасаду", status: "accepted", deadline: todayAt(base, 12, 0, 5), source: "typed" },
    { id: "t7", title: "Акт по забору", status: "pending_review", deadline: null, source: "voice" },
  ];
}

/** What the director accepted this week — the wall shows it when nothing is open. */
function doneTasks(base: number): TvFocusTask[] {
  return [
    { id: "d1", title: "Сверка с бухгалтерией", status: "done", deadline: todayAt(base, 18), source: "voice" },
    { id: "d2", title: "Вывоз мусора со склада", status: "done", deadline: null, source: "typed" },
    { id: "d3", title: "Пропуска для субподрядчика", status: "done", deadline: todayAt(base, 12, 0, -3), source: "voice" },
  ];
}

/**
 * The life of an order on fixtures (D-120): from «Поставлена» to its stage, on different
 * days, with questions, photos and a new deadline — every kind of row and the squeeze.
 */
function storyOf(status: string, base: number, id: string): TvStoryEvent[] {
  const seed = Number(id.slice(1)) || 1;
  const day = -((seed % 3) + (status === "sent" ? 0 : 1));
  const t = (hh: number, mm = 0) => todayAt(base, hh, mm, day);
  const story: TvStoryEvent[] = [{ k: "posted", at: t(9, 10 + seed) }];
  if (status === "sent") {
    if (seed % 2) story.push({ k: "seen", at: t(9, 14 + seed) });
    return story;
  }
  story.push({ k: "seen", at: t(9, 12 + seed) }, { k: "accepted", at: t(9, 25 + seed) });
  if (seed % 2 === 0) story.push({ k: "question", at: t(11, 5), ans: t(11, 40) });
  if (seed % 3 === 0) story.push({ k: "deadline", at: t(12, 0), to: todayAt(base, 18, 0, 3) });
  if (seed !== 3) story.push({ k: "photo", at: t(14, 20) }, { k: "photo", at: t(14, 22) });
  if (seed % 4 === 1) story.push({ k: "director", at: t(15, 0) }, { k: "text", at: t(15, 30) }, { k: "voice", at: t(16, 5) });
  if (status === "accepted" || status === "in_progress") return story;
  story.push({ k: "review", at: t(17, 10), rep: seed % 2 ? "photo" : "text" });
  if (status === "rework") return [...story, { k: "again", at: t(17, 45) }];
  if (status === "pending_review") return story;
  return [...story, { k: "done", at: t(18, 5) }];
}

/** The company's last seven days ending today in Aqtobe, `done` per day — as `tv_summary.week` sends them. */
function weekOf(base: number, done: readonly number[]): { day: string; done: number }[] {
  const offset = 5 * 3_600_000;
  const today = Math.floor((base + offset) / 86_400_000);
  return done.map((count, i) => ({ day: new Date((today - (done.length - 1 - i)) * 86_400_000).toISOString().slice(0, 10), done: count }));
}

function fixtures(base: number, guest: boolean) {
  const name = (full: string) => (guest ? full.split(" ")[0] : full);
  const events: TvEvent[] = [
    { kind: "task_done", name: "Айгерим Сапарова", title: "Сверка с бухгалтерией", ago: 4 },
    { kind: "task_accepted", name: "Марат Ахметов", title: "Бетон на третий этаж", ago: 11 },
    { kind: "announcement", name: "Директор", title: "В пятницу короткий день — до 16:00", ago: 35 },
    { kind: "task_sent", name: "Ерлан Беков", title: "Замер окон на объекте «Север»", ago: 52 },
  ].map((e, i) => ({
    id: `ev${i}`,
    kind: e.kind as TvEvent["kind"],
    created_at: at(base, -e.ago),
    payload: { name: e.name, title: e.title, amount: null },
    payload_guest: { name: e.name.split(" ")[0], title: null, amount: null },
  }));

  const team = [
    ["Марат Ахметов", 4],
    ["Айгерим Сапарова", 2],
    ["Ерлан Беков", 3],
    ["Динара Касымова", 0],
    ["Айгуль Нурланова", 1],
    ["Ерлан Досанов", 2],
    ["Сауле Ибраева", 0],
    ["Тимур Жаксылыков", 5],
    ["Асель Муратова", 1],
    ["Нурлан Серикбаев", 2],
  ] as const;

  const summary: TvSummary = {
    guest,
    points_enabled: true,
    now: new Date(base).toISOString(),
    pulse: [0, 0, 0, 0, 0, 0, 0, 1, 4, 9, 12, 8, 5, 7, 11, 6, 3, 2, 1, 0, 0, 0, 0, 0],
    counts: { overdue: 1, declined: 0, review: 2, questions: 1 },
    today: { sent: 14, done: 9, in_work: 21 },
    rating: team.slice(0, 5).map(([n], i) => ({ name: name(n), points: guest ? null : 60 - i * 7, rank: i + 1 })),
    load: team.map(([n, active]) => ({ name: name(n), active, overdue: 0 })),
    week: weekOf(base, [3, 5, 0, 4, 6, 2, 9]),
    merch: [],
    events: [
      { id: "e-soon", title: guest ? null : "Планёрка", starts_at: at(base, 15), location: guest ? null : "Переговорная", people: 8 },
      { id: "e-later", title: guest ? null : "Приёмка объекта", starts_at: todayAt(base, 17, 30), location: null, people: 4 },
    ],
  };

  const focus: TvFocusEmployee = {
    mode: "employee",
    guest,
    expires_at: at(base, 7),
    employee: { id: "p1", name: name("Марат Ахметов"), position: "Прораб, участок «Север»", avatar_url: null },
    tasks: openTasks(base).map((t) => ({ ...t, story: storyOf(t.status, base, t.id), title: guest ? null : t.title })),
    counts: { new: 2, work: 4, review: 1 },
    done_today: { count: 2, titles: guest ? [null, null] : ["Сверка с бухгалтерией", "Вывоз мусора"] },
    points_week: guest ? null : 340,
    rating: guest ? null : { points: true, rank: 2, weeks: [180, 240, 280, 340], done_week: 9, on_time_week: 8 },
    done_recent: doneTasks(base).map((t) => ({ ...t, story: storyOf("done", base, t.id), title: guest ? null : t.title })),
  };

  const calendar: TvCalendar = {
    from: todayAt(base, 0),
    days: 7,
    events: [
      { id: "c1", title: "Планёрка", starts_at: todayAt(base, 9), ends_at: todayAt(base, 9, 30), location: "Переговорная", everyone: true, people: 24, going: 20 },
      { id: "c2", title: "Созвон с поставщиком", starts_at: at(base, -20), ends_at: at(base, 25), location: null, everyone: false, people: 3, going: 3 },
      { id: "c3", title: "Приёмка объекта «Север»", starts_at: todayAt(base, 17, 30), ends_at: null, location: "Объект", everyone: false, people: 4, going: 2 },
      { id: "c4", title: "Выезд на объект «Юг»", starts_at: todayAt(base, 10, 0, 2), ends_at: null, location: null, everyone: false, people: 5, going: 1 },
      { id: "c5", title: "Планёрка", starts_at: todayAt(base, 9, 0, 3), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 0 },
      { id: "c6", title: "Встреча с заказчиком по второму корпусу", starts_at: todayAt(base, 15, 0, 3), ends_at: todayAt(base, 16, 30, 3), location: "Кабинет директора", everyone: false, people: 3, going: 2 },
      { id: "c7", title: "Корпоратив", starts_at: todayAt(base, 19, 0, 5), ends_at: null, location: "Ресторан", everyone: true, people: 30, going: 12 },
      { id: "c8", title: "Обучение по охране труда", starts_at: todayAt(base, 11, 0, 1), ends_at: todayAt(base, 13, 0, 1), location: "Учебный класс", everyone: false, people: 12, going: 8 },
      { id: "c9", title: "Планёрка", starts_at: todayAt(base, 9, 0, 7), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 0 },
      { id: "c10", title: "Приёмка второго корпуса", starts_at: todayAt(base, 14, 0, 9), ends_at: null, location: "Объект", everyone: false, people: 6, going: 0 },
      { id: "c11", title: "Совет директоров", starts_at: todayAt(base, 16, 0, 12), ends_at: null, location: null, everyone: false, people: 4, going: 0 },
      { id: "c12", title: "Выезд к заказчику", starts_at: todayAt(base, 10, 0, -6), ends_at: null, location: null, everyone: false, people: 3, going: 3 },
      { id: "c13", title: "Планёрка", starts_at: todayAt(base, 9, 0, -7), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 20 },
      { id: "c14", title: "День рождения Асель", starts_at: todayAt(base, 17, 0, -3), ends_at: null, location: "Кухня", everyone: true, people: 30, going: 25 },
    ].map((e) => (guest ? { ...e, title: null, location: null } : e)),
  };

  return { events, summary, focus, calendar };
}

const BOARD_POINTS = [
  "Отгрузка Казхром до пятницы",
  "Новый прайс на мерч — согласовать с бухгалтерией",
  "Отпуск бухгалтера в октябре",
  "Ремонт склада: смета к среде",
  "Кого берём на выставку в Алматы",
  "Проверить договор аренды второго офиса",
  "Закупка ноутбуков для отдела продаж",
  "Тренинг по технике безопасности",
  "Итоги квартала — к пятнице",
  "Новые визитки для команды",
  "Встреча с банком по кредитной линии",
  "Корпоратив: дата и место",
  "Перевести склад на новую систему учёта",
  "Обновить сайт компании",
  "Сверка с поставщиками бетона",
  "План продаж на ноябрь",
  "Парковка для гостей",
  "Отчёт инвестору",
  "Кондиционеры в переговорной",
  "Стажёры на зиму",
];

/** The board of D-102 on fixtures: five points (two ticked, one handed over, one just said), eleven, twenty. */
function boardFor(wallCase: WallCase, base: number, guest: boolean): TvBoard | null {
  const v2 = boardCase(wallCase, base, guest);
  if (v2) return v2;
  if (wallCase === "board-hidden") return { board: null, hidden: true };
  const count = wallCase === "board-pages" ? 20 : wallCase === "board-two" ? 11 : wallCase === "board" ? 5 : 0;
  if (count === 0) return null;
  const items: TvBoardItem[] = BOARD_POINTS.slice(0, count).map((text, index) => ({
    id: `p${index + 1}`,
    text,
    done: index === 2 || index === 5,
    created_at: index === count - 1 ? new Date(base).toISOString() : at(base, -60 + index),
    assignee: guest ? null : index === 0 ? "Марат" : index === 3 ? "Асель" : null,
    handed_done: index === 3,
    children: [],
  }));
  return {
    hidden: false,
    board: {
      id: "b1",
      title: "Планёрка · понедельник",
      total: items.length,
      done: items.filter((item) => item.done).length,
      updated_at: new Date(base).toISOString(),
      view: "list",
      focus: null,
      items,
    },
  };
}

function overlayFor(wallCase: WallCase, base: number, guest: boolean): TvOverlay {
  const note = guest ? null : "Иванов, по поставкам бетона";
  const none = { visit: null, waiting: 0, message: null, messages: 0 };
  // the first minute of a visitor and of a message: over the whole wall (D-185); the cases below are older — a plate
  if (wallCase === "visit-now") {
    return { ...none, visit: { id: "v2", status: "waiting", note, created_at: at(base, 0), answered_at: null }, waiting: 1 };
  }
  if (wallCase === "message-now") {
    return { ...none, message: { id: "m2", note: guest ? null : "Звонил Ахметов, перезвоните", created_at: at(base, 0) }, messages: 1 };
  }
  if (wallCase === "visit") {
    return { ...none, visit: { id: "v1", status: "waiting", note, created_at: at(base, -3), answered_at: null }, waiting: 1 };
  }
  if (wallCase === "wait") {
    return { ...none, visit: { id: "v1", status: "wait", note, created_at: at(base, -9), answered_at: at(base, -2) }, waiting: 1 };
  }
  if (wallCase === "message" || wallCase === "message-long") {
    const words =
      wallCase === "message"
        ? "Звонил Ахметов, перезвоните"
        : "Через 20 минут приедет проверка из акимата — нужны документы по тендеру и договор поставки";
    return { ...none, message: { id: "m1", note: guest ? null : words, created_at: at(base, -2) }, messages: wallCase === "message" ? 1 : 2 };
  }
  return none;
}

/** The person on the wall per case (D-120): seven orders, two, twelve of fifteen, only the week done, points off, nothing. */
function focusFor(wallCase: WallCase, focus: TvFocusEmployee): TvFocusEmployee | null {
  const none = { tasks: [], counts: { new: 0, work: 0, review: 0 } };
  switch (wallCase) {
    case "focus":
      return focus;
    case "focus-few":
      return { ...focus, tasks: focus.tasks.filter((t) => t.id === "t4" || t.id === "t7"), counts: { new: 0, work: 1, review: 1 } };
    case "focus-many": {
      const more = Array.from({ length: 5 }, (_, i) => ({ ...focus.tasks[2 + (i % 4)], id: `m${i}` }));
      return { ...focus, tasks: [...focus.tasks, ...more], counts: { new: 3, work: 9, review: 3 } };
    }
    case "focus-done":
      return { ...focus, ...none };
    case "focus-nopoints":
      return focus.rating ? { ...focus, points_week: null, rating: { ...focus.rating, points: false, rank: null, weeks: null } } : focus;
    case "focus-empty":
      return { ...focus, ...none, done_recent: [], done_today: { count: 0, titles: [] } };
    default:
      return null;
  }
}

/** The rating scene on fixtures (D-123): a week with five on the podium, a month, nobody yet; a guest hides it. */
function ratingFor(wallCase: WallCase, base: number, guest: boolean, reorder = false): TvRatingScene {
  if (guest) return { hidden: true, enabled: true, period: "week", top: [], riser: null, awards: [], team: { done: 0, on_time: 0, earned: 0, people: 0 } };
  const month = wallCase === "rating-month";
  const k = month ? 4 : 1;
  const people: [string, string | null, number, number, number, number, string][] = [
    ["Айгерим Сапарова", "Бухгалтер", 420, 60, 9, 9, "r1"],
    ["Марат Ахметов", "Прораб, участок «Север»", 340, 60, 9, 8, "r2"],
    ["Динара Касымова", "Снабжение", 260, -20, 6, 5, "r3"],
    ["Ерлан Беков", "Менеджер", 210, 90, 4, 4, "r4"],
    ["Тимур Жаксылыков", "Кладовщик", 180, 0, 3, 2, "r5"],
  ];
  // the walk's `rating-reorder`: an award lifts Ерлан from fourth to second, the places shuffle
  if (reorder) {
    people[3] = ["Ерлан Беков", "Менеджер", 350, 230, 5, 5, "r4"];
    people.sort((a, b) => b[2] - a[2]);
  }
  const top =
    wallCase === "rating-empty"
      ? []
      : people.map(([name, position, points, delta, done, onTime, id], index) => ({
          id,
          name,
          position,
          avatar_url: null,
          points: points * k,
          rank: index + 1,
          delta: delta * k,
          done: done * k,
          on_time: onTime * k,
        }));
  return {
    hidden: false,
    enabled: true,
    period: month ? "month" : "week",
    top,
    riser: wallCase === "rating-empty" ? null : { id: "r4", name: "Ерлан Беков", avatar_url: null, delta: 90 * k, points: 210 * k },
    awards:
      wallCase === "rating-empty"
        ? []
        : [
            { name: "Марат Ахметов", amount: 50, reason: "Сдал объект «Север» на день раньше", at: at(base, -35) },
            { name: "Айгерим Сапарова", amount: 30, reason: "Закрыла сверку с поставщиками", at: todayAt(base, 11, 20, -1) },
            { name: "Ерлан Беков", amount: 40, reason: "Новый клиент — договор на год", at: todayAt(base, 16, 5, -3) },
          ],
    team: { done: 48 * k, on_time: 41 * k, earned: 1240 * k, people: 9 },
  };
}

/** «Команда», «Сегодня» and the band of a company of three: one task given and not yet taken (not «в работе»), two done this week, one with points. */
function smallSummary(summary: TvSummary, guest: boolean, base: number): TvSummary {
  const name = (full: string) => (guest ? full.split(" ")[0] : full);
  return {
    ...summary,
    today: { sent: 0, done: 0, in_work: 0 },
    week: weekOf(base, [0, 0, 1, 0, 0, 1, 0]),
    pulse: [],
    events: [],
    rating: [{ name: name("Айболат Нурланов"), points: guest ? null : 15, rank: 1 }],
    load: [
      { name: name("Айболат Нурланов"), active: 0, overdue: 0, done_today: 0, done_week: 2, position: guest ? null : "Прораб, участок «Север»" },
      { name: name("Ербол Сотрудник"), active: 0, overdue: 0, done_today: 0, done_week: 0, position: guest ? null : "Сотрудник" },
      { name: name("Юля Смирнова"), active: 0, overdue: 0, done_today: 0, done_week: 0, position: guest ? null : "Секретарь" },
    ],
  };
}

/** The rating of the company of three: one leader with points, the week's two tasks. */
function smallRating(scene: TvRatingScene): TvRatingScene {
  if (scene.hidden) return scene;
  return { ...scene, top: scene.top.slice(0, 1).map((row) => ({ ...row, name: "Айболат Нурланов", points: 15, delta: 15 })), riser: null, team: { done: 2, on_time: 2, earned: 15, people: 3 } };
}

/** One order on the whole wall (D-123): in work after a return, on review, accepted. */
function taskFor(wallCase: WallCase, focus: TvFocusEmployee, guest: boolean): TvTaskFocus | null {
  const source =
    wallCase === "task"
      ? focus.tasks.find((t) => t.id === "t4")
      : wallCase === "task-review"
        ? focus.tasks.find((t) => t.id === "t7")
        : wallCase === "task-done"
          ? focus.done_recent?.find((t) => t.id === "d1")
          : undefined;
  if (!source) return null;
  return {
    mode: "task",
    guest,
    expires_at: focus.expires_at,
    employee: focus.employee,
    task: {
      ...source,
      body: guest ? null : "Замерить все окна на третьем этаже корпуса «Север», размеры — в общую таблицу, фото каждого проёма.",
      counts: { photos: 3, voices: 1, texts: 4, questions: 1 },
    },
  };
}

/** The sandbox demo's step: a tick every `every` ms while a demo is on. */
function useDemoStep(on: boolean, every = DEMO_STEP_MS): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setStep((s) => s + 1), every);
    return () => clearInterval(timer);
  }, [on, every]);
  return step;
}

/**
 * `&walk=…`: the wall walks through its states by itself, one step every `&every=` ms (4 s) — for
 * filming scene changes, notices coming and going, the night waking up. `&lag=` ms keeps the new
 * step's scene data away for a while, the way the kiosk fetches it after `tv_state` flips.
 */
export const WALKS = {
  scenes: ["face", "clock", "team", "calendar", "calendar-month", "rating", "rating-month", "photos", "moment-points", "focus", "task", "board-branches", "face"],
  overlay: ["face", "visit-now", "visit", "face", "message-now", "message", "wait", "message-long", "event", "focus", "visit-now", "focus"],
  night: ["night", "face", "night", "focus", "night"],
  focus: ["focus", "focus-few", "focus", "focus-done", "task", "task-review", "task-done"],
  rating: ["rating", "rating-reorder", "rating", "rating-month"],
  team: ["team", "team-reorder", "team"],
} as const satisfies Record<string, readonly (WallCase | "rating-reorder" | "team-reorder")[]>;
export type WallWalk = keyof typeof WALKS;
type WalkCase = WallCase | "rating-reorder" | "team-reorder";

/** True `lag` ms after `key` last changed: the new step's data «arrives». */
function useArrived(key: string, lag: number): boolean {
  const [arrived, setArrived] = useState({ key, at: lag <= 0 });
  if (arrived.key !== key) setArrived({ key, at: lag <= 0 });
  useEffect(() => {
    if (lag <= 0) return;
    const timer = setTimeout(() => setArrived({ key, at: true }), lag);
    return () => clearTimeout(timer);
  }, [key, lag]);
  return arrived.key === key && arrived.at;
}

/** `&tick=1`: news every 3 s — the ticker takes new words on the move (D-121, wave 3). */
const TICK_MS = 3_000;
function newsOf(base: number, count: number): TvEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `news${count - i}`,
    kind: "task_done" as const,
    created_at: at(base, 0),
    payload: { name: "Асель Муратова", title: `Новое дело №${count - i}`, amount: null },
    payload_guest: { name: "Асель", title: null, amount: null },
  }));
}

/** A made-up client logo for `&logo=1`: a gold triangle mark and a word, like a real company's. */
const SANDBOX_LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="120" height="120" rx="18" fill="#e9a23b"/><path d="M60 24 L96 92 H24 Z" fill="#1b1b1b"/><text x="132" y="78" font-family="sans-serif" font-size="44" font-weight="700" fill="#e9a23b">АРЛ</text></svg>',
)}`;

export function WallSandbox({
  wallCase,
  clock,
  guest,
  demo = null,
  tick = false,
  walk = null,
  every = 4_000,
  lag = 0,
  logo = false,
  at: pinned = null,
  zero = false,
  small = false,
}: {
  wallCase: WallCase;
  clock: ClockStyle;
  guest: boolean;
  demo?: BoardDemo | null;
  tick?: boolean;
  walk?: string | null;
  every?: number;
  lag?: number;
  logo?: boolean;
  /** «15:20»: the wall's clock pinned to that time of today in Aqtobe. */
  at?: string | null;
  /** A day with nothing done yet: «Сегодня» greets instead of a number. */
  zero?: boolean;
  /**
   * A company of three with one task in work and one person with points (D-194): the scenes must look finished
   * with this little — three cards in «Команда», a leader alone in «Рейтинг», a greeting on «Сегодня».
   */
  small?: boolean;
}) {
  // on the minute: the fixtures are built on the server and again in the browser, and
  // they have to be the same fixtures for hydration
  const [base] = useState(() => Date.now() - (Date.now() % 60_000));
  const live = useClock();
  const step = useDemoStep(demo !== null);
  const news = useDemoStep(tick, TICK_MS);
  const route: readonly WalkCase[] | null = walk && walk in WALKS ? WALKS[walk as WallWalk] : null;
  const walkStep = useDemoStep(route !== null, every);
  const walked: WalkCase = route ? route[walkStep % route.length] : wallCase;
  const reorder = walked === "rating-reorder";
  // the walk's `team-reorder`: Динара takes six orders, Тимур hands four in — the tiles re-sort by load
  const busier = walked === "team-reorder";
  const current: WallCase = reorder ? "rating" : busier ? "team" : walked;
  const arrived = useArrived(`${walkStep}`, route ? lag : 0);
  // the night case pins the clock to 23:10 in Aqtobe; every other case runs on the real one
  const [pinHour, pinMinute] = pinned ? pinned.split(":").map(Number) : [null, null];
  const now =
    current === "night" || walk === "night"
      ? new Date(todayAt(base, 23, 10))
      : pinHour !== null
        ? new Date(new Date(todayAt(base, pinHour, pinMinute ?? 0)).getTime() + (live.getTime() % 60_000))
        : live;
  // the scene data keeps its identity between renders, as query results do on the kiosk (TvFrame holds a scene by it)
  const data = useMemo(() => fixtures(base, guest), [base, guest]);
  const lines = [...newsOf(base, news), ...data.events].map((event) => lineOf(event, guest));
  // a person or an order still on its way: the kiosk keeps the ether scene it had (its row names the mode,
  // the middle waits for `tv_focus()`), so the walk keeps the previous step's scene
  const before = route ? route[(walkStep + route.length - 1) % route.length] : wallCase;
  const sceneCase: WallCase =
    !arrived && (current.startsWith("focus") || current.startsWith("task")) ? (before === "rating-reorder" ? "rating" : before === "team-reorder" ? "team" : before) : current;
  const scene: TvScene =
    sceneCase === "carousel"
      ? carouselScene(now, true)
      : sceneCase === "clock" || sceneCase === "team" || sceneCase === "photos"
        ? sceneCase
        : sceneCase === "team-many"
          ? "team"
        : sceneCase === "calendar" || sceneCase === "calendar-month" || sceneCase === "calendar-empty" || sceneCase === "calendar-month-empty"
          ? "calendar"
          : sceneCase.startsWith("board")
            ? "board"
            : sceneCase.startsWith("rating")
              ? "rating"
              : "face";
  // the scene under a pending person keeps its data; a new scene waits for its own
  const hasData = arrived || sceneCase !== current;
  const boardData = useMemo(() => (hasData ? boardFor(sceneCase, base, guest) : null), [hasData, sceneCase, base, guest]);
  const board = useMemo(() => (boardData && demo ? boardDemo(boardData, demo, step) : boardData), [boardData, demo, step]);
  const rating = useMemo(
    () => (hasData && scene === "rating" ? (small ? smallRating(ratingFor(sceneCase, base, guest, reorder)) : ratingFor(sceneCase, base, guest, reorder)) : null),
    [hasData, scene, sceneCase, base, guest, reorder, small],
  );
  const calendar = useMemo(
    () =>
      !hasData
        ? null
        : sceneCase === "calendar-empty"
          ? { ...data.calendar, events: data.calendar.events.filter((e) => e.id === "c4") }
          : sceneCase === "calendar-month-empty"
            ? { ...data.calendar, events: [] }
            : data.calendar,
    [hasData, sceneCase, data],
  );
  // the event notice needs the meeting exactly fifteen minutes out; elsewhere keep it clear
  const shown = current === "event" ? data.summary : { ...data.summary, events: data.summary.events.slice(1) };
  const shownToday = zero ? { ...shown, today: { sent: shown.today.sent, done: 0, in_work: shown.today.in_work }, week: [] } : shown;
  const counted = news > 0 ? { ...shownToday, today: { ...shownToday.today, sent: shownToday.today.sent + news, done: shownToday.today.done + news } } : shownToday;
  const many = current === "team-many" ? bigTeam(counted, guest) : counted;
  const photos = useMemo(() => photoFixtures(base, guest), [base, guest]);
  const summary = small
    ? smallSummary(counted, guest, base)
    : busier
    ? {
        ...counted,
        load: counted.load.map((row) =>
          row.name.startsWith("Динара") ? { ...row, active: 6 } : row.name.startsWith("Тимур") ? { ...row, active: 1 } : row,
        ),
      }
    : many;

  return (
    <div className="h-dvh w-full overflow-hidden bg-bg" style={{ cursor: "default" }} data-demo-step={demo ? step : route ? walkStep : undefined}>
      <TvFrame
        company="Компания"
        logoUrl={logo ? SANDBOX_LOGO : null}
        now={now}
        guest={guest}
        scene={scene}
        clock={clock}
        night={current === "night"}
        offline={false}
        items={tickerItems(lines, summary, now)}
        speech={speechOf(lines, summary.today, now)}
        summary={summary}
        focus={arrived ? focusFor(current, data.focus) : null}
        task={arrived ? taskFor(current, data.focus, guest) : null}
        focusRemainingMs={7 * MIN}
        rating={rating}
        calendar={calendar}
        calendarView={sceneCase === "calendar-month" || sceneCase === "calendar-month-empty" ? "month" : "week"}
        board={board}
        overlay={overlayOf(overlayFor(current, base, guest), summary.events, new Date(base))}
        sound={false}
        photos={guest ? [] : photos}
        taskPhotos={guest ? [] : photos.slice(0, 3)}
        moment={momentFixture(current, base)}
      />
    </div>
  );
}
