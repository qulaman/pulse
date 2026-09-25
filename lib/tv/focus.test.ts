import { describe, expect, it } from "vitest";

import {
  focusCard,
  focusRows,
  initialsOfName,
  PER_LANE,
  ratingView,
  ROWS_GRID,
  ROWS_SINGLE,
  storyBoard,
  storyRows,
  storyTime,
  taskSteps,
} from "./focus";
import type { TvFocusEmployee, TvFocusTask, TvStoryEvent } from "./queries";

const NOW = new Date("2026-09-18T09:00:00Z"); // 14:00 в Актобе

function focus(tasks: Partial<TvFocusTask>[], guest = false): TvFocusEmployee {
  return {
    mode: "employee",
    guest,
    expires_at: "2026-09-18T09:10:00Z",
    employee: { id: "e1", name: guest ? "Марат" : "Марат Оспанов", position: "Специалист" },
    tasks: tasks.map((task, index) => ({
      id: task.id ?? `t${index}`,
      title: "title" in task ? task.title ?? null : "Подписать акт",
      status: task.status ?? "sent",
      deadline: task.deadline ?? null,
    })),
  };
}

describe("focusRows", () => {
  it("даёт слово и тон по статусу", () => {
    const rows = focusRows(
      focus([{ status: "sent" }, { status: "accepted" }, { status: "pending_review" }]),
      NOW,
    );
    expect(rows.map((row) => row.status)).toEqual(["новая", "в работе", "на проверке"]);
    expect(rows.map((row) => row.tone)).toEqual(["accent", "ok", "muted"]);
  });

  it("доработку печатает как работу — негатив по имени на стену не выносится (D-45)", () => {
    const [row] = focusRows(focus([{ status: "rework" }]), NOW);
    expect(row.status).toBe("в работе");
    expect(row.tone).toBe("ok");
  });

  it("срок — сегодня со временем, завтра словом, дальше датой", () => {
    const rows = focusRows(
      focus([
        { deadline: "2026-09-18T13:00:00Z" }, // 18:00 в Актобе
        { deadline: "2026-09-19T05:00:00Z" },
        { deadline: "2026-09-22T05:00:00Z" },
      ]),
      NOW,
    );
    expect(rows.map((row) => row.deadline)).toEqual(["сегодня 18:00", "завтра", "до 22 сен"]);
  });

  it("прошедший срок печатается нейтрально: ни «просрочено», ни красного (D-45)", () => {
    const [row] = focusRows(focus([{ status: "accepted", deadline: "2026-09-15T05:00:00Z" }]), NOW);
    expect(row.deadline).toBe("до 15 сен");
    expect(row.deadline).not.toMatch(/просроч/i);
    expect(row.status).not.toMatch(/просроч/i);
    expect(row.tone).not.toBe("danger");
  });

  it("без срока — пусто, у гостя вместо заголовка «Поручение»", () => {
    const rows = focusRows(focus([{ title: null, deadline: null }], true), NOW);
    expect(rows[0].deadline).toBeNull();
    expect(rows[0].title).toBe("Поручение");
  });
});

describe("focusCard — колонки по стадиям (D-96)", () => {
  it("раскладывает дела на «Новые / В работе / На проверке», доработку — в работу", () => {
    const card = focusCard(
      focus([{ status: "sent" }, { status: "accepted" }, { status: "rework" }, { status: "pending_review" }]),
      NOW,
    );
    expect(card.lanes.map((lane) => [lane.label, lane.count])).toEqual([
      ["Новые", 1],
      ["В работе", 2],
      ["На проверке", 1],
    ]);
    expect(card.total).toBe(4);
  });

  it("числа над колонками — из базы, по всем делам; лишнее — «+ ещё N»", () => {
    const many = focus(Array.from({ length: PER_LANE + 1 }, () => ({ status: "accepted" })));
    many.counts = { new: 0, work: 9, review: 0 };
    const work = focusCard(many, NOW).lanes[1];
    expect(work.count).toBe(9);
    expect(work.rows).toHaveLength(PER_LANE);
    expect(work.more).toBe(9 - PER_LANE);
  });

  it("срок сегодня впереди подсвечен, прошедший — нет (D-45)", () => {
    const card = focusCard(
      focus([
        { id: "ahead", status: "sent", deadline: "2026-09-18T13:00:00Z" },
        { id: "past", status: "sent", deadline: "2026-09-18T05:00:00Z" },
      ]),
      NOW,
    );
    const rows = card.lanes[0].rows;
    expect(rows.find((r) => r.id === "ahead")?.soon).toBe(true);
    expect(rows.find((r) => r.id === "past")?.soon).toBe(false);
  });

  it("сданное сегодня: гостю без названий", () => {
    const f = focus([], true);
    f.done_today = { count: 2, titles: [null, null] };
    expect(focusCard(f, NOW).done).toEqual({ count: 2, titles: ["Поручение", "Поручение"] });
  });
});

