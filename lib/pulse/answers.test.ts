import { describe, expect, it } from "vitest";

import { answer, findByTopic, findPerson, type AnswerInput, type AnswerTask } from "./answers";

// 2026-09-11 09:30 Aqtobe
const NOW = new Date("2026-09-11T04:30:00Z");

const PEOPLE = [
  { id: "m", fullName: "Марат Оспанов", aliases: ["Марат"] },
  { id: "d", fullName: "Динара Ахметова", aliases: ["Динара", "Дина"] },
  { id: "t", fullName: "Тимур Салимов", aliases: [] },
];

const task = (id: string, title: string, assignee: string | null, status: AnswerTask["status"], deadline: string | null = null): AnswerTask => ({
  id,
  title,
  assignee,
  status,
  deadline,
});

const BASE: AnswerInput = {
  question: "",
  now: NOW,
  people: PEOPLE,
  open: [
    task("1", "Подготовить КП по Казхрому", "Марат", "accepted", "2026-09-12T08:00:00Z"),
    task("2", "Смета по складу", "Марат", "sent"),
    task("3", "Отчёт по складу", "Тимур", "accepted", "2026-09-10T13:00:00Z"),
  ],
  overdue: [task("3", "Отчёт по складу", "Тимур", "accepted", "2026-09-10T13:00:00Z")],
  questions: [],
  review: [task("4", "Договор с Казцинком", "Динара", "pending_review")],
};

describe("findPerson", () => {
  it("matches an inflected first name and an alias", () => {
    expect(findPerson("чем занят Марат", PEOPLE)?.id).toBe("m");
    expect(findPerson("что у Марата сегодня", PEOPLE)?.id).toBe("m");
    expect(findPerson("что там у Дины", PEOPLE)?.id).toBe("d");
    expect(findPerson("что там по Казхрому", PEOPLE)).toBeNull();
  });
});

describe("findByTopic", () => {
  it("finds tasks by a stem of a meaningful word", () => {
    expect(findByTopic("что там по Казхрому", BASE.open).map((t) => t.id)).toEqual(["1"]);
    expect(findByTopic("как дела со складом", BASE.open).map((t) => t.id)).toEqual(["2", "3"]);
    expect(findByTopic("что там", BASE.open)).toEqual([]);
  });
});

describe("answer", () => {
  it("overdue: who has not reported", () => {
    const a = answer({ ...BASE, question: "Кто сегодня не отчитался?" });
    expect(a.understood).toBe(true);
    expect(a.lines).toEqual(["Просрочено 1:", "Тимур, «Отчёт по складу» — срок был вчера 18:00"]);
  });

  it("overdue: none", () => {
    const a = answer({ ...BASE, overdue: [], question: "есть просрочки?" });
    expect(a.lines).toEqual(["Просрочек нет. Все сроки пока держатся."]);
  });

  it("review stack", () => {
    const a = answer({ ...BASE, question: "Что на приёмке?" });
    expect(a.lines[0]).toBe("На приёмке 1:");
    expect(a.lines[1]).toBe("Динара, «Договор с Казцинком» — без срока");
  });

  it("a person: their open tasks with status and deadline", () => {
    const a = answer({ ...BASE, question: "Чем занят Марат?" });
    expect(a.lines).toEqual([
      "Марат: 2 задачи в работе:",
      "«Подготовить КП по Казхрому» — в работе, до завтра 13:00",
      "«Смета по складу» — не открыта, без срока",
    ]);
  });

  it("a person with an overdue task says so", () => {
    const a = answer({ ...BASE, question: "Что у Тимура?" });
    expect(a.lines[0]).toBe("Тимур: 1 задача в работе, 1 с просрочкой:");
  });

  it("a topic", () => {
    const a = answer({ ...BASE, question: "Что там по Казхрому?" });
    expect(a.lines).toEqual(["Нашёл одну задачу:", "Марат, «Подготовить КП по Казхрому» — в работе, до завтра 13:00"]);
  });

  it("a topic that is only in the closed tasks", () => {
    const a = answer({
      ...BASE,
      closed: [{ ...task("c1", "Договор с Казцинком", "Динара", "done"), closedAt: "2026-09-10T13:00:00Z" }],
      question: "Что там по Казцинку?",
    });
    expect(a.lines).toEqual(["В работе такого нет, но было:", "Динара, «Договор с Казцинком» — готово вчера 18:00"]);
  });

  it("the general picture", () => {
    const a = answer({ ...BASE, question: "Как дела в целом?" });
    expect(a.lines).toEqual(["В работе 3 задачи. Просрочено 1. На приёмке 1."]);
  });

  it("refusals with reasons", () => {
    const a = answer({ ...BASE, declined: [{ ...task("d", "Смета", "Ерлан", "sent"), reason: "Занят срочным" }], question: "Кто отказался?" });
    expect(a.lines).toEqual(["Один отказ:", "Ерлан, «Смета» — Занят срочным"]);
    expect(answer({ ...BASE, question: "кто не может?" }).lines).toEqual(["Отказов нет."]);
  });

  it("honest when it cannot read the question", () => {
    const a = answer({ ...BASE, question: "Вы думаете всем явиться ли завтра?" });
    expect(a.understood).toBe(false);
    expect(a.lines[0]).toMatch(/^Пока отвечаю только про задачи и людей/);
  });
});
