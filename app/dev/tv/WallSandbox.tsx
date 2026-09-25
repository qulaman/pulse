"use client";

import { useState } from "react";

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

import { boardCase, type BoardCase } from "./boardFixtures";

export type WallCase =
  | "face"
  | "clock"
  | "team"
  | "calendar"
  | "calendar-month"
  | "calendar-empty"
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
  | "night";

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
    week: [],
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
function ratingFor(wallCase: WallCase, base: number, guest: boolean): TvRatingScene {
  if (guest) return { hidden: true, enabled: true, period: "week", top: [], riser: null, awards: [], team: { done: 0, on_time: 0, earned: 0, people: 0 } };
  const month = wallCase === "rating-month";
  const k = month ? 4 : 1;
  const people: [string, string | null, number, number, number, number][] = [
    ["Айгерим Сапарова", "Бухгалтер", 420, 60, 9, 9],
    ["Марат Ахметов", "Прораб, участок «Север»", 340, 60, 9, 8],
    ["Динара Касымова", "Снабжение", 260, -20, 6, 5],
    ["Ерлан Беков", "Менеджер", 210, 90, 4, 4],
    ["Тимур Жаксылыков", "Кладовщик", 180, 0, 3, 2],
  ];
  const top =
    wallCase === "rating-empty"
      ? []
      : people.map(([name, position, points, delta, done, onTime], index) => ({
          id: `r${index + 1}`,
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

export function WallSandbox({ wallCase, clock, guest }: { wallCase: WallCase; clock: ClockStyle; guest: boolean }) {
  // on the minute: the fixtures are built on the server and again in the browser, and
  // they have to be the same fixtures for hydration
  const [base] = useState(() => Date.now() - (Date.now() % 60_000));
  const live = useClock();
  // the night case pins the clock to 23:10 in Aqtobe; every other case runs on the real one
  const now = wallCase === "night" ? new Date(todayAt(base, 23, 10)) : live;
  const data = fixtures(base, guest);
  const lines = data.events.map((event) => lineOf(event, guest));
  const scene: TvScene =
    wallCase === "carousel"
      ? carouselScene(now, true)
      : wallCase === "clock" || wallCase === "team"
        ? wallCase
        : wallCase === "calendar" || wallCase === "calendar-month" || wallCase === "calendar-empty"
          ? "calendar"
          : wallCase.startsWith("board")
            ? "board"
            : wallCase.startsWith("rating")
              ? "rating"
              : "face";
  // the event notice needs the meeting exactly fifteen minutes out; elsewhere keep it clear
  const summary = wallCase === "event" ? data.summary : { ...data.summary, events: data.summary.events.slice(1) };

  return (
    <div className="h-dvh w-full overflow-hidden bg-bg" style={{ cursor: "default" }}>
      <TvFrame
        company="Компания"
        logoUrl={null}
        now={now}
        guest={guest}
        scene={scene}
        clock={clock}
        night={wallCase === "night"}
        offline={false}
        items={tickerItems(lines, summary)}
        speech={speechOf(lines, summary.today, now)}
        summary={summary}
        focus={focusFor(wallCase, data.focus)}
        task={taskFor(wallCase, data.focus, guest)}
        focusRemainingMs={7 * MIN}
        rating={ratingFor(wallCase, base, guest)}
        calendar={wallCase === "calendar-empty" ? { ...data.calendar, events: data.calendar.events.filter((e) => e.id === "c4") } : data.calendar}
        calendarView={wallCase === "calendar-month" ? "month" : "week"}
        board={boardFor(wallCase, base, guest)}
        overlay={overlayOf(overlayFor(wallCase, base, guest), summary.events, new Date(base))}
        sound={false}
      />
    </div>
  );
}
