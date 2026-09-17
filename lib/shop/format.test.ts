import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS,
  cancellableByOwner,
  isOpenOrder,
  nearestGoal,
  pointsWord,
  progressPct,
  shopVerdict,
  shortfall,
  waitingRu,
} from "./format";

describe("pointsWord", () => {
  it("declines the ordinary tails", () => {
    expect(pointsWord(1)).toBe("очко");
    expect(pointsWord(2)).toBe("очка");
    expect(pointsWord(4)).toBe("очка");
    expect(pointsWord(5)).toBe("очков");
    expect(pointsWord(0)).toBe("очков");
  });

  it("keeps the teens in the genitive", () => {
    expect(pointsWord(11)).toBe("очков");
    expect(pointsWord(12)).toBe("очков");
    expect(pointsWord(14)).toBe("очков");
    expect(pointsWord(111)).toBe("очков");
  });

  it("follows the last digit above twenty", () => {
    expect(pointsWord(21)).toBe("очко");
    expect(pointsWord(22)).toBe("очка");
    expect(pointsWord(25)).toBe("очков");
    expect(pointsWord(1000)).toBe("очков");
  });
});

describe("shortfall", () => {
  it("is what is still missing, never negative", () => {
    expect(shortfall(1000, 320)).toBe(680);
    expect(shortfall(200, 200)).toBe(0);
    expect(shortfall(200, 900)).toBe(0);
  });
});

describe("progressPct", () => {
  it("clamps to 0…100", () => {
    expect(progressPct(1000, 250)).toBe(25);
    expect(progressPct(1000, 5000)).toBe(100);
    // a negative balance (the director took points away) is an empty bar, not a broken one
    expect(progressPct(1000, -50)).toBe(0);
  });
});

describe("order status", () => {
  it("names every status of the enum", () => {
    expect(Object.keys(ORDER_STATUS)).toEqual(["pending", "approved", "delivered", "cancelled"]);
  });

  it("lets the owner take back only an unconfirmed order (D-37)", () => {
    expect(cancellableByOwner("pending")).toBe(true);
    expect(cancellableByOwner("approved")).toBe(false);
    expect(cancellableByOwner("delivered")).toBe(false);
  });

  it("keeps pending and approved in the shopkeeper's queue", () => {
    expect(isOpenOrder("pending")).toBe(true);
    expect(isOpenOrder("approved")).toBe(true);
    expect(isOpenOrder("delivered")).toBe(false);
    expect(isOpenOrder("cancelled")).toBe(false);
  });
});

describe("waitingRu", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("says how long the order has been hanging", () => {
    expect(waitingRu(ago(30_000), now)).toBe("только что");
    expect(waitingRu(ago(12 * 60_000), now)).toBe("12 минут");
    expect(waitingRu(ago(61 * 60_000), now)).toBe("1 час");
    expect(waitingRu(ago(3 * 3600_000), now)).toBe("3 часа");
    expect(waitingRu(ago(50 * 3600_000), now)).toBe("2 дня");
  });

  it("declines the numbers", () => {
    expect(waitingRu(ago(21 * 60_000), now)).toBe("21 минуту");
    expect(waitingRu(ago(5 * 3600_000), now)).toBe("5 часов");
  });
});

describe("nearestGoal", () => {
  const items = [
    { title: "Куртка", price: 200, is_active: true },
    { title: "Безрукавка", price: 500, is_active: true },
    { title: "Скрытая", price: 300, is_active: false },
    { title: "Отгул", price: 1000, is_active: true },
  ];

  it("is the cheapest reward still out of reach", () => {
    expect(nearestGoal(120, items)).toEqual({ title: "Куртка", missing: 80 });
    expect(nearestGoal(200, items)).toEqual({ title: "Безрукавка", missing: 300 });
  });

  it("ignores hidden rewards", () => {
    expect(nearestGoal(250, items)).toEqual({ title: "Безрукавка", missing: 250 });
  });

  it("is nothing when everything is affordable", () => {
    expect(nearestGoal(5000, items)).toBeNull();
  });
});

describe("shopVerdict", () => {
  it("puts what waits for the director first", () => {
    expect(shopVerdict(1, 4, 0)).toEqual({ text: "1 заказ ждёт выдачи", tone: "warn" });
    expect(shopVerdict(2, 4, 0)).toEqual({ text: "2 заказа ждут выдачи", tone: "warn" });
    expect(shopVerdict(5, 4, 0)).toEqual({ text: "5 заказов ждут выдачи", tone: "warn" });
  });

  it("describes the shelf when nothing waits", () => {
    expect(shopVerdict(0, 4, 0)).toEqual({ text: "Всё выдано. На витрине 4 награды", tone: "muted" });
    expect(shopVerdict(0, 1, 2)).toEqual({ text: "Всё выдано. На витрине 1 награда, скрыто 2", tone: "muted" });
  });

  it("asks for the first reward on an empty shelf", () => {
    expect(shopVerdict(0, 0, 0).text).toBe("На витрине пока пусто — добавь первую награду");
  });
});
