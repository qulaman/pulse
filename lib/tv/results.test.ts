import { describe, expect, it } from "vitest";

import { ANNOUNCEMENT_MAX, announcementView, dayResultView, paceView, weekResultView, weekdayOf } from "./results";

const award = (name: string, amount: number, reason = "За дело") => ({ name, amount, reason, at: "2026-11-18T10:00:00Z" });

describe("dayResultView — «Итог дня» (D-182)", () => {
  it("принятое — героем, люди и очки — строками, до трёх наград с причиной", () => {
    const view = dayResultView(
      { done: 14, points: 230, people: 9, awards: [award("А", 50), award("Б", 30), award("В", 20), award("Г", 10)] },
      false,
    );
    expect(view).toMatchObject({ state: "ready", done: 14, doneLabel: "дел принято за день" });
    if (view.state !== "ready") throw new Error("ready");
    expect(view.lines).toEqual([
      { label: "сдали работу", value: "9 человек" },
      { label: "очков за день", value: "+230" },
    ]);
    expect(view.awards.map((a) => a.name)).toEqual(["А", "Б", "В"]);
  });

  it("гостю — без очков и наград (D-33)", () => {
    const view = dayResultView({ done: 3, points: null, people: 1, awards: [award("А", 50)] }, true);
    if (view.state !== "ready") throw new Error("ready");
    expect(view.lines).toEqual([{ label: "сдал работу", value: "1 человек" }]);
    expect(view.awards).toEqual([]);
  });

  it("день без принятого — не ноль, а «спасибо»; минус и пустые награды не печатаются (D-45)", () => {
    expect(dayResultView({ done: 0, points: 0, people: 0, awards: [] }, false)).toEqual({ state: "quiet" });
    expect(dayResultView(undefined, false)).toEqual({ state: "quiet" });
    const view = dayResultView({ done: 2, points: -10, people: 0, awards: [award("А", -5)] }, false);
    if (view.state !== "ready") throw new Error("ready");
    expect(view.lines).toEqual([]);
    expect(view.awards).toEqual([]);
  });
});

describe("weekResultView — «Итог недели» (D-182)", () => {
  it("принятое за неделю, лучший день словом, лидер, очки", () => {
    const view = weekResultView({ done: 63, points: 1240, best_day: { day: "2026-11-16", done: 17 }, leader: "Айгерим Сапарова" }, false);
    if (view.state !== "ready") throw new Error("ready");
    expect(view.doneLabel).toBe("дела принято за неделю");
    expect(view.lines).toEqual([
      { label: "лучший день", value: "понедельник · 17" },
      { label: "лидер недели", value: "Айгерим Сапарова" },
      { label: "очков за неделю", value: "+1240" },
    ]);
  });

  it("гостю — без очков; пустая неделя — тихо", () => {
    const view = weekResultView({ done: 5, points: null, best_day: null, leader: "Айгерим" }, true);
    if (view.state !== "ready") throw new Error("ready");
    expect(view.lines).toEqual([{ label: "лидер недели", value: "Айгерим" }]);
    expect(weekResultView({ done: 0, points: 0, best_day: null, leader: null }, false)).toEqual({ state: "quiet" });
  });

  it("день недели — по дате компании", () => {
    expect(weekdayOf("2026-11-18")).toBe("среда");
    expect(weekdayOf("не дата")).toBe("");
  });
});

describe("announcementView — «Объявление» (D-182)", () => {
  const at = "2026-11-18T04:40:00Z";

  it("короткое — заголовком, длинное — мельче, но не ниже tv-text", () => {
    expect(announcementView({ id: "1", text: "В пятницу короткий день", at, acks: 0 }).size).toBe("tv-title");
    expect(announcementView({ id: "1", text: "а".repeat(120), at, acks: 0 }).size).toBe("tv-lead");
    expect(announcementView({ id: "1", text: "а".repeat(300), at, acks: 0 }).size).toBe("tv-text");
  });

  it("«Ознакомились N» — без «из N»; ноль не печатается", () => {
    expect(announcementView({ id: "1", text: "Текст", at, acks: 34 }).acks).toBe("Ознакомились 34");
    expect(announcementView({ id: "1", text: "Текст", at, acks: 0 }).acks).toBeNull();
  });

  it("совсем длинное — многоточием, лишние пустые строки схлопываются", () => {
    const long = announcementView({ id: "1", text: "слово ".repeat(200), at, acks: 0 });
    expect(long.text.length).toBe(ANNOUNCEMENT_MAX);
    expect(long.text.endsWith("…")).toBe(true);
    expect(announcementView({ id: "1", text: "раз\n\n\n\nдва  \n", at, acks: 0 }).text).toBe("раз\n\nдва");
  });
});

describe("paceView — темп под лицом (D-182)", () => {
  it("ниже обычного — только число, без полосы и сравнения (D-45)", () => {
    expect(paceView({ done: 3, usual_now: 7, usual_day: 15, best_day: 22 })).toEqual({ done: 3, bar: null, note: null });
  });

  it("вровень — полоса к обычному дню; выше — «больше обычного»; выше рекорда — рекорд", () => {
    expect(paceView({ done: 7, usual_now: 7, usual_day: 14, best_day: 22 })).toEqual({ done: 7, bar: 0.5, note: null });
    expect(paceView({ done: 11, usual_now: 7, usual_day: 14, best_day: 22 })?.note).toBe("больше обычного");
    expect(paceView({ done: 24, usual_now: 7, usual_day: 14, best_day: 22 })).toEqual({ done: 24, bar: 1, note: "лучший день за два месяца" });
  });

  it("ничего не принято или нет истории — ничего или одно число", () => {
    expect(paceView({ done: 0, usual_now: 5, usual_day: 10, best_day: 12 })).toBeNull();
    expect(paceView(undefined)).toBeNull();
    expect(paceView({ done: 4, usual_now: 0, usual_day: 0, best_day: 0 })).toEqual({ done: 4, bar: null, note: null });
  });
});
