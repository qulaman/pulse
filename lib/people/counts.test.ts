import { describe, expect, it } from "vitest";

import { closedIn30, finishedOf, taskStageParts } from "./counts";

const NOW = Date.parse("2026-11-24T05:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

// the review's card: four accepted within 30 days, one recalled — «4 закрыто» beside «Закрытые · 5»
const TASKS = [
  { status: "done" as const, closed_at: day(1) },
  { status: "done" as const, closed_at: day(3) },
  { status: "done" as const, closed_at: day(10) },
  { status: "done" as const, closed_at: day(29) },
  { status: "revoked" as const, closed_at: day(2) },
  { status: "done" as const, closed_at: day(31) },
  { status: "accepted" as const, closed_at: null },
];

describe("a person's counts", () => {
  it("«закрыто за 30 дн.» is accepted within 30 days only", () => {
    expect(closedIn30(TASKS, NOW)).toBe(4);
    expect(closedIn30([], NOW)).toBe(0);
  });

  it("«История» is every finished task — a different word for a different set", () => {
    expect(finishedOf(TASKS)).toHaveLength(6);
  });
});

describe("taskStageParts — the head of «Команда» names the stages honestly (§4.4)", () => {
  it("a task given and not accepted is not «в работе»", () => {
    expect(taskStageParts(0, 0, 1)).toEqual(["1 задача не принята"]);
    expect(taskStageParts(0, 0, 3)).toEqual(["3 задачи не приняты"]);
  });

  it("the noun once, on the first stage that has anything", () => {
    expect(taskStageParts(2, 1, 1)).toEqual(["2 задачи в работе", "1 на проверке", "1 не принята"]);
    expect(taskStageParts(0, 5, 0)).toEqual(["5 задач на проверке"]);
    expect(taskStageParts(0, 0, 0)).toEqual([]);
  });
});
