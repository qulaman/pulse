import type {
  TvCalendar,
  TvFocusEmployee,
  TvFocusTask,
  TvRatingScene,
  TvStoryEvent,
  TvSummary,
  TvTaskFocus,
} from "@/lib/tv/queries";
import type { TvAnnouncementData, TvDayResultData, TvPaceData, TvWeekResultData } from "@/lib/tv/results";

/**
 * Fixtures of the wall's scenes (D-182) for /dev/tv-scenes: every scene SCENES draws, on its own,
 * with a guest's mask applied the way the database applies it (no surnames, titles or points, D-33).
 */

const MIN = 60_000;
const at = (base: number, minutes: number) => new Date(base + minutes * MIN).toISOString();

/** Today at hh:mm in Aqtobe (+05:00), relative to the moment the sandbox opened. */
export function todayAt(base: number, hh: number, mm = 0, dayOffset = 0): string {
  const offset = 5 * 3_600_000;
  const day = Math.floor((base + offset) / 86_400_000) + dayOffset;
  return new Date(day * 86_400_000 - offset + (hh * 60 + mm) * MIN).toISOString();
}

const PEOPLE = [
  "Марат Ахметов",
  "Айгерим Сапарова",
  "Ерлан Беков",
  "Динара Касымова",
  "Айгуль Нурланова",
  "Ерлан Досанов",
  "Сауле Ибраева",
  "Тимур Жаксылыков",
  "Асель Муратова",
  "Нурлан Серикбаев",
  "Нурсултан Абдрахманов",
  "Жанар Тулегенова",
  "Бауыржан Оспанов",
  "Гульнара Сейткали",
  "Дамир Кенжебаев",
  "Мадина Есенова",
  "Арман Жумабаев",
  "Камила Ибрагимова",
  "Олжас Бекмуханов",
  "Алия Нуртазина",
  "Руслан Ахмедов",
  "Светлана Ким",
  "Даурен Смагулов",
  "Индира Каримова",
  "Ерболат Тасмагамбетов",
  "Айжан Сулейменова",
  "Канат Мусин",
  "Зарина Абенова",
  "Максат Ергалиев",
  "Лаура Ахметжанова",
  "Санжар Утепов",
  "Асем Бекова",
  "Талгат Нурмаганбетов",
  "Гаухар Жунусова",
  "Ильяс Рахимов",
  "Меруерт Кайыргали",
  "Нурлыбек Сагындыков",
  "Айсулу Темирова",
  "Бекзат Аманов",
  "Динмухамед Ержанов",
];

const firstName = (full: string) => full.split(" ")[0];

export function teamSummary(base: number, guest: boolean, count: number): TvSummary {
  const people = PEOPLE.slice(0, count);
  const name = (full: string) => (guest ? firstName(full) : full);
  return {
    guest,
    points_enabled: true,
    now: new Date(base).toISOString(),
    pulse: [],
    counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
    today: { sent: 14, done: 9, in_work: 21 },
    // the five by points; the guest gets none (the mask in SQL)
    rating: [1, 2, 0, 7, 4].map((index, i) => ({ name: name(people[index] ?? people[0]), points: guest ? null : 60 - i * 7, rank: i + 1 })),
    load: people.map((full, index) => ({
      name: name(full),
      active: (index * 7) % 5,
      overdue: index % 4 === 0 ? 1 : 0,
      done_today: [2, 0, 3, 1, 0, 0, 1, 0, 4, 0][index % 10],
    })),
    week: [],
    merch: [],
    events: [],
  };
}

/** Open orders of the person on the wall — every stage, voice and typed, with and without a deadline. */
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