describe("initialsOfName", () => {
  it("две буквы — имя и фамилия, одна часть — первые две буквы", () => {
    expect(initialsOfName("Марат Ахметов")).toBe("МА");
    expect(initialsOfName("Марат")).toBe("МА");
    expect(initialsOfName("  ")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* v3 (D-120): карточки с хронологией и рейтинг                                */
/* -------------------------------------------------------------------------- */

function task(partial: Partial<TvFocusTask>): TvFocusTask {
  return { id: "t", title: "Смета по кровле", status: "accepted", deadline: null, source: "typed", story: [], ...partial };
}

/** Сегодня hh:mm в Актобе от NOW (пятница, 18 сентября). */
const today = (hh: number, mm = 0) => `2026-09-18T${String(hh - 5).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;

describe("storyTime", () => {
  it("сегодня — часами, на неделе — днём и часами, раньше — датой", () => {
    expect(storyTime(today(9, 12), NOW)).toBe("09:12");
    expect(storyTime("2026-09-16T04:00:00Z", NOW)).toBe("ср 09:00");
    expect(storyTime("2026-09-05T04:00:00Z", NOW)).toBe("5 сен");
  });
});

describe("storyRows — хронология дела", () => {
  const life: TvStoryEvent[] = [
    { k: "posted", at: today(9, 12) },
    { k: "seen", at: today(9, 14) },
    { k: "accepted", at: today(9, 20) },
    { k: "question", at: today(10, 5), ans: today(11, 20) },
    { k: "photo", at: today(12, 0) },
    { k: "photo", at: today(12, 5) },
    { k: "review", at: today(12, 30), rep: "photo" },
    { k: "again", at: today(13, 0) },
  ];

  it("вся жизнь дела словами о деле, текущая строка — последней", () => {
    const rows = storyRows(task({ status: "rework", source: "voice", story: life }), NOW, ROWS_SINGLE);
    expect(rows.map((row) => row.text)).toEqual([
      "Поставлена голосом",
      "Просмотрена",
      "Принята в работу",
      "Уточнение · ответ 11:20",
      "Фото ×2",
      "Сдана с фото",
      "Снова в работе",
      "В работе",
    ]);
    expect(rows.map((row) => row.time)).toEqual(["09:12", "09:14", "09:20", "10:05", "12:05", "12:30", "13:00", "сейчас"]);
    expect(rows.at(-1)?.tone).toBe("now");
  });

  it("на стене нет ни отказа, ни просрочки, ни «доработки» (D-45)", () => {
    const kinds: TvStoryEvent["k"][] = [
      "posted",
      "seen",
      "accepted",
      "question",
      "text",
      "photo",
      "voice",
      "director",
      "deadline",
      "review",
      "again",
      "done",
    ];
    const story = kinds.map((k, i) => ({ k, at: today(9, i) }));
    for (const status of ["sent", "accepted", "rework", "pending_review", "done"]) {
      const text = storyRows(task({ status, story, deadline: "2026-09-10T05:00:00Z" }), NOW, 40)
        .map((row) => row.text)
        .join(" ");
      expect(text).not.toMatch(/отказ|не мож|просроч|доработ|опозд/i);
    }
  });

  it("«просмотрена» после «принята» не печатается", () => {
    const rows = storyRows(
      task({ story: [{ k: "posted", at: today(9) }, { k: "accepted", at: today(9, 5) }, { k: "seen", at: today(9, 30) }] }),
      NOW,
      ROWS_SINGLE,
    );
    expect(rows.map((row) => row.text)).toEqual(["Поставлена", "Принята в работу", "В работе"]);
  });

  it("длинная история сжимается: начало, «ещё N событий», последние строки", () => {
    const story: TvStoryEvent[] = [{ k: "posted", at: today(9) }];
    for (let i = 0; i < 10; i += 1) story.push({ k: i % 2 ? "photo" : "text", at: today(10, i) });
    const rows = storyRows(task({ story }), NOW, 6);
    expect(rows).toHaveLength(6);
    expect(rows[0].text).toBe("Поставлена");
    expect(rows[1].text).toBe("ещё 7 событий");
    expect(rows.slice(2, 5).map((row) => row.time)).toEqual(["10:07", "10:08", "10:09"]);
    expect(rows[5].text).toBe("В работе");
    expect(storyRows(task({ story }), NOW, ROWS_GRID)).toHaveLength(ROWS_GRID);
  });

  it("ответ на уточнение в другой день — с днём", () => {
    const rows = storyRows(
      task({ story: [{ k: "question", at: "2026-09-16T05:00:00Z", ans: "2026-09-17T06:00:00Z" }] }),
      NOW,
      6,
    );
    expect(rows[0].text).toBe("Уточнение · ответ чт 11:00");
    expect(storyRows(task({ story: [{ k: "question", at: today(10) }] }), NOW, 6)[0].text).toBe("Уточнение · ждёт ответа");
  });

  it("новая ждёт принятия, сданная — на проверке у директора", () => {
    expect(storyRows(task({ status: "sent" }), NOW, 6).at(-1)?.text).toBe("Ждёт принятия");
    expect(storyRows(task({ status: "pending_review" }), NOW, 6).at(-1)?.text).toBe("На проверке у директора");
  });

  it("принятое дело: без текущей строки, «в срок» — только когда так и есть", () => {
    const done = (deadline: string | null) =>
      storyRows(task({ status: "done", deadline, story: [{ k: "posted", at: today(9) }, { k: "done", at: today(12) }] }), NOW, 6);
    expect(done(today(18)).map((row) => row.text)).toEqual(["Поставлена", "Принята директором · в срок"]);
    expect(done(today(10)).at(-1)?.text).toBe("Принята директором");
    expect(done(null).at(-1)?.tone).toBe("done");
  });

  it("новый срок — нейтрально датой, снятый — словами", () => {
    const rows = storyRows(
      task({
        story: [
          { k: "deadline", at: today(9), to: "2026-09-22T05:00:00Z" },
          { k: "deadline", at: today(10), cleared: true },
        ],
      }),
      NOW,
      6,
    );
    expect(rows.slice(0, 2).map((row) => row.text)).toEqual(["Новый срок · до 22 сен", "Срок снят"]);
  });

  it("база v2 без хронологии — только текущая строка", () => {
    const rows = storyRows({ id: "t", title: "x", status: "accepted", deadline: null }, NOW, 6);
    expect(rows).toEqual([{ key: "now", time: "сейчас", text: "В работе", tone: "now" }]);
  });
});

describe("storyBoard — дела карточками", () => {
  const expires = new Date(NOW.getTime() + 10 * 60_000).toISOString(); // фокус начался сейчас

  it("до двух дел — одной строкой карточек повыше", () => {
    const board = storyBoard({ ...focus([{ status: "sent" }, { status: "accepted" }]), expires_at: expires }, NOW);
    expect([board.mode, board.cols, board.rows, board.pages]).toEqual(["open", 2, 1, 1]);
    expect(board.cards.map((card) => card.stageLabel)).toEqual(["Новая", "В работе"]);
  });

  it("больше четырёх — сетка 2 × 2, стена листает сама по часам фокуса", () => {
    const seven = focus(Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, status: "accepted" })));
    const at = (seconds: number) => storyBoard({ ...seven, expires_at: expires }, new Date(NOW.getTime() + seconds * 1000));
    expect([at(0).page, at(0).pages, at(0).cards.length, at(0).cols, at(0).rows]).toEqual([0, 2, 4, 2, 2]);
    expect([at(25).page, at(25).cards.length]).toEqual([1, 3]);
    expect(at(45).page).toBe(0);
  });

  it("открытых нет — сданное за неделю; нет ничего — пусто", () => {
    const none = { ...focus([]), expires_at: expires };
    expect(storyBoard(none, NOW).mode).toBe("empty");
    const done = storyBoard({ ...none, done_recent: [task({ id: "d", status: "done" })] }, NOW);
    expect([done.mode, done.cards[0].stageLabel, done.cards[0].deadline]).toEqual(["done", "Принята", null]);
  });

  it("не отданное базой — числом: «ещё N»", () => {
    const board = storyBoard(
      { ...focus([{ status: "sent" }]), expires_at: expires, counts: { new: 5, work: 8, review: 2 } },
      NOW,
    );
    expect([board.total, board.hidden]).toEqual([15, 14]);
  });
});

describe("taskSteps — одно дело во весь экран (D-123)", () => {
  const story: TvStoryEvent[] = [
    { k: "posted", at: today(9, 12) },
    { k: "accepted", at: today(9, 20) },
    { k: "review", at: today(12, 30) },
    { k: "again", at: today(13, 0) },
    { k: "review", at: today(15, 45) },
  ];

  it("пройденные шаги — со временем, текущий — подсвечен", () => {
    const steps = taskSteps(task({ status: "pending_review", story }), NOW);
    expect(steps.map((step) => [step.label, step.time, step.state])).toEqual([
      ["Поставлена", "09:12", "passed"],
      ["Принята в работу", "09:20", "passed"],
      ["Сдана на проверку", "15:45", "passed"],
      ["Принята директором", null, "now"],
    ]);
  });

  it("возврат на доработку откатывает «Сдана»: шаг снова впереди (D-45)", () => {
    const steps = taskSteps(task({ status: "rework", story }), NOW);
    expect(steps.map((step) => step.state)).toEqual(["passed", "passed", "now", "next"]);
    expect(steps[2].time).toBeNull();
  });

  it("новая ждёт принятия; принятая директором — все четыре пройдены", () => {
    expect(taskSteps(task({ status: "sent", story: [story[0]] }), NOW).map((step) => step.state)).toEqual([
      "passed",
      "now",
      "next",
      "next",
    ]);
    const done = taskSteps(task({ status: "done", story: [...story, { k: "done", at: today(16) }] }), NOW);
    expect(done.map((step) => step.state)).toEqual(["passed", "passed", "passed", "passed"]);
    expect(done[3].time).toBe("16:00");
  });
});

describe("ratingView — рейтинг на стене", () => {
  const withRating = (rating: TvFocusEmployee["rating"], guest = false): TvFocusEmployee => ({ ...focus([], guest), rating });
  const base = { points: true, rank: 2, weeks: [10, 20, 30, 90], done_week: 9, on_time_week: 8 };

  it("место, очки, рост, четыре недели и итоги недели", () => {
    expect(ratingView(withRating(base))).toEqual({
      rank: 2,
      points: 90,
      delta: 60,
      bars: [
        { value: 10, current: false },
        { value: 20, current: false },
        { value: 30, current: false },
        { value: 90, current: true },
      ],
      week: { done: 9, onTime: 8 },
    });
  });

  it("гостю — ничего (D-33)", () => {
    expect(ratingView(withRating(base, true))).toBeNull();
    expect(ratingView(withRating(null))).toBeNull();
  });

  it("место ниже пятого, падение и минус не показываются (D-45)", () => {
    const view = ratingView(withRating({ ...base, rank: 7, weeks: [-20, 0, 80, 40] }));
    expect(view?.rank).toBeNull();
    expect(view?.delta).toBeNull();
    expect(view?.bars?.[0].value).toBe(0);
    expect(view?.points).toBe(40);
  });

  it("очки выключены — только итоги недели; ничего не сдано — без итогов", () => {
    expect(ratingView(withRating({ points: false, done_week: 3, on_time_week: 3 }))).toEqual({
      rank: null,
      points: null,
      delta: null,
      bars: null,
      week: { done: 3, onTime: 3 },
    });
    expect(ratingView(withRating({ points: false, done_week: 0, on_time_week: 0 }))?.week).toBeNull();
  });

  it("база v2 без рейтинга — только очки недели, как было", () => {
    const legacy: TvFocusEmployee = { ...focus([]), points_week: 42 };
    expect(ratingView(legacy)).toEqual({ rank: null, points: 42, delta: null, bars: null, week: null });
    expect(ratingView({ ...legacy, points_week: 0 })).toBeNull();
  });
});
