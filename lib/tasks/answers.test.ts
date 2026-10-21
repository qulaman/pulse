import { describe, expect, it } from "vitest";

import { answersFor, questionKind, wantsWords } from "./answers";

// 2026-10-21 10:00 Aqtobe (UTC+5)
const MORNING = new Date("2026-10-21T05:00:00Z");
// 2026-10-21 17:30 Aqtobe — no working afternoon left for «сегодня 18:00»
const EVENING = new Date("2026-10-21T12:30:00Z");

describe("the director's quick answers fit the question (D-142)", () => {
  it("reads the employee's own ready-made questions right", () => {
    expect(questionKind("Когда срок?")).toBe("when");
    expect(questionKind("Какой формат?")).toBe("open");
    expect(questionKind("Где взять данные?")).toBe("open");
    expect(questionKind("Это срочно?")).toBe("urgent");
  });

  it("free words: a yes/no question, an open one, a deadline one", () => {
    expect(questionKind("Сделать сегодня?")).toBe("yesno");
    expect(questionKind("Можно взять машину?")).toBe("yesno");
    expect(questionKind("Сколько штук заказать?")).toBe("open");
    expect(questionKind("Какой срок у отчёта?")).toBe("when");
    expect(questionKind("Кто это подписывает?")).toBe("open");
  });

  it("«Да» never answers «Какой формат?» — words come first there", () => {
    const labels = answersFor("Какой формат?", null, MORNING).map((a) => a.label);
    expect(labels).not.toContain("Да");
    expect(wantsWords("Какой формат?")).toBe(true);
    expect(answersFor("Сделать сегодня?", null, MORNING).map((a) => a.label)).toEqual(["Да", "Нет", "Позже", "Действуй сам"]);
  });

  it("«Когда срок?»: the deadline as it is, and new dates that go on the task", () => {
    const answers = answersFor("Когда срок?", "2026-10-22T07:00:00Z", MORNING);
    expect(answers[0]).toMatchObject({ text: expect.stringMatching(/^Срок как в задаче: /) });
    expect(answers[0]!.deadlineIso).toBeUndefined();
    expect(answers.find((a) => a.label === "Сегодня 18:00")?.deadlineIso).toBe("2026-10-21T13:00:00.000Z");
    expect(answers.find((a) => a.label === "Завтра 12:00")?.deadlineIso).toBe("2026-10-22T07:00:00.000Z");
  });

  it("«Когда срок?» late in the day and without a deadline: no «сегодня», no «как в задаче»", () => {
    const labels = answersFor("Когда срок?", null, EVENING).map((a) => a.label);
    expect(labels).toEqual(["Завтра 12:00"]);
    // a deadline already behind is not offered back
    expect(answersFor("Когда срок?", "2026-10-20T07:00:00Z", MORNING).some((a) => a.label.startsWith("Как в задаче"))).toBe(false);
  });
});