/** The life of an order (D-120): from «Поставлена» to its stage, with questions, photos and a new deadline. */
export function storyOf(status: string, base: number, id: string): TvStoryEvent[] {
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

export type FocusCase = "focus" | "focus-few" | "focus-many" | "focus-clear" | "focus-empty";

export function focusFixture(base: number, guest: boolean, kind: FocusCase): TvFocusEmployee {
  const all = openTasks(base);
  const many = [
    ...all,
    ...all.map((t) => ({ ...t, id: `${t.id}x`, title: `${t.title} (второй участок)` })),
  ].slice(0, 12);
  const tasks = kind === "focus-few" ? all.slice(2, 4) : kind === "focus-many" ? many : kind === "focus-clear" || kind === "focus-empty" ? [] : all;
  const counts =
    kind === "focus-clear" || kind === "focus-empty"
      ? { new: 0, work: 0, review: 0 }
      : kind === "focus-few"
        ? { new: 0, work: 2, review: 0 }
        : kind === "focus-many"
          ? { new: 3, work: 9, review: 3 }
          : { new: 2, work: 4, review: 1 };
  return {
    mode: "employee",
    guest,
    expires_at: at(base, 7),
    employee: { id: "p1", name: guest ? "Марат" : "Марат Ахметов", position: "Прораб, участок «Север»", avatar_url: null },
    tasks: tasks.map((t) => ({ ...t, story: storyOf(t.status, base, t.id.replace("x", "")), title: guest ? null : t.title })),
    counts,
    done_today: kind === "focus-empty" ? { count: 0, titles: [] } : { count: 2, titles: guest ? [null, null] : ["Сверка с бухгалтерией", "Вывоз мусора"] },
    points_week: guest ? null : 340,
    rating: guest ? null : { points: true, rank: 2, weeks: [180, 240, 280, 340], done_week: kind === "focus-empty" ? 0 : 9, on_time_week: 8 },
    done_recent: [],
  };
}

export type TaskCase = "task" | "task-new" | "task-review" | "task-done";

export function taskFixture(base: number, guest: boolean, kind: TaskCase): TvTaskFocus {
  const status = kind === "task-new" ? "sent" : kind === "task-review" ? "pending_review" : kind === "task-done" ? "done" : "rework";
  return {
    mode: "task",
    guest,
    expires_at: at(base, 7),
    employee: { id: "p1", name: guest ? "Марат" : "Марат Ахметов", position: "Прораб, участок «Север»", avatar_url: null },
    task: {
      id: "t4",
      title: guest ? null : "Замер окон",
      status,
      deadline: todayAt(base, 10, 0, 1),
      source: "voice",
      story: storyOf(status === "rework" ? "rework" : status, base, "t4").concat(
        status === "rework" || status === "pending_review" ? [{ k: "voice", at: todayAt(base, 9, 5) }] : [],
      ),
      body: guest ? null : "Замерить все окна на третьем этаже корпуса «Север», размеры — в общую таблицу, фото каждого проёма.",
      created_at: todayAt(base, 9, 14, -2),
      counts: { photos: 3, voices: 1, texts: 4, questions: kind === "task-new" ? 0 : 1 },
    },
  };
}

export function calendarFixture(base: number, guest: boolean, kind: "week" | "month" | "empty"): TvCalendar {
  const events =
    kind === "empty"
      ? [{ id: "c4", title: "Выезд на объект «Юг»", starts_at: todayAt(base, 10, 0, 2), ends_at: null, location: null, everyone: false, people: 5, going: 1 }]
      : [
          { id: "c1", title: "Планёрка", starts_at: todayAt(base, 9), ends_at: todayAt(base, 9, 30), location: "Переговорная", everyone: true, people: 24, going: 20 },
          { id: "c2", title: "Созвон с поставщиком", starts_at: at(base, -20), ends_at: at(base, 25), location: null, everyone: false, people: 3, going: 3 },
          { id: "c3", title: "Приёмка объекта «Север»", starts_at: todayAt(base, 17, 30), ends_at: null, location: "Объект", everyone: false, people: 4, going: 2 },
          { id: "c4", title: "Выезд на объект «Юг»", starts_at: todayAt(base, 10, 0, 2), ends_at: null, location: null, everyone: false, people: 5, going: 1 },
          { id: "c5", title: "Планёрка", starts_at: todayAt(base, 9, 0, 3), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 0 },
          { id: "c6", title: "Встреча с заказчиком по второму корпусу", starts_at: todayAt(base, 15, 0, 3), ends_at: todayAt(base, 16, 30, 3), location: "Кабинет директора", everyone: false, people: 3, going: 2 },
          { id: "c6b", title: "Подписание актов", starts_at: todayAt(base, 17, 0, 3), ends_at: null, location: null, everyone: false, people: 2, going: 0 },
          { id: "c8", title: "Обучение по охране труда", starts_at: todayAt(base, 11, 0, 1), ends_at: todayAt(base, 13, 0, 1), location: "Учебный класс", everyone: false, people: 12, going: 8 },
          { id: "c9", title: "Планёрка", starts_at: todayAt(base, 9, 0, 7), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 0 },
          { id: "c10", title: "Приёмка второго корпуса", starts_at: todayAt(base, 14, 0, 9), ends_at: null, location: "Объект", everyone: false, people: 6, going: 0 },
          { id: "c11", title: "Совет директоров", starts_at: todayAt(base, 16, 0, 12), ends_at: null, location: null, everyone: false, people: 4, going: 0 },
          { id: "c12", title: "Выезд к заказчику", starts_at: todayAt(base, 10, 0, 15), ends_at: null, location: null, everyone: false, people: 3, going: 3 },
          { id: "c13", title: "Планёрка", starts_at: todayAt(base, 9, 0, 14), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 20 },
          { id: "c14", title: "День рождения Асель", starts_at: todayAt(base, 17, 0, 18), ends_at: null, location: "Кухня", everyone: true, people: 30, going: 25 },
          { id: "c15", title: "Корпоратив по случаю окончания строительного сезона", starts_at: todayAt(base, 19, 0, 20), ends_at: null, location: "Ресторан", everyone: true, people: 30, going: 12 },
          { id: "c16", title: "Планёрка", starts_at: todayAt(base, 9, 0, -1), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 20 },
        ];
  return {
    from: todayAt(base, 0),
    days: kind === "month" ? 28 : 7,
    events: events.map((e) => (guest ? { ...e, title: null, location: null } : e)),
  };
}

export function ratingFixture(base: number, guest: boolean, swapped: boolean, period: "week" | "month" = "week"): TvRatingScene {
  const people = [
    { id: "a", name: "Айгерим Сапарова", points: 420, delta: 60, done: 9, on_time: 9, streak: 4 },
    { id: "m", name: "Марат Ахметов", points: 340, delta: 60, done: 9, on_time: 8 },
    { id: "d", name: "Динара Касымова", points: 260, delta: 0, done: 6, on_time: 5 },
    { id: "e", name: "Ерлан Беков", points: 210, delta: 90, done: 5, on_time: 5 },
    { id: "t", name: "Тимур Жаксылыков", points: 180, delta: 0, done: 4, on_time: 2 },
  ];
  // the swap: Ерлан gets an award and climbs from fourth to second
  const order = swapped ? [people[0], { ...people[3], points: 360 }, people[1], people[2], people[4]] : people;
  return {
    hidden: guest,
    enabled: true,
    period,
    top: guest
      ? []
      : order.map((p, i) => ({ id: p.id, name: p.name, position: null, avatar_url: null, points: p.points, rank: i + 1, delta: p.delta, done: p.done, on_time: p.on_time, streak: p.streak })),
    riser: guest ? null : { id: "e", name: "Ерлан Беков", avatar_url: null, delta: 90, points: 210 },
    awards: guest
      ? []
      : [
          { name: "Марат Ахметов", amount: 50, reason: "Сдал объект «Север» на день раньше", at: at(base, -40) },
          { name: "Айгерим Сапарова", amount: 30, reason: "Закрыла сверку с поставщиками", at: at(base, -26 * 60) },
        ],
    team: { done: 48, on_time: 41, earned: 1240, people: 12 },
  };
}

export function dayFixture(base: number, guest: boolean, kind: "day" | "day-quiet"): TvDayResultData {
  if (kind === "day-quiet") return { done: 0, points: guest ? null : 0, people: 0, awards: [] };
  return {
    done: 14,
    points: guest ? null : 230,
    people: 9,
    awards: guest
      ? []
      : [
          { name: "Марат Ахметов", amount: 50, reason: "Сдал объект «Север» на день раньше", at: at(base, -60) },
          { name: "Айгерим Сапарова", amount: 30, reason: "Закрыла сверку с поставщиками за один день", at: at(base, -60) },
          { name: "Ерлан Беков", amount: 20, reason: "Помог с замерами на втором корпусе", at: at(base, -60) },
        ],
  };
}

export function weekFixture(base: number, guest: boolean): TvWeekResultData {
  return {
    done: 63,
    points: guest ? null : 1240,
    best_day: { day: todayAt(base, 12, 0, -2).slice(0, 10), done: 17 },
    leader: guest ? "Айгерим" : "Айгерим Сапарова",
  };
}

export function announcementFixture(base: number, kind: "short" | "long" | "max"): TvAnnouncementData {
  const text =
    kind === "short"
      ? "В пятницу короткий день — до 16:00"
      : kind === "long"
        ? "Завтра в 10:00 на объекте «Север» приёмка второго корпуса. Прорабам — быть на месте к 9:30 с актами и фотоотчётом. Бухгалтерии — подготовить сверку по поставщикам.\nСпасибо всем за работу на этой неделе!"
        : "Коллеги, напоминаю о порядке на объектах. ".repeat(14).trim();
  return { id: "an1", text, at: todayAt(base, 9, 40), acks: 34 };
}

export function paceFixture(kind: "pace" | "pace-low" | "pace-high" | "pace-record"): TvPaceData {
  if (kind === "pace-low") return { done: 3, usual_now: 7, usual_day: 15, best_day: 22 };
  if (kind === "pace-high") return { done: 11, usual_now: 7, usual_day: 15, best_day: 22 };
  if (kind === "pace-record") return { done: 24, usual_now: 7, usual_day: 15, best_day: 22 };
  return { done: 7, usual_now: 7, usual_day: 15, best_day: 22 };
}
