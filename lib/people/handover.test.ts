import { describe, expect, it } from "vitest";

import { OPEN, openWork, passAll, type OpenTask } from "./handover";

const task = (id: string, status: OpenTask["status"]): OpenTask => ({ id, title: id, status, deadline: null });

describe("openWork", () => {
  const rows = [task("a", "sent"), task("b", "accepted"), task("c", "rework"), task("d", "pending_review"), task("e", "scheduled")];

  it("says what can move and what stays, in numbers", () => {
    expect(openWork(rows, true)).toMatchObject({ total: 5, movable: 3, review: 1, scheduled: 1 });
    expect(openWork(rows, true).tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("gives the secretary the numbers without a single task", () => {
    const work = openWork(rows, false);
    expect(work.total).toBe(5);
    expect(work.tasks).toEqual([]);
  });

  it("does not take a refused task for open work", () => {
    expect(OPEN).not.toContain("declined");
  });
});

describe("passAll", () => {
  it("hands over everything when nothing fails", async () => {
    const seen: number[] = [];
    const result = await passAll([1, 2, 3, 4, 5], async (n) => void seen.push(n));
    expect(result.passed.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(result.failed).toEqual([]);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps one failure to its task, with the reason, and goes on", async () => {
    const result = await passAll(["a", "b", "c", "d"], async (id) => {
      if (id === "b") throw new Error("Так нельзя: статус уже изменился");
    });
    expect(result.passed.sort()).toEqual(["a", "c", "d"]);
    expect(result.failed).toEqual([{ task: "b", reason: "Так нельзя: статус уже изменился" }]);
  });

  it("says something even when the failure says nothing", async () => {
    const result = await passAll(["a"], () => Promise.reject(new Error("")));
    expect(result.failed[0].reason).toBe("Не получилось передать");
  });

  it("does not run more at once than asked", async () => {
    let now = 0;
    let most = 0;
    await passAll([1, 2, 3, 4, 5, 6, 7], async () => {
      now += 1;
      most = Math.max(most, now);
      await new Promise((resolve) => setTimeout(resolve, 1));
      now -= 1;
    }, 2);
    expect(most).toBe(2);
  });

  it("has nothing to do on an empty list", async () => {
    expect(await passAll([], () => Promise.reject(new Error("never")))).toEqual({ passed: [], failed: [] });
  });
});
